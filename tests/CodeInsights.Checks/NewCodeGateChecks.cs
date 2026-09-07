using System.Text.Json;
using CodeInsights.Api;
using CodeInsights.Api.Contracts;
using CodeInsights.Api.Data;
using CodeInsights.Api.Endpoints;
using CodeInsights.Api.Services;

internal static class NewCodeGateChecks
{
    public static void Run()
    {
        var diff = new GitDiff
        {
            State = "available",
            BaseSha = "aaaaaa",
            HeadSha = "bbbbbb",
            Files = [new("code.cs", null, Enumerable.Range(1, 150).ToArray(), [])],
        };
        var profile = new ProfileDefinition
        {
            ProfileId = "checks",
            Version = "1",
            RequiredTools = ["scanner"],
            Conditions = [new("bugs", "max", 0, "new_code")],
        };
        var metrics = new Dictionary<string, double?> { ["bugs"] = 500, ["coverage"] = 50 };
        var states = new Dictionary<string, string>
        {
            ["bugs"] = "measured",
            ["coverage"] = "measured",
        };
        IngestionProcessor.ConditionResult Evaluate(string comparison, bool measured = true) =>
            IngestionProcessor
                .EvaluateConditions(
                    profile,
                    metrics,
                    states,
                    JsonSerializer.Deserialize<JsonElement>(comparison),
                    diff,
                    1,
                    2,
                    measured
                )
                .Single();
        string Compare(
            List<FindingOccurrence> findings,
            Dictionary<(string Path, int Line), bool>? coverage = null
        ) => IngestionProcessor.Compare(diff, [], findings, coverage ?? [], "baseline");
        Check(
            Evaluate(Compare([])).Result == "pass",
            "historical debt does not block a clean new-code gate"
        );
        var many = Enumerable
            .Range(1, 150)
            .Select(n => new FindingOccurrence
            {
                Tool = "scanner",
                RuleId = "R",
                Category = "bug",
                Path = "code.cs",
                Line = n,
            })
            .ToList();
        var counted = Evaluate(Compare(many));
        Check(
            counted.Value == 150 && counted.Numerator == 150 && counted.Result == "fail",
            "exact new-code count exceeds the 100 detail limit"
        );
        Check(
            counted.BaseSha == "aaaaaa"
                && counted.HeadSha == "bbbbbb"
                && counted.BaselineId == "baseline",
            "frozen diff provenance"
        );
        Check(
            Evaluate("{\"state\":\"unavailable\",\"reason\":\"profiles_incompatible\"}").Result
                == "unknown",
            "incompatible baseline never passes"
        );
        many[0].Line = null;
        Check(
            Evaluate(Compare(many)).Result == "unknown",
            "ambiguous matching cannot produce a measured new count"
        );
        metrics["bugs"] = null;
        Check(Evaluate(Compare([])).Result == "unknown", "missing measurement never becomes zero");
        profile = profile with { Conditions = [new("coverage", "min", 80, "new_code")] };
        var na = Evaluate(Compare([], new() { [("code.cs", 151)] = true }));
        Check(
            na.Result == "not_applicable"
                && na.Value is null
                && na.Numerator == 0
                && na.Denominator == 0,
            "no changed executable line is explicitly not applicable"
        );
        Check(
            Evaluate(Compare([]), false).Result == "unknown",
            "missing coverage is not not-applicable"
        );
        Check(
            Evaluate(Compare([])).Result == "unknown",
            "missing changed file cannot be declared non-executable"
        );
        Check(
            Evaluate(
                IngestionProcessor.Compare(diff with { Files = [] }, [], [], [], "baseline")
            ).Result == "not_applicable",
            "diff without additions has no applicable executable lines"
        );
        var partialDiff = diff with { Files = [.. diff.Files, new("missing.cs", null, [1], [])] };
        Check(
            Evaluate(
                IngestionProcessor.Compare(
                    partialDiff,
                    [],
                    [],
                    new() { [("code.cs", 1)] = true },
                    "baseline"
                )
            ).Result == "unknown",
            "a partially covered changed-file corpus cannot pass"
        );
        var coverageResult = Evaluate(
            Compare(
                [],
                new()
                {
                    [("code.cs", 1)] = true,
                    [("code.cs", 2)] = false,
                    [("old.cs", 1)] = true,
                }
            )
        );
        Check(
            coverageResult.Value == 50
                && coverageResult.Numerator == 1
                && coverageResult.Denominator == 2
                && coverageResult.Result == "fail",
            "coverage uses changed executable lines only"
        );
        profile = profile with { Conditions = [new("bugs", "max", 0)] };
        metrics["bugs"] = 500;
        Check(Evaluate(Compare([])).Result == "fail", "omitted scope retains global behavior");
        var currentProfileJson = JsonSerializer.Serialize(profile, ApiJson.Options);
        var oldProfileJson = currentProfileJson.Replace(",\"scope\":\"global\"", "");
        Check(
            oldProfileJson != currentProfileJson
                && IngestionProcessor.ProfilesCompatible(oldProfileJson, currentProfileJson),
            "pre-scope snapshots are compatible with explicit global defaults"
        );
        Check(
            !IngestionProcessor.ProfilesCompatible(
                oldProfileJson,
                JsonSerializer.Serialize(
                    profile with
                    {
                        Conditions = [new("bugs", "max", 0, "new_code")],
                    },
                    ApiJson.Options
                )
            ),
            "different scope is incompatible"
        );
        Check(
            !IngestionProcessor.ProfilesCompatible(
                oldProfileJson,
                JsonSerializer.Serialize(profile with { Version = "2" }, ApiJson.Options)
            ),
            "different profile version is incompatible"
        );
        var classifier = profile with { Rules = [new("bugs-scanner", "R", "bug")] };
        var manifest = new IngestionManifest
        {
            Reports = [new("r", "sarif", "2.1.0", "other-scanner", "1", "measured", 1, "")],
        };
        Check(
            IngestionProcessor.FindingCount(classifier, manifest, [], true, "bug") is null,
            "unrelated SARIF cannot stand in for a missing category producer"
        );
        manifest = manifest with { Reports = [manifest.Reports[0] with { Tool = "bugs-scanner" }] };
        Check(
            IngestionProcessor.FindingCount(classifier, manifest, [], true, "bug") == 0,
            "empty SARIF from the actual category producer measures zero"
        );
        foreach (
            var condition in new[]
            {
                new ProfileCondition("bugs", "max", 0, "invalid"),
                new ProfileCondition("license_violations", "max", 0, "new_code"),
            }
        )
        {
            try
            {
                ProfileEndpoints.Validate(profile with { Conditions = [condition] });
                throw new InvalidOperationException("Invalid scope accepted");
            }
            catch (ApiException ex) when (ex.StatusCode == 422) { }
        }
        Console.WriteLine("New-code gate checks passed.");
    }

    private static void Check(bool value, string name)
    {
        if (!value)
            throw new InvalidOperationException("New-code gate: " + name);
    }
}
