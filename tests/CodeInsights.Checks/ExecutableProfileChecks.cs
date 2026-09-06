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
        var rejected = false;
        Assert(export.Files[0].Content.StartsWith("module.exports = ["), "ESLint export must be consumable CommonJS");
        var disabledEslint = profile with { DisabledRules = [new("eslint", "9.0.0", "no-eval")] };
        ExecutableProfiles.Validate(disabledEslint);
        Assert(ExecutableProfiles.Export(disabledEslint).Files[0].Content.Contains("\"no-eval\":\"off\""), "ESLint disabled rule overrides its configured value");
        Assert(ExecutableProfiles.Export(disabledEslint with { DisabledRules = [] }).Files[0].Content == export.Files[0].Content, "Re-enabling restores the immutable ESLint source configuration");
        var semgrep = new ProfileDefinition
        {
            ProfileId = "semgrep", Version = "1",
            AnalyzerConfigurations = [new("semgrep", "1.2.3", "semgrep-json", "semgrep.json", "{\"rules\":[{\"id\":\"keep\",\"languages\":[\"csharp\"],\"message\":\"Keep\",\"severity\":\"WARNING\"},{\"id\":\"remove\",\"languages\":[\"csharp\"],\"message\":\"Remove\",\"severity\":\"ERROR\"}]}")],
            RuleCatalog = [new("semgrep", "1.2.3", "remove", "csharp", "vulnerability", JsonSerializer.SerializeToElement(new { }))],
            DisabledRules = [new("semgrep", "1.2.3", "remove")]
        };
        ExecutableProfiles.Validate(semgrep);
        var semgrepExport = ExecutableProfiles.Export(semgrep).Files[0].Content;
        Assert(semgrepExport.Contains("keep") && !semgrepExport.Contains("remove"), "Semgrep export removes only the disabled rule");
        var editorConfig = new ProfileDefinition
        {
            ProfileId = "dotnet", Version = "1",
            AnalyzerConfigurations = [new("dotnet", "10.0.0", "editorconfig", ".editorconfig", "root = true\n\n[*.cs]\ndotnet_analyzer_diagnostic.severity = warning\n")],
            RuleCatalog = [new("dotnet", "10.0.0", "CA1000", "csharp", "code_smell", JsonSerializer.SerializeToElement(new { }))],
            DisabledRules = [new("dotnet", "10.0.0", "CA1000")]
        };
        ExecutableProfiles.Validate(editorConfig);
        Assert(ExecutableProfiles.Export(editorConfig).Files[0].Content.Contains("dotnet_diagnostic.CA1000.severity = none"), "EditorConfig export appends an explicit diagnostic override");
        rejected = false;
        try { ExecutableProfiles.Validate(profile with { DisabledRules = [new("eslint", "9.0.0", "absent")] }); } catch (ApiException exception) { rejected = exception.StatusCode == 422; }
        Assert(rejected, "Disabled rule must exist in the versioned catalogue and native configuration");
        var manifest = new IngestionManifest { EffectiveConfigurations = export.Files.Select(x => new EffectiveConfiguration(x.Tool, x.ToolVersion, x.Path, x.Sha256)).ToArray(), Reports = [new("r", "sarif", "2.1.0", "eslint", "9.0.0", "measured", 1, "")] };
        ExecutableProfiles.Validate(manifest);
        Assert(ExecutableProfiles.Evaluate(profile, manifest).State == "matched", "Exact native bytes match");
        Assert(ExecutableProfiles.Evaluate(profile, manifest with { EffectiveConfigurations = [] }).State == "missing", "No evidence cannot pass");
        Assert(ExecutableProfiles.Evaluate(profile, manifest with { Reports = [] }).Reason == "configured_analyzer_report_missing", "Native file evidence cannot replace an executed producer report");
        Assert(ExecutableProfiles.Evaluate(profile, manifest with { Reports = [manifest.Reports[0] with { ToolVersion = "10" }] }).Reason == "analyzer_version_drift", "Producer version drift is explicit");
        Assert(ExecutableProfiles.Evaluate(profile, manifest with { EffectiveConfigurations = [manifest.EffectiveConfigurations[0] with { Sha256 = new string('0', 64) }] }).State == "drift", "Changed native file cannot match");
        rejected = false;
        try { ExecutableProfiles.Validate(profile with { AnalyzerConfigurations = [profile.AnalyzerConfigurations[0] with { Path = "../escape.cjs" }] }); } catch (ApiException exception) { rejected = exception.StatusCode == 422; }
        Assert(rejected, "Export paths cannot escape workspace");
        var remediation = JsonSerializer.SerializeToElement(ExecutableProfiles.EstimateRemediation(profile, [new FindingOccurrence { Tool = "eslint", RuleId = "no-eval", ReportId = "r" }, new FindingOccurrence { Tool = "eslint", RuleId = "missing", ReportId = "r" }], manifest), ApiJson.Options);
        Assert(remediation.GetProperty("state").GetString() == "partial" && remediation.GetProperty("estimated_seconds").GetInt64() == 60, "Unmodeled rules cannot fabricate remediation duration");
        Console.WriteLine("Executable profile checks passed.");
    }
}
