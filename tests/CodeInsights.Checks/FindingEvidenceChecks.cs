using System.Text;
using System.Text.Json;
using CodeInsights.Api.Services;

internal static class FindingEvidenceChecks
{
    public static async Task RunAsync()
    {
        const string report = """
            {"version":"2.1.0","runs":[{"tool":{"driver":{"name":"scanner","semanticVersion":"2.3.0","rules":[{"id":"R1","helpUri":"https://docs.example.org/rules/R1"}]}},"results":[{"ruleId":"R1","message":{"text":"Original message"},"locations":[{"physicalLocation":{"artifactLocation":{"uri":"src/a.cs"},"region":{"startLine":4,"endLine":5,"startColumn":2,"snippet":{"text":"DO NOT RETAIN"}}}}],"relatedLocations":[{"physicalLocation":{"artifactLocation":{"uri":"src/b.cs"},"region":{"startLine":9}}}],"codeFlows":[{"threadFlows":[{"locations":[{"location":{"physicalLocation":{"artifactLocation":{"uri":"src/c.cs"},"region":{"startLine":12}}}}]}]}]}]}]}
            """;
        var parsed = await Parse(report);
        var evidence = parsed.Findings.Single().Evidence!;
        Check(evidence.DriverVersion == "2.3.0" && evidence.DocumentationVersion is null, "Analyzer version does not invent documentation version");
        Check(evidence.DocumentationUrl == "https://docs.example.org/rules/R1" && evidence.DocumentationStatus == "producer_link_unverified", "Documentation attributed without claiming availability");
        Check(evidence.Locations is [{ Kind: "primary", Line: 4, EndLine: 5, Column: 2 }, { Kind: "related", Line: 9 }, { Kind: "flow", Flow: 0, Thread: 0, Step: 0, Line: 12 }], "SARIF regions, related locations and flow grouping retained");
        Check(!JsonSerializer.Serialize(evidence).Contains("DO NOT RETAIN"), "Source snippets never retained");
        var unknown = await Parse(report.Replace("\"id\":\"R1\"", "\"id\":\"OTHER\""));
        Check(unknown.Findings.Single().Evidence!.DocumentationStatus == "unavailable", "Unknown rules have no invented documentation");
        var extension = await Parse(report.Replace("\"ruleId\":\"R1\"", "\"ruleId\":\"R1\",\"rule\":{\"id\":\"R1\",\"toolComponent\":{\"index\":0}}"));
        Check(extension.Findings.Single().Evidence!.DocumentationUrl is null, "Extension rule must not inherit driver documentation by matching identifier");
        foreach (var url in new[] { "javascript:alert(1)", "http://docs.example.org/rule", "https://secret:password@docs.example.org/rule" })
        {
            var unsafeLink = await Parse(report.Replace("https://docs.example.org/rules/R1", url));
            Check(unsafeLink.Findings.Single().Evidence!.DocumentationUrl is null, "Unsafe documentation does not break ingestion");
        }
        var commit = new string('a', 40);
        const string repository = "https://dev.azure.com/org/project/_git/repo";
        var source = FindingEvidenceLinks.AzureDevOpsSource(repository, commit, "src/a b.cs", 4);
        Check(source is not null && source.Contains("version=GC" + commit) && source.Contains("path=%2Fsrc%2Fa%20b.cs") && source.Contains("line=4&lineEnd=5"), "ADO source pinned to exact commit and line");
        Check(FindingEvidenceLinks.AzureDevOpsSource(repository, "abcdef", "src/a.cs", 4) is null, "Abbreviated commit must not create source link");
        foreach (var path in new[] { "../secrets", "/absolute", "https://other/path", "src/../secrets" })
            Check(FindingEvidenceLinks.AzureDevOpsSource(repository, commit, path, 4) is null, "Unsafe source path rejected");
        Check(FindingEvidenceLinks.AzureDevOpsSource("https://dev.azure.com.evil.org/org/project/_git/repo", commit, "a.cs", 1) is null, "Lookalike ADO host rejected");
        Check(FindingEvidenceLinks.AzureDevOpsSource(repository + "?token=secret", commit, "a.cs", 1) is null, "Repository query not copied into source link");
        var basePath = await Parse(report.Replace("\"uri\":\"src/a.cs\"", "\"uri\":\"src/a.cs\",\"uriBaseId\":\"SOURCE\""));
        Check(!basePath.Findings.Single().Evidence!.Locations[0].RepositoryRelative, "Unresolved URI base must not claim repository mapping");
        using var many = JsonDocument.Parse("{\"relatedLocations\":[" + string.Join(',', Enumerable.Repeat("{}", 201)) + "]}");
        var bounded = FindingEvidenceLinks.FromSarif(default, default, many.RootElement, []);
        Check(bounded.Locations.Length == 200 && bounded.LocationsTruncated, "Long traces bounded and truncation explicit");
        var oversizedVersion = await Parse(report.Replace("2.3.0", new string('v', 201)));
        Check(oversizedVersion.Findings.Single().Evidence!.DriverVersion is null, "Oversized producer version not persisted");
        long used = 0;
        var serialized = FindingEvidenceLinks.Serialize(evidence, ref used);
        Check(used == Encoding.UTF8.GetByteCount(serialized), "Evidence budget counts persisted UTF-8 JSON");
        var firstSize = used;
        try
        {
            FindingEvidenceLinks.Serialize(evidence, ref used, firstSize * 2 - 1);
            throw new InvalidOperationException("Expected cumulative evidence budget rejection");
        }
        catch (InvalidDataException) { }
        Check(used == firstSize, "Rejected evidence leaves budget unchanged");
        FindingEvidenceLinks.Serialize(evidence, ref used, firstSize * 2);
        Check(used == firstSize * 2, "Exact cumulative limit remains valid");
        Console.WriteLine("Finding evidence checks passed.");
    }

    private static Task<ImportedReport> Parse(string report) => ReportImports.ParseAsync(new MemoryStream(Encoding.UTF8.GetBytes(report)), "sarif", "2.1.0", "scanner", CancellationToken.None);
    private static void Check(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }
}
