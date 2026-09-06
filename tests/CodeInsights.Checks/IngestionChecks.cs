using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CodeInsights.Api;
using CodeInsights.Api.Contracts;
using CodeInsights.Api.Data;
using CodeInsights.Api.Services;
using Microsoft.EntityFrameworkCore;
using Npgsql;

public static class IngestionChecks
{
    public static async Task RunAsync()
    {
        var connection = Environment.GetEnvironmentVariable("CODEINSIGHTS_TEST_DB");
        var url = Environment.GetEnvironmentVariable("CODEINSIGHTS_TEST_URL");
        if (string.IsNullOrEmpty(connection) || string.IsNullOrEmpty(url))
        {
            Console.WriteLine(
                "P1 ingestion HTTP/PostgreSQL checks require CODEINSIGHTS_TEST_DB and CODEINSIGHTS_TEST_URL."
            );
            return;
        }
        var database = new NpgsqlConnectionStringBuilder(connection);
        Check(
            database.Host is "localhost" or "127.0.0.1"
                && database.Database
                    is "codeinsights_p1"
                        or "codeinsights_test"
                        or "codeinsights_checks",
            "use the explicitly isolated local test database"
        );
        Check(
            Uri.TryCreate(url, UriKind.Absolute, out var endpoint) && endpoint.IsLoopback,
            "test API must be loopback"
        );
        using var timeout = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        var ct = timeout.Token;
        using var client = new HttpClient
        {
            BaseAddress = endpoint,
            Timeout = TimeSpan.FromSeconds(30),
        };
        var admin = Environment.GetEnvironmentVariable("CODEINSIGHTS_TEST_TOKEN");
        if (string.IsNullOrEmpty(admin))
        {
            var login = await Call(
                "POST",
                "/api/v1/auth/login",
                new
                {
                    email = Environment.GetEnvironmentVariable("CODEINSIGHTS_TEST_EMAIL")
                        ?? "admin@codeinsights.local",
                    password = Environment.GetEnvironmentVariable("CODEINSIGHTS_TEST_PASSWORD")
                        ?? "Isolated-bootstrap-123",
                }
            );
            admin = login.GetProperty("token").GetString()!;
        }
        var key = "check-p1-" + Guid.NewGuid().ToString("N")[..12];
        var profile = new ProfileDefinition
        {
            ProfileId = key,
            Version = "1",
            RequiredTools = ["fixture"],
            RequiredMetrics = ["bugs"],
            Rules = [new("fixture", "R1", "bug")],
            Conditions = [new("bugs", "max", 0)],
        };
        await Call(
            "POST",
            "/api/v1/projects",
            new
            {
                key,
                name = key,
                analysis_profile_id = "p0-dotnet",
                analysis_profile_version = "1",
            },
            admin
        );
        await Call("POST", "/api/v1/profiles", profile, admin, 201);
        await Call(
            "PUT",
            $"/api/v1/profiles/projects/{key}",
            new ProfileAssignment(key, "1"),
            admin
        );
        var token = await Call(
            "POST",
            "/api/v1/platform/token/generate",
            new
            {
                token_name = key,
                project_keys = new[] { key },
                scopes = new[] { "analysis:read", "analysis:write" },
            },
            admin
        );
        var ci = token.GetProperty("token").GetString()!;
        var otherKey = key + "-other";
        await Call(
            "POST",
            "/api/v1/projects",
            new
            {
                key = otherKey,
                name = otherKey,
                analysis_profile_id = "p0-dotnet",
                analysis_profile_version = "1",
            },
            admin
        );
        var otherToken = await Call(
            "POST",
            "/api/v1/platform/token/generate",
            new
            {
                token_name = otherKey,
                project_keys = new[] { otherKey },
                scopes = new[] { "analysis:read", "analysis:write" },
            },
            admin
        );
        var other = otherToken.GetProperty("token").GetString()!;
        const string sarif =
            """{"version":"2.1.0","runs":[{"tool":{"driver":{"name":"fixture"}},"results":[]}]}""";
        var initial = Manifest("main", "sarif", "2.1.0", sarif);
        var first = await Call("POST", "/api/v1/ingestions", initial, ci, 201);
        var id = first.GetProperty("ingestion_id").GetString()!;
        var analysis = first.GetProperty("analysis_id").GetString()!;
        var repeated = await Task.WhenAll(
            Enumerable.Range(0, 4).Select(_ => Call("POST", "/api/v1/ingestions", initial, ci))
        );
        Check(
            repeated.All(x => x.GetProperty("ingestion_id").GetString() == id),
            "concurrent identical manifests have one receipt"
        );
        await Call(
            "POST",
            "/api/v1/ingestions",
            initial with
            {
                SourceRoot = "/different-checkout",
            },
            ci,
            409
        );
        await Call("POST", $"/api/v1/ingestions/{id}/finalize", token: ci, expected: 409);
        await Call("GET", $"/api/v1/ingestions/{id}", token: other, expected: 403);
        await Call("POST", $"/api/v1/ingestions/{id}/finalize", token: other, expected: 403);
        await Upload(id, "main", sarif, other, 403);
        await Call("POST", "/api/v1/ingestions", initial, other, 403);
        await Upload(id, "main", sarif.Replace("fixture", "invalid"), ci, 422);
        var pending = await Call("GET", $"/api/v1/ingestions/{id}", token: ci);
        Check(
            pending.GetProperty("reports")[0].GetProperty("state").GetString() == "expected",
            "hash mismatch is not acknowledged"
        );
        await using (var db = Db())
        {
            var stored = await db.Set<IngestionReport>().SingleAsync(x => x.IngestionId == id, ct);
            Check(
                stored.BlobName.Length == 0 && stored.State == "expected",
                "hash mismatch has no committed blob reference"
            );
        }
        await Upload(id, "main", sarif, ci);
        await Call("GET", $"/api/v1/ingestions/{id}/reports/main", token: other, expected: 403);
        using (
            var downloaded = new HttpRequestMessage(
                HttpMethod.Get,
                $"/api/v1/ingestions/{id}/reports/main"
            )
        )
        {
            downloaded.Headers.Authorization = new AuthenticationHeaderValue("Bearer", ci);
            using var response = await client.SendAsync(downloaded, ct);
            Check(
                response.IsSuccessStatusCode
                    && await response.Content.ReadAsStringAsync(ct) == sarif,
                "original report download"
            );
        }
        await Call("POST", $"/api/v1/ingestions/{id}/finalize", token: ci, expected: 202);
        var complete = await Terminal(id);
        Check(
            complete.GetProperty("state").GetString() == "completed"
                && complete.GetProperty("quality_gate").GetString() == "pass",
            "empty classified SARIF yields measured zero and pass"
        );
        const string lcov = "SF:src/a.cs\nDA:1,1\nDA:2,0\nend_of_record\n";
        var contribution = Manifest("coverage", "lcov", "1", lcov);
        var second = await Call("POST", "/api/v1/ingestions", contribution, ci, 201);
        var revisionId = second.GetProperty("ingestion_id").GetString()!;
        Check(
            second.GetProperty("analysis_id").GetString() == analysis
                && second.GetProperty("revision").GetInt32() == 2
                && second.GetProperty("reports").GetArrayLength() == 2,
            "complementary report creates a merged revision on the same analysis"
        );
        await Upload(revisionId, "coverage", lcov, ci);
        await Call("POST", $"/api/v1/ingestions/{revisionId}/finalize", token: ci, expected: 202);
        var updated = await Terminal(revisionId);
        Check(
            updated.GetProperty("quality_gate").GetString() == "pass"
                && updated
                    .GetProperty("gate_snapshot")
                    .GetProperty("metrics")
                    .GetProperty("coverage")
                    .GetDouble() == 50,
            "complementary revision combines normalized data"
        );
        var historical = await Call("GET", $"/api/v1/ingestions/{id}", token: ci);
        Check(
            historical.GetProperty("quality_gate").GetString() == "pass"
                && historical.GetProperty("reports").GetArrayLength() == 1,
            "old revision verdict and report set preserved"
        );
        await using (var db = Db())
            Check(
                await db.Set<AnalysisRecord>().CountAsync(x => x.AnalysisId == analysis, ct) == 1,
                "one analysis for both contributions"
            );
        const string correctedSarif =
            """{"version":"2.1.0","runs":[{"tool":{"driver":{"name":"fixture"}},"results":[{"ruleId":"R1","level":"error","message":{"text":"Corrected finding"},"locations":[{"physicalLocation":{"artifactLocation":{"uri":"src/a.cs"},"region":{"startLine":1}}}]}]}]}""";
        var correction = await Call(
            "POST",
            "/api/v1/ingestions",
            Manifest("main", "sarif", "2.1.0", correctedSarif),
            ci,
            201
        );
        var correctedId = correction.GetProperty("ingestion_id").GetString()!;
        Check(
            correction.GetProperty("analysis_id").GetString() == analysis
                && correction.GetProperty("revision").GetInt32() == 3,
            "changed content creates a traceable revision"
        );
        await Upload(correctedId, "main", correctedSarif, ci);
        await Call("POST", $"/api/v1/ingestions/{correctedId}/finalize", token: ci, expected: 202);
        var corrected = await Terminal(correctedId);
        Check(
            corrected.GetProperty("quality_gate").GetString() == "fail",
            "corrected finding updates the current verdict"
        );
        historical = await Call("GET", $"/api/v1/ingestions/{id}", token: ci);
        Check(
            historical.GetProperty("quality_gate").GetString() == "pass",
            "changed verdict preserves prior revision verdict"
        );
        var corrupt = Manifest("broken", "sarif", "2.1.0", "{invalid") with
        {
            BuildId = key + "-invalid",
        };
        var rejected = await Call("POST", "/api/v1/ingestions", corrupt, ci, 201);
        var badId = rejected.GetProperty("ingestion_id").GetString()!;
        await Upload(badId, "broken", "{invalid", ci);
        await Call("POST", $"/api/v1/ingestions/{badId}/finalize", token: ci, expected: 202);
        var failed = await Terminal(badId);
        Check(
            failed.GetProperty("state").GetString() == "failed"
                && failed.GetProperty("technical_state").GetString() == "failed"
                && failed.GetProperty("quality_gate").GetString() != "pass",
            "corrupt SARIF reaches terminal failure without success"
        );
        await using (var db = Db())
            Check(
                await db.Set<DurableJob>()
                    .AnyAsync(x => x.ResourceId == badId && x.Kind == "ado", ct),
                "terminal failure persists an ADO outbox event"
            );
        var oversized = initial with
        {
            BuildId = key + "-oversize",
            Reports = [initial.Reports[0] with { SizeBytes = 50L * 1024 * 1024 + 1 }],
        };
        await Call("POST", "/api/v1/ingestions", oversized, ci, 422);
        foreach (var missingState in new[] { "absent", "failed" })
        {
            var missing = initial with
            {
                BuildId = key + "-" + missingState,
                Reports =
                [
                    initial.Reports[0] with
                    {
                        State = missingState,
                        SizeBytes = 0,
                        Sha256 = "",
                    },
                ],
            };
            var receipt = await Call("POST", "/api/v1/ingestions", missing, ci, 201);
            var missingId = receipt.GetProperty("ingestion_id").GetString()!;
            await Call(
                "POST",
                $"/api/v1/ingestions/{missingId}/finalize",
                token: ci,
                expected: 202
            );
            Check(
                (await Terminal(missingId)).GetProperty("technical_state").GetString()
                    == "incomplete",
                "missing producer cannot complete technically"
            );
            var result = await Call(
                "GET",
                "/api/v1/analyses/" + receipt.GetProperty("analysis_id").GetString(),
                token: ci
            );
            Check(
                result
                    .GetProperty("measurements")
                    .GetProperty("bugs")
                    .GetProperty("state")
                    .GetString() == missingState,
                "measurement preserves " + missingState
            );
        }
        const string cleanSbom =
            """{"bomFormat":"CycloneDX","specVersion":"1.6","version":1,"components":[],"vulnerabilities":[]}""";
        var clean = await Call(
            "POST",
            "/api/v1/ingestions",
            Manifest("sbom", "cyclonedx", "1.6", cleanSbom) with
            {
                BuildId = key + "-clean-sbom",
            },
            ci,
            201
        );
        var cleanId = clean.GetProperty("ingestion_id").GetString()!;
        await Upload(cleanId, "sbom", cleanSbom, ci);
        await Call("POST", $"/api/v1/ingestions/{cleanId}/finalize", token: ci, expected: 202);
        Check(
            (await Terminal(cleanId))
                .GetProperty("gate_snapshot")
                .GetProperty("metrics")
                .GetProperty("dependency_vulnerabilities")
                .GetInt32() == 0,
            "explicit clean SBOM assessment is zero"
        );
        var baselineManifest = Manifest("main", "sarif", "2.1.0", correctedSarif) with
        {
            BuildId = key + "-baseline",
            CommitSha = "bbbbbb",
        };
        var baselineReceipt = await Call("POST", "/api/v1/ingestions", baselineManifest, ci, 201);
        var baselineId = baselineReceipt.GetProperty("ingestion_id").GetString()!;
        await Upload(baselineId, "main", correctedSarif, ci);
        await Call("POST", $"/api/v1/ingestions/{baselineId}/finalize", token: ci, expected: 202);
        await Terminal(baselineId);
        const string changedSarif =
            """{"version":"2.1.0","runs":[{"tool":{"driver":{"name":"fixture"}},"results":[{"ruleId":"R1","level":"error","message":{"text":"Corrected finding"},"locations":[{"physicalLocation":{"artifactLocation":{"uri":"src/a.cs"},"region":{"startLine":2}}}]},{"ruleId":"R1","level":"error","message":{"text":"New finding"},"locations":[{"physicalLocation":{"artifactLocation":{"uri":"src/a.cs"},"region":{"startLine":3}}}]}]}]}""";
        var changedManifest = Manifest("main", "sarif", "2.1.0", changedSarif) with
        {
            BuildId = key + "-changed",
            CommitSha = "cccccc",
            TargetSha = "bbbbbb",
            GitDiff = new GitDiff
            {
                State = "available",
                BaseSha = "bbbbbb",
                HeadSha = "cccccc",
                Files = [new GitFileDiff("src/a.cs", null, [3], new() { ["1"] = 2 })],
            },
        };
        var changedReceipt = await Call("POST", "/api/v1/ingestions", changedManifest, ci, 201);
        var changedId = changedReceipt.GetProperty("ingestion_id").GetString()!;
        await Upload(changedId, "main", changedSarif, ci);
        await Call("POST", $"/api/v1/ingestions/{changedId}/finalize", token: ci, expected: 202);
        await Terminal(changedId);
        var comparison = await Call(
            "GET",
            "/api/v1/insights/analyses/"
                + changedReceipt.GetProperty("analysis_id").GetString()
                + "/comparison",
            token: ci
        );
        Check(
            comparison.GetProperty("state").GetString() == "available"
                && comparison.GetProperty("new_count").GetInt32() == 1
                && comparison.GetProperty("persistent_count").GetInt32() == 1
                && comparison.GetProperty("resolved_count").GetInt32() == 0,
            "persisted baseline and real diff produce reproducible New Code"
        );
        var newCodeProfile = profile with
        {
            Version = "2",
            Conditions = [new("bugs", "max", 0, "new_code")],
        };
        await Call("POST", "/api/v1/profiles", newCodeProfile, admin, 201);
        await Call(
            "PUT",
            $"/api/v1/profiles/projects/{key}",
            new ProfileAssignment(key, "2"),
            admin
        );
        var evidenceSarif = correctedSarif.Replace(
            "\"name\":\"fixture\"",
            "\"name\":\"fixture\",\"version\":\"1\",\"rules\":[{\"id\":\"R1\",\"helpUri\":\"https://docs.example.invalid/rules/R1\"}]"
        );
        var scopedBaseline = baselineManifest with
        {
            ProfileVersion = "2",
            BuildId = key + "-p3-baseline",
            CommitSha = new string('b', 40),
            RepositoryUrl = "https://dev.azure.com/checks/project/_git/fixture",
            Reports = Manifest("main", "sarif", "2.1.0", evidenceSarif).Reports,
        };
        var p3Baseline = await Publish(scopedBaseline, evidenceSarif);
        var evidenceAnalysis = p3Baseline.GetProperty("analysis_id").GetString();
        var evidenceRows = await Call(
            "GET",
            $"/api/v1/insights/analyses/{evidenceAnalysis}/findings",
            token: ci
        );
        Check(
            evidenceRows[0].GetProperty("evidence").GetProperty("documentation_url").GetString()
                == "https://docs.example.invalid/rules/R1"
                && evidenceRows[0]
                    .GetProperty("source_url")
                    .GetString()!
                    .Contains("version=GC" + new string('b', 40)),
            "persisted SARIF documentation and source link use the exact analysis commit"
        );
        await Call(
            "GET",
            $"/api/v1/insights/analyses/{evidenceAnalysis}/findings",
            token: other,
            expected: 403
        );
        Check(
            p3Baseline.GetProperty("quality_gate").GetString() == "unknown",
            "new-code baseline without its own comparison never passes"
        );
        var scopedChange = changedManifest with
        {
            ProfileVersion = "2",
            RepositoryUrl = scopedBaseline.RepositoryUrl,
            BuildId = key + "-p3-change",
            CommitSha = new string('c', 40),
            TargetSha = new string('b', 40),
            GitDiff = changedManifest.GitDiff with
            {
                BaseSha = new string('b', 40),
                HeadSha = new string('c', 40),
            },
        };
        var p3Failed = await Publish(scopedChange, changedSarif);
        Check(
            p3Failed.GetProperty("quality_gate").GetString() == "fail",
            "new defect fails the scoped gate"
        );
        var scopedCondition = p3Failed.GetProperty("gate_snapshot").GetProperty("conditions")[0];
        Check(
            scopedCondition.GetProperty("scope").GetString() == "new_code"
                && scopedCondition.GetProperty("value").GetInt32() == 1
                && scopedCondition.GetProperty("base_sha").GetString() == new string('b', 40),
            "persisted gate carries scoped value and frozen baseline"
        );
        var fixedSarif = correctedSarif.Replace("\"startLine\":1", "\"startLine\":2");
        var p3Fixed = await Publish(
            scopedChange with
            {
                BuildId = key + "-p3-fixed",
                CommitSha = new string('d', 40),
                Reports = Manifest("main", "sarif", "2.1.0", fixedSarif).Reports,
                GitDiff = scopedChange.GitDiff with { HeadSha = new string('d', 40) },
            },
            fixedSarif
        );
        Check(
            p3Fixed.GetProperty("quality_gate").GetString() == "pass"
                && p3Fixed
                    .GetProperty("gate_snapshot")
                    .GetProperty("metrics")
                    .GetProperty("bugs")
                    .GetInt32() == 1,
            "fixed PR passes despite one persistent historical bug"
        );
        var p3Missing = await Publish(
            scopedChange with
            {
                BuildId = key + "-p3-missing",
                TargetSha = new string('e', 40),
                GitDiff = scopedChange.GitDiff with { BaseSha = new string('e', 40) },
            },
            changedSarif
        );
        Check(
            p3Missing.GetProperty("quality_gate").GetString() == "unknown",
            "absent baseline cannot pass scoped gate"
        );
        var p3Historical = await Call(
            "GET",
            "/api/v1/ingestions/" + p3Failed.GetProperty("ingestion_id").GetString(),
            token: ci
        );
        Check(
            p3Historical.GetProperty("quality_gate").GetString() == "fail",
            "fix never rewrites failing historical gate"
        );
        await Call(
            "GET",
            "/api/v1/insights/analyses/"
                + p3Fixed.GetProperty("analysis_id").GetString()
                + "/comparison",
            token: other,
            expected: 403
        );
        Console.WriteLine(
            "P3 scoped gate HTTP checks passed: new defect, correction with historical debt, missing baseline, immutable verdict, project isolation."
        );
        var measuredProfile = profile with
        {
            Version = "4",
            RequiredMetrics = ["bugs", "branch_coverage", "duplicate_blocks", "code_lines"],
            Conditions =
            [
                new("bugs", "max", 10),
                new("branch_coverage", "min", 50),
                new("duplicate_blocks", "max", 1),
                new("code_lines", "min", 12),
            ],
            RuleCatalog =
            [
                new(
                    "fixture",
                    "1",
                    "R1",
                    "csharp",
                    "bug",
                    JsonSerializer.SerializeToElement(new { }),
                    "https://learn.microsoft.com/dotnet/fundamentals/code-analysis/overview",
                    Remediation: new(
                        "constant",
                        60,
                        "https://learn.microsoft.com/dotnet/fundamentals/code-analysis/overview"
                    )
                ),
            ],
            AnalyzerConfigurations =
            [
                new(
                    "fixture",
                    "1",
                    "editorconfig",
                    ".editorconfig",
                    "root = true\n[*.cs]\ndotnet_diagnostic.R1.severity = warning\n"
                ),
            ],
        };
        await Call("POST", "/api/v1/profiles", measuredProfile, admin, 201);
        await Call(
            "PUT",
            $"/api/v1/profiles/projects/{key}",
            new ProfileAssignment(key, "4"),
            admin
        );
        var exported = ExecutableProfiles.Export(measuredProfile);
        var codeReports = new Dictionary<string, (string Format, string Version, string Content)>
        {
            ["main"] = ("sarif", "2.1.0", correctedSarif),
            ["coverage"] = (
                "lcov",
                "1",
                "SF:src/a.cs\nDA:1,1\nDA:2,0\nBRDA:1,0,0,1\nBRDA:1,0,1,0\nend_of_record\n"
            ),
            ["duplicates"] = (
                "jscpd",
                "1",
                """{"duplicates":[{"format":"csharp","lines":3,"tokens":20,"firstFile":{"name":"src/a.cs","start":1,"end":3},"secondFile":{"name":"src/b.cs","start":1,"end":3}}]}"""
            ),
            ["size"] = (
                "cloc",
                "1",
                """{"header":{"cloc_version":"1"},"src/a.cs":{"language":"C#","code":12,"comment":2,"blank":1},"src/b.cs":{"language":"C#","code":12,"comment":0,"blank":0},"SUM":{"code":24}}"""
            ),
        };
        var codeManifest = initial with
        {
            ProfileVersion = "4",
            BuildId = key + "-native-metrics",
            CommitSha = new string('f', 40),
            RepositoryFiles = ["src/a.cs", "src/b.cs"],
            EffectiveConfigurations = exported
                .Files.Select(f => new EffectiveConfiguration(
                    f.Tool,
                    f.ToolVersion,
                    f.Path,
                    f.Sha256
                ))
                .ToArray(),
            Reports = codeReports
                .Select(r =>
                    Manifest(r.Key, r.Value.Format, r.Value.Version, r.Value.Content).Reports[0]
                )
                .ToList(),
        };
        var codeResult = await PublishCode(codeManifest);
        Check(
            codeResult.GetProperty("quality_gate").GetString() == "pass",
            "global gate consumes real branch, duplicate and size measurements"
        );
        var codeSnapshot = codeResult.GetProperty("gate_snapshot");
        Check(
            codeSnapshot.GetProperty("metrics").GetProperty("branch_coverage").GetDouble() == 50
                && codeSnapshot.GetProperty("metrics").GetProperty("duplicate_blocks").GetInt32()
                    == 1
                && codeSnapshot.GetProperty("metrics").GetProperty("code_lines").GetInt32() == 24
                && codeSnapshot.GetProperty("configuration").GetProperty("state").GetString()
                    == "matched",
            "native metrics and effective configuration are persisted exactly"
        );
        Check(
            codeSnapshot.GetProperty("remediation").GetProperty("estimated_seconds").GetInt32()
                == 60,
            "documented remediation model stays an explicit estimate"
        );
        var drift = await PublishCode(
            codeManifest with
            {
                BuildId = key + "-configuration-drift",
                EffectiveConfigurations =
                [
                    codeManifest.EffectiveConfigurations[0] with
                    {
                        Sha256 = new string('0', 64),
                    },
                ],
            }
        );
        Check(
            drift.GetProperty("quality_gate").GetString() == "unknown"
                && drift
                    .GetProperty("gate_snapshot")
                    .GetProperty("configuration")
                    .GetProperty("state")
                    .GetString() == "drift",
            "configuration drift cannot satisfy a passing measured gate"
        );
        Console.WriteLine(
            "P3 native metrics/configuration HTTP checks passed: LCOV branches, jscpd blocks, cloc files, remediation estimate and drift."
        );
        await LeaseChecks(connection, key, ct);
        Console.WriteLine(
            $"P1 real HTTP/Blob/PostgreSQL checks passed: {key} (idempotence, revisions, hash, corruption, sizes, cross-project access, leases)."
        );

        AppDbContext Db() =>
            new(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connection).Options);
        async Task<JsonElement> PublishCode(IngestionManifest manifest)
        {
            var receipt = await Call("POST", "/api/v1/ingestions", manifest, ci, 201);
            var ingestionId = receipt.GetProperty("ingestion_id").GetString()!;
            foreach (var report in codeReports)
                await Upload(ingestionId, report.Key, report.Value.Content, ci);
            await Call(
                "POST",
                $"/api/v1/ingestions/{ingestionId}/finalize",
                token: ci,
                expected: 202
            );
            return await Terminal(ingestionId);
        }
        async Task<JsonElement> Publish(IngestionManifest manifest, string content)
        {
            var receipt = await Call("POST", "/api/v1/ingestions", manifest, ci, 201);
            var ingestionId = receipt.GetProperty("ingestion_id").GetString()!;
            await Upload(ingestionId, "main", content, ci);
            await Call(
                "POST",
                $"/api/v1/ingestions/{ingestionId}/finalize",
                token: ci,
                expected: 202
            );
            return await Terminal(ingestionId);
        }
        IngestionManifest Manifest(
            string reportId,
            string format,
            string version,
            string content
        ) =>
            new()
            {
                ProjectKey = key,
                RepositoryUrl = "https://example.invalid/" + key,
                CiProvider = "local",
                BuildId = key,
                CommitSha = "abcdef123456",
                Branch = "refs/heads/checks",
                ProfileId = key,
                ProfileVersion = "1",
                Reports =
                [
                    new(
                        reportId,
                        format,
                        version,
                        "fixture",
                        "1",
                        "measured",
                        Encoding.UTF8.GetByteCount(content),
                        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(content)))
                    ),
                ],
            };
        async Task<JsonElement> Call(
            string method,
            string path,
            object? body = null,
            string? token = null,
            int expected = 200
        )
        {
            using var request = new HttpRequestMessage(new HttpMethod(method), path);
            if (token is not null)
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            if (body is not null)
                request.Content = JsonContent.Create(body, options: ApiJson.Options);
            using var response = await client.SendAsync(request, ct);
            Check(
                (int)response.StatusCode == expected,
                $"{method} {path}: expected {expected}, got {(int)response.StatusCode}"
            );
            var raw = await response.Content.ReadAsStringAsync(ct);
            return string.IsNullOrWhiteSpace(raw)
                ? default
                : JsonSerializer.Deserialize<JsonElement>(raw);
        }
        async Task Upload(
            string ingestion,
            string report,
            string content,
            string token,
            int expected = 200
        )
        {
            using var request = new HttpRequestMessage(
                HttpMethod.Put,
                $"/api/v1/ingestions/{ingestion}/reports/{report}"
            )
            {
                Content = new ByteArrayContent(Encoding.UTF8.GetBytes(content)),
            };
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            using var response = await client.SendAsync(request, ct);
            Check(
                (int)response.StatusCode == expected,
                $"Upload expected {expected}, got {(int)response.StatusCode}"
            );
        }
        async Task<JsonElement> Terminal(string ingestion)
        {
            for (var attempt = 0; attempt < 80; attempt++)
            {
                var receipt = await Call("GET", $"/api/v1/ingestions/{ingestion}", token: ci);
                if (receipt.GetProperty("state").GetString() is "completed" or "failed")
                    return receipt;
                await Task.Delay(250, ct);
            }
            throw new InvalidOperationException(
                "Ingestion did not reach terminal state in 20 seconds."
            );
        }
    }

    private static async Task LeaseChecks(string connection, string prefix, CancellationToken ct)
    {
        AppDbContext Db() =>
            new(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connection).Options);
        await using var setup = Db();
        var ids = Enumerable.Range(0, 6).Select(x => prefix + "-lease-" + x).ToArray();
        setup.AddRange(
            ids.Select(id => new DurableJob
            {
                Id = id,
                ResourceId = id,
                Kind = "check-p1",
                AvailableAt = new DateTime(1900, 1, 1, 0, 0, 0, DateTimeKind.Utc),
            })
        );
        await setup.SaveChangesAsync(ct);
        try
        {
            await using var firstContext = Db();
            await using var secondContext = Db();
            var options = new IngestionOptions();
            var claims = await Task.WhenAll(
                IngestionWorker.ClaimAsync(firstContext, options, ct),
                IngestionWorker.ClaimAsync(secondContext, options, ct)
            );
            Check(
                claims.All(x => x is not null && ids.Contains(x.Id))
                    && claims[0]!.Id != claims[1]!.Id
                    && claims[0]!.LeaseOwner != claims[1]!.LeaseOwner,
                "concurrent claims reserve different jobs and owners"
            );
            var original = claims[0]!;
            await setup
                .Set<DurableJob>()
                .Where(x => x.Id == original.Id)
                .ExecuteUpdateAsync(
                    s =>
                        s.SetProperty(x => x.LeaseUntil, DateTime.UtcNow.AddSeconds(-1))
                            .SetProperty(
                                x => x.AvailableAt,
                                new DateTime(1800, 1, 1, 0, 0, 0, DateTimeKind.Utc)
                            ),
                    ct
                );
            await using var recovery = Db();
            var recovered = await IngestionWorker.ClaimAsync(recovery, options, ct);
            Check(
                recovered?.Id == original.Id
                    && recovered.LeaseOwner != original.LeaseOwner
                    && recovered.Attempts == original.Attempts + 1,
                "expired lease is reclaimed with a new owner and incremented attempt"
            );
        }
        finally
        {
            await setup.Set<DurableJob>().Where(x => ids.Contains(x.Id)).ExecuteDeleteAsync(ct);
        }
    }

    private static void Check(bool condition, string message)
    {
        if (!condition)
            throw new InvalidOperationException("P1 ingestion check: " + message);
    }
}
