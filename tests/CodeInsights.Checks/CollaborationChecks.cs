using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using CodeInsights.Api;
using CodeInsights.Api.Auth;
using CodeInsights.Api.Data;
using CodeInsights.Api.Services;
using Microsoft.EntityFrameworkCore;
using Npgsql;

internal static class CollaborationChecks
{
    public static async Task RunAsync()
    {
        var sample = new FindingOccurrence { Tool = "scanner", RuleId = "R1", Fingerprint = "stable", Path = "before.cs", Line = 4, Message = "problem" };
        var identity = FindingCollaboration.Identity("project", "main", sample);
        sample.Path = "after.cs"; sample.Line = 20;
        Check(identity == FindingCollaboration.Identity("project", "main", sample), "fingerprint survives line shift and rename");
        Check(identity != FindingCollaboration.Identity("other", "main", sample) && identity != FindingCollaboration.Identity("project", "feature", sample), "identity is scoped to project and branch");
        Check(identity != FindingCollaboration.Identity("project", "main", sample, false), "ambiguous fingerprint uses conservative location");
        sample.Fingerprint = null; var exact = FindingCollaboration.Identity("project", "main", sample); sample.Line++;
        Check(exact != FindingCollaboration.Identity("project", "main", sample), "missing fingerprint does not invent a match after movement");
        Check(FindingCollaboration.EffectiveState(new DurableFinding { State = "accepted_risk", ExceptionExpiresAt = DateTime.UtcNow.AddSeconds(-1) }, DateTime.UtcNow) == "open", "expiry is effective without waiting for maintenance");
        var connection = Environment.GetEnvironmentVariable("CODEINSIGHTS_TEST_DB");
        if (string.IsNullOrEmpty(connection)) { Console.WriteLine("Collaboration PostgreSQL/HTTP checks skipped: isolated test database required."); return; }
        var info = new NpgsqlConnectionStringBuilder(connection);
        Check(info.Host is "localhost" or "127.0.0.1" && info.Database is "codeinsights_checks" or "codeinsights_test" or "codeinsights_p1", "isolated local PostgreSQL required");
        await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connection).Options);
        var project = "p2-" + Guid.NewGuid().ToString("N");
        var member = new PlatformUser { UserId = Guid.NewGuid().ToString(), Email = project + "@checks.local", FullName = "P2 member", HashedPassword = AuthService.HashPassword("P2-isolated-member-123") };
        var outsider = new PlatformUser { UserId = Guid.NewGuid().ToString(), Email = project + "-other@checks.local", FullName = "P2 outsider", HashedPassword = member.HashedPassword };
        var team = new CollaborationTeam { ProjectKey = project, Name = "Quality", OwnerUserId = member.UserId };
        db.AddRange(new Project { Id = Guid.NewGuid().ToString(), Key = project, Name = project }, member, outsider, team,
            new UserGrant { Id = Guid.NewGuid().ToString(), UserId = member.UserId, ScopeType = "project", ScopeId = project },
            new ProjectOwnership { ProjectKey = project, OwnerUserId = member.UserId, TeamId = team.Id });
        await db.SaveChangesAsync();
        var first = await Observe("first", DateTime.UtcNow.AddMinutes(-5));
        var findingId = first.FindingId!;
        Check((await db.Set<DurableFinding>().SingleAsync(x => x.Id == findingId)).AssigneeUserId == member.UserId, "project ownership initializes assignment");
        var row = await db.Set<DurableFinding>().SingleAsync(x => x.Id == findingId);
        row.State = "resolved"; await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        var second = await Observe("second", DateTime.UtcNow);
        Check(second.FindingId == findingId, "next scan keeps identity");
        row = await db.Set<DurableFinding>().SingleAsync(x => x.Id == findingId);
        Check(row.State == "open" && row.AssigneeUserId == member.UserId && row.TeamId == team.Id, "reopening retains assignment");
        Check(await db.Set<FindingDecision>().CountAsync(x => x.FindingId == findingId && x.Action == "reopened_by_scan") == 1, "reopening is audited once");
        row.State = "accepted_risk"; row.ExceptionExpiresAt = DateTime.UtcNow.AddSeconds(-1); await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        await FindingCollaboration.ExpireAsync(db, default); db.ChangeTracker.Clear();
        await FindingCollaboration.ExpireAsync(db, default);
        Check(await db.Set<FindingDecision>().CountAsync(x => x.FindingId == findingId && x.Action == "exception_expired") == 1, "expiration records one decision across retries");
        if (Environment.GetEnvironmentVariable("CODEINSIGHTS_TEST_URL") is { Length: > 0 } url)
        {
            Check(Uri.TryCreate(url, UriKind.Absolute, out var endpoint) && endpoint.IsLoopback, "test API is loopback");
            using var client = new HttpClient { BaseAddress = endpoint };
            var token = (await Call("POST", "/api/v1/auth/login", new { email = member.Email, password = "P2-isolated-member-123" })).GetProperty("token").GetString()!;
            var otherToken = (await Call("POST", "/api/v1/auth/login", new { email = outsider.Email, password = "P2-isolated-member-123" })).GetProperty("token").GetString()!;
            var resource = "/api/v1/collaboration/findings/" + findingId;
            Check((await Call("GET", $"/api/v1/collaboration/projects/{project}/boards", token: token)).ValueKind == JsonValueKind.Null, "missing Boards configuration returns JSON null for onboarding");
            await Call("GET", resource, token: otherToken, status: 403);
            await Call("GET", resource, status: 401);
            var state = await Call("GET", resource, token: token);
            var version = state.GetProperty("version").GetInt32();
            await Call("POST", resource + "/comments", new { version, reason = (string?)null }, token, 422);
            await Call("POST", resource + "/comments", new { version, reason = new string('x', 4001) }, token, 422);
            await Call("PUT", resource, new { version, state = "false_positive", hotspot_review = "not_reviewed", reason = "review", expires_at = DateTime.UtcNow.AddDays(1) }, token, 403);
            await Call("PUT", resource, new { version, state = "confirmed", hotspot_review = "safe", reason = "not a hotspot" }, token, 422);
            await Call("PUT", resource, new { version, state = "confirmed", hotspot_review = "not_reviewed", assignee_user_id = outsider.UserId, reason = "invalid assignee" }, token, 422);
            var subscription = new { project_key = project, scope = "finding", scope_id = findingId };
            await Call("POST", "/api/v1/collaboration/subscriptions", subscription, token, 200);
            await Call("POST", "/api/v1/collaboration/subscriptions", subscription, token, 200);
            var update = new { version, state = "confirmed", hotspot_review = "not_reviewed", assignee_user_id = member.UserId, team_id = team.Id, reason = "Confirmed after review" };
            state = await Call("PUT", resource, update, token);
            await Call("PUT", resource, update, token, 409);
            await Call("POST", resource + "/comments", new { version = state.GetProperty("version").GetInt32(), reason = "Follow-up" }, token);
            var assigned = await Call("GET", $"/api/v1/collaboration/findings?project_key={project}&mine=true&team_id={team.Id}&state=confirmed", token: token);
            Check(assigned.GetArrayLength() == 1, "mine/team/state filters run on server");
            var page = await Call("GET", $"/api/v1/insights/analyses/{second.AnalysisId}/findings?mine=true&state=confirmed", token: token);
            Check(page.GetArrayLength() == 1 && page[0].GetProperty("finding_id").GetString() == findingId, "analysis findings join durable assignment");
            await Call("GET", $"/api/v1/collaboration/findings?project_key={project}", token: otherToken, status: 403);
            await Call("GET", $"/api/v1/portfolio/history?project_key={project}", token: otherToken, status: 403);
            var portfolio = await Call("GET", $"/api/v1/portfolio/history?project_key={project}&team_id={team.Id}&limit=1", token: token);
            Check(portfolio.GetProperty("items").GetArrayLength() == 1, "portfolio SQL translates with ownership filter");
            var createdAt = await db.Set<AnalysisRecord>().Where(x => x.AnalysisId == second.AnalysisId).Select(x => x.CreatedAt).SingleAsync();
            var instant = Uri.EscapeDataString(createdAt);
            var exactPeriod = await Call("GET", $"/api/v1/portfolio/history?project_key={project}&from={instant}&to={instant}", token: token);
            Check(exactPeriod.GetProperty("items").GetArrayLength() == 1, "inclusive period compares instants, including seven-digit UTC timestamps");
            Check(await db.Set<FindingNotification>().CountAsync(x => x.FindingId == findingId) == 2, "targeted inbox has one item per significant decision, no subscription or stale-write duplicates");
            await db.Set<FindingOccurrence>().Where(x => x.AnalysisId == second.AnalysisId || x.AnalysisId == first.AnalysisId).ExecuteDeleteAsync();
            await db.Set<AnalysisRecord>().Where(x => x.ProjectKey == project).ExecuteUpdateAsync(x => x.SetProperty(a => a.DetailsPurged, true).SetProperty(a => a.AffectedFiles, "{}"));
            await Call("GET", resource, token: token);
            var decisions = await Call("GET", resource + "/decisions", token: token);
            Check(decisions.GetArrayLength() >= 4, "decisions survive detail purge");
            await Call("GET", $"/api/v1/insights/analyses/{second.AnalysisId}/findings", token: token, status: 410);

            async Task<JsonElement> Call(string method, string path, object? body = null, string? token = null, int status = 200)
            {
                using var request = new HttpRequestMessage(new HttpMethod(method), path);
                if (token != null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
                if (body != null) request.Content = JsonContent.Create(body, options: ApiJson.Options);
                using var response = await client.SendAsync(request);
                var text = await response.Content.ReadAsStringAsync();
                Check((int)response.StatusCode == status, $"{method} {path}: expected {status}, got {(int)response.StatusCode}: {text}");
                return text.Length == 0 ? default : JsonSerializer.Deserialize<JsonElement>(text);
            }
        }
        db.ChangeTracker.Clear();
        row = await db.Set<DurableFinding>().SingleAsync(x => x.Id == findingId);
        row.State = "accepted_risk"; row.ExceptionReason = "Previous evidence"; row.ExceptionExpiresAt = DateTime.UtcNow.AddDays(1);
        await db.SaveChangesAsync(); db.ChangeTracker.Clear();
        var changed = await Observe("changed", DateTime.UtcNow.AddSeconds(1), "different evidence");
        row = await db.Set<DurableFinding>().SingleAsync(x => x.Id == findingId);
        Check(row.State == "open" && row.ExceptionExpiresAt == null, "changed evidence invalidates an earlier exception");
        var evidence = await db.Set<FindingDecision>().SingleAsync(x => x.FindingId == findingId && x.Action == "evidence_changed");
        Check(JsonSerializer.Deserialize<JsonElement>(evidence.Snapshot).GetProperty("last_analysis_id").GetString() == changed.AnalysisId, "evidence audit references the current scan");
        Console.WriteLine("Collaboration identity, persistence, authorization and lifecycle checks passed.");

        async Task<FindingOccurrence> Observe(string suffix, DateTime at, string message = "problem")
        {
            var analysis = new AnalysisRecord { AnalysisId = Guid.NewGuid().ToString(), ProjectKey = project, Branch = "main", CommitSha = suffix + "abcdef", CreatedAt = ApiJson.Iso(at), Status = "completed" };
            var occurrence = new FindingOccurrence { AnalysisId = analysis.AnalysisId, Tool = "scanner", RuleId = "R1", Fingerprint = "stable", Path = suffix + ".cs", Line = 10, Message = message, Category = "bug" };
            await using var tx = await db.Database.BeginTransactionAsync();
            db.Add(analysis); db.Add(occurrence);
            await FindingCollaboration.ObserveAsync(db, analysis, [occurrence], default);
            await db.SaveChangesAsync(); await tx.CommitAsync(); db.ChangeTracker.Clear();
            return occurrence;
        }
    }

    private static void Check(bool value, string message)
    {
        if (!value) throw new InvalidOperationException("Collaboration: " + message);
    }
}
