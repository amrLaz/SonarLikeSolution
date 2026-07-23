import base64
from datetime import datetime, timezone
import json
import logging
from typing import Literal
import urllib.error
import urllib.parse
import urllib.request
from uuid import uuid4

from fastapi import Depends
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import require_platform_auth, require_ci_token_auth, require_role
from app.db import get_session
from app.models import AnalysisRecord, AzureDevOpsOrganizationConfig, ProjectIntegration
from app.models import QualityGateConfig
from app.notify import dispatch as notify_dispatch

_log = logging.getLogger(__name__)


router = APIRouter(prefix="/api/v1/analyses", tags=["analysis"])


class AnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="allow")  # Allow extra fields to ensure PR fields are accepted
    
    project_key: str = Field(min_length=2)
    commit_sha: str = Field(min_length=6)
    branch: str = Field(min_length=1)
    ci_provider: Literal["azure-devops", "github-actions", "local"] = "local"
    simulated_quality_gate: Literal["pass", "fail"] | None = None
    reported_maintainability_score: int | None = Field(default=None, ge=0, le=100)
    reported_security_score: int | None = Field(default=None, ge=0, le=100)
    reported_reliability_score: int | None = Field(default=None, ge=0, le=100)
    reported_code_smells: int | None = Field(default=None, ge=0, le=100000)
    reported_vulnerabilities: int | None = Field(default=None, ge=0, le=10000)
    reported_security_hotspots: int | None = Field(default=None, ge=0, le=10000)
    reported_bugs: int | None = Field(default=None, ge=0, le=10000)
    reported_duplication: int | None = Field(default=None, ge=0, le=100, description="Code duplication percentage")
    reported_coverage: int | None = Field(default=None, ge=0, le=100, description="Code coverage percentage")
    reported_dependency_vulnerabilities: int | None = Field(default=None, ge=0, le=100000, description="SCA findings (excluded from security score)")
    affected_files: dict | None = Field(default=None, description="Files with issues and line numbers")
    simulated_maintainability_score: int | None = Field(default=None, ge=0, le=100)
    simulated_security_score: int | None = Field(default=None, ge=0, le=100)
    simulated_reliability_score: int | None = Field(default=None, ge=0, le=100)
    simulated_code_smells: int | None = Field(default=None, ge=0, le=100000)
    simulated_vulnerabilities: int | None = Field(default=None, ge=0, le=10000)
    simulated_security_hotspots: int | None = Field(default=None, ge=0, le=10000)
    simulated_bugs: int | None = Field(default=None, ge=0, le=10000)
    # PR context — only populated when analysis is triggered from a pull request
    pr_id: str | None = Field(default=None, description="Pull request ID (ADO PR number)")
    pr_repo_id: str | None = Field(default=None, description="ADO repository GUID (Build.Repository.ID)")
    pr_ado_project: str | None = Field(default=None, description="ADO project name (System.TeamProject)")
    pr_target_branch: str | None = Field(default=None, description="PR target branch")
    pr_ado_org_url: str | None = Field(default=None, description="ADO org URL used to look up PAT (System.CollectionUri)")
    reported_platform_url: str | None = Field(default=None, description="Platform base URL for PR status targetUrl")


class AnalysisMetrics(BaseModel):
    maintainability_score: int
    security_score: int
    reliability_score: int
    code_smells: int
    vulnerabilities: int
    security_hotspots: int
    bugs: int
    duplication: int = Field(default=0, ge=0, le=100, description="Code duplication percentage (0-100)")
    coverage: int = Field(default=0, ge=0, le=100, description="Code coverage percentage (0-100)")
    dependency_vulnerabilities: int = Field(default=0, ge=0, description="SCA findings, not counted in security score")
    affected_files: dict | None = None


class AnalysisResponse(BaseModel):
    analysis_id: str
    project_key: str
    commit_sha: str
    branch: str
    ci_provider: Literal["azure-devops", "github-actions", "local"]
    status: Literal["queued", "running", "completed", "failed"]
    quality_gate: Literal["pass", "fail", "unknown"]
    metrics: AnalysisMetrics
    gate_failures: list[str]
    created_at: str
    pr_id: str | None = None
    pr_decoration_status: str | None = None


def _ado_auth_headers(pat: str) -> dict[str, str]:
    encoded_pat = base64.b64encode(f":{pat}".encode("utf-8")).decode("ascii")
    return {
        "Authorization": f"Basic {encoded_pat}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-TFS-FedAuthRedirect": "Suppress",
    }


def _post_ado_pr_decoration(
    org_url: str,
    pat: str,
    ado_project: str,
    ado_repo_id: str,
    pr_id: str,
    quality_gate: str,
    metrics: "AnalysisMetrics",
    analysis_id: str,
    platform_url: str,
) -> None:
    """Post a PR status to the Azure DevOps PR Status API."""
    state = "succeeded" if quality_gate == "pass" else "failed"
    description = (
        f"Quality Gate: {'PASS' if quality_gate == 'pass' else 'FAIL'} — "
        f"Security {metrics.security_score}/100, "
        f"Reliability {metrics.reliability_score}/100, "
        f"Maintainability {metrics.maintainability_score}/100"
    )
    body: dict = {
        "state": state,
        "description": description[:200],
        "context": {
            "name": "platform-quality-gate",
            "genre": "static-analysis",
        },
    }
    if platform_url:
        body["targetUrl"] = f"{platform_url.rstrip('/')}/api/v1/analyses/{analysis_id}/view"

    url = (
        f"{org_url.rstrip('/')}/{ado_project}"
        f"/_apis/git/repositories/{ado_repo_id}"
        f"/pullRequests/{pr_id}/statuses?api-version=7.1"
    )
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers=_ado_auth_headers(pat),
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310
            if resp.status not in (200, 201):
                raise RuntimeError(f"ADO returned HTTP {resp.status}")
    except urllib.error.HTTPError as exc:
        body_bytes = exc.read(512)
        raise RuntimeError(
            f"ADO HTTP {exc.code}: {body_bytes.decode('utf-8', errors='replace')}"
        ) from exc


def _post_ado_pr_comment(
    org_url: str,
    pat: str,
    ado_project: str,
    ado_repo_id: str,
    pr_id: str,
    quality_gate: str,
    metrics: "AnalysisMetrics",
    gate_failures: list[str],
    analysis_id: str,
    platform_url: str,
) -> None:
    """Post a discussion thread comment to the Azure DevOps PR."""
    status_label = "PASSED" if quality_gate == "pass" else "FAILED"
    lines = [
        f"Quality Gate {status_label}",
        "",
        f"Security: {metrics.security_score}/100",
        f"Reliability: {metrics.reliability_score}/100",
        f"Maintainability: {metrics.maintainability_score}/100",
        f"Vulnerabilities: {metrics.vulnerabilities}",
        f"Hotspots: {metrics.security_hotspots}",
        f"Bugs: {metrics.bugs}",
        f"Code smells: {metrics.code_smells}",
    ]
    if gate_failures:
        lines.append("")
        lines.append("Blocking conditions:")
        lines.extend(f"- {failure}" for failure in gate_failures[:10])
    if platform_url:
        lines.append("")
        lines.append(f"Analysis details: {platform_url.rstrip('/')}/api/v1/analyses/{analysis_id}/view")

    body = {
        "comments": [
            {
                "parentCommentId": 0,
                "content": "\n".join(lines),
                "commentType": 1,
            }
        ],
        "status": "active",
    }

    url = (
        f"{org_url.rstrip('/')}/{ado_project}"
        f"/_apis/git/repositories/{ado_repo_id}"
        f"/pullRequests/{pr_id}/threads?api-version=7.1"
    )
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode("utf-8"),
        headers=_ado_auth_headers(pat),
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310
            if resp.status not in (200, 201):
                raise RuntimeError(f"ADO returned HTTP {resp.status}")
    except urllib.error.HTTPError as exc:
        body_bytes = exc.read(512)
        raise RuntimeError(
            f"ADO HTTP {exc.code}: {body_bytes.decode('utf-8', errors='replace')}"
        ) from exc


def evaluate_quality_gate(metrics: AnalysisMetrics, gate: QualityGateConfig) -> tuple[str, list[str]]:
    failures: list[str] = []

    if metrics.maintainability_score < gate.min_maintainability_score:
        failures.append(
            f"Maintainability score {metrics.maintainability_score} is below {gate.min_maintainability_score}"
        )
    if metrics.security_score < gate.min_security_score:
        failures.append(f"Security score {metrics.security_score} is below {gate.min_security_score}")
    if metrics.vulnerabilities > gate.max_vulnerabilities:
        failures.append(f"Vulnerabilities {metrics.vulnerabilities} exceed {gate.max_vulnerabilities}")
    if metrics.security_hotspots > gate.max_security_hotspots:
        failures.append(
            f"Security hotspots {metrics.security_hotspots} exceed {gate.max_security_hotspots}"
        )
    if metrics.code_smells > gate.max_code_smells:
        failures.append(f"Code smells {metrics.code_smells} exceed {gate.max_code_smells}")

    return ("fail", failures) if failures else ("pass", [])


def build_metrics(request: AnalysisRequest) -> AnalysisMetrics:
    if any(
        value is not None
        for value in [
            request.reported_maintainability_score,
            request.reported_security_score,
            request.reported_reliability_score,
            request.reported_code_smells,
            request.reported_vulnerabilities,
            request.reported_security_hotspots,
            request.reported_bugs,
            request.reported_duplication,
            request.reported_coverage,
            request.affected_files,
        ]
    ):
        return AnalysisMetrics(
            maintainability_score=request.reported_maintainability_score or 0,
            security_score=request.reported_security_score or 0,
            reliability_score=request.reported_reliability_score or 0,
            code_smells=request.reported_code_smells or 0,
            vulnerabilities=request.reported_vulnerabilities or 0,
            security_hotspots=request.reported_security_hotspots or 0,
            bugs=request.reported_bugs or 0,
            duplication=request.reported_duplication or 0,
            coverage=request.reported_coverage or 0,
            dependency_vulnerabilities=request.reported_dependency_vulnerabilities or 0,
            affected_files=request.affected_files,
        )

    if request.simulated_quality_gate == "fail":
        return AnalysisMetrics(
            maintainability_score=request.simulated_maintainability_score or 58,
            security_score=request.simulated_security_score or 61,
            reliability_score=request.simulated_reliability_score or 60,
            code_smells=request.simulated_code_smells or 47,
            vulnerabilities=request.simulated_vulnerabilities or 3,
            security_hotspots=request.simulated_security_hotspots or 6,
            bugs=request.simulated_bugs or 2,
            duplication=15,
            coverage=request.reported_coverage or 42,
            dependency_vulnerabilities=0,
            affected_files=request.affected_files,
        )

    return AnalysisMetrics(
        maintainability_score=request.simulated_maintainability_score or 91,
        security_score=request.simulated_security_score or 94,
        reliability_score=request.simulated_reliability_score or 89,
        code_smells=request.simulated_code_smells or 8,
        vulnerabilities=request.simulated_vulnerabilities or 0,
        security_hotspots=request.simulated_security_hotspots or 1,
        bugs=request.simulated_bugs or 0,
        duplication=2,
        coverage=request.reported_coverage or 88,
        dependency_vulnerabilities=0,
        affected_files=request.affected_files,
    )


def to_response(record: AnalysisRecord) -> AnalysisResponse:
    raw_affected_files = record.affected_files or "{}"
    try:
        affected_files = json.loads(raw_affected_files)
    except json.JSONDecodeError:
        affected_files = None

    raw_gate_failures = record.gate_failures or "[]"
    try:
        gate_failures = json.loads(raw_gate_failures)
        if not isinstance(gate_failures, list):
            gate_failures = []
    except json.JSONDecodeError:
        gate_failures = []

    return AnalysisResponse(
        analysis_id=record.analysis_id,
        project_key=record.project_key,
        commit_sha=record.commit_sha,
        branch=record.branch,
        ci_provider=record.ci_provider,
        status=record.status,
        quality_gate=record.quality_gate,
        metrics=AnalysisMetrics(
            maintainability_score=record.maintainability_score,
            security_score=record.security_score,
            reliability_score=record.reliability_score,
            code_smells=record.code_smells,
            vulnerabilities=record.vulnerabilities,
            security_hotspots=record.security_hotspots,
            bugs=record.bugs,
            coverage=record.coverage,
            duplication=record.duplication,
            dependency_vulnerabilities=record.dependency_vulnerabilities or 0,
            affected_files=affected_files,
        ),
        gate_failures=gate_failures,
        created_at=record.created_at,
        pr_id=record.pr_id or None,
        pr_decoration_status=record.pr_decoration_status or None,
    )


@router.get("", response_model=list[AnalysisResponse])
def list_analyses(
    _: None = Depends(require_platform_auth),
    session: Session = Depends(get_session),
) -> list[AnalysisResponse]:
    records = session.scalars(
        select(AnalysisRecord).order_by(AnalysisRecord.created_at.desc())
    ).all()
    return [to_response(record) for record in records]


@router.post("", response_model=AnalysisResponse)
def create_analysis(
    request: AnalysisRequest,
    _: None = Depends(require_ci_token_auth),
    session: Session = Depends(get_session),
) -> AnalysisResponse:
    gate = session.get(QualityGateConfig, "default")
    if gate is None:
        gate = QualityGateConfig(id="default")
        session.add(gate)
        session.flush()

    metrics = build_metrics(request)
    quality_gate, gate_failures = evaluate_quality_gate(metrics, gate)
    record = AnalysisRecord(
        analysis_id=str(uuid4()),
        project_key=request.project_key,
        commit_sha=request.commit_sha,
        branch=request.branch,
        ci_provider=request.ci_provider,
        status="completed",
        quality_gate=quality_gate,
        maintainability_score=metrics.maintainability_score,
        security_score=metrics.security_score,
        reliability_score=metrics.reliability_score,
        code_smells=metrics.code_smells,
        vulnerabilities=metrics.vulnerabilities,
        security_hotspots=metrics.security_hotspots,
        bugs=metrics.bugs,
        coverage=metrics.coverage,
        duplication=metrics.duplication,
        dependency_vulnerabilities=metrics.dependency_vulnerabilities,
        affected_files=json.dumps(metrics.affected_files or {}),
        gate_failures=json.dumps(gate_failures),
        created_at=datetime.now(timezone.utc).isoformat(),
        pr_id=request.pr_id or "",
        pr_repo_id=request.pr_repo_id or "",
        pr_ado_project=request.pr_ado_project or "",
        pr_target_branch=request.pr_target_branch or "",
        pr_decoration_status="",
        pr_decoration_error="",
    )
    session.add(record)
    session.commit()
    session.refresh(record)

    # Post PR status decoration when analysis is triggered from a pull request
    if request.pr_id and request.pr_repo_id and request.pr_ado_project:
        decoration_status = "skipped"
        decoration_error = ""
        try:
            ado_config: AzureDevOpsOrganizationConfig | None = None
            if request.pr_ado_org_url:
                normalized_org = request.pr_ado_org_url.rstrip("/")
                ado_config = session.scalars(
                    select(AzureDevOpsOrganizationConfig).where(
                        AzureDevOpsOrganizationConfig.organization_url == normalized_org,
                        AzureDevOpsOrganizationConfig.quality_gate_enabled == True,  # noqa: E712
                    )
                ).first()
            if ado_config is None:
                # Fallback: first org with quality_gate_enabled and a non-empty PAT
                ado_config = session.scalars(
                    select(AzureDevOpsOrganizationConfig).where(
                        AzureDevOpsOrganizationConfig.quality_gate_enabled == True,  # noqa: E712
                        AzureDevOpsOrganizationConfig.pat != "",
                    )
                ).first()
            if ado_config and ado_config.pat:
                _post_ado_pr_decoration(
                    org_url=ado_config.organization_url,
                    pat=ado_config.pat,
                    ado_project=request.pr_ado_project,
                    ado_repo_id=request.pr_repo_id,
                    pr_id=request.pr_id,
                    quality_gate=quality_gate,
                    metrics=metrics,
                    analysis_id=record.analysis_id,
                    platform_url=request.reported_platform_url or "",
                )
                _post_ado_pr_comment(
                    org_url=ado_config.organization_url,
                    pat=ado_config.pat,
                    ado_project=request.pr_ado_project,
                    ado_repo_id=request.pr_repo_id,
                    pr_id=request.pr_id,
                    quality_gate=quality_gate,
                    metrics=metrics,
                    gate_failures=gate_failures,
                    analysis_id=record.analysis_id,
                    platform_url=request.reported_platform_url or "",
                )
                decoration_status = "posted"
            else:
                decoration_status = "skipped"
        except Exception as exc:
            _log.warning("PR decoration failed for PR %s: %s", request.pr_id, exc)
            decoration_status = "error"
            decoration_error = str(exc)[:512]
        record.pr_decoration_status = decoration_status
        record.pr_decoration_error = decoration_error
        session.commit()

    notify_dispatch(quality_gate, {
        "project_key": record.project_key,
        "branch": record.branch,
        "commit_sha": record.commit_sha,
        "analysis_id": record.analysis_id,
        "vulnerabilities": record.vulnerabilities,
        "bugs": record.bugs,
        "code_smells": record.code_smells,
        "security_hotspots": record.security_hotspots,
        "gate_failures": gate_failures,
    })

    return to_response(record)


def _build_repo_file_url(
    repo_provider: str,
    repo_url: str,
    commit_sha: str,
    file_path: str,
    start_line: int | None,
    end_line: int | None,
) -> str | None:
    """Build a deep link to the exact file/line in the source repo, if possible."""
    if not repo_url or repo_provider != "azure-devops":
        return None
    params = {"path": "/" + file_path.lstrip("/")}
    if commit_sha:
        params["version"] = f"GC{commit_sha}"
    if start_line:
        params["line"] = str(start_line)
        params["lineEnd"] = str((end_line or start_line) + 1)
        params["lineStartColumn"] = "1"
        params["lineEndColumn"] = "1"
        params["lineStyle"] = "plain"
    params["_a"] = "contents"
    return f"{repo_url.rstrip('/')}?{urllib.parse.urlencode(params)}"


@router.get("/{analysis_id}/vulnerabilities")
def get_analysis_vulnerabilities(
    analysis_id: str,
    _: None = Depends(require_platform_auth),
    session: Session = Depends(get_session),
):
    """Get vulnerabilities and IOCs for an analysis"""
    record = session.get(AnalysisRecord, analysis_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Analysis not found")

    integration = session.query(ProjectIntegration).filter(
        ProjectIntegration.project_key == record.project_key
    ).first()
    repo_provider = integration.repo_provider if integration else ""
    repo_url = integration.repo_url if integration else ""

    # Helper to convert datetime to ISO string
    def to_iso_string(dt):
        if dt is None:
            return ""
        if isinstance(dt, str):
            return dt
        return dt.isoformat() if hasattr(dt, 'isoformat') else str(dt)

    # Parse affected_files if it exists
    affected_files = {}
    if record.affected_files:
        try:
            affected_files = json.loads(record.affected_files) if isinstance(record.affected_files, str) else record.affected_files
        except (json.JSONDecodeError, TypeError):
            affected_files = {}

    # ── Helpers to parse SCA findings (Trivy, dotnet-audit, etc.) ─────────────

    _SCA_PREFIXES = ("trivy/", "dotnet-audit/", "composer-audit/", "npm-audit/", "pip-audit/")

    def _is_sca(rule: str, category: str) -> bool:
        return category == "dependency_vulnerability" or any(rule.startswith(p) for p in _SCA_PREFIXES)

    def _parse_trivy_message(message: str) -> tuple[str, str, str, float, str]:
        """Return (pkg_name, version, fixed_version, cvss_score, description) from Trivy message."""
        parts = [p.strip() for p in message.split(" | ")]
        pkg_part = parts[0] if parts else message
        at_idx = pkg_part.find("@")
        colon_idx = pkg_part.find(":", at_idx) if at_idx != -1 else -1
        pkg_name = pkg_part[:at_idx] if at_idx != -1 else pkg_part
        version = pkg_part[at_idx + 1:colon_idx] if (at_idx != -1 and colon_idx != -1) else "unknown"
        title = pkg_part[colon_idx + 1:].strip() if colon_idx != -1 else pkg_part
        fixed_version = ""
        cvss_score = 0.0
        description = title
        for part in parts[1:]:
            if part.startswith("fix: upgrade to "):
                fixed_version = part[len("fix: upgrade to "):]
            elif part.startswith("CVSS "):
                try:
                    cvss_score = float(part[5:])
                except ValueError:
                    pass
            elif not part.startswith("fix:") and not part.startswith("CVSS"):
                description = part[:400]
        return pkg_name, version, fixed_version, cvss_score, description

    def _parse_dotnet_message(message: str) -> tuple[str, str, str]:
        """Return (pkg_name, version, advisory_url) from dotnet-audit message."""
        at_idx = message.find("@")
        colon_idx = message.find(":", at_idx) if at_idx != -1 else -1
        pkg_name = message[:at_idx].strip() if at_idx != -1 else "unknown"
        version = message[at_idx + 1:colon_idx] if (at_idx != -1 and colon_idx != -1) else "unknown"
        url = ""
        if "https://" in message:
            url_start = message.find("https://")
            url = message[url_start:].split()[0]
        return pkg_name, version, url

    def _build_sca_entry(file_path: str, issue: dict) -> dict:
        rule = issue.get("rule", "")
        msg = issue.get("message", "")
        severity = str(issue.get("severity", "info")).upper()
        start_line = issue.get("line") or 0
        end_line = issue.get("end_line") or start_line

        if rule.startswith("trivy/"):
            cve_id = rule[len("trivy/"):]
            pkg_name, version, fixed_version, cvss_score, description = _parse_trivy_message(msg)
            # Guess language from file extension
            ext = file_path.rsplit(".", 1)[-1].lower() if "." in file_path else ""
            lang_map = {"json": "npm", "lock": "npm", "csproj": "dotnet", "sln": "dotnet",
                        "txt": "python", "toml": "python", "mod": "go", "sum": "go"}
            language = lang_map.get(ext, "unknown")
            if "deps.json" in file_path:
                language = "dotnet"
            return {
                "cve_id": cve_id,
                "pkg_name": pkg_name,
                "version": version,
                "fixed_version": fixed_version,
                "cvss_score": cvss_score or 5.0,
                "description": description,
                "language": language,
                "fix_available": bool(fixed_version),
                "start_line": start_line,
                "end_line": end_line,
            }

        if rule.startswith("dotnet-audit/"):
            pkg_name, version, url = _parse_dotnet_message(msg)
            advisory_id = url.split("/")[-1] if url else rule[len("dotnet-audit/"):][:20]
            return {
                "cve_id": advisory_id,
                "pkg_name": pkg_name,
                "version": version,
                "fixed_version": "",
                "cvss_score": 5.0,
                "description": msg,
                "language": "dotnet",
                "fix_available": False,
                "start_line": start_line,
                "end_line": end_line,
            }

        if rule.startswith("composer-audit/"):
            advisory_id = rule[len("composer-audit/"):]
            pkg_name = msg.split(":")[0].strip() if ":" in msg else "unknown"
            return {
                "cve_id": advisory_id if advisory_id.upper().startswith("CVE-") else f"GHSA-{advisory_id[:15]}",
                "pkg_name": pkg_name,
                "version": "unknown",
                "fixed_version": "",
                "cvss_score": 5.0,
                "description": msg,
                "language": "php",
                "fix_available": False,
                "start_line": start_line,
                "end_line": end_line,
            }

        if rule.startswith("npm-audit/"):
            advisory_id = rule[len("npm-audit/"):]
            pkg_name = msg.split(":")[0].strip() if ":" in msg else "unknown"
            return {
                "cve_id": f"NPM-{advisory_id}",
                "pkg_name": pkg_name,
                "version": "unknown",
                "fixed_version": "",
                "cvss_score": 5.0,
                "description": msg,
                "language": "javascript",
                "fix_available": False,
                "start_line": start_line,
                "end_line": end_line,
            }

        # pip-audit or unknown SCA
        advisory_id = rule.split("/", 1)[-1] if "/" in rule else rule
        return {
            "cve_id": advisory_id if advisory_id.upper().startswith("CVE-") else advisory_id[:30],
            "pkg_name": msg.split(":")[0].strip() if ":" in msg else "unknown",
            "version": "unknown",
            "fixed_version": "",
            "cvss_score": 5.0,
            "description": msg,
            "language": "unknown",
            "fix_available": False,
            "start_line": start_line,
            "end_line": end_line,
        }

    # ── Extract and classify findings from affected_files ────────────────────

    vulnerabilities = []
    critical_count = 0
    high_count = 0
    medium_count = 0
    low_count = 0

    for file_path, file_data in affected_files.items():
        issues: list[dict] = []
        if isinstance(file_data, list):
            issues = file_data
        elif isinstance(file_data, dict) and file_data.get("severity"):
            # Compact format: single entry per file, no per-finding detail
            issues = [file_data]

        for issue in issues:
            rule = issue.get("rule", "")
            category = issue.get("category", "")
            severity = str(issue.get("severity", "info")).upper()

            if severity == "BLOCKER":
                severity = "CRITICAL"

            if severity == "CRITICAL":
                critical_count += 1
            elif severity == "HIGH":
                high_count += 1
            elif severity == "MEDIUM":
                medium_count += 1
            elif severity == "LOW":
                low_count += 1

            if _is_sca(rule, category):
                sca = _build_sca_entry(file_path, issue)
                start_line = sca["start_line"] or None
                end_line = sca["end_line"] or start_line
                vulnerabilities.append({
                    "id": f"{file_path}:{sca['cve_id']}",
                    "vulnerability_id": sca["cve_id"],
                    "language": sca["language"],
                    "package_name": sca["pkg_name"],
                    "current_version": sca["version"],
                    "vulnerable_versions": "unknown",
                    "fix_available": sca["fix_available"],
                    "fixed_version": sca["fixed_version"] or None,
                    "created_at": to_iso_string(record.created_at),
                    "severity": severity,
                    "cvss_score": sca["cvss_score"],
                    "file_path": file_path,
                    "line": start_line,
                    "end_line": end_line,
                    "source_url": _build_repo_file_url(
                        repo_provider, repo_url, record.commit_sha, file_path, start_line, end_line
                    ),
                    "vulnerability": {
                        "cve_id": sca["cve_id"],
                        "cvss_v3_score": sca["cvss_score"],
                        "cvss_v3_severity": severity,
                        "description": sca["description"],
                    },
                })
            else:
                # SAST finding — keep existing display logic
                msg = issue.get("message", "")
                start_line = issue.get("line") or None
                end_line = issue.get("end_line") or start_line
                rule_label = rule.replace("/", "-")[:40] if rule else "SAST"
                vulnerabilities.append({
                    "id": f"{file_path}:{issue.get('line', 0)}:{rule}",
                    "vulnerability_id": rule,
                    "language": "unknown",
                    "package_name": file_path.split("/")[-1] if "/" in file_path else file_path,
                    "current_version": "unknown",
                    "vulnerable_versions": "unknown",
                    "fix_available": False,
                    "fixed_version": None,
                    "created_at": to_iso_string(record.created_at),
                    "severity": severity,
                    "cvss_score": 5.0,
                    "file_path": file_path,
                    "line": start_line,
                    "end_line": end_line,
                    "source_url": _build_repo_file_url(
                        repo_provider, repo_url, record.commit_sha, file_path, start_line, end_line
                    ),
                    "vulnerability": {
                        "cve_id": rule_label,
                        "cvss_v3_score": 5.0,
                        "cvss_v3_severity": severity,
                        "description": f"{msg} (line {issue.get('line', '?')})" if msg else f"Issue in {file_path}",
                    },
                })

    return {
        "analysis_id": record.analysis_id,
        "project_key": record.project_key,
        "commit_sha": record.commit_sha,
        "branch": record.branch,
        "repo_provider": repo_provider,
        "repo_url": repo_url,
        "total_vulnerabilities": record.vulnerabilities or 0,
        "critical_count": critical_count,
        "high_count": high_count,
        "medium_count": medium_count,
        "low_count": low_count,
        "vulnerabilities": vulnerabilities,
        "iocs": [],  # IOCs can be added later
        "last_scan_date": to_iso_string(record.created_at)
    }


@router.get("/{analysis_id}", response_model=AnalysisResponse)
def get_analysis(
    analysis_id: str,
    _: None = Depends(require_platform_auth),
    session: Session = Depends(get_session),
) -> AnalysisResponse:
    record = session.get(AnalysisRecord, analysis_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Analysis not found")

    return to_response(record)


@router.get("/{analysis_id}/view")
def get_analysis_view(
    analysis_id: str,
    session: Session = Depends(get_session),
):
    """Redirect to analysis view in frontend"""
    from fastapi.responses import RedirectResponse
    
    # Verify analysis exists
    record = session.get(AnalysisRecord, analysis_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    
    # Redirect to frontend (localhost:5174)
    return RedirectResponse(
        url=f"http://localhost:5174/analyses/{analysis_id}",
        status_code=302
    )


@router.delete("/projects/{project_key}")
def delete_project_analyses(
    project_key: str,
    session: Session = Depends(get_session),
    auth = Depends(require_role("admin")),
):
    """Delete all analyses for a project"""
    from sqlalchemy import text
    
    # Get analysis IDs as a string for use in IN clause  
    analysis_ids_result = session.execute(text("""
        SELECT analysis_id FROM analysis_records WHERE project_key = :project_key
    """), {"project_key": project_key}).fetchall()
    
    if not analysis_ids_result:
        return {
            "project_key": project_key,
            "deleted_analyses": 0,
            "message": f"No analyses found for project {project_key}"
        }
    
    analysis_ids = [str(row[0]) for row in analysis_ids_result]
    ids_sql = "(" + ",".join(f"'{id}'" for id in analysis_ids) + ")"
    
    # Delete from all dependent tables in order
    session.execute(text(f"DELETE FROM analysis_iocs WHERE analysis_id IN {ids_sql}"))
    session.execute(text(f"DELETE FROM analysis_vulnerabilities WHERE analysis_id IN {ids_sql}"))
    session.execute(text(f"DELETE FROM vulnerability_scans WHERE analysis_id IN {ids_sql}"))
    
    # Finally delete the main analysis records
    result = session.execute(text("DELETE FROM analysis_records WHERE project_key = :project_key"), {"project_key": project_key})
    session.commit()
    
    deleted_count = result.rowcount
    return {
        "project_key": project_key,
        "deleted_analyses": deleted_count,
        "message": f"Deleted {deleted_count} analyses for project {project_key}"
    }


@router.delete("/projects/{project_key}/branches/{branch}")
def delete_branch_analyses(
    project_key: str,
    branch: str,
    session: Session = Depends(get_session),
    auth = Depends(require_role("admin")),
):
    """Delete all analyses for a specific branch in a project"""
    from sqlalchemy import text
    
    # Get analysis IDs as a string for use in IN clause
    analysis_ids_result = session.execute(text("""
        SELECT analysis_id FROM analysis_records 
        WHERE project_key = :project_key AND branch = :branch
    """), {"project_key": project_key, "branch": branch}).fetchall()
    
    if not analysis_ids_result:
        return {
            "project_key": project_key,
            "branch": branch,
            "deleted_analyses": 0,
            "message": f"No analyses found for {project_key}/{branch}"
        }
    
    analysis_ids = [str(row[0]) for row in analysis_ids_result]
    ids_sql = "(" + ",".join(f"'{id}'" for id in analysis_ids) + ")"
    
    # Delete from all dependent tables in order
    session.execute(text(f"DELETE FROM analysis_iocs WHERE analysis_id IN {ids_sql}"))
    session.execute(text(f"DELETE FROM analysis_vulnerabilities WHERE analysis_id IN {ids_sql}"))
    session.execute(text(f"DELETE FROM vulnerability_scans WHERE analysis_id IN {ids_sql}"))
    
    # Finally delete the main analysis records
    result = session.execute(text("""
        DELETE FROM analysis_records 
        WHERE project_key = :project_key AND branch = :branch
    """), {"project_key": project_key, "branch": branch})
    session.commit()
    
    deleted_count = result.rowcount
    return {
        "project_key": project_key,
        "branch": branch,
        "deleted_analyses": deleted_count,
        "message": f"Deleted {deleted_count} analyses for {project_key}/{branch}"
    }
