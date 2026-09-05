import base64
from datetime import datetime, timezone
import json
import logging
import os
from typing import Literal
import urllib.error
import urllib.parse
import urllib.request
from uuid import uuid4

from fastapi import Depends, Query
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import allowed_project_keys, assert_project_access, require_platform_auth, require_ci_token_auth, require_role
from app.db import get_session
from app.models import AnalysisRecord, AzureDevOpsOrganizationConfig, Project, ProjectIntegration
from app.models import QualityGateConfig
from app.routes.gates import get_gate_for_project
from app.notify import dispatch as notify_dispatch

_log = logging.getLogger(__name__)


router = APIRouter(prefix="/api/v1/analyses", tags=["analysis"])

MEASURED_METRICS = {
    "maintainability_score", "security_score", "reliability_score", "code_smells",
    "vulnerabilities", "security_hotspots", "bugs", "duplication", "coverage",
    "dependency_vulnerabilities",
}
GATE_METRICS = {
    "maintainability_score", "security_score", "reliability_score", "code_smells",
    "vulnerabilities", "security_hotspots", "bugs",
}
PROFILE_CATALOG = {
    "platform-sast": {"version": "1", "formula_versions": ["1"], "required_metrics": sorted(GATE_METRICS), "required_tools": ["semgrep", "trivy", "gitleaks", "checkov"]},
    "p0-dotnet": {"version": "1", "formula_versions": ["1"], "required_metrics": sorted(GATE_METRICS), "required_tools": ["semgrep", "trivy", "gitleaks"]},
    "p0-react": {"version": "1", "formula_versions": ["1"], "required_metrics": sorted(GATE_METRICS), "required_tools": ["semgrep", "trivy", "gitleaks"]},
    "p0-iac": {"version": "1", "formula_versions": ["1"], "required_metrics": ["security_score", "vulnerabilities"], "required_tools": ["checkov", "trivy", "gitleaks"]},
}


class ToolExecution(BaseModel):
    tool: str = Field(min_length=1, max_length=100)
    version: str | None = Field(default=None, max_length=100)
    status: Literal["success", "failed", "absent", "not_measured"]
    error_code: str | None = Field(default=None, max_length=100)


class MeasurementValue(BaseModel):
    state: Literal["measured", "absent", "failed", "not_measured"]
    value: int | None = Field(default=None, ge=0, le=100000)
    tool: str | None = Field(default=None, max_length=100)
    tool_version: str | None = Field(default=None, max_length=100)

    def model_post_init(self, __context) -> None:
        if self.state == "measured" and self.value is None:
            raise ValueError("A measured value must contain a value")
        if self.state != "measured" and self.value is not None:
            raise ValueError("Only measured values may contain a value")


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
    profile_id: str | None = Field(default=None, max_length=100)
    profile_version: str | None = Field(default=None, max_length=50)
    formula_version: str = Field(default="1", max_length=50)
    tool_executions: list[ToolExecution] = Field(default_factory=list)
    measurements: dict[str, MeasurementValue] = Field(default_factory=dict)
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
    maintainability_score: int | None = Field(default=None, ge=0, le=100)
    security_score: int | None = Field(default=None, ge=0, le=100)
    reliability_score: int | None = Field(default=None, ge=0, le=100)
    code_smells: int | None = Field(default=None, ge=0, le=100000)
    vulnerabilities: int | None = Field(default=None, ge=0, le=10000)
    security_hotspots: int | None = Field(default=None, ge=0, le=10000)
    bugs: int | None = Field(default=None, ge=0, le=10000)
    duplication: int | None = Field(default=None, ge=0, le=100, description="Code duplication percentage (0-100)")
    coverage: int | None = Field(default=None, ge=0, le=100, description="Code coverage percentage (0-100)")
    dependency_vulnerabilities: int | None = Field(default=None, ge=0, description="SCA findings, not counted in security score")
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
    profile_id: str
    profile_version: str
    formula_version: str
    tool_executions: list[ToolExecution]
    measurements: dict[str, MeasurementValue]
    completeness: Literal["complete", "incomplete", "legacy_unverified"]
    technical_state: Literal["success", "failed", "incomplete", "legacy_unverified"]
    gate_snapshot: dict


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
    informative = os.getenv("QUALITY_GATE_ENFORCEMENT", "informative").lower() != "blocking"
    state = "succeeded" if informative or quality_gate == "pass" else "failed"
    description = (
        f"Quality Gate ({'informative' if informative else 'blocking'}): {quality_gate.upper()} — "
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
        body["targetUrl"] = f"{platform_url.rstrip('/')}/?analysis_id={analysis_id}"

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
    status_label = quality_gate.upper()
    enforcement = os.getenv("QUALITY_GATE_ENFORCEMENT", "informative").lower()
    lines = [
        f"Quality Gate {status_label} ({enforcement})",
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


_GATE_RULES = (
    ("maintainability_score", "min", "min_maintainability_score", "Maintainability score"),
    ("security_score", "min", "min_security_score", "Security score"),
    ("reliability_score", "min", "min_reliability_score", "Reliability score"),
    ("code_smells", "max", "max_code_smells", "Code smells"),
    ("vulnerabilities", "max", "max_vulnerabilities", "Vulnerabilities"),
    ("security_hotspots", "max", "max_security_hotspots", "Security hotspots"),
    ("bugs", "max", "max_bugs", "Bugs"),
)


def evaluate_quality_gate_snapshot(
    metrics: AnalysisMetrics,
    gate: QualityGateConfig,
    measurements: dict[str, MeasurementValue],
    profile_id: str,
    profile_version: str,
    formula_version: str,
) -> tuple[str, list[str], dict]:
    failures: list[str] = []
    conditions: list[dict] = []
    has_unknown = False
    for metric_name, direction, threshold_name, label in _GATE_RULES:
        measurement = measurements.get(metric_name)
        threshold = int(getattr(gate, threshold_name))
        value = getattr(metrics, metric_name) if measurement and measurement.state == "measured" else None
        if value is None:
            result = "unknown"
            has_unknown = True
        else:
            passed = value >= threshold if direction == "min" else value <= threshold
            result = "pass" if passed else "fail"
            if not passed:
                comparison = "is below" if direction == "min" else "exceed"
                failures.append(f"{label} {value} {comparison} {threshold}")
        conditions.append({
            "metric": metric_name,
            "operator": ">=" if direction == "min" else "<=",
            "threshold": threshold,
            "value": value,
            "state": measurement.state if measurement else "not_measured",
            "tool": measurement.tool if measurement else None,
            "tool_version": measurement.tool_version if measurement else None,
            "result": result,
        })
    verdict = "fail" if failures else "unknown" if has_unknown else "pass"
    snapshot = {
        "gate_id": gate.id,
        "gate_name": gate.name,
        "profile_id": profile_id,
        "profile_version": profile_version,
        "formula_version": formula_version,
        "conditions": conditions,
    }
    return verdict, failures, snapshot


def evaluate_quality_gate(metrics: AnalysisMetrics, gate: QualityGateConfig) -> tuple[str, list[str]]:
    """Compatibility helper used by focused tests; all supplied metrics are measured."""
    measured = {
        name: MeasurementValue(state="measured", value=getattr(metrics, name))
        for name in GATE_METRICS
    }
    verdict, failures, _ = evaluate_quality_gate_snapshot(metrics, gate, measured, "compat", "1", "1")
    return verdict, failures


def _legacy_or_measurement(request: AnalysisRequest, name: str) -> int | None:
    measurement = request.measurements.get(name)
    if measurement:
        return measurement.value if measurement.state == "measured" else None
    legacy = getattr(request, f"reported_{name}", None)
    return legacy


def build_metrics(request: AnalysisRequest, allow_simulation: bool = False) -> AnalysisMetrics:
    values = {name: _legacy_or_measurement(request, name) for name in MEASURED_METRICS}
    if allow_simulation and not request.measurements:
        defaults = ({
            "maintainability_score": 58, "security_score": 61, "reliability_score": 60,
            "code_smells": 47, "vulnerabilities": 3, "security_hotspots": 6, "bugs": 2,
        } if request.simulated_quality_gate == "fail" else {
            "maintainability_score": 91, "security_score": 94, "reliability_score": 89,
            "code_smells": 8, "vulnerabilities": 0, "security_hotspots": 1, "bugs": 0,
        })
        for name in GATE_METRICS:
            simulated = getattr(request, f"simulated_{name}", None)
            values[name] = simulated if simulated is not None else defaults[name]
    return AnalysisMetrics(**values, affected_files=request.affected_files)


def _measurement_completeness(
    request: AnalysisRequest,
    project: Project,
) -> Literal["complete", "incomplete", "legacy_unverified"]:
    if not request.measurements:
        return "legacy_unverified"
    if not project.analysis_profile_id or not project.analysis_profile_version:
        return "incomplete"
    if request.profile_id != project.analysis_profile_id or request.profile_version != project.analysis_profile_version:
        return "incomplete"
    profile = PROFILE_CATALOG.get(project.analysis_profile_id)
    if not profile or profile["version"] != project.analysis_profile_version:
        return "incomplete"
    if request.formula_version not in profile["formula_versions"]:
        return "incomplete"
    required_metrics = profile["required_metrics"]
    if any(request.measurements.get(name) is None or request.measurements[name].state != "measured" for name in required_metrics):
        return "incomplete"
    executions = {execution.tool: execution.status for execution in request.tool_executions}
    if any(executions.get(tool) != "success" for tool in profile["required_tools"]):
        return "incomplete"
    return "complete"


def _technical_state(
    completeness: Literal["complete", "incomplete", "legacy_unverified"],
    executions: list[ToolExecution] | list[dict],
    measurements: dict[str, MeasurementValue] | dict[str, dict] | None = None,
) -> Literal["success", "failed", "incomplete", "legacy_unverified"]:
    if completeness == "legacy_unverified":
        return "legacy_unverified"
    statuses = {
        execution.status if isinstance(execution, ToolExecution) else execution.get("status")
        for execution in executions
    }
    measurement_states = {
        measurement.state if isinstance(measurement, MeasurementValue) else measurement.get("state")
        for measurement in (measurements or {}).values()
    }
    if statuses.intersection({"failed", "absent"}) or measurement_states.intersection({"failed", "absent"}):
        return "failed"
    if completeness != "complete" or "not_measured" in statuses or "not_measured" in measurement_states:
        return "incomplete"
    return "success"


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

    try:
        measurements = json.loads(record.measurements or "{}")
        tool_executions = json.loads(record.tool_executions or "[]")
        gate_snapshot = json.loads(record.gate_snapshot or "{}")
    except (json.JSONDecodeError, TypeError):
        measurements, tool_executions, gate_snapshot = {}, [], {}

    completeness = record.completeness or "legacy_unverified"
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
            dependency_vulnerabilities=record.dependency_vulnerabilities,
            affected_files=affected_files,
        ),
        gate_failures=gate_failures,
        created_at=record.created_at,
        pr_id=record.pr_id or None,
        pr_decoration_status=record.pr_decoration_status or None,
        profile_id=record.profile_id or "legacy",
        profile_version=record.profile_version or "0",
        formula_version=record.formula_version or "0",
        tool_executions=tool_executions,
        measurements=measurements,
        completeness=completeness,
        technical_state=gate_snapshot.get("technical_state") or _technical_state(completeness, tool_executions, measurements),
        gate_snapshot=gate_snapshot,
    )


@router.get("", response_model=list[AnalysisResponse])
def list_analyses(
    project_key: str | None = Query(None),
    principal: dict = Depends(require_platform_auth),
    session: Session = Depends(get_session),
) -> list[AnalysisResponse]:
    from sqlalchemy import text as _text
    if project_key:
        assert_project_access(principal, session, project_key)
        # Filtered by project: include affected_files (needed by Issues tab).
        records = session.execute(_text("""
            SELECT * FROM analysis_records
            WHERE project_key = :pk
            ORDER BY created_at DESC
        """), {"pk": project_key}).mappings().all()
        return [_row_to_response(r, include_findings=True) for r in records]
    else:
        visible_keys = sorted(allowed_project_keys(principal, session))
        if not visible_keys:
            return []
        # Global list: exclude affected_files (can be MB per row).
        rows = session.execute(_text("""
            SELECT analysis_id, project_key, commit_sha, branch, ci_provider,
                   status, quality_gate, maintainability_score, security_score,
                   reliability_score, code_smells, vulnerabilities, security_hotspots,
                   bugs, coverage, duplication, dependency_vulnerabilities,
                   gate_failures, created_at, pr_id, pr_decoration_status,
                   measurements, tool_executions, completeness, profile_id,
                   profile_version, formula_version, gate_snapshot
            FROM analysis_records
            WHERE project_key = ANY(:visible_keys)
            ORDER BY created_at DESC
        """), {"visible_keys": visible_keys}).mappings().all()
        return [_row_to_response(r) for r in rows]


def _row_to_response(r: dict, include_findings: bool = False) -> AnalysisResponse:
    try:
        gate_failures = json.loads(r["gate_failures"] or "[]")
        if not isinstance(gate_failures, list):
            gate_failures = []
    except (json.JSONDecodeError, TypeError):
        gate_failures = []

    affected_files = None
    if include_findings and r.get("affected_files"):
        try:
            raw = r["affected_files"]
            affected_files = json.loads(raw) if isinstance(raw, str) else raw
        except (json.JSONDecodeError, TypeError):
            affected_files = None

    def _json_value(name: str, default):
        try:
            raw = r.get(name)
            return json.loads(raw) if isinstance(raw, str) else (raw if raw is not None else default)
        except (json.JSONDecodeError, TypeError):
            return default

    completeness = r.get("completeness") or "legacy_unverified"
    tool_executions = _json_value("tool_executions", [])
    gate_snapshot = _json_value("gate_snapshot", {})
    return AnalysisResponse(
        analysis_id=r["analysis_id"],
        project_key=r["project_key"],
        commit_sha=r["commit_sha"],
        branch=r["branch"],
        ci_provider=r["ci_provider"],
        status=r["status"],
        quality_gate=r["quality_gate"],
        metrics=AnalysisMetrics(
            maintainability_score=r["maintainability_score"],
            security_score=r["security_score"],
            reliability_score=r["reliability_score"],
            code_smells=r["code_smells"],
            vulnerabilities=r["vulnerabilities"],
            security_hotspots=r["security_hotspots"],
            bugs=r["bugs"],
            coverage=r["coverage"],
            duplication=r["duplication"],
            dependency_vulnerabilities=r["dependency_vulnerabilities"],
            affected_files=affected_files,
        ),
        gate_failures=gate_failures,
        created_at=str(r["created_at"]),
        pr_id=r["pr_id"] or None,
        pr_decoration_status=r["pr_decoration_status"] or None,
        profile_id=r.get("profile_id") or "legacy",
        profile_version=r.get("profile_version") or "0",
        formula_version=r.get("formula_version") or "0",
        tool_executions=tool_executions,
        measurements=_json_value("measurements", {}),
        completeness=completeness,
        technical_state=gate_snapshot.get("technical_state") or _technical_state(
            completeness, tool_executions, _json_value("measurements", {})
        ),
        gate_snapshot=gate_snapshot,
    )


@router.post("", response_model=AnalysisResponse)
def create_analysis(
    request: AnalysisRequest,
    principal: dict = Depends(require_ci_token_auth),
    session: Session = Depends(get_session),
) -> AnalysisResponse:
    project = session.query(Project).filter(Project.key == request.project_key).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project must be registered before publishing an analysis")
    assert_project_access(principal, session, request.project_key, "analysis:write")
    simulated_requested = request.simulated_quality_gate is not None or any(
        getattr(request, f"simulated_{name}", None) is not None for name in GATE_METRICS
    )
    allow_simulation = (
        os.getenv("PLATFORM_VALIDATION_MODE", "false").lower() == "true"
        and request.project_key == os.getenv("PLATFORM_VALIDATION_PROJECT_KEY", "")
    )
    if simulated_requested and not allow_simulation:
        raise HTTPException(status_code=403, detail="Simulation is restricted to the configured validation project")
    gate = get_gate_for_project(session, request.project_key)

    metrics = build_metrics(request, allow_simulation=allow_simulation)
    measurements = dict(request.measurements)
    if simulated_requested and allow_simulation and not measurements:
        measurements = {
            name: MeasurementValue(state="measured", value=getattr(metrics, name), tool="validation-simulator")
            for name in GATE_METRICS
        }
    profile_id = request.profile_id or project.analysis_profile_id or "legacy"
    profile_version = request.profile_version or project.analysis_profile_version or "0"
    simulation_profile = PROFILE_CATALOG.get(project.analysis_profile_id or "")
    simulation_contract_valid = bool(
        simulated_requested
        and allow_simulation
        and simulation_profile
        and request.profile_id == project.analysis_profile_id
        and request.profile_version == project.analysis_profile_version
        and request.formula_version in simulation_profile["formula_versions"]
    )
    completeness = "complete" if simulation_contract_valid else _measurement_completeness(request, project)
    quality_gate, gate_failures, gate_snapshot = evaluate_quality_gate_snapshot(
        metrics, gate, measurements, profile_id, profile_version, request.formula_version
    )
    technical_state = (
        "success" if simulated_requested and allow_simulation
        else _technical_state(completeness, request.tool_executions, measurements)
    )
    if completeness != "complete" and quality_gate != "fail":
        quality_gate = "unknown"
    gate_snapshot["completeness"] = completeness
    gate_snapshot["technical_state"] = technical_state
    if completeness != "complete":
        failed_tools = sorted(
            execution.tool for execution in request.tool_executions if execution.status != "success"
        )
        _log.warning(
            "Analysis contract incomplete project=%s completeness=%s failed_tools=%s",
            request.project_key, completeness, failed_tools,
        )
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
        measurements=json.dumps({name: value.model_dump() for name, value in measurements.items()}),
        tool_executions=json.dumps([execution.model_dump() for execution in request.tool_executions]),
        completeness=completeness,
        profile_id=profile_id,
        profile_version=profile_version,
        formula_version=request.formula_version,
        gate_snapshot=json.dumps(gate_snapshot),
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
    # Strip git-clone credential prefix: https://user@host → https://host
    import re as _re
    clean_url = _re.sub(r'^https://[^/@]+@', 'https://', repo_url)
    # Reject placeholder / non-ADO URLs
    if 'github.com' in clean_url or 'your-org' in clean_url or 'your-repo' in clean_url:
        return None
    repo_url = clean_url
    # Convert absolute build-agent paths to repo-relative paths.
    rel_path = file_path
    # Strategy 1: repo name embedded in path (e.g. /mnt/vss/_work/4/s/RepoName/src/f.cs)
    m = _re.search(r'/_git/([^/?#]+)', repo_url)
    if m and _re.search(r'[\\/]' + _re.escape(m.group(1)) + r'[\\/]', file_path):
        parts = _re.split(r'[\\/]' + _re.escape(m.group(1)) + r'[\\/]', file_path, maxsplit=1)
        if len(parts) == 2:
            rel_path = parts[1]
    else:
        # Strategy 2: known ADO/VSTS agent prefix without repo name
        # e.g. /home/vsts/work/1/app/src/f.cs  or  /mnt/vss/_work/4/s/src/f.cs
        rel_path = _re.sub(
            r'^(?:/home/vsts/work|/mnt/vss/_work|/agent/_work)/\d+/[^/]+/',
            '',
            file_path,
        )
    # Strip leftover MSBuild "N>" prefix that Roslyn sometimes prepends
    rel_path = _re.sub(r'^\d+>', '', rel_path)
    params = {"path": "/" + rel_path.lstrip("/\\")}
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
    principal: dict = Depends(require_platform_auth),
    session: Session = Depends(get_session),
):
    """Get vulnerabilities and IOCs for an analysis"""
    record = session.get(AnalysisRecord, analysis_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    assert_project_access(principal, session, record.project_key)

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
        return category in {"dependency", "dependency_vulnerability"} or any(rule.startswith(p) for p in _SCA_PREFIXES)

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
        rule = issue.get("rule_id") or issue.get("rule", "")
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
        # Legacy aggregate dictionaries contain no durable finding identity and
        # therefore stay summaries instead of being expanded into fake details.

        for issue in issues:
            rule = issue.get("rule_id") or issue.get("rule", "")
            category = issue.get("category", "")
            tool = issue.get("tool", "unknown")
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
                    "category": "dependency",
                    "tool": tool,
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
                    "category": category if category in {"secret", "code", "ioc", "unknown"} else "unknown",
                    "tool": tool,
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

    # Enrich with CISA KEV flags
    from app.routes.kev import get_kev_ids
    kev_ids = get_kev_ids(session)
    for v in vulnerabilities:
        cve = (v.get("vulnerability") or {}).get("cve_id", "")
        v["kev"] = bool(cve and cve.upper() in kev_ids)

    kev_count = sum(1 for v in vulnerabilities if v.get("kev"))

    return {
        "analysis_id": record.analysis_id,
        "project_key": record.project_key,
        "commit_sha": record.commit_sha,
        "branch": record.branch,
        "repo_provider": repo_provider,
        "repo_url": repo_url,
        "total_vulnerabilities": record.vulnerabilities,
        "critical_count": critical_count,
        "high_count": high_count,
        "medium_count": medium_count,
        "low_count": low_count,
        "kev_count": kev_count,
        "vulnerabilities": vulnerabilities,
        "iocs": [],
        "last_scan_date": to_iso_string(record.created_at)
    }


class AiFixRequest(BaseModel):
    cve_id: str = ""
    pkg_name: str = ""
    version: str = ""
    fixed_version: str = ""
    description: str = ""
    language: str = ""
    severity: str = ""
    rule_id: str = ""
    message: str = ""
    file_path: str = ""


@router.post("/{analysis_id}/ai-fix")
async def ai_fix_suggestion(
    analysis_id: str,
    req: AiFixRequest,
    principal: dict = Depends(require_role("admin")),
    session: Session = Depends(get_session),
):
    """Return an AI-generated fix suggestion. Uses Azure OpenAI if configured, else Anthropic."""
    import os
    import httpx

    az_endpoint = os.getenv("AZURE_OPENAI_ENDPOINT", "").rstrip("/")
    az_key = os.getenv("AZURE_OPENAI_API_KEY", "")
    az_deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")
    az_api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-15-preview")
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")

    if not az_endpoint and not anthropic_key:
        raise HTTPException(
            status_code=503,
            detail="AI fix suggestions not configured — set AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_API_KEY, or ANTHROPIC_API_KEY",
        )

    record = session.get(AnalysisRecord, analysis_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    assert_project_access(principal, session, record.project_key)

    # Build a focused, context-rich prompt
    if req.cve_id and req.pkg_name:
        context = (
            f"CVE: {req.cve_id}\n"
            f"Package: {req.pkg_name}@{req.version} ({req.language})\n"
            f"Severity: {req.severity}\n"
            + (f"Fix: upgrade to {req.fixed_version}\n" if req.fixed_version else "No official fix available yet\n")
            + f"Description: {req.description or 'No description available'}"
        )
        task = "dependency vulnerability (CVE in a third-party package)"
    else:
        context = (
            f"Rule: {req.rule_id}\n"
            f"File: {req.file_path}\n"
            f"Severity: {req.severity}\n"
            f"Finding: {req.message}\n"
            f"Language: {req.language or 'unknown'}"
        )
        task = "SAST finding (code issue)"

    prompt = (
        f"You are a security expert reviewing a {task} found during a SAST scan.\n\n"
        f"{context}\n\n"
        "Respond with:\n"
        "1. **Why it matters** — 1 sentence on the real-world risk\n"
        "2. **Fix** — the exact command, code change, or configuration to resolve it (be precise and concrete)\n"
        "3. **Verification** — 1 sentence on how to confirm it is fixed\n\n"
        "Keep the total response under 200 words. Use markdown formatting."
    )

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            if az_endpoint and az_key:
                # Azure OpenAI — OpenAI-compatible chat completions
                url = f"{az_endpoint}/openai/deployments/{az_deployment}/chat/completions?api-version={az_api_version}"
                resp = await client.post(
                    url,
                    headers={"api-key": az_key, "content-type": "application/json"},
                    json={
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": 512,
                        "temperature": 0.3,
                    },
                )
                if resp.status_code != 200:
                    raise HTTPException(status_code=502, detail=f"Azure OpenAI returned {resp.status_code}: {resp.text[:200]}")
                suggestion = resp.json()["choices"][0]["message"]["content"]
                model_used = f"azure/{az_deployment}"
            else:
                # Anthropic fallback
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": anthropic_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": "claude-haiku-4-5-20251001",
                        "max_tokens": 512,
                        "messages": [{"role": "user", "content": prompt}],
                    },
                )
                if resp.status_code != 200:
                    raise HTTPException(status_code=502, detail=f"Anthropic returned {resp.status_code}")
                suggestion = resp.json()["content"][0]["text"]
                model_used = "claude-haiku-4-5-20251001"

    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="AI service timeout") from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI service error: {exc}") from exc

    return {
        "suggestion": suggestion,
        "cve_id": req.cve_id,
        "rule_id": req.rule_id,
        "model": model_used,
    }


@router.get("/export/csv")
def export_project_csv(
    project_key: str,
    principal: dict = Depends(require_platform_auth),
    session: Session = Depends(get_session),
):
    """Export all analyses for a project as CSV — one row per analysis."""
    import csv
    import io
    from fastapi.responses import StreamingResponse

    assert_project_access(principal, session, project_key)

    records = session.scalars(
        select(AnalysisRecord)
        .where(AnalysisRecord.project_key == project_key)
        .order_by(AnalysisRecord.created_at.desc())
    ).all()

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "analysis_id", "project_key", "branch", "commit_sha", "ci_provider",
        "quality_gate", "created_at",
        "security_score", "maintainability_score", "reliability_score",
        "vulnerabilities", "security_hotspots", "bugs", "code_smells",
        "coverage", "duplication", "dependency_vulnerabilities",
        "gate_failures", "completeness", "profile_id", "profile_version", "formula_version", "gate_snapshot",
    ])
    for r in records:
        failures = []
        try:
            failures = json.loads(r.gate_failures or "[]")
        except json.JSONDecodeError:
            pass
        writer.writerow([
            r.analysis_id, r.project_key, r.branch, r.commit_sha, r.ci_provider,
            r.quality_gate, r.created_at,
            r.security_score, r.maintainability_score, r.reliability_score,
            r.vulnerabilities, r.security_hotspots, r.bugs, r.code_smells,
            r.coverage, r.duplication, r.dependency_vulnerabilities,
            "; ".join(failures), r.completeness, r.profile_id, r.profile_version,
            r.formula_version, r.gate_snapshot,
        ])

    safe_key = "".join(c if c.isalnum() or c in "-_" else "_" for c in project_key)
    filename = f"sast-{safe_key}-history.csv"
    return StreamingResponse(
        iter([buf.getvalue().encode("utf-8")]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{analysis_id}", response_model=AnalysisResponse)
def get_analysis(
    analysis_id: str,
    principal: dict = Depends(require_platform_auth),
    session: Session = Depends(get_session),
) -> AnalysisResponse:
    record = session.get(AnalysisRecord, analysis_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    assert_project_access(principal, session, record.project_key)

    return to_response(record)


@router.get("/{analysis_id}/view")
def get_analysis_view(
    analysis_id: str,
    principal: dict = Depends(require_platform_auth),
    session: Session = Depends(get_session),
):
    """Redirect to analysis view in frontend"""
    from fastapi.responses import RedirectResponse
    
    # Verify analysis exists
    record = session.get(AnalysisRecord, analysis_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    assert_project_access(principal, session, record.project_key)
    
    # Redirect to frontend (localhost:5174)
    return RedirectResponse(
        url=f"http://localhost:5174/analyses/{analysis_id}",
        status_code=302
    )


@router.get("/{analysis_id}/export/csv")
def export_analysis_csv(
    analysis_id: str,
    principal: dict = Depends(require_platform_auth),
    session: Session = Depends(get_session),
):
    """Export a single analysis as a one-row CSV."""
    import csv
    import io
    from fastapi.responses import StreamingResponse

    record = session.get(AnalysisRecord, analysis_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    assert_project_access(principal, session, record.project_key)

    failures: list[str] = []
    try:
        failures = json.loads(record.gate_failures or "[]")
    except json.JSONDecodeError:
        pass

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "analysis_id", "project_key", "branch", "commit_sha", "ci_provider",
        "quality_gate", "created_at",
        "security_score", "maintainability_score", "reliability_score",
        "vulnerabilities", "security_hotspots", "bugs", "code_smells",
        "coverage", "duplication", "dependency_vulnerabilities",
        "gate_failures", "completeness", "profile_id", "profile_version", "formula_version", "gate_snapshot",
    ])
    writer.writerow([
        record.analysis_id, record.project_key, record.branch, record.commit_sha,
        record.ci_provider, record.quality_gate, record.created_at,
        record.security_score, record.maintainability_score, record.reliability_score,
        record.vulnerabilities, record.security_hotspots, record.bugs,
        record.code_smells, record.coverage, record.duplication,
        record.dependency_vulnerabilities,
        "; ".join(failures), record.completeness, record.profile_id,
        record.profile_version, record.formula_version, record.gate_snapshot,
    ])

    filename = f"sast-{analysis_id[:8]}.csv"
    return StreamingResponse(
        iter([buf.getvalue().encode("utf-8")]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/{analysis_id}/export/pdf")
def export_analysis_pdf(
    analysis_id: str,
    principal: dict = Depends(require_platform_auth),
    session: Session = Depends(get_session),
):
    """Generate a PDF report for a single analysis."""
    from fastapi.responses import Response
    from fpdf import FPDF

    record = session.get(AnalysisRecord, analysis_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Analysis not found")
    assert_project_access(principal, session, record.project_key)

    failures: list[str] = []
    gate_snapshot: dict = {}
    measurements: dict = {}
    try:
        failures = json.loads(record.gate_failures or "[]")
        gate_snapshot = json.loads(record.gate_snapshot or "{}")
        measurements = json.loads(record.measurements or "{}")
    except json.JSONDecodeError:
        pass

    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    pdf = FPDF()
    pdf.set_margins(20, 20, 20)
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=20)

    # ── Header ──────────────────────────────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(15, 118, 110)  # teal
    pdf.cell(0, 10, "CodeInsights", ln=True)
    pdf.set_font("Helvetica", "", 12)
    pdf.set_text_color(80, 80, 80)
    pdf.cell(0, 6, "Security Analysis Report", ln=True)
    pdf.ln(4)
    pdf.set_draw_color(15, 118, 110)
    pdf.set_line_width(0.5)
    pdf.line(20, pdf.get_y(), 190, pdf.get_y())
    pdf.ln(6)

    # ── Analysis metadata ────────────────────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(40, 40, 40)
    pdf.cell(0, 7, "Analysis Details", ln=True)
    pdf.ln(2)

    meta_rows = [
        ("Project", record.project_key),
        ("Branch", record.branch),
        ("Commit", record.commit_sha[:12] + ("..." if len(record.commit_sha) > 12 else "")),
        ("CI Provider", record.ci_provider),
        ("Completeness", record.completeness or "legacy_unverified"),
        ("Profile", f"{record.profile_id or 'legacy'}/{record.profile_version or 'unverified'}"),
        ("Formula", record.formula_version or "unverified"),
        ("Analysis ID", record.analysis_id),
        ("Analysed at", str(record.created_at)[:19].replace("T", " ") + " UTC"),
        ("Report generated", generated_at),
    ]
    pdf.set_font("Helvetica", "", 10)
    pdf.set_fill_color(245, 245, 245)
    for i, (label, value) in enumerate(meta_rows):
        pdf.set_fill_color(248, 248, 248) if i % 2 == 0 else pdf.set_fill_color(255, 255, 255)
        pdf.cell(55, 6, label + ":", fill=True)
        pdf.cell(0, 6, str(value), fill=True, ln=True)
    pdf.ln(6)

    # ── Quality gate status ──────────────────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(40, 40, 40)
    pdf.cell(0, 7, "Quality Gate", ln=True)
    pdf.ln(2)

    if record.quality_gate == "pass":
        pdf.set_fill_color(232, 245, 233)
        pdf.set_text_color(46, 125, 50)
        status_text = "PASSED"
    elif record.quality_gate == "fail":
        pdf.set_fill_color(255, 235, 238)
        pdf.set_text_color(198, 40, 40)
        status_text = "FAILED"
    else:
        pdf.set_fill_color(255, 248, 225)
        pdf.set_text_color(156, 103, 0)
        status_text = "UNKNOWN"

    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 12, status_text, fill=True, ln=True, align="C")
    pdf.set_text_color(40, 40, 40)
    pdf.ln(4)

    if failures:
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(0, 6, "Blocking conditions:", ln=True)
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(198, 40, 40)
        for f in failures:
            pdf.cell(8)
            pdf.cell(0, 5, f"- {f}", ln=True)
        pdf.set_text_color(40, 40, 40)
        pdf.ln(4)

    # ── Metrics table ────────────────────────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 7, "Metrics", ln=True)
    pdf.ln(2)

    labels = {
        "security_score": "Security Score",
        "maintainability_score": "Maintainability Score",
        "reliability_score": "Reliability Score",
        "vulnerabilities": "Vulnerabilities",
        "security_hotspots": "Security Hotspots",
        "bugs": "Bugs",
        "code_smells": "Code Smells",
    }
    conditions = {
        condition.get("metric"): condition
        for condition in gate_snapshot.get("conditions", [])
        if isinstance(condition, dict)
    }
    metrics_rows = []
    for metric_name, label in labels.items():
        condition = conditions.get(metric_name, {})
        measurement = measurements.get(metric_name, {})
        state = condition.get("state") or measurement.get("state") or "not_measured"
        value = condition.get("value")
        display_value = str(value) if state == "measured" and value is not None else state.replace("_", " ")
        metrics_rows.append((label, display_value, condition.get("result", "unknown")))

    # Column widths
    col_label = 80
    col_value = 40
    col_status = 40

    pdf.set_font("Helvetica", "B", 9)
    pdf.set_fill_color(15, 118, 110)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(col_label, 7, "Metric", fill=True, border=0)
    pdf.cell(col_value, 7, "Value", fill=True, border=0, align="C")
    pdf.cell(col_status, 7, "Status", fill=True, border=0, align="C", ln=True)

    pdf.set_font("Helvetica", "", 9)
    for i, (label, value, result) in enumerate(metrics_rows):
        pdf.set_fill_color(248, 248, 248) if i % 2 == 0 else pdf.set_fill_color(255, 255, 255)
        pdf.set_text_color(40, 40, 40)
        pdf.cell(col_label, 6, label, fill=True)
        pdf.cell(col_value, 6, value, fill=True, align="C")
        if result == "pass":
            pdf.set_text_color(46, 125, 50)
            pdf.cell(col_status, 6, "OK", fill=True, align="C", ln=True)
        elif result == "fail":
            pdf.set_text_color(198, 40, 40)
            pdf.cell(col_status, 6, "Failed", fill=True, align="C", ln=True)
        else:
            pdf.set_text_color(156, 103, 0)
            pdf.cell(col_status, 6, "Unknown", fill=True, align="C", ln=True)

    pdf.set_text_color(40, 40, 40)
    pdf.ln(8)

    # ── Footer ───────────────────────────────────────────────────────────────────
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(150, 150, 150)
    pdf.cell(0, 5, f"Generated by CodeInsights on {generated_at}", ln=True, align="C")
    pdf.cell(0, 5, "This report is confidential. Do not distribute outside your organisation.", ln=True, align="C")

    pdf_bytes = pdf.output()
    filename = f"sast-report-{analysis_id[:8]}.pdf"
    return Response(
        content=bytes(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
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
