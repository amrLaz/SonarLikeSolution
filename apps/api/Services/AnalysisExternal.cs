using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using CodeInsights.Api.Contracts;
using CodeInsights.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace CodeInsights.Api.Services;

public static class AnalysisExternal
{
    public static async Task DecorateAsync(
        AnalysisRecord record,
        AnalysisRequest request,
        AnalysisMetrics metrics,
        List<string> failures,
        AppDbContext db,
        IHttpClientFactory clients,
        AnalysisOptions options,
        CancellationToken ct
    )
    {
        record.PrDecorationStatus = "skipped";
        record.PrDecorationError = "";
        try
        {
            var orgUrl = request.PrAdoOrgUrl?.TrimEnd('/');
            var config = string.IsNullOrEmpty(orgUrl)
                ? null
                : await db.Set<AzureDevOpsOrganizationConfig>()
                    .FirstOrDefaultAsync(
                        x => x.OrganizationUrl == orgUrl && x.QualityGateEnabled,
                        ct
                    );
            if (config == null || string.IsNullOrEmpty(config.Pat))
                return;
            using var client = clients.CreateClient("pr-decoration");
            client.Timeout = TimeSpan.FromSeconds(15);
            client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
                "Basic",
                Convert.ToBase64String(Encoding.UTF8.GetBytes(":" + config.Pat))
            );
            client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
            client.DefaultRequestHeaders.Add("X-TFS-FedAuthRedirect", "Suppress");
            var enforcement = options.Enforcement.ToLowerInvariant();
            var informative = enforcement != "blocking";
            using var snapshot = JsonDocument.Parse(record.GateSnapshot);
            var technicallyComplete = snapshot.RootElement.TryGetProperty("technical_state", out var technicalState)
                && technicalState.GetString() == "success";
            static string N(int? value) => value?.ToString() ?? "None";
            var description =
                $"Quality Gate ({(informative ? "informative" : "blocking")}): {record.QualityGate.ToUpperInvariant()} — Security {N(metrics.SecurityScore)}/100, Reliability {N(metrics.ReliabilityScore)}/100, Maintainability {N(metrics.MaintainabilityScore)}/100";
            var body = new Dictionary<string, object>
            {
                ["state"] = !technicallyComplete || record.QualityGate == "unknown" ? "error" : informative || record.QualityGate == "pass" ? "succeeded" : "failed",
                ["description"] = description[..Math.Min(description.Length, 200)],
                ["context"] = new { name = "platform-quality-gate", genre = "static-analysis" },
            };
            if (!string.IsNullOrEmpty(request.PlatformUrl))
                body["targetUrl"] =
                    $"{request.PlatformUrl.TrimEnd('/')}/?analysis_id={record.AnalysisId}";
            var url =
                $"{config.OrganizationUrl.TrimEnd('/')}/{Uri.EscapeDataString(request.PrAdoProject!)}/_apis/git/repositories/{Uri.EscapeDataString(request.PrRepoId!)}/pullRequests/{Uri.EscapeDataString(request.PrId!)}";
            async Task Post(string suffix, object payload)
            {
                using var response = await client.PostAsJsonAsync(url + suffix, payload, ct);
                if ((int)response.StatusCode is not (200 or 201))
                {
                    throw new HttpRequestException(
                        $"ADO HTTP {(int)response.StatusCode}"
                    );
                }
            }
            await Post("/statuses?api-version=7.1", body);
            List<string> lines =
            [
                $"Quality Gate {record.QualityGate.ToUpperInvariant()} ({enforcement})",
                "",
                $"Security: {N(metrics.SecurityScore)}/100",
                $"Reliability: {N(metrics.ReliabilityScore)}/100",
                $"Maintainability: {N(metrics.MaintainabilityScore)}/100",
                $"Vulnerabilities: {N(metrics.Vulnerabilities)}",
                $"Hotspots: {N(metrics.SecurityHotspots)}",
                $"Bugs: {N(metrics.Bugs)}",
                $"Code smells: {N(metrics.CodeSmells)}",
            ];
            if (failures.Count > 0)
            {
                lines.AddRange(["", "Blocking conditions:"]);
                lines.AddRange(failures.Take(10).Select(x => "- " + x));
            }
            if (!string.IsNullOrEmpty(request.PlatformUrl))
                lines.AddRange([
                    "",
                    $"Analysis details: {request.PlatformUrl.TrimEnd('/')}/api/v1/analyses/{record.AnalysisId}/view",
                ]);
            await Post(
                "/threads?api-version=7.1",
                new
                {
                    comments = new[]
                    {
                        new
                        {
                            parentCommentId = 0,
                            content = string.Join('\n', lines),
                            commentType = 1,
                        },
                    },
                    status = "active",
                }
            );
            record.PrDecorationStatus = "posted";
        }
        catch (Exception ex)
            when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            record.PrDecorationStatus = "error";
            record.PrDecorationError = ex.Message[..Math.Min(ex.Message.Length, 512)];
        }
    }

    public static async Task<object> AiFixAsync(
        AiFixRequest req,
        IHttpClientFactory clients,
        AnalysisOptions options,
        CancellationToken ct
    )
    {
        var endpoint = options.AzureOpenAiEndpoint.TrimEnd('/');
        var key = options.AzureOpenAiApiKey;
        var deployment = options.AzureOpenAiDeployment;
        var apiVersion = options.AzureOpenAiApiVersion;
        var dependency = req.CveId.Length > 0 && req.PkgName.Length > 0;
        var context = dependency
            ? $"CVE: {req.CveId}\nPackage: {req.PkgName}@{req.Version} ({req.Language})\nSeverity: {req.Severity}\n"
                + (
                    req.FixedVersion.Length > 0
                        ? $"Fix: upgrade to {req.FixedVersion}\n"
                        : "No official fix available yet\n"
                )
                + $"Description: {(req.Description.Length > 0 ? req.Description : "No description available")}"
            : $"Rule: {req.RuleId}\nFile: {req.FilePath}\nSeverity: {req.Severity}\nFinding: {req.Message}\nLanguage: {(req.Language.Length > 0 ? req.Language : "unknown")}";
        var prompt =
            $"You are a security expert reviewing a {(dependency ? "dependency vulnerability (CVE in a third-party package)" : "SAST finding (code issue)")} found during a SAST scan.\n\n{context}\n\nRespond with:\n1. **Why it matters** — 1 sentence on the real-world risk\n2. **Fix** — the exact command, code change, or configuration to resolve it (be precise and concrete)\n3. **Verification** — 1 sentence on how to confirm it is fixed\n\nKeep the total response under 200 words. Use markdown formatting.";
        try
        {
            using var client = clients.CreateClient("ai-fix");
            client.Timeout = TimeSpan.FromSeconds(30);
            var azure = endpoint.Length > 0 && key.Length > 0;
            var url = azure
                ? $"{endpoint}/openai/deployments/{deployment}/chat/completions?api-version={apiVersion}"
                : "https://api.anthropic.com/v1/messages";
            if (azure)
                client.DefaultRequestHeaders.Add("api-key", key);
            else
            {
                client.DefaultRequestHeaders.Add("x-api-key", options.AnthropicApiKey);
                client.DefaultRequestHeaders.Add("anthropic-version", "2023-06-01");
            }
            var body = new Dictionary<string, object>
            {
                ["messages"] = new[] { new { role = "user", content = prompt } },
                ["max_tokens"] = 512,
            };
            if (azure)
                body["temperature"] = 0.3;
            else
                body["model"] = "claude-haiku-4-5-20251001";
            using var response = await client.PostAsJsonAsync(url, body, ct);
            var text = await response.Content.ReadAsStringAsync(ct);
            if ((int)response.StatusCode != 200)
                throw new ApiException(
                    502,
                    azure
                        ? $"Azure OpenAI returned {(int)response.StatusCode}: {text[..Math.Min(200, text.Length)]}"
                        : $"Anthropic returned {(int)response.StatusCode}"
                );
            using var document = JsonDocument.Parse(text);
            var suggestion = azure
                ? document
                    .RootElement.GetProperty("choices")[0]
                    .GetProperty("message")
                    .GetProperty("content")
                    .GetString()
                : document.RootElement.GetProperty("content")[0].GetProperty("text").GetString();
            return new
            {
                suggestion,
                cve_id = req.CveId,
                rule_id = req.RuleId,
                model = azure ? $"azure/{deployment}" : "claude-haiku-4-5-20251001",
            };
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            throw new ApiException(504, "AI service timeout");
        }
        catch (ApiException)
        {
            throw;
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            throw new ApiException(502, $"AI service error: {ex.Message}");
        }
    }
}
