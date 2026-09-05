using System.Text.Json;
using CodeInsights.Api.Contracts;
using CodeInsights.Api.Data;

namespace CodeInsights.Api.Services;

public sealed record PortfolioDimension(string State, int? Value, int? Delta, string Trend);
public sealed record PortfolioObjectiveResult(string Dimension, int Target, DateTime DueAt, string State);
public sealed record PortfolioPoint(string AnalysisId, string ProjectKey, string Branch, string CommitSha,
    string CreatedAt, string ProfileId, string ProfileVersion, string FormulaVersion, string QualityGate,
    string Completeness, string Freshness, string ComparisonState, string? BaselineAnalysisId,
    bool DetailsPurged, Dictionary<string, PortfolioDimension> Dimensions, PortfolioObjectiveResult[] Objectives);

/// <summary>Compare independent dimensions only when their measurement contracts match.</summary>
public static class PortfolioTrends
{
    public static readonly string[] Dimensions = ["maintainability_score", "security_score", "reliability_score",
        "code_smells", "vulnerabilities", "security_hotspots", "bugs", "coverage", "duplication", "dependency_vulnerabilities"];

    public static bool HigherIsBetter(string dimension) => dimension.EndsWith("_score", StringComparison.Ordinal) || dimension == "coverage";

    public static PortfolioPoint Describe(AnalysisRecord current, AnalysisRecord? previous, IEnumerable<PortfolioObjective> objectives, DateTimeOffset now)
    {
        var state = previous == null ? "baseline_absent"
            : current.ProjectKey != previous.ProjectKey || current.Branch != previous.Branch ? "scope_mismatch"
            : string.IsNullOrWhiteSpace(current.ProfileId) || string.IsNullOrWhiteSpace(current.ProfileVersion) || current.ProfileVersion == "0"
                || string.IsNullOrWhiteSpace(current.FormulaVersion) || current.FormulaVersion == "0" ? "version_unknown"
            : current.ProfileId != previous.ProfileId || current.ProfileVersion != previous.ProfileVersion || current.FormulaVersion != previous.FormulaVersion ? "version_break"
            : current.Completeness != "complete" || previous.Completeness != "complete" || current.Status != "completed" || previous.Status != "completed" ? "incomplete"
            : "comparable";
        var measured = JsonSerializer.Deserialize<Dictionary<string, MeasurementValue>>(current.Measurements, ApiJson.Options) ?? [];
        var prior = JsonSerializer.Deserialize<Dictionary<string, MeasurementValue>>(previous?.Measurements ?? "{}", ApiJson.Options) ?? [];
        var dimensions = Dimensions.ToDictionary(name => name, name =>
        {
            measured.TryGetValue(name, out var value); prior.TryGetValue(name, out var old);
            var number = value?.State == "measured" ? value.Value : null;
            int? delta = state == "comparable" && number != null && old?.State == "measured" && old.Value != null ? number - old.Value : null;
            var trend = delta == null ? "not_comparable" : delta == 0 ? "stable"
                : (delta > 0) == HigherIsBetter(name) ? "improved" : "regressed";
            return new PortfolioDimension(value?.State ?? "not_measured", number, delta, trend);
        });
        var targets = objectives.Where(x => x.ProjectKey == current.ProjectKey && x.Branch == current.Branch).Select(x =>
        {
            var dimension = dimensions.GetValueOrDefault(x.Dimension);
            var result = x.ProfileId != current.ProfileId || x.ProfileVersion != current.ProfileVersion || x.FormulaVersion != current.FormulaVersion ? "version_break"
                : current.Status != "completed" || current.Completeness != "complete" || dimension?.Value == null ? "unknown"
                : (HigherIsBetter(x.Dimension) ? dimension.Value >= x.Target : dimension.Value <= x.Target) ? "met" : "unmet";
            return new PortfolioObjectiveResult(x.Dimension, x.Target, x.DueAt, result);
        }).ToArray();
        var freshness = !DateTimeOffset.TryParse(current.CreatedAt, out var created) || created > now ? "unknown"
            : now - created > TimeSpan.FromDays(7) ? "stale" : "fresh";
        return new(current.AnalysisId, current.ProjectKey, current.Branch, current.CommitSha, current.CreatedAt,
            current.ProfileId, current.ProfileVersion, current.FormulaVersion, current.QualityGate, current.Completeness,
            freshness, state, previous?.AnalysisId, current.DetailsPurged, dimensions, targets);
    }
}
