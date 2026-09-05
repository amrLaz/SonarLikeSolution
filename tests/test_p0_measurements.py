from app.models import Project, QualityGateConfig
from app.routes.analysis import (
    AnalysisMetrics,
    AnalysisRequest,
    MeasurementValue,
    ToolExecution,
    _measurement_completeness,
    _technical_state,
    build_metrics,
    evaluate_quality_gate_snapshot,
)


def _gate() -> QualityGateConfig:
    return QualityGateConfig(
        id="gate-1",
        name="Pilot",
        min_maintainability_score=50,
        min_security_score=60,
        min_reliability_score=70,
        max_code_smells=10,
        max_vulnerabilities=1,
        max_security_hotspots=2,
        max_bugs=3,
    )


def _metrics(**overrides) -> AnalysisMetrics:
    values = {
        "maintainability_score": 50,
        "security_score": 60,
        "reliability_score": 70,
        "code_smells": 10,
        "vulnerabilities": 1,
        "security_hotspots": 2,
        "bugs": 3,
        "duplication": 0,
        "coverage": 0,
        "dependency_vulnerabilities": 0,
    }
    values.update(overrides)
    return AnalysisMetrics(**values)


def _measured(metrics: AnalysisMetrics) -> dict[str, MeasurementValue]:
    return {
        name: MeasurementValue(state="measured", value=getattr(metrics, name), tool="test")
        for name in (
            "maintainability_score", "security_score", "reliability_score",
            "code_smells", "vulnerabilities", "security_hotspots", "bugs",
        )
    }


def test_all_seven_conditions_pass_at_the_threshold() -> None:
    metrics = _metrics()
    verdict, failures, snapshot = evaluate_quality_gate_snapshot(
        metrics, _gate(), _measured(metrics), "p0-dotnet", "1", "1"
    )
    assert verdict == "pass"
    assert failures == []
    assert len(snapshot["conditions"]) == 7
    assert {condition["result"] for condition in snapshot["conditions"]} == {"pass"}


def test_reliability_and_bugs_are_enforced() -> None:
    metrics = _metrics(reliability_score=69, bugs=4)
    verdict, failures, _ = evaluate_quality_gate_snapshot(
        metrics, _gate(), _measured(metrics), "p0-dotnet", "1", "1"
    )
    assert verdict == "fail"
    assert any("Reliability" in failure for failure in failures)
    assert any("Bugs" in failure for failure in failures)


def test_each_condition_fails_one_step_beyond_its_threshold() -> None:
    cases = {
        "maintainability_score": 49,
        "security_score": 59,
        "reliability_score": 69,
        "code_smells": 11,
        "vulnerabilities": 2,
        "security_hotspots": 3,
        "bugs": 4,
    }
    for metric_name, failing_value in cases.items():
        metrics = _metrics(**{metric_name: failing_value})
        verdict, failures, snapshot = evaluate_quality_gate_snapshot(
            metrics, _gate(), _measured(metrics), "p0-dotnet", "1", "1"
        )
        condition = next(item for item in snapshot["conditions"] if item["metric"] == metric_name)
        assert verdict == "fail", metric_name
        assert failures, metric_name
        assert condition["result"] == "fail", metric_name


def test_persistable_snapshot_does_not_follow_later_gate_changes() -> None:
    gate = _gate()
    metrics = _metrics()
    _, _, snapshot = evaluate_quality_gate_snapshot(metrics, gate, _measured(metrics), "p0-dotnet", "1", "1")
    gate.min_security_score = 100
    security_condition = next(item for item in snapshot["conditions"] if item["metric"] == "security_score")
    assert security_condition["threshold"] == 60
    assert security_condition["result"] == "pass"


def test_missing_measurement_makes_verdict_unknown() -> None:
    metrics = _metrics()
    measurements = _measured(metrics)
    measurements["security_score"] = MeasurementValue(state="failed", tool="semgrep")
    verdict, failures, snapshot = evaluate_quality_gate_snapshot(
        metrics, _gate(), measurements, "platform-sast", "1", "1"
    )
    assert verdict == "unknown"
    assert failures == []
    condition = next(item for item in snapshot["conditions"] if item["metric"] == "security_score")
    assert condition["value"] is None
    assert condition["state"] == "failed"


def test_real_failure_takes_precedence_over_incomplete_measurement() -> None:
    metrics = _metrics(bugs=4)
    measurements = _measured(metrics)
    measurements["security_score"] = MeasurementValue(state="absent")
    verdict, _, _ = evaluate_quality_gate_snapshot(
        metrics, _gate(), measurements, "platform-sast", "1", "1"
    )
    assert verdict == "fail"


def test_explicit_zero_is_preserved_but_absence_is_not_measured() -> None:
    request = AnalysisRequest(
        project_key="project", commit_sha="abcdef", branch="main",
        measurements={
            "bugs": MeasurementValue(state="measured", value=0),
            "coverage": MeasurementValue(state="absent"),
        },
    )
    metrics = build_metrics(request)
    assert metrics.bugs == 0
    assert metrics.coverage is None
    assert request.measurements["bugs"].state == "measured"
    assert request.measurements["coverage"].value is None


def test_authoritative_failed_measurement_ignores_legacy_scalar() -> None:
    request = AnalysisRequest(
        project_key="project", commit_sha="abcdef", branch="main",
        reported_security_score=100,
        measurements={"security_score": MeasurementValue(state="failed", tool="semgrep")},
    )
    assert build_metrics(request).security_score is None


def test_simulated_values_are_ignored_outside_validation_mode() -> None:
    request = AnalysisRequest(
        project_key="project", commit_sha="abcdef", branch="main",
        simulated_security_score=99,
    )
    assert build_metrics(request).security_score is None
    assert build_metrics(request, allow_simulation=True).security_score == 99


def test_completeness_requires_matching_project_profile_and_every_metric() -> None:
    project = Project(
        id="project-id", key="project", name="Project",
        analysis_profile_id="p0-dotnet", analysis_profile_version="1",
    )
    metrics = _metrics()
    request = AnalysisRequest(
        project_key="project", commit_sha="abcdef", branch="main",
        profile_id="p0-dotnet", profile_version="1", measurements=_measured(metrics),
        tool_executions=[
            ToolExecution(tool=tool, version="test", status="success")
            for tool in ("semgrep", "trivy", "gitleaks")
        ],
    )
    assert _measurement_completeness(request, project) == "complete"
    request.formula_version = "unsupported"
    assert _measurement_completeness(request, project) == "incomplete"
    request.formula_version = "1"
    request.measurements["bugs"] = MeasurementValue(state="not_measured")
    assert _measurement_completeness(request, project) == "incomplete"


def test_legacy_payload_is_never_certified_complete() -> None:
    project = Project(id="project-id", key="project", name="Project")
    request = AnalysisRequest(
        project_key="project", commit_sha="abcdef", branch="main",
        reported_security_score=100,
    )
    assert _measurement_completeness(request, project) == "legacy_unverified"


def test_technical_state_is_separate_from_completeness() -> None:
    assert _technical_state("complete", [ToolExecution(tool="semgrep", status="success")]) == "success"
    assert _technical_state("complete", [ToolExecution(tool="semgrep", status="absent")]) == "failed"
    assert _technical_state(
        "incomplete", [ToolExecution(tool="semgrep", status="success")],
        {"security_score": MeasurementValue(state="failed", tool="semgrep")},
    ) == "failed"
    assert _technical_state("incomplete", []) == "incomplete"
    assert _technical_state("legacy_unverified", []) == "legacy_unverified"
