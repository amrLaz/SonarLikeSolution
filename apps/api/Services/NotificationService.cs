using System.Net;
using System.Net.Mail;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using CodeInsights.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace CodeInsights.Api.Services;

public sealed class NotificationService(
    IServiceScopeFactory scopes,
    IHttpClientFactory clients,
    ILogger<NotificationService> logger
)
{
    /// <summary>Dispatches committed gate events using an independent database scope.</summary>
    public void Dispatch(string qualityGate, Dictionary<string, object?> context)
    {
        // ponytail: delivery runs in process; durable retries require an outbox.
        var snapshot = JsonSerializer.SerializeToNode(context, ApiJson.Options)!.AsObject();
        _ = Task.Run(async () =>
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
                var channels = await db.Set<NotificationChannel>()
                    .Where(x => x.Enabled)
                    .ToListAsync();
                foreach (var channel in channels)
                {
                    if (
                        !(
                            qualityGate == "fail" && channel.OnFail
                            || qualityGate == "pass" && channel.OnPass
                        )
                    )
                        continue;
                    try
                    {
                        await SendAsync(
                            channel.ChannelType,
                            JsonNode.Parse(channel.Config)!.AsObject(),
                            qualityGate,
                            snapshot,
                            CancellationToken.None
                        );
                    }
                    catch (Exception exception)
                    {
                        logger.LogWarning(
                            exception,
                            "Notification channel {ChannelId} failed",
                            channel.Id
                        );
                    }
                }
            }
            catch (Exception exception)
            {
                logger.LogWarning(exception, "Notification dispatch failed");
            }
        });
    }

    public async Task<string> SendTestAsync(
        string channelType,
        JsonObject config,
        CancellationToken ct = default
    )
    {
        var context = new JsonObject
        {
            ["project_key"] = "test-project",
            ["branch"] = "main",
            ["commit_sha"] = "abc12345",
            ["vulnerabilities"] = 3,
            ["bugs"] = 1,
            ["code_smells"] = 12,
            ["gate_failures"] = new JsonArray("Too many vulnerabilities (3 > 0)"),
            ["analysis_id"] = "test-00000000",
        };
        try
        {
            await SendAsync(channelType, config, "fail", context, ct);
            return "ok";
        }
        catch (Exception exception) when (!ct.IsCancellationRequested)
        {
            return exception.Message;
        }
    }

    private async Task SendAsync(
        string type,
        JsonObject config,
        string gate,
        JsonObject context,
        CancellationToken ct
    )
    {
        if (type == "webhook")
        {
            var url = Text(config, "url");
            if (url.Length == 0)
                throw new InvalidOperationException("Webhook URL is empty");
            var isTeams = new[]
            {
                "webhook.office.com",
                "outlook.office.com/webhook",
                "logic.azure.com",
                "flow.microsoft.com",
                "azure.com/workflows",
            }.Any(p => url.Contains(p, StringComparison.OrdinalIgnoreCase));
            var payload = isTeams
                ? BuildTeamsPayload(gate, context)
                : (JsonObject)context.DeepClone();
            if (!isTeams)
            {
                payload["event"] = "quality_gate." + gate;
                payload["quality_gate"] = gate;
            }
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(10));
            using var client = clients.CreateClient("notifications");
            using var request = new HttpRequestMessage(HttpMethod.Post, url)
            {
                Content = new StringContent(
                    payload.ToJsonString(),
                    Encoding.UTF8,
                    "application/json"
                ),
            };
            request.Headers.UserAgent.ParseAdd("SAST-Platform/1.0");
            using var response = await client.SendAsync(request, timeout.Token);
            response.EnsureSuccessStatusCode();
        }
        else if (type == "email")
        {
            var host = Text(config, "smtp_host");
            var recipient = Text(config, "to_email");
            var user = Text(config, "smtp_user");
            var password = Text(config, "smtp_password");
            if (host.Length == 0)
                throw new InvalidOperationException("smtp_host is not configured");
            if (recipient.Length == 0)
                throw new InvalidOperationException("to_email is not configured");
            var port = config["smtp_port"] is null
                ? 587
                : int.Parse(config["smtp_port"]!.ToString());
            var label = gate == "fail" ? "FAILED" : "PASSED";
            var icon = gate == "fail" ? "❌" : "✅";
            using var message = new MailMessage(Text(config, "smtp_from", user), recipient)
            {
                Subject =
                    $"[CodeInsights] Quality Gate {label} {icon} — {Text(context, "project_key")} / {Text(context, "branch")}",
                Body = BuildEmailBody(gate, context),
                IsBodyHtml = true,
                BodyEncoding = Encoding.UTF8,
                SubjectEncoding = Encoding.UTF8,
            };
            using var smtp = new SmtpClient(host, port) { EnableSsl = true, Timeout = 15000 };
            if (user.Length > 0 && password.Length > 0)
                smtp.Credentials = new NetworkCredential(user, password);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(15));
            await smtp.SendMailAsync(message, timeout.Token);
        }
    }

    public static JsonObject BuildTeamsPayload(string gate, JsonObject context)
    {
        var failed = gate == "fail";
        var facts = new JsonArray();
        foreach (
            var (title, key) in new[]
            {
                ("Project", "project_key"),
                ("Branch", "branch"),
                ("Commit", "commit_sha"),
                ("Vulnerabilities", "vulnerabilities"),
                ("Bugs", "bugs"),
                ("Code smells", "code_smells"),
            }
        )
        {
            var value = Text(
                context,
                key,
                key is "vulnerabilities" or "bugs" or "code_smells" ? "0" : ""
            );
            if (key == "commit_sha")
                value = value[..Math.Min(8, value.Length)];
            facts.Add(new JsonObject { ["title"] = title, ["value"] = value });
        }
        var body = new JsonArray(
            new JsonObject
            {
                ["type"] = "TextBlock",
                ["text"] =
                    $"{(failed ? "🔴" : "🟢")} CodeInsights — Quality Gate {(failed ? "FAILED" : "PASSED")}",
                ["size"] = "Large",
                ["weight"] = "Bolder",
                ["color"] = failed ? "Attention" : "Good",
                ["wrap"] = true,
            },
            new JsonObject { ["type"] = "FactSet", ["facts"] = facts }
        );
        if (context["gate_failures"] is JsonArray { Count: > 0 } failures)
            body.Add(
                new JsonObject
                {
                    ["type"] = "TextBlock",
                    ["text"] =
                        "**Gate failures:**\n"
                        + string.Join("\n", failures.Take(8).Select(f => "• " + f)),
                    ["wrap"] = true,
                    ["color"] = "Attention",
                    ["spacing"] = "Medium",
                }
            );
        return new JsonObject
        {
            ["type"] = "message",
            ["attachments"] = new JsonArray(
                new JsonObject
                {
                    ["contentType"] = "application/vnd.microsoft.card.adaptive",
                    ["contentUrl"] = null,
                    ["content"] = new JsonObject
                    {
                        ["$schema"] = "http://adaptivecards.io/schemas/adaptive-card.json",
                        ["type"] = "AdaptiveCard",
                        ["version"] = "1.4",
                        ["body"] = body,
                    },
                }
            ),
        };
    }

    public static string BuildEmailBody(string gate, JsonObject context)
    {
        var builder = new StringBuilder(
            $"<html><body style=\"font-family:Arial,sans-serif;max-width:600px;margin:auto\"><h2 style=\"color:{(gate == "fail" ? "#e74c3c" : "#27ae60")}\">{(gate == "fail" ? "❌ Quality Gate FAILED" : "✅ Quality Gate PASSED")}</h2><table style=\"border-collapse:collapse;width:100%\">"
        );
        foreach (
            var (title, key) in new[]
            {
                ("Project", "project_key"),
                ("Branch", "branch"),
                ("Commit", "commit_sha"),
                ("Vulnerabilities", "vulnerabilities"),
                ("Bugs", "bugs"),
                ("Code smells", "code_smells"),
            }
        )
            builder.Append(
                $"<tr><td style=\"padding:6px;border:1px solid #ddd\"><strong>{title}</strong></td><td style=\"padding:6px;border:1px solid #ddd\">{WebUtility.HtmlEncode(Text(context, key, "0"))}</td></tr>"
            );
        builder.Append("</table>");
        if (context["gate_failures"] is JsonArray { Count: > 0 } failures)
            builder.Append(
                "<p><strong>Failures:</strong></p><ul>"
                    + string.Concat(
                        failures
                            .Take(10)
                            .Select(f => "<li>" + WebUtility.HtmlEncode(f?.ToString()) + "</li>")
                    )
                    + "</ul>"
            );
        return builder
            .Append(
                "<p style=\"color:#666;font-size:12px;margin-top:24px\">Sent by CodeInsights</p></body></html>"
            )
            .ToString();
    }

    private static string Text(JsonObject value, string key, string fallback = "") =>
        value[key]?.ToString() ?? fallback;
}
