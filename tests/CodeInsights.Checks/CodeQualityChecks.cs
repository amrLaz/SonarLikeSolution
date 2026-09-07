using System.Text;
using System.Text.Json;
using CodeInsights.Api.Contracts;
using CodeInsights.Api.Services;

internal static class CodeQualityChecks
{
    public static async Task RunAsync()
    {
        var first = await Parse(
            "SF:src/a.cs\nDA:2,0\nDA:3,1\nBRDA:2,0,0,0\nBRDA:2,0,1,1\nend_of_record\n",
            "lcov"
        );
        var second = await Parse(
            "SF:src/a.cs\nDA:2,1\nBRDA:2,0,0,1\nBRDA:2,0,1,-\nend_of_record\n",
            "lcov"
        );
        var snapshot = new CodeQualitySnapshot();
        CodeQualityData.AddReport(snapshot, first, Descriptor("one", "lcov"));
        CodeQualityData.AddReport(snapshot, second, Descriptor("two", "lcov"));
        var totals = CodeQualityData.Summarize(snapshot, first.Coverage.Concat(second.Coverage));
        Check(
            totals.Lines.Numerator == 2
                && totals.Lines.Denominator == 2
                && totals.Branches.Numerator == 2
                && totals.Branches.Denominator == 2,
            "Exact LCOV branch identities and line union without averages"
        );
        Check(
            CodeQualityData.Summarize(snapshot, first.Coverage, "src/absent.cs").Branches.State
                == "not_measured",
            "A file absent from the coverage report has no proved branch denominator"
        );
        var diff = new GitDiff { State = "available", Files = [new("src/a.cs", null, [2], [])] };
        var changed = CodeQualityData.Summarize(
            snapshot,
            first.Coverage,
            newCode: true,
            diff: diff
        );
        Check(
            changed.Lines.Numerator == 0
                && changed.Lines.Denominator == 1
                && changed.Branches.Denominator == 2,
            "Changed-line coverage scope"
        );
        Check(
            CodeQualityData.Summarize(snapshot, first.Coverage, newCode: true).Lines.State
                == "unavailable",
            "Missing diff never becomes measured zero"
        );
        var missing = new GitDiff
        {
            State = "available",
            Files = [new("src/absent.cs", null, [2], [])],
        };
        Check(
            CodeQualityData
                .Summarize(snapshot, first.Coverage, newCode: true, diff: missing)
                .Lines.State == "unavailable"
                && CodeQualityData
                    .Summarize(snapshot, first.Coverage, newCode: true, diff: missing)
                    .Branches.State == "unavailable",
            "Missing changed-file coverage never becomes non applicable"
        );
        const string cobertura =
            "<coverage branches-valid='2'><packages><package><classes><class name='A' filename='src/a.cs' complexity='3'><lines><line number='2' hits='0' branch='true' condition-coverage='50% (1/2)'/></lines></class></classes></package></packages></coverage>";
        var conditions = await Parse(cobertura, "cobertura");
        var conditionsSnapshot = new CodeQualitySnapshot();
        CodeQualityData.AddReport(conditionsSnapshot, conditions, Descriptor("one", "cobertura"));
        var conditionTotals = CodeQualityData.Summarize(conditionsSnapshot, conditions.Coverage);
        Check(
            conditionTotals.Conditions.Numerator == 1
                && conditionTotals.Conditions.Denominator == 2
                && conditionTotals.ClassComplexity == 3,
            "Cobertura native counts and complexity"
        );
        CodeQualityData.AddReport(conditionsSnapshot, conditions, Descriptor("two", "cobertura"));
        Check(
            CodeQualityData.Summarize(conditionsSnapshot, conditions.Coverage).Conditions.State
                == "ambiguous",
            "Overlapping anonymous conditions cannot claim a union"
        );
        var zero = await Parse("SF:a.cs\nDA:1,1\nBRF:0\nend_of_record\n", "lcov");
        var zeroSnapshot = new CodeQualitySnapshot();
        CodeQualityData.AddReport(zeroSnapshot, zero, Descriptor("zero", "lcov"));
        Check(
            CodeQualityData.Summarize(zeroSnapshot, zero.Coverage).Branches.State
                == "not_applicable",
            "Measured no branches distinguished from missing branch report"
        );
        const string clones =
            """{"duplicates":[{"format":"csharp","lines":3,"tokens":20,"fragment":"SECRET SOURCE","firstFile":{"name":"src/a.cs","start":2,"end":4},"secondFile":{"name":"src/b.cs","start":8,"end":10}}]}""";
        var duplicate = await Parse(clones, "jscpd");
        CodeQualityData.AddReport(snapshot, duplicate, Descriptor("duplicates", "jscpd"));
        Check(
            CodeQualityData.Summarize(snapshot, [], newCode: true, diff: diff).DuplicateBlocks == 1,
            "Real duplicate blocks intersect changed lines"
        );
        Check(
            !CodeQualityData.Serialize(snapshot).Contains("SECRET SOURCE"),
            "Duplicate fragments not persisted"
        );
        const string cloc =
            """{"header":{"cloc_version":"1"},"src/a.cs":{"language":"C#","code":12,"comment":2,"blank":1},"SUM":{"code":12}}""";
        CodeQualityData.AddReport(snapshot, await Parse(cloc, "cloc"), Descriptor("size", "cloc"));
        Check(
            CodeQualityData.Summarize(snapshot, [], "src").CodeLines == 12,
            "cloc by-file count and directory total"
        );
        Check(
            CodeQualityData.Summarize(snapshot, [], newCode: true, diff: diff).CodeLines is null,
            "File size not invented for changed-line subset"
        );
        var profile = new ProfileDefinition
        {
            Conditions = [new("branch_coverage", "min", 80, "new_code")],
        };
        var gate = IngestionProcessor
            .EvaluateConditions(
                profile,
                [],
                [],
                JsonSerializer.Deserialize<JsonElement>(
                    "{\"state\":\"available\",\"baseline_id\":\"base\"}"
                ),
                diff,
                1,
                2,
                true,
                totals,
                totals
            )
            .Single();
        Check(
            gate.Value == 100
                && gate.Numerator == 2
                && gate.Denominator == 2
                && gate.Result == "pass",
            "Branch gate preserves exact numerator and denominator"
        );
        var noBranches = CodeQualityData.Summarize(zeroSnapshot, zero.Coverage);
        gate = IngestionProcessor
            .EvaluateConditions(
                profile,
                [],
                [],
                JsonSerializer.Deserialize<JsonElement>(
                    "{\"state\":\"unavailable\",\"reason\":\"baseline_absent\"}"
                ),
                diff,
                0,
                0,
                true,
                noBranches,
                noBranches
            )
            .Single();
        Check(
            gate.Result == "unknown",
            "Unavailable baseline overrides global non-applicable branch state"
        );
        foreach (
            var (text, format) in new[]
            {
                (clones.Replace("src/a.cs", "../secret"), "jscpd"),
                (cloc.Replace("12", "-1"), "cloc"),
                (cobertura.Replace("1/2", "3/2"), "cobertura"),
            }
        )
        {
            try
            {
                await Parse(text, format);
                throw new InvalidOperationException("Expected malformed quality report rejection");
            }
            catch (InvalidDataException) { }
        }
        Console.WriteLine("Code quality import, scope, aggregation and provenance checks passed.");
    }

    private static ReportDescriptor Descriptor(string id, string format) =>
        new(id, format, "1", format, "1", "measured", 1, new string('a', 64));

    private static Task<ImportedReport> Parse(string text, string format) =>
        ReportImports.ParseAsync(
            new MemoryStream(Encoding.UTF8.GetBytes(text)),
            format,
            "1",
            format,
            CancellationToken.None
        );

    private static void Check(bool condition, string message)
    {
        if (!condition)
            throw new InvalidOperationException(message);
    }
}
