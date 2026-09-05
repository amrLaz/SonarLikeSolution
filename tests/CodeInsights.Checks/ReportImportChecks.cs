using System.Text;
using CodeInsights.Api.Services;

internal static class ReportImportChecks
{
    public static async Task RunAsync()
    {
        await FindingEvidenceChecks.RunAsync();
        await CodeQualityChecks.RunAsync();
        var sarif = """
            {"version":"2.1.0","runs":[{"tool":{"driver":{"name":"example","rules":[{"id":"RULE1"}]}},"results":[{"ruleIndex":0,"level":"error","message":{"text":"Example"},"partialFingerprints":{"stable":"abc"},"locations":[{"physicalLocation":{"artifactLocation":{"uri":"src/a.cs"},"region":{"startLine":4}}}]}]}]}
            """;
        var parsed = await Parse(sarif, "sarif", "2.1.0");
        Check(parsed.Findings is [{ RuleId: "RULE1", OriginalSeverity: "error", Severity: "high", Category: "unknown", Path: "src/a.cs", Line: 4 }], "SARIF provenance and unclassified rules");
        Check(parsed.Findings[0].Fingerprint!.Contains("abc"), "SARIF stable fingerprint");
        await Reject(sarif.Replace("src/a.cs", "../private"), "sarif", "2.1.0");
        await Reject(sarif.Replace("src/a.cs", "https://host/code"), "sarif", "2.1.0");
        await Reject(sarif, "sarif", "2.2.0");
        await Reject("{}", "sarif", "2.1.0");
        await Reject("{\"version\":\"2.1.0\",\"runs\":[{\"tool\":{\"driver\":{\"name\":\"scanner\"}}}]}", "sarif", "2.1.0");
        await Reject("{\"version\":\"2.1.0\",\"runs\":[{\"tool\":{\"driver\":{\"name\":\"scanner\"}},\"invocations\":[{\"executionSuccessful\":false}],\"results\":[]}]}", "sarif", "2.1.0");

        parsed = await Parse("SF:./src/a.cs\nDA:1,0\nDA:2,1\nend_of_record\nSF:src/a.cs\nDA:1,1\nend_of_record\n", "lcov", "1");
        Check(parsed.Coverage.Count == 2 && parsed.Coverage.All(x => x.Covered), "LCOV duplicate coverage union");
        parsed = await Parse("SF:src/zero.cs\nDA:1,0\nend_of_record\n", "lcov", "1");
        Check(parsed.Coverage is [{ Covered: false }], "Measured zero remains zero");
        await Reject("SF:a.cs\nDA:1,-2\nend_of_record\n", "lcov", "1");
        await Reject("SF:a.cs\nDA:1,2\n", "lcov", "1");
        await Reject("DA:1,2\nend_of_record\n", "lcov", "1");

        const string cobertura = "<coverage><packages><package><classes><class filename='src/a.cs'><lines><line number='1' hits='0'/><line number='2' hits='4'/></lines></class></classes></package></packages></coverage>";
        parsed = await Parse(cobertura, "cobertura", "1");
        Check(parsed.Coverage.Count == 2 && parsed.Coverage.Count(x => x.Covered) == 1, "Cobertura executable lines");
        await Reject("<!DOCTYPE coverage [<!ENTITY e SYSTEM 'file:///etc/passwd'>]>" + cobertura, "cobertura", "1");
        await Reject(cobertura.Replace("src/a.cs", "C:\\secret"), "cobertura", "1");
        await Reject("<coverage/>", "cobertura", "1");
        await Reject("<coverage><packages>" + string.Concat(Enumerable.Repeat("<a>", 65)) + string.Concat(Enumerable.Repeat("</a>", 65)) + "</packages></coverage>", "cobertura", "1");

        const string cdx = """
            {"bomFormat":"CycloneDX","specVersion":"1.6","metadata":{"component":{"bom-ref":"root","name":"app"}},"components":[{"bom-ref":"one","name":"same","version":"1","purl":"pkg:nuget/same@1","licenses":[{"expression":"MIT OR Apache-2.0"}]},{"bom-ref":"two","name":"same","version":"2","purl":"pkg:npm/same@2"},{"bom-ref":"isolated","name":"unknown"}],"dependencies":[{"ref":"root","dependsOn":["one"]},{"ref":"one","dependsOn":["two"]}],"vulnerabilities":[{"id":"CVE-2025-1234","source":{"name":"producer-db"},"published":"2025-01-01T00:00:00Z","ratings":[{"severity":"high"}],"affects":[{"ref":"two"}]}]}
            """;
        parsed = await Parse(cdx, "cyclonedx", "1.6");
        Check(parsed.Components.Count == 4 && parsed.Components[1].Relationship == "direct" && parsed.Components[2].Relationship == "transitive" && parsed.Components[3].Relationship == "unknown", "SBOM relationships and homonyms");
        Check(parsed.Components[1].Licenses.Single() == "MIT OR Apache-2.0" && parsed.Components[2].Ecosystem == "npm", "Licenses and ecosystem");
        Check(parsed.Vulnerabilities is [{ ComponentReference: "two", Source: "producer-db", PublishedAt: not null }], "Exact vulnerability reference and provenance");
        Check(parsed.VulnerabilityAssessmentMeasured == true, "Explicit vulnerability assessment");
        var inventoryOnly = await Parse("{\"bomFormat\":\"CycloneDX\",\"specVersion\":\"1.6\",\"components\":[]}", "cyclonedx", "1.6");
        Check(inventoryOnly.VulnerabilityAssessmentMeasured is null, "SBOM inventory alone is not a vulnerability assessment");
        var assessedZero = await Parse("{\"bomFormat\":\"CycloneDX\",\"specVersion\":\"1.6\",\"components\":[],\"vulnerabilities\":[]}", "cyclonedx", "1.6");
        Check(assessedZero.VulnerabilityAssessmentMeasured == true && assessedZero.Vulnerabilities.Count == 0, "Explicit empty assessment remains measured zero");
        foreach (var version in new[] { "1.4", "1.5", "1.7" }) await Parse(cdx.Replace("1.6", version), "cyclonedx", version);
        await Reject(cdx, "cyclonedx", "1.3");
        await Reject(cdx.Replace("\"ref\":\"two\"", "\"ref\":\"missing\""), "cyclonedx", "1.6");
        await Reject(cdx.Replace("\"bom-ref\":\"two\"", "\"bom-ref\":\"one\""), "cyclonedx", "1.6");

        const string spdx = """
            {"spdxVersion":"SPDX-2.3","SPDXID":"SPDXRef-DOCUMENT","documentDescribes":["SPDXRef-App"],"packages":[{"SPDXID":"SPDXRef-App","name":"app"},{"SPDXID":"SPDXRef-Lib","name":"app","versionInfo":"2","licenseDeclared":"NOASSERTION","externalRefs":[{"referenceType":"purl","referenceLocator":"pkg:nuget/app@2"}]}],"relationships":[{"spdxElementId":"SPDXRef-Lib","relatedSpdxElement":"SPDXRef-App","relationshipType":"DEPENDENCY_OF"}]}
            """;
        parsed = await Parse(spdx, "spdx", "2.3");
        Check(parsed.Components.Count == 2 && parsed.Components[1].Relationship == "direct" && parsed.Components[1].Licenses.Single() == "NOASSERTION", "SPDX reversed dependency and unknown license");
        Check(parsed.Vulnerabilities.Count == 0, "No fabricated CVE enrichment");
        await Reject(spdx.Replace("SPDX-2.3", "SPDX-3.0"), "spdx", "2.3");
        await Reject("PK archive", "zip", "1");
        Console.WriteLine("Report import checks passed.");
    }

    private static Task<ImportedReport> Parse(string data, string format, string version) => ReportImports.ParseAsync(new MemoryStream(Encoding.UTF8.GetBytes(data)), format, version, "fixture", CancellationToken.None);
    private static async Task Reject(string data, string format, string version)
    {
        try { await Parse(data, format, version); }
        catch (InvalidDataException) { return; }
        throw new InvalidOperationException($"Expected rejection for {format}.");
    }
    private static void Check(bool condition, string message)
    {
        if (!condition) throw new InvalidOperationException(message);
    }
}
