"""SAST rules catalog — aggregated from real analysis findings."""

import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.auth import require_platform_auth
from app.db import get_session
from app.models import AnalysisRecord, RuleSuppression

router = APIRouter(prefix="/api/v1/rules", tags=["rules"])

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
    session: Session = Depends(get_session),
) -> list[dict]:
    """
    Aggregate all SAST rules seen across recent analyses.
    Returns one entry per unique rule_id with occurrence counts.
    SCA findings (Trivy, dotnet-audit, etc.) are excluded — they appear
    in the Vulnerabilities tab instead.
    """
    if project_key:
        analyses = (
            session.query(AnalysisRecord)
            .filter(AnalysisRecord.project_key == project_key)
            .order_by(AnalysisRecord.created_at.desc())
            .limit(10)
            .all()
        )
    else:
        # Most recent analysis per project_key
        from sqlalchemy import func, text
        latest_ids = session.execute(text("""
            SELECT DISTINCT ON (project_key) analysis_id
            FROM analysis_records
            ORDER BY project_key, created_at DESC
        """)).fetchall()
        ids = [r[0] for r in latest_ids]
        if not ids:
            return []
        analyses = session.query(AnalysisRecord).filter(
            AnalysisRecord.analysis_id.in_(ids)
        ).all()

    # Aggregate
    rules: dict[str, dict] = {}

    for analysis in analyses:
        if not analysis.affected_files:
            continue
        try:
            af = (
                json.loads(analysis.affected_files)
                if isinstance(analysis.affected_files, str)
                else analysis.affected_files
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
                rules[rule_id]["projects"].add(analysis.project_key)

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
    return result


@router.post("/{rule_key:path}/suppress")
def suppress_rule(
    rule_key: str,
    note: str | None = Query(None),
    session: Session = Depends(get_session),
    _: None = Depends(require_platform_auth),
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
        session.commit()
    return {"status": "suppressed", "rule_key": rule_key}


@router.delete("/{rule_key:path}/suppress")
def unsuppress_rule(
    rule_key: str,
    session: Session = Depends(get_session),
    _: None = Depends(require_platform_auth),
) -> dict:
    """Reactivate a previously suppressed rule."""
    session.query(RuleSuppression).filter(
        RuleSuppression.rule_key == rule_key
    ).delete()
    session.commit()
    return {"status": "active", "rule_key": rule_key}
