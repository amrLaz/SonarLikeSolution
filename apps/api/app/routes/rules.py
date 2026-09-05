"""SAST rules catalog — aggregated from real analysis findings."""

import json
import time
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.audit import log_event
from app.auth import allowed_project_keys, assert_project_access, require_platform_auth, require_role
from app.db import get_session
from app.models import AnalysisRecord, RuleSuppression

router = APIRouter(prefix="/api/v1/rules", tags=["rules"])

# In-memory cache: (project_key or None) → (timestamp, result)
_rules_cache: dict[str | None, tuple[float, list]] = {}
_CACHE_TTL = 60  # seconds

_SCA_PREFIXES = ("trivy/", "dotnet-audit/", "composer-audit/", "npm-audit/", "pip-audit/")

_EXT_LANG = {
    "py": "Python", "js": "JavaScript", "ts": "TypeScript", "tsx": "TypeScript",
    "jsx": "JavaScript", "php": "PHP", "cs": "C#", "css": "CSS", "scss": "CSS",
    "c": "C", "cpp": "C++", "h": "C/C++", "kt": "Kotlin", "go": "Go",
    "java": "Java", "rb": "Ruby", "rs": "Rust", "yml": "YAML", "yaml": "YAML",
    "json": "JSON", "xml": "XML", "sh": "Shell",
}

_PREFIX_LANG = {
    "bandit": "Python",
    "eslint": "JavaScript",
    "detect-secrets": "Any",
    "gitleaks": "Any",
    "cppcheck": "C/C++",
    "detekt": "Kotlin",
    "semgrep": None,  # resolved from file path
}

_CAT_LABEL = {
    "vulnerability": "Security",
    "hotspot": "Security",
    "bug": "Reliability",
    "code_smell": "Maintainability",
    "dependency_vulnerability": "Security",
}


def _lang_from_path(path: str) -> str:
    ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
    return _EXT_LANG.get(ext, "")


def _rule_language(rule_id: str, file_path: str) -> str:
    prefix = rule_id.split("/")[0] if "/" in rule_id else rule_id
    lang = _PREFIX_LANG.get(prefix)
    if lang is not None:
        return lang or _lang_from_path(file_path) or "Multi"
    return _lang_from_path(file_path) or "Multi"


def _rule_title(rule_id: str) -> str:
    if "/" not in rule_id:
        return rule_id
    _, rest = rule_id.split("/", 1)
    # Last dotted segment is most specific
    last = rest.split(".")[-1] if "." in rest else rest
    return last.replace("-", " ").replace("_", " ").strip() or rest


def _rule_category(category: str) -> str:
    return _CAT_LABEL.get(category, "Security")


def _rule_severity(severity: str) -> str:
    s = severity.upper()
    if s in ("BLOCKER", "CRITICAL"):
        return "Critical"
    if s == "HIGH":
        return "High"
    if s in ("MEDIUM", "WARNING"):
        return "Medium"
    return "Low"


@router.get("")
def list_rules(
    project_key: str | None = Query(None),
    principal: dict = Depends(require_platform_auth),
    session: Session = Depends(get_session),
) -> list[dict]:
    """
    Aggregate all SAST rules seen across recent analyses.
    Returns one entry per unique rule_id with occurrence counts.
    SCA findings (Trivy, dotnet-audit, etc.) are excluded — they appear
    in the Vulnerabilities tab instead.
    """
    visible = allowed_project_keys(principal, session)
    if project_key:
        assert_project_access(principal, session, project_key)
    cache_key = project_key or "|".join(sorted(visible))
    cached = _rules_cache.get(cache_key)
    if cached and (time.monotonic() - cached[0]) < _CACHE_TTL:
        return cached[1]

    from sqlalchemy import text

    if project_key:
        rows = session.execute(text("""
            SELECT analysis_id, project_key, affected_files
            FROM analysis_records
            WHERE project_key = :pk
            ORDER BY created_at DESC
            LIMIT 10
        """), {"pk": project_key}).fetchall()
    else:
        if not visible:
            return []
        rows = session.execute(text("""
            SELECT DISTINCT ON (project_key) analysis_id, project_key, affected_files
            FROM analysis_records
            WHERE project_key = ANY(:visible)
            ORDER BY project_key, created_at DESC
        """), {"visible": sorted(visible)}).fetchall()

    if not rows:
        return []

    # Aggregate
    rules: dict[str, dict] = {}

    for row in rows:
        analysis_id, project_key_val, affected_files_raw = row
        if not affected_files_raw:
            continue
        try:
            af = (
                json.loads(affected_files_raw)
                if isinstance(affected_files_raw, str)
                else affected_files_raw
            )
        except (json.JSONDecodeError, TypeError):
            continue

        for file_path, file_data in af.items():
            issues = file_data if isinstance(file_data, list) else []
            for issue in issues:
                rule_id = issue.get("rule", "")
                if not rule_id:
                    continue
                if any(rule_id.startswith(p) for p in _SCA_PREFIXES):
                    continue

                severity = str(issue.get("severity", "info"))
                category = issue.get("category", "vulnerability")

                if rule_id not in rules:
                    rules[rule_id] = {
                        "rule_id": rule_id,
                        "title": _rule_title(rule_id),
                        "category": _rule_category(category),
                        "severity": _rule_severity(severity),
                        "language": _rule_language(rule_id, file_path),
                        "occurrences": 0,
                        "files": set(),
                        "projects": set(),
                    }

                rules[rule_id]["occurrences"] += 1
                rules[rule_id]["files"].add(file_path)
                rules[rule_id]["projects"].add(project_key_val)

    # Load suppressions
    suppressed = {s.rule_key for s in session.query(RuleSuppression).all()}

    result = [
        {
            "rule_id": r["rule_id"],
            "title": r["title"],
            "category": r["category"],
            "severity": r["severity"],
            "language": r["language"],
            "occurrences": r["occurrences"],
            "file_count": len(r["files"]),
            "project_count": len(r["projects"]),
            "projects": list(r["projects"]),
            "status": "suppressed" if r["rule_id"] in suppressed else "active",
        }
        for r in rules.values()
    ]

    result.sort(key=lambda r: r["occurrences"], reverse=True)
    _rules_cache[cache_key] = (time.monotonic(), result)
    return result


@router.post("/{rule_key:path}/suppress")
def suppress_rule(
    rule_key: str,
    note: str | None = Query(None),
    session: Session = Depends(get_session),
    caller: dict = Depends(require_role("admin")),
) -> dict:
    """Mark a rule as suppressed (false positive / accepted risk)."""
    existing = session.query(RuleSuppression).filter(
        RuleSuppression.rule_key == rule_key
    ).first()
    if not existing:
        session.add(RuleSuppression(
            id=str(uuid.uuid4()),
            rule_key=rule_key,
            suppressed_at=datetime.now(timezone.utc),
            note=note,
        ))
        log_event(session, caller["email"], caller["role"], "rule.suppress", "rule",
                  resource_label=rule_key, details={"note": note} if note else None)
        session.commit()
    return {"status": "suppressed", "rule_key": rule_key}


@router.delete("/{rule_key:path}/suppress")
def unsuppress_rule(
    rule_key: str,
    session: Session = Depends(get_session),
    caller: dict = Depends(require_role("admin")),
) -> dict:
    """Reactivate a previously suppressed rule."""
    session.query(RuleSuppression).filter(
        RuleSuppression.rule_key == rule_key
    ).delete()
    log_event(session, caller["email"], caller["role"], "rule.unsuppress", "rule",
              resource_label=rule_key)
    session.commit()
    return {"status": "active", "rule_key": rule_key}
