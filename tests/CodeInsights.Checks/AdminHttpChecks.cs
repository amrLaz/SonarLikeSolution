using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

public static class AdminHttpChecks
{
    public static async Task RunAsync(HttpClient client, string adminToken, string projectKey)
    {
        async Task<JsonNode?> Call(
            HttpMethod method,
            string path,
            object? body = null,
            HttpStatusCode expected = HttpStatusCode.OK,
            bool authenticated = true
        )
        {
            using var request = new HttpRequestMessage(method, path);
            if (authenticated)
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", adminToken);
            if (body is not null)
                request.Content = JsonContent.Create(body);
            using var response = await client.SendAsync(request);
            var text = await response.Content.ReadAsStringAsync();
            Check(
                response.StatusCode == expected,
                $"{method} {path}: {(int)response.StatusCode}, expected {(int)expected}: {text}"
            );
            return string.IsNullOrEmpty(text) ? null : JsonNode.Parse(text);
        }
        foreach (
            var path in new[]
            {
                "/platform/token/history",
                "/platform/token/status",
                "/platform/settings",
                "/platform/cleanup/status",
                "/integrations/azure-devops/configs",
                "/notifications/channels",
                "/audit-logs",
                "/audit-logs/actions",
            }
        )
            await Call(
                HttpMethod.Get,
                "/api/v1" + path,
                expected: HttpStatusCode.Unauthorized,
                authenticated: false
            );
        var settings = await Call(HttpMethod.Get, "/api/v1/platform/settings");
        Check(
            settings?["retention_keep_days"] is not null
                && settings["audit_log_retention_days"] is not null,
            "Settings defaults"
        );
        await Call(
            HttpMethod.Put,
            "/api/v1/platform/settings",
            new { instance_name = "Administration checks", ignored_setting = new { arbitrary = 42 } }
        );
        settings = await Call(HttpMethod.Get, "/api/v1/platform/settings");
        Check(
            settings?["instance_name"]?.ToString() == "Administration checks"
                && settings["ignored_setting"] is null,
            "Settings update filters unknown fields"
        );
        await Call(
            HttpMethod.Post,
            "/api/v1/platform/token/generate",
            new
            {
                token_name = "invalid",
                project_keys = new[] { projectKey },
                ttl_days = 0,
            },
            HttpStatusCode.UnprocessableEntity
        );
        await Call(
            HttpMethod.Post,
            "/api/v1/platform/token/generate",
            new { token_name = "invalid", project_keys = Array.Empty<string>() },
            HttpStatusCode.UnprocessableEntity
        );
        await Call(
            HttpMethod.Post,
            "/api/v1/platform/token/generate",
            new { token_name = "invalid", project_keys = new[] { "unknown-project" } },
            HttpStatusCode.UnprocessableEntity
        );
        await Call(
            HttpMethod.Post,
            "/api/v1/platform/token/generate",
            new
            {
                token_name = "invalid",
                project_keys = new[] { projectKey },
                require_current_token = true,
            },
            HttpStatusCode.Unauthorized
        );
        var generated = await Call(
            HttpMethod.Post,
            "/api/v1/platform/token/generate",
            new
            {
                token_name = "admin-check-token-" + projectKey,
                project_keys = new[] { projectKey },
                ttl_days = 1,
            }
        );
        var plaintext = generated?["token"]?.ToString();
        Check(
            plaintext?.Length == 43 && generated?["expires_at"] is not null,
            "Token format and expiry"
        );
        var history = (await Call(HttpMethod.Get, "/api/v1/platform/token/history"))!.AsArray();
        var token = history.Single(x => x?["token_name"]?.ToString() == "admin-check-token-" + projectKey)!;
        var tokenId = token["token_id"]!.ToString();
        Check(
            token["token_hash"] is null
                && token["token"] is null
                && token["token_preview"]!.ToString() == "..." + plaintext![^4..],
            "History never exposes token credentials"
        );
        await Call(
            HttpMethod.Put,
            $"/api/v1/platform/token/{tokenId}/access",
            new { project_keys = new[] { projectKey }, scopes = new[] { "analysis:read" } }
        );
        await Call(
            HttpMethod.Put,
            $"/api/v1/platform/token/{tokenId}/access",
            new { project_keys = new[] { projectKey }, scopes = Array.Empty<string>() },
            HttpStatusCode.UnprocessableEntity
        );
        await Call(HttpMethod.Post, $"/api/v1/platform/token/{tokenId}/revoke");
        var status = await Call(HttpMethod.Get, "/api/v1/platform/token/status");
        Check(status?["configured"] is not null, "Token status contract");
        await Call(
            HttpMethod.Post,
            "/api/v1/platform/token/unknown/revoke",
            expected: HttpStatusCode.NotFound
        );
        var providers = (
            await Call(HttpMethod.Get, "/api/v1/integrations/providers", authenticated: false)
        )!.AsArray();
        Check(
            providers.All(x => x?["config"] is null && x?["connection_url"] is null),
            "Anonymous provider projection is safe"
        );
        await Call(
            HttpMethod.Put,
            "/api/v1/integrations/providers/missing",
            new { connection_url = "https://example.invalid" },
            HttpStatusCode.NotFound
        );
        if (providers.Any(x => x?["provider_id"]?.ToString() == "azure-ad"))
        {
            var configured = await Call(
                HttpMethod.Put,
                "/api/v1/integrations/providers/azure-ad",
                new { config_json = new { client_secret = "synthetic-secret", tenant_id = "", client_id = "", redirect_uri = "" } }
            );
            Check(
                configured?["config"]?["client_secret"] is null
                    && configured?["config"]?["client_secret_configured"]?.GetValue<bool>() == true,
                "Provider secret hidden"
            );
            configured = await Call(
                HttpMethod.Put,
                "/api/v1/integrations/providers/azure-ad",
                new { config_json = new { client_secret = "" } }
            );
            Check(
                configured?["config"]?["client_secret_configured"]?.GetValue<bool>() == true,
                "Blank provider secret preserves stored value"
            );
            await Call(
                HttpMethod.Post,
                "/api/v1/integrations/providers/azure-ad/test",
                expected: HttpStatusCode.BadRequest
            );
            await Call(HttpMethod.Post, "/api/v1/integrations/providers/azure-ad/disable");
        }
        await Call(
            HttpMethod.Put,
            $"/api/v1/integrations/projects/{projectKey}",
            new
            {
                repo_provider = "azure-devops",
                repo_url = "https://example.invalid/repo",
                pipeline_provider = "azure-devops",
                pipeline_url = "https://example.invalid/pipeline",
            }
        );
        var projects = (await Call(HttpMethod.Get, "/api/v1/integrations/projects"))!.AsArray();
        Check(
            projects.Any(x => x?["project_key"]?.ToString() == projectKey),
            "Project integration visible"
        );
        var azureRequest = new
        {
            config_name = "synthetic-admin-check",
            organization_url = "http://127.0.0.1:1",
            personal_access_token = "synthetic-pat",
            quality_gate_enabled = false,
            repo_import_enabled = false,
        };
        var azure = await Call(
            HttpMethod.Post,
            "/api/v1/integrations/azure-devops/configs",
            azureRequest
        );
        var azureId = azure!["config_id"]!.ToString();
        Check(azure["pat"] is null && azure["pat_configured"]!.GetValue<bool>(), "ADO PAT hidden");
        await Call(
            HttpMethod.Post,
            "/api/v1/integrations/azure-devops/configs",
            azureRequest,
            HttpStatusCode.BadRequest
        );
        azure = await Call(
            HttpMethod.Put,
            $"/api/v1/integrations/azure-devops/configs/{azureId}",
            new
            {
                config_name = azureRequest.config_name,
                organization_url = azureRequest.organization_url,
                personal_access_token = "",
            }
        );
        Check(
            azure?["pat_configured"]?.GetValue<bool>() == true,
            "Blank ADO PAT preserves stored value"
        );
        await Call(
            HttpMethod.Post,
            $"/api/v1/integrations/azure-devops/configs/{azureId}/test",
            expected: HttpStatusCode.BadRequest
        );
        await Call(HttpMethod.Delete, $"/api/v1/integrations/azure-devops/configs/{azureId}");
        await Call(
            HttpMethod.Delete,
            $"/api/v1/integrations/azure-devops/configs/{azureId}",
            expected: HttpStatusCode.NotFound
        );
        await Call(
            HttpMethod.Post,
            "/api/v1/notifications/channels",
            new { name = "bad", channel_type = "invalid" },
            HttpStatusCode.UnprocessableEntity
        );
        var channel = await Call(
            HttpMethod.Post,
            "/api/v1/notifications/channels",
            new
            {
                name = " synthetic ",
                channel_type = "email",
                enabled = false,
                on_fail = true,
                config = new { smtp_password = "synthetic-password" },
            }
        );
        var channelId = channel!["id"]!.ToString();
        Check(
            channel["enabled"]?.GetValue<bool>() == false
                && channel["on_fail"]?.GetValue<bool>() == true,
            "Native JSON boolean fields"
        );
        await Call(
            HttpMethod.Put,
            $"/api/v1/notifications/channels/{channelId}",
            new { enabled = 2 },
            HttpStatusCode.BadRequest
        );
        await Call(
            HttpMethod.Put,
            $"/api/v1/notifications/channels/{channelId}",
            new { enabled = "maybe" },
            HttpStatusCode.BadRequest
        );
        Check(
            channel["name"]!.ToString() == "synthetic"
                && channel["config"]?["smtp_password"] is null
                && channel["config"]?["smtp_password_set"]?.GetValue<bool>() == true,
            "Notification config hides secrets and trims name"
        );
        channel = await Call(
            HttpMethod.Put,
            $"/api/v1/notifications/channels/{channelId}",
            new { config = new { smtp_password = "" }, on_pass = true }
        );
        Check(
            channel?["config"]?["smtp_password_set"]?.GetValue<bool>() == true
                && channel?["on_pass"]?.GetValue<bool>() == true,
            "Notification update preserves secret"
        );
        await Call(
            HttpMethod.Post,
            $"/api/v1/notifications/channels/{channelId}/test",
            expected: HttpStatusCode.BadRequest
        );
        await Call(HttpMethod.Delete, $"/api/v1/notifications/channels/{channelId}");
        await Call(
            HttpMethod.Delete,
            $"/api/v1/notifications/channels/{channelId}",
            expected: HttpStatusCode.NotFound
        );
        var logs = await Call(
            HttpMethod.Get,
            "/api/v1/audit-logs?limit=1&offset=0&action=token.generate"
        );
        Check(
            logs?["total"]?.GetValue<int>() >= 1 && logs?["entries"]?.AsArray().Count == 1,
            "Audit filter and pagination"
        );
        await Call(
            HttpMethod.Get,
            "/api/v1/audit-logs?limit=501",
            expected: HttpStatusCode.UnprocessableEntity
        );
        await Call(
            HttpMethod.Get,
            "/api/v1/audit-logs?offset=-1",
            expected: HttpStatusCode.UnprocessableEntity
        );
        await Call(HttpMethod.Get, "/api/v1/audit-logs/actions");
        await Call(HttpMethod.Get, "/api/v1/kev/status");
        await Call(
            HttpMethod.Post,
            "/api/v1/kev/refresh",
            expected: HttpStatusCode.Unauthorized,
            authenticated: false
        );
        await Call(HttpMethod.Post, "/api/v1/platform/cleanup");
        Console.WriteLine(
            "Admin HTTP checks passed (tokens, settings, providers, integrations, notifications, audit, KEV, retention)."
        );
    }

    private static void Check(bool condition, string message)
    {
        if (!condition)
            throw new InvalidOperationException(message);
    }
}


