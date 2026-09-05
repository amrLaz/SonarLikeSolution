using System.Net;
using System.Text;
using System.Text.Json;
using CodeInsights.Api;
using CodeInsights.Api.Contracts;
using CodeInsights.Api.Data;
using CodeInsights.Api.Services;
using Microsoft.EntityFrameworkCore;

public static class AnalysisChecks
{
    private static void Check(bool condition, string label)
    {
        if (!condition)
            throw new InvalidOperationException("Analysis check: " + label);
    }

    public static void Run()
    {
        var request = new AnalysisRequest
        {
            ProjectKey = "example",
            CommitSha = "abcdef",
            Branch = "main",
            CiProvider = "local",
            ProfileId = "p0-dotnet",
            ProfileVersion = "1",
            FormulaVersion = "1",
        };
        int[] values = [50, 50, 50, 100, 10, 10, 10];
        for (var i = 0; i < values.Length; i++)
            request.Measurements[GateEvaluation.GateMetrics[i]] = new(
                "measured",
                values[i],
                "semgrep",
                "1"
            );
        request.ToolExecutions =
        [
            new("semgrep", "success"),
            new("trivy", "success"),
            new("gitleaks", "success"),
        ];
        var project = new Project { AnalysisProfileId = "p0-dotnet", AnalysisProfileVersion = "1" };
        var gate = new QualityGateConfig
        {
            Id = "default",
            Name = "Default",
            MinMaintainabilityScore = 50,
            MinSecurityScore = 50,
            MinReliabilityScore = 50,
            MaxCodeSmells = 100,
            MaxVulnerabilities = 10,
            MaxSecurityHotspots = 10,
            MaxBugs = 10,
        };
        GateEvaluation.Validate(request);
        Check(GateEvaluation.Completeness(request, project) == "complete", "complete profile");
        var metrics = GateEvaluation.BuildMetrics(request);
        Check(
            GateEvaluation
                .Evaluate(metrics, gate, request.Measurements, "p0-dotnet", "1", "1")
                .Verdict == "pass",
            "inclusive thresholds"
        );
        for (var i = 0; i < values.Length; i++)
        {
            var name = GateEvaluation.GateMetrics[i];
            metrics.Set(name, values[i] + (i < 3 ? -1 : 1));
            Check(
                GateEvaluation
                    .Evaluate(metrics, gate, request.Measurements, "p0-dotnet", "1", "1")
                    .Verdict == "fail",
                "threshold " + name
            );
            metrics.Set(name, values[i]);
        }
        request.Measurements.Remove("bugs");
        Check(
            GateEvaluation.Completeness(request, project) == "incomplete",
            "missing required metric"
        );
        Check(
            GateEvaluation
                .Evaluate(metrics, gate, request.Measurements, "p0-dotnet", "1", "1")
                .Verdict == "unknown",
            "missing is not zero"
        );
        request.Measurements["bugs"] = new("measured", 0);
        Check(GateEvaluation.BuildMetrics(request).Bugs == 0, "measured zero");
        request.FormulaVersion = "unrecognized";
        Check(GateEvaluation.Completeness(request, project) == "incomplete", "unknown formula");
        request.FormulaVersion = "1";
        request.ToolExecutions.Add(new("trivy", "failed"));
        Check(GateEvaluation.Completeness(request, project) == "incomplete", "failed tool");
        Check(
            GateEvaluation.TechnicalState(
                "incomplete",
                request.ToolExecutions,
                request.Measurements
            ) == "failed",
            "failed technical state"
        );
        request.Measurements.Clear();
        Check(
            GateEvaluation.Completeness(request, project) == "incomplete",
            "empty metrics incomplete"
        );
        Check(GateEvaluation.BuildMetrics(request).SecurityScore == null, "absence preserved");
        request.Measurements["security_score"] = new("measured");
        try
        {
            GateEvaluation.Validate(request);
            throw new InvalidOperationException("Invalid measurement accepted");
        }
        catch (ApiException) { }
        request.Measurements["security_score"] = new("measured", 100);
        request.Measurements["vulnerabilities"] = new("measured", 0);
        request.ProfileId = "p0-iac";
        project.AnalysisProfileId = "p0-iac";
        request.ToolExecutions =
        [
            new("checkov", "success"),
            new("trivy", "success"),
            new("gitleaks", "success"),
        ];
        Check(
            GateEvaluation.Completeness(request, project) == "complete",
            "IaC two required measurements"
        );
        var iac = GateEvaluation.Evaluate(
            GateEvaluation.BuildMetrics(request),
            gate,
            request.Measurements,
            "p0-iac",
            "1",
            "1"
        );
        Check(iac.Verdict == "pass", "optional measurements do not block IaC");
        Check(
            ((List<object>)iac.Snapshot["conditions"]!).Count == 7,
            "seven snapshot conditions retained"
        );
        var json = JsonSerializer.SerializeToNode(request, ApiJson.Options)!.AsObject();
        foreach (
            var field in new[]
            {
                "project_key",
                "commit_sha",
                "branch",
                "ci_provider",
                "profile_id",
                "profile_version",
                "formula_version",
                "measurements",
                "tool_executions",
            }
        )
        {
            var missing = json.DeepClone().AsObject();
            missing.Remove(field);
            try
            {
                missing.Deserialize<AnalysisRequest>(ApiJson.Options);
                throw new InvalidOperationException("Missing required field accepted: " + field);
            }
            catch (JsonException) { }
        }
        json["unexpected_field"] = 1;
        try
        {
            json.Deserialize<AnalysisRequest>(ApiJson.Options);
            throw new InvalidOperationException("Unknown field accepted");
        }
        catch (JsonException) { }
        request.ProfileId = "";
        try
        {
            GateEvaluation.Validate(request);
            throw new InvalidOperationException("Empty profile accepted");
        }
        catch (ApiException) { }
        Check(
            AnalysisFindings.RepoFileUrl(
                "azure-devops",
                "https://user@dev.azure.com/org/project/_git/repo",
                "abcdef",
                "/mnt/vss/_work/1/s/a.cs",
                4,
                6
            )
                == "https://dev.azure.com/org/project/_git/repo?path=%2Fa.cs&version=GCabcdef&line=4&lineEnd=7&lineStartColumn=1&lineEndColumn=1&lineStyle=plain&_a=contents",
            "ADO source link"
        );
        var record = new AnalysisRecord
        {
            AnalysisId = "12345678",
            ProjectKey = "a,b",
            CommitSha = "abcdef",
            Branch = "main",
            CiProvider = "local",
            Status = "completed",
            QualityGate = "unknown",
            CreatedAt = "2026-09-05T00:00:00+00:00",
            AffectedFiles = "{}",
            GateFailures = "[]",
            Measurements = "{}",
            ToolExecutions = "[]",
            GateSnapshot = "{}",
            Completeness = "incomplete",
            ProfileId = "p0-dotnet",
            ProfileVersion = "1",
            FormulaVersion = "1",
        };
        Check(
            Encoding.UTF8.GetString(ExportService.Csv([record])).Contains("\"a,b\""),
            "CSV quoting"
        );
        Check(Encoding.ASCII.GetString(ExportService.Pdf(record), 0, 5) == "%PDF-", "PDF fonts");
        Console.WriteLine(
            "Strict analysis contract, gates, IaC, null measurements, CSV and PDF checks passed."
        );
    }

    public static async Task RunExternalAsync()
    {
        await CheckPrDecorationAsync();
        var options = new AnalysisOptions
        {
            AzureOpenAiEndpoint = "https://model.invalid",
            AzureOpenAiApiKey = "fixture",
            AzureOpenAiDeployment = "fixture-model",
        };
        var handler = new StubHandler();
        var factory = new StubFactory(handler);
        var request = new AiFixRequest
        {
            CveId = "CVE-2026-1",
            PkgName = "sample",
            Version = "1",
            FixedVersion = "2",
            Severity = "HIGH",
        };
        await AnalysisExternal.AiFixAsync(request, factory, options, CancellationToken.None);
        Check(
            handler.Request?.RequestUri?.AbsolutePath
                == "/openai/deployments/fixture-model/chat/completions",
            "Azure AI endpoint"
        );
        Check(
            handler.Body.Contains("Why it matters")
                && handler.Body.Contains("upgrade to 2")
                && handler.Body.Contains("max_tokens"),
            "AI prompt and token limit"
        );
        options.AzureOpenAiEndpoint = "";
        options.AzureOpenAiApiKey = "";
        options.AnthropicApiKey = "fixture";
        handler.Anthropic = true;
        await AnalysisExternal.AiFixAsync(request, factory, options, CancellationToken.None);
        Check(
            handler.Request?.RequestUri?.Host == "api.anthropic.com"
                && handler.Request.Headers.Contains("anthropic-version"),
            "Anthropic fallback"
        );
        handler.Failure = true;
        try
        {
            await AnalysisExternal.AiFixAsync(request, factory, options, CancellationToken.None);
            throw new InvalidOperationException("AI failure accepted");
        }
        catch (ApiException) { }
        Console.WriteLine("AI outbound contract and errors verified using an HTTP substitute.");
    }

    private static async Task CheckPrDecorationAsync()
    {
        var connection = Environment.GetEnvironmentVariable("CODEINSIGHTS_TEST_DB");
        if (string.IsNullOrEmpty(connection))
            return;
        await using var db = new AppDbContext(
            new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connection).Options
        );
        await using var transaction = await db.Database.BeginTransactionAsync();
        var orgUrl = "https://ado.invalid/" + Guid.NewGuid().ToString("N");
        db.Add(
            new AzureDevOpsOrganizationConfig
            {
                ConfigId = Guid.NewGuid().ToString(),
                ConfigName = Guid.NewGuid().ToString(),
                OrganizationUrl = orgUrl,
                Pat = "synthetic-pat",
                QualityGateEnabled = true,
            }
        );
        await db.SaveChangesAsync();
        var handler = new PrHandler();
        var record = new AnalysisRecord { AnalysisId = "fixture-id", QualityGate = "fail" };
        var request = new AnalysisRequest
        {
            PrAdoOrgUrl = orgUrl + "/",
            PrAdoProject = "Team Project",
            PrRepoId = "repository",
            PrId = "42",
            PlatformUrl = "https://hub.invalid/",
        };
        var metrics = new AnalysisMetrics
        {
            SecurityScore = 40,
            MaintainabilityScore = 50,
            ReliabilityScore = 60,
            Vulnerabilities = 3,
            Bugs = 2,
            CodeSmells = 20,
            SecurityHotspots = 1,
        };
        var options = new AnalysisOptions { Enforcement = "blocking" };
        await AnalysisExternal.DecorateAsync(
            record,
            request,
            metrics,
            ["Security score 40 is below 50"],
            db,
            new PrFactory(handler),
            options,
            CancellationToken.None
        );
        Check(
            record.PrDecorationStatus == "posted" && handler.Bodies.Count == 2,
            "PR status and discussion posted"
        );
        using (var status = JsonDocument.Parse(handler.Bodies[0]))
        {
            Check(
                status.RootElement.GetProperty("state").GetString() == "failed",
                "blocking PR failure"
            );
            Check(
                status.RootElement.GetProperty("targetUrl").GetString()
                    == "https://hub.invalid/?analysis_id=fixture-id",
                "PR target URL preserves camelCase"
            );
            Check(
                status.RootElement.GetProperty("context").GetProperty("name").GetString()
                    == "platform-quality-gate",
                "PR context"
            );
        }
        using (var comment = JsonDocument.Parse(handler.Bodies[1]))
        {
            var content = comment
                .RootElement.GetProperty("comments")[0]
                .GetProperty("content")
                .GetString()!;
            Check(
                content.Contains("Quality Gate FAIL (blocking)")
                    && content.Contains("Blocking conditions:\n- Security score 40 is below 50")
                    && content.EndsWith("/api/v1/analyses/fixture-id/view"),
                "PR discussion detail"
            );
        }
        handler.Bodies.Clear();
        options.Enforcement = "informative";
        await AnalysisExternal.DecorateAsync(
            record,
            request,
            metrics,
            [],
            db,
            new PrFactory(handler),
            options,
            CancellationToken.None
        );
        using (var informative = JsonDocument.Parse(handler.Bodies[0]))
            Check(
                informative.RootElement.GetProperty("state").GetString() == "succeeded",
                "informative PR status"
            );
        handler.Failure = true;
        await AnalysisExternal.DecorateAsync(
            record,
            request,
            metrics,
            [],
            db,
            new PrFactory(handler),
            options,
            CancellationToken.None
        );
        Check(
            record.PrDecorationStatus == "error"
                && record.PrDecorationError?.Contains("ADO HTTP 503") == true,
            "PR transport failure recorded without losing analysis"
        );
        await transaction.RollbackAsync();
        Console.WriteLine(
            "Azure DevOps PR decoration payloads and errors verified without network sends."
        );
    }

    private sealed class PrFactory(PrHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, false);
    }

    private sealed class PrHandler : HttpMessageHandler
    {
        public List<string> Bodies { get; } = [];
        public bool Failure { get; set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken ct
        )
        {
            Check(request.RequestUri?.Host == "ado.invalid", "PR uses selected organization");
            Check(request.Headers.Authorization?.Scheme == "Basic", "PR PAT uses Basic header");
            Bodies.Add(await request.Content!.ReadAsStringAsync(ct));
            return new(Failure ? HttpStatusCode.ServiceUnavailable : HttpStatusCode.Created)
            {
                Content = new StringContent("{}"),
            };
        }
    }

    private sealed class StubFactory(StubHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, false);
    }

    private sealed class StubHandler : HttpMessageHandler
    {
        public HttpRequestMessage? Request { get; private set; }
        public string Body { get; private set; } = "";
        public bool Anthropic { get; set; }
        public bool Failure { get; set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken ct
        )
        {
            Request = request;
            Body = await request.Content!.ReadAsStringAsync(ct);
            return new(Failure ? HttpStatusCode.BadGateway : HttpStatusCode.OK)
            {
                Content = new StringContent(
                    Anthropic
                        ? "{\"content\":[{\"text\":\"fix\"}]}"
                        : "{\"choices\":[{\"message\":{\"content\":\"fix\"}}]}"
                ),
            };
        }
    }
}
