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

}
