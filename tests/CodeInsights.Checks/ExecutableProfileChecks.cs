using System.Text.Json;
using CodeInsights.Api;
using CodeInsights.Api.Contracts;
using CodeInsights.Api.Data;
using CodeInsights.Api.Services;

internal static class ExecutableProfileChecks
{
    public static void Run()
    {
        static void Assert(bool value, string message) { if (!value) throw new Exception(message); }
        var profile = new ProfileDefinition { ProfileId = "test", Version = "1", AnalyzerConfigurations = [new("eslint", "9.0.0", "eslint-flat-json", "eslint.config.cjs", "[{\"rules\":{\"no-eval\":\"error\"}}]")],
            RuleCatalog = [new("eslint", "9.0.0", "no-eval", "javascript", "vulnerability", JsonSerializer.SerializeToElement(new {}), "https://eslint.org/docs/latest/rules/no-eval", Remediation: new("constant", 60, "https://example.org/producer/model"))] };
        ExecutableProfiles.Validate(profile);
        var export = ExecutableProfiles.Export(profile);
        Assert(export.Files[0].Content.StartsWith("module.exports = ["), "ESLint export must be consumable CommonJS");
        var manifest = new IngestionManifest { EffectiveConfigurations = export.Files.Select(x => new EffectiveConfiguration(x.Tool, x.ToolVersion, x.Path, x.Sha256)).ToArray(), Reports = [new("r", "sarif", "2.1.0", "eslint", "9.0.0", "measured", 1, "")] };
        ExecutableProfiles.Validate(manifest);
        Assert(ExecutableProfiles.Evaluate(profile, manifest).State == "matched", "Exact native bytes match");
        Assert(ExecutableProfiles.Evaluate(profile, manifest with { EffectiveConfigurations = [] }).State == "missing", "No evidence cannot pass");
        Assert(ExecutableProfiles.Evaluate(profile, manifest with { Reports = [] }).Reason == "configured_analyzer_report_missing", "Native file evidence cannot replace an executed producer report");
        Assert(ExecutableProfiles.Evaluate(profile, manifest with { Reports = [manifest.Reports[0] with { ToolVersion = "10" }] }).Reason == "analyzer_version_drift", "Producer version drift is explicit");
        Assert(ExecutableProfiles.Evaluate(profile, manifest with { EffectiveConfigurations = [manifest.EffectiveConfigurations[0] with { Sha256 = new string('0', 64) }] }).State == "drift", "Changed native file cannot match");
        var rejected = false;
        try { ExecutableProfiles.Validate(profile with { AnalyzerConfigurations = [profile.AnalyzerConfigurations[0] with { Path = "../escape.cjs" }] }); } catch (ApiException exception) { rejected = exception.StatusCode == 422; }
        Assert(rejected, "Export paths cannot escape workspace");
        var remediation = JsonSerializer.SerializeToElement(ExecutableProfiles.EstimateRemediation(profile, [new FindingOccurrence { Tool = "eslint", RuleId = "no-eval", ReportId = "r" }, new FindingOccurrence { Tool = "eslint", RuleId = "missing", ReportId = "r" }], manifest), ApiJson.Options);
        Assert(remediation.GetProperty("state").GetString() == "partial" && remediation.GetProperty("estimated_seconds").GetInt64() == 60, "Unmodeled rules cannot fabricate remediation duration");
        Console.WriteLine("Executable profile checks passed.");
    }
}
