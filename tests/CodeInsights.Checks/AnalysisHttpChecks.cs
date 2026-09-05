using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CodeInsights.Api;
using CodeInsights.Api.Contracts;
using CodeInsights.Api.Services;

public static class AnalysisHttpChecks
{
    public static async Task RunAsync(
        HttpClient client,
        string ciToken,
        string projectKey,
        string adminToken
    )
    {
        async Task<HttpResponseMessage> Send(
            HttpMethod method,
            string path,
            object? body = null,
            string? token = null
        )
        {
            var message = new HttpRequestMessage(method, path);
            message.Headers.Authorization = new AuthenticationHeaderValue(
                "Bearer",
                token ?? ciToken
            );
            if (body != null)
                message.Content = JsonContent.Create(body, options: ApiJson.Options);
            return await client.SendAsync(message);
        }
        static async Task<JsonElement> Json(
            HttpResponseMessage response,
            HttpStatusCode status = HttpStatusCode.OK
        )
        {
            var text = await response.Content.ReadAsStringAsync();
            if (response.StatusCode != status)
                throw new InvalidOperationException(
                    $"Analysis HTTP {response.RequestMessage?.RequestUri}: expected {status}, got {response.StatusCode}: {text}"
                );
            return JsonDocument.Parse(text).RootElement.Clone();
        }
        static void Require(bool pass, string description)
        {
            if (!pass)
                throw new InvalidOperationException("Analysis HTTP: " + description);
        }
        var complete = new AnalysisRequest
        {
            ProjectKey = projectKey,
            CommitSha = "abcdef012345",
            Branch = "migration-check",
            ProfileId = "p0-dotnet",
            ProfileVersion = "1",
            FormulaVersion = "1",
            ToolExecutions =
            [
                new("semgrep", "success", "1"),
                new("trivy", "success", "1"),
                new("gitleaks", "success", "1"),
            ],
        };
        foreach (var metric in GateEvaluation.GateMetrics)
            complete.Measurements[metric] = new(
                "measured",
                metric.EndsWith("score") ? 100 : 0,
                "semgrep",
                "1"
            );
        complete.AffectedFiles = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(
            "{\"src/a.cs\":[{\"rule\":\"semgrep/csharp.sample-rule\",\"severity\":\"HIGH\",\"category\":\"vulnerability\",\"line\":4,\"message\":\"Sample issue\"}],\"sample.csproj\":[{\"rule\":\"trivy/CVE-2026-0001\",\"severity\":\"HIGH\",\"category\":\"dependency_vulnerability\",\"message\":\"Sample@1: title | fix: upgrade to 2 | CVSS 8.1\"}]}"
        );
        var created = await Json(await Send(HttpMethod.Post, "/api/v1/analyses", complete));
        Require(created.GetProperty("quality_gate").GetString() == "pass", "complete gate pass");
        var id = created.GetProperty("analysis_id").GetString()!;
        var detail = await Json(await Send(HttpMethod.Get, $"/api/v1/analyses/{id}"));
        Require(
            detail
                .GetProperty("metrics")
                .GetProperty("affected_files")
                .GetProperty("src/a.cs")
                .GetArrayLength() == 1,
            "persisted findings"
        );
        var list = await Json(
            await Send(
                HttpMethod.Get,
                $"/api/v1/analyses?project_key={Uri.EscapeDataString(projectKey)}"
            )
        );
        Require(
            list.EnumerateArray().Any(x => x.GetProperty("analysis_id").GetString() == id),
            "project list contains analysis"
        );
        list = await Json(await Send(HttpMethod.Get, "/api/v1/analyses"));
        Require(
            list.EnumerateArray()
                .First(x => x.GetProperty("analysis_id").GetString() == id)
                .GetProperty("metrics")
                .GetProperty("affected_files")
                .ValueKind == JsonValueKind.Null,
            "global list omits findings"
        );
        var findings = await Json(
            await Send(HttpMethod.Get, $"/api/v1/analyses/{id}/vulnerabilities")
        );
        Require(
            findings.GetProperty("vulnerabilities").GetArrayLength() == 2
                && findings.GetProperty("high_count").GetInt32() == 2,
            "SAST and SCA materialization"
        );
        foreach (
            var path in new[]
            {
                $"/api/v1/analyses/{id}/export/csv",
                $"/api/v1/analyses/export/csv?project_key={Uri.EscapeDataString(projectKey)}",
            }
        )
        {
            using var csv = await Send(HttpMethod.Get, path);
            Require(
                csv.StatusCode == HttpStatusCode.OK
                    && (await csv.Content.ReadAsStringAsync()).StartsWith(
                        "analysis_id,project_key"
                    ),
                "CSV export"
            );
        }
        using (var pdf = await Send(HttpMethod.Get, $"/api/v1/analyses/{id}/export/pdf"))
        {
            Require(pdf.StatusCode == HttpStatusCode.OK, "PDF HTTP status");
            Require(
                System.Text.Encoding.ASCII.GetString(await pdf.Content.ReadAsByteArrayAsync(), 0, 5)
                    == "%PDF-",
                "PDF bytes"
            );
        }
        using (
            var redirectClient = new HttpClient(new HttpClientHandler { AllowAutoRedirect = false })
            {
                BaseAddress = client.BaseAddress,
            }
        )
        {
            redirectClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
                "Bearer",
                ciToken
            );
            using var redirect = await redirectClient.GetAsync($"/api/v1/analyses/{id}/view");
            Require(
                redirect.StatusCode == HttpStatusCode.Found
                    && redirect.Headers.Location?.ToString()
                        == $"http://localhost:5174/analyses/{id}",
                "analysis view redirect"
            );
        }
        var rules = await Json(
            await Send(
                HttpMethod.Get,
                $"/api/v1/rules?project_key={Uri.EscapeDataString(projectKey)}"
            )
        );
        Require(
            rules
                .EnumerateArray()
                .Any(x => x.GetProperty("rule_id").GetString() == "semgrep/csharp.sample-rule"),
            "rule aggregate"
        );
        Require(
            !rules
                .EnumerateArray()
                .Any(x => x.GetProperty("rule_id").GetString()!.StartsWith("trivy/")),
            "SCA excluded from rules"
        );
        await Json(await Send(HttpMethod.Get, "/api/v1/rules"));
        await Json(
            await Send(
                HttpMethod.Post,
                "/api/v1/rules/semgrep/csharp.sample-rule/suppress?note=migration-test",
                token: adminToken
            )
        );
        rules = await Json(
            await Send(
                HttpMethod.Get,
                $"/api/v1/rules?project_key={Uri.EscapeDataString(projectKey)}"
            )
        );
        Require(
            rules
                .EnumerateArray()
                .First(x => x.GetProperty("rule_id").GetString() == "semgrep/csharp.sample-rule")
                .GetProperty("status")
                .GetString() == "suppressed",
            "rule suppression visible"
        );
        await Json(
            await Send(
                HttpMethod.Delete,
                "/api/v1/rules/semgrep/csharp.sample-rule/suppress",
                token: adminToken
            )
        );
        await Json(
            await Send(
                HttpMethod.Get,
                $"/api/v1/vulnerabilities?project_key={Uri.EscapeDataString(projectKey)}"
            )
        );
        await Json(
            await Send(
                HttpMethod.Post,
                $"/api/v1/analyses/{id}/ai-fix",
                new AiFixRequest(),
                adminToken
            ),
            HttpStatusCode.ServiceUnavailable
        );
        complete.Measurements["security_score"] = new("measured", 0);
        var failed = await Json(await Send(HttpMethod.Post, "/api/v1/analyses", complete));
        Require(failed.GetProperty("quality_gate").GetString() == "fail", "measured failure");
        complete.Measurements["security_score"] = new("measured", 100);
        complete.FormulaVersion = "unknown";
        var unknown = await Json(await Send(HttpMethod.Post, "/api/v1/analyses", complete));
        Require(
            unknown.GetProperty("quality_gate").GetString() == "unknown",
            "unknown formula cannot pass"
        );
        complete.ProfileId = "";
        await Json(
            await Send(HttpMethod.Post, "/api/v1/analyses", complete),
            HttpStatusCode.UnprocessableEntity
        );
        complete.ProfileId = "p0-dotnet";
        complete.FormulaVersion = "1";
        complete.Measurements["security_score"] = new("measured", 101);
        await Json(
            await Send(HttpMethod.Post, "/api/v1/analyses", complete),
            HttpStatusCode.UnprocessableEntity
        );
        complete.Measurements["security_score"] = new("measured", 100);
        var strict = JsonSerializer.SerializeToNode(complete, ApiJson.Options)!.AsObject();
        foreach (
            var removedField in new[]
            {
                "profile_id",
                "profile_version",
                "formula_version",
                "measurements",
                "tool_executions",
            }
        )
        {
            var missing = strict.DeepClone().AsObject();
            missing.Remove(removedField);
            await Json(
                await Send(HttpMethod.Post, "/api/v1/analyses", missing),
                HttpStatusCode.BadRequest
            );
        }
        foreach (
            var unknownField in new[]
            {
                "unexpected_field",
            }
        )
        {
            var extra = strict.DeepClone().AsObject();
            extra[unknownField] = 1;
            await Json(
                await Send(HttpMethod.Post, "/api/v1/analyses", extra),
                HttpStatusCode.BadRequest
            );
        }
        await Json(await Send(HttpMethod.Get, "/api/v1/analyses/missing"), HttpStatusCode.NotFound);
        using (
            var unauthorized = await Send(
                HttpMethod.Get,
                $"/api/v1/analyses/{id}",
                token: "invalid"
            )
        )
            Require(
                unauthorized.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden,
                "anonymous denied"
            );
        using (
            var forbidden = await Send(
                HttpMethod.Post,
                "/api/v1/rules/semgrep/csharp.sample-rule/suppress",
                token: ciToken
            )
        )
            Require(
                forbidden.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden,
                "CI rule mutation denied"
            );
        await Json(
            await Send(
                HttpMethod.Delete,
                $"/api/v1/analyses/projects/{Uri.EscapeDataString(projectKey)}/branches/migration-check",
                token: adminToken
            )
        );
        await Json(await Send(HttpMethod.Get, $"/api/v1/analyses/{id}"), HttpStatusCode.NotFound);
        await Json(
            await Send(
                HttpMethod.Delete,
                $"/api/v1/analyses/projects/{Uri.EscapeDataString(projectKey)}",
                token: adminToken
            )
        );
        Console.WriteLine(
            "Analysis HTTP CRUD, gates, findings, rules, exports, errors and access checks passed."
        );
    }
}
