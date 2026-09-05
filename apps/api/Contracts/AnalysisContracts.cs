using System.Text.Json;
using System.Text.Json.Serialization;

namespace CodeInsights.Api.Contracts;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record ToolExecution(
    [property: JsonRequired] string Tool,
    [property: JsonRequired] string Status,
    string? Version = null,
    string? ErrorCode = null
);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record MeasurementValue(
    [property: JsonRequired] string State,
    int? Value = null,
    string? Tool = null,
    string? ToolVersion = null
);

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed class AnalysisRequest
{
    [JsonRequired]
    public string ProjectKey { get; set; } = "";

    [JsonRequired]
    public string CommitSha { get; set; } = "";

    [JsonRequired]
    public string Branch { get; set; } = "";

    [JsonRequired]
    public string CiProvider { get; set; } = "local";

    [JsonRequired]
    public string ProfileId { get; set; } = "";

    [JsonRequired]
    public string ProfileVersion { get; set; } = "";

    [JsonRequired]
    public string FormulaVersion { get; set; } = "";

    [JsonRequired]
    public Dictionary<string, MeasurementValue> Measurements { get; set; } = [];

    [JsonRequired]
    public List<ToolExecution> ToolExecutions { get; set; } = [];
    public Dictionary<string, JsonElement>? AffectedFiles { get; set; }
    public string? PrId { get; set; }
    public string? PrRepoId { get; set; }
    public string? PrAdoProject { get; set; }
    public string? PrTargetBranch { get; set; }
    public string? PrAdoOrgUrl { get; set; }
    public string? PlatformUrl { get; set; }
}

public sealed class AnalysisMetrics
{
    public int? MaintainabilityScore { get; set; }
    public int? SecurityScore { get; set; }
    public int? ReliabilityScore { get; set; }
    public int? CodeSmells { get; set; }
    public int? Vulnerabilities { get; set; }
    public int? SecurityHotspots { get; set; }
    public int? Bugs { get; set; }
    public int? Duplication { get; set; }
    public int? Coverage { get; set; }
    public int? DependencyVulnerabilities { get; set; }
    public Dictionary<string, JsonElement>? AffectedFiles { get; set; }

    public int? Get(string name) =>
        name switch
        {
            "maintainability_score" => MaintainabilityScore,
            "security_score" => SecurityScore,
            "reliability_score" => ReliabilityScore,
            "code_smells" => CodeSmells,
            "vulnerabilities" => Vulnerabilities,
            "security_hotspots" => SecurityHotspots,
            "bugs" => Bugs,
            "coverage" => Coverage,
            "duplication" => Duplication,
            "dependency_vulnerabilities" => DependencyVulnerabilities,
            _ => null,
        };

    public void Set(string name, int? value)
    {
        switch (name)
        {
            case "maintainability_score":
                MaintainabilityScore = value;
                break;
            case "security_score":
                SecurityScore = value;
                break;
            case "reliability_score":
                ReliabilityScore = value;
                break;
            case "code_smells":
                CodeSmells = value;
                break;
            case "vulnerabilities":
                Vulnerabilities = value;
                break;
            case "security_hotspots":
                SecurityHotspots = value;
                break;
            case "bugs":
                Bugs = value;
                break;
            case "coverage":
                Coverage = value;
                break;
            case "duplication":
                Duplication = value;
                break;
            case "dependency_vulnerabilities":
                DependencyVulnerabilities = value;
                break;
        }
    }
}

public sealed record AnalysisResponse(
    string AnalysisId,
    string ProjectKey,
    string CommitSha,
    string Branch,
    string CiProvider,
    string Status,
    string QualityGate,
    AnalysisMetrics Metrics,
    List<string> GateFailures,
    string CreatedAt,
    string? PrId,
    string? PrDecorationStatus,
    string ProfileId,
    string ProfileVersion,
    string FormulaVersion,
    List<ToolExecution> ToolExecutions,
    Dictionary<string, MeasurementValue> Measurements,
    string Completeness,
    string TechnicalState,
    Dictionary<string, JsonElement> GateSnapshot
);

public sealed class AiFixRequest
{
    public string CveId { get; set; } = "";
    public string PkgName { get; set; } = "";
    public string Version { get; set; } = "";
    public string FixedVersion { get; set; } = "";
    public string Description { get; set; } = "";
    public string Language { get; set; } = "";
    public string Severity { get; set; } = "";
    public string RuleId { get; set; } = "";
    public string Message { get; set; } = "";
    public string FilePath { get; set; } = "";

    public void Validate()
    {
        foreach (
            var (field, value) in new (string, string?)[]
            {
                ("cve_id", CveId),
                ("pkg_name", PkgName),
                ("version", Version),
                ("fixed_version", FixedVersion),
                ("description", Description),
                ("language", Language),
                ("severity", Severity),
                ("rule_id", RuleId),
                ("message", Message),
                ("file_path", FilePath),
            }
        )
            if (value is null)
                throw new ApiException(
                    422,
                    new[]
                    {
                        new
                        {
                            type = "string_type",
                            loc = new[] { "body", field },
                            msg = "Input should be a valid string",
                        },
                    }
                );
    }
}
