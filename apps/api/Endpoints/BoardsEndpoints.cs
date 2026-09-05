using CodeInsights.Api.Auth;
using CodeInsights.Api.Data;
using CodeInsights.Api.Services;
using Microsoft.EntityFrameworkCore;
using System.ComponentModel.DataAnnotations;
using System.Text.Json;

namespace CodeInsights.Api.Endpoints;

public static class BoardsEndpoints
{
    public sealed record BoardsConfigRequest([property: Required, MaxLength(100)] string OrganizationConfigId,
        [property: Required, MaxLength(200)] string AdoProject, [property: Required, MaxLength(100)] string WorkItemType, bool Enabled);
    public sealed record SubscriptionRequest([property: Required, MaxLength(20)] string Scope,
        [property: Required, MaxLength(100)] string ScopeId, [property: Required, MaxLength(100)] string ProjectKey);

    public static IEndpointRouteBuilder MapBoardsEndpoints(this IEndpointRouteBuilder app)
    {
        var routes = app.MapGroup("/api/v1/collaboration").RequireAuthorization();
        routes.MapGet("/projects/{projectKey}/boards", async (string projectKey, HttpContext context, AuthService auth, AppDbContext db, CancellationToken ct) =>
        {
            await HumanAsync(context, auth, projectKey, ct);
            var row = await db.Set<BoardsProjectConfig>().FindAsync([projectKey], ct);
            return Results.Json(JsonSerializer.SerializeToElement(row is null ? null : new { row.ProjectKey, row.OrganizationConfigId, row.AdoProject, row.WorkItemType, row.Enabled }, ApiJson.Options));
        });
        routes.MapPut("/projects/{projectKey}/boards", async (string projectKey, HttpContext context, AuthService auth, AppDbContext db, CancellationToken ct) =>
        {
            var actor = await auth.RequireAsync(context, "admin", ct);
            await auth.AssertProjectAccessAsync(actor, projectKey, ct: ct);
            var request = await ApiJson.ReadAsync<BoardsConfigRequest>(context, ct);
            if (string.IsNullOrWhiteSpace(request.AdoProject) || request.AdoProject.Length > 200 || string.IsNullOrWhiteSpace(request.WorkItemType) || request.WorkItemType.Length > 100)
                throw new ApiException(422, "Azure Boards project and work item type are required and bounded");
            var org = await db.Set<AzureDevOpsOrganizationConfig>().FindAsync([request.OrganizationConfigId], ct) ?? throw new ApiException(422, "Organization integration not found");
            await BoardsDelivery.ValidateTargetAsync(db, projectKey, org.OrganizationUrl, request.AdoProject, ct);
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await IngestionEndpoints.LockAsync(db, "boards-config:" + projectKey, ct);
            var row = await db.Set<BoardsProjectConfig>().FindAsync([projectKey], ct);
            if (row is null) { row = new() { ProjectKey = projectKey }; db.Add(row); }
            row.OrganizationConfigId = request.OrganizationConfigId; row.AdoProject = request.AdoProject; row.WorkItemType = request.WorkItemType; row.Enabled = request.Enabled;
            db.Add(new AuditLog { Id = Guid.NewGuid().ToString(), ActorEmail = actor.Email, ActorRole = actor.Role, Action = "boards.configure", ResourceType = "project", ResourceId = projectKey });
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            return Results.NoContent();
        });
        routes.MapGet("/findings/{id}/boards", async (string id, HttpContext context, AuthService auth, AppDbContext db, CancellationToken ct) =>
        {
            var finding = await FindingAsync(id, context, auth, db, ct);
            var row = await db.Set<FindingWorkItem>().FindAsync([id], ct);
            return Results.Ok(new
            {
                link = row is null ? null : new { row.WorkItemId, row.State, row.Error, row.LastDecisionId, row.SyncedVersion, row.UpdatedAt,
                    url = row.WorkItemId is null ? null : $"{row.OrganizationUrl.TrimEnd('/')}/{Uri.EscapeDataString(row.AdoProject)}/_workitems/edit/{row.WorkItemId}" },
                events = await db.Set<BoardsSyncEvent>().Where(x => x.FindingId == finding.Id).OrderByDescending(x => x.CompletedAt).ThenBy(x => x.DecisionId).Take(100)
                    .Select(x => new { x.DecisionId, x.State, x.Error, x.CompletedAt }).ToListAsync(ct)
            });
        });
        routes.MapPost("/findings/{id}/boards", async (string id, HttpContext context, AuthService auth, AppDbContext db, CancellationToken ct) =>
        {
            var finding = await FindingAsync(id, context, auth, db, ct);
            var actor = await auth.RequireAsync(context, "user", ct);
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await IngestionEndpoints.LockAsync(db, "boards-link:" + id, ct);
            if (await db.Set<FindingWorkItem>().AnyAsync(x => x.FindingId == id, ct)) return Results.Ok(new { finding_id = id, state = "already_requested" });
            var config = await db.Set<BoardsProjectConfig>().FindAsync([finding.ProjectKey], ct);
            if (config?.Enabled != true) throw new ApiException(409, "Azure Boards is not enabled for this project");
            var org = await db.Set<AzureDevOpsOrganizationConfig>().FindAsync([config.OrganizationConfigId], ct) ?? throw new ApiException(409, "Organization integration unavailable");
            await BoardsDelivery.ValidateTargetAsync(db, finding.ProjectKey, org.OrganizationUrl, config.AdoProject, ct);
            db.Add(new FindingWorkItem { FindingId = id, ProjectKey = finding.ProjectKey, OrganizationConfigId = org.ConfigId, OrganizationUrl = org.OrganizationUrl,
                AdoProject = config.AdoProject, WorkItemType = config.WorkItemType });
            var decision = new FindingDecision { Id = Guid.NewGuid().ToString(), FindingId = id, ProjectKey = finding.ProjectKey, ActorUserId = actor.Sub,
                ActorEmail = actor.Email, Action = "boards_requested", Reason = "Azure Boards work item requested", Snapshot = "{}" };
            db.Add(decision);
            db.Add(new BoardsSyncEvent { DecisionId = decision.Id, FindingId = id });
            db.Add(new DurableJob { Kind = "boards", ResourceId = decision.Id });
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            return Results.Accepted($"/api/v1/collaboration/findings/{id}/boards", new { finding_id = id, decision_id = decision.Id });
        });
        routes.MapPost("/findings/{id}/boards/reconcile", async (string id, HttpContext context, AuthService auth, AppDbContext db, CancellationToken ct) =>
        {
            var finding = await FindingAsync(id, context, auth, db, ct);
            var actor = await auth.RequireAsync(context, "user", ct);
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await IngestionEndpoints.LockAsync(db, "boards-link:" + id, ct);
            if (!await db.Set<FindingWorkItem>().AnyAsync(x => x.FindingId == id, ct)) throw new ApiException(409, "Request a Boards link first");
            var decision = new FindingDecision { Id = Guid.NewGuid().ToString(), FindingId = id, ProjectKey = finding.ProjectKey, ActorUserId = actor.Sub,
                ActorEmail = actor.Email, Action = "boards_reconcile", Reason = "Reconcile existing work item by durable marker", Snapshot = "{}" };
            db.Add(decision);
            db.Add(new BoardsSyncEvent { DecisionId = decision.Id, FindingId = id });
            db.Add(new DurableJob { Kind = "boards", ResourceId = decision.Id });
            await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
            return Results.Accepted($"/api/v1/collaboration/findings/{id}/boards", new { decision_id = decision.Id });
        });
        routes.MapGet("/subscriptions", async (HttpContext context, AuthService auth, AppDbContext db, CancellationToken ct) =>
        {
            var user = await auth.RequireAsync(context, "user", ct); var keys = await auth.AllowedProjectKeysAsync(user, ct: ct);
            return Results.Ok(await db.Set<FindingSubscription>().Where(x => x.UserId == user.Sub && keys.Contains(x.ProjectKey)).OrderBy(x => x.Id).Take(500)
                .Select(x => new { x.Id, x.ProjectKey, x.Scope, x.ScopeId }).ToListAsync(ct));
        });
        routes.MapPost("/subscriptions", async (HttpContext context, AuthService auth, AppDbContext db, CancellationToken ct) =>
        {
            var request = await ApiJson.ReadAsync<SubscriptionRequest>(context, ct);
            var user = await HumanAsync(context, auth, request.ProjectKey, ct);
            var valid = request.Scope switch
            {
                "project" => request.ScopeId == request.ProjectKey,
                "finding" => await db.Set<DurableFinding>().AnyAsync(x => x.Id == request.ScopeId && x.ProjectKey == request.ProjectKey, ct),
                "team" => await db.Set<CollaborationTeam>().AnyAsync(x => x.Id == request.ScopeId && x.ProjectKey == request.ProjectKey, ct),
                _ => false
            };
            if (!valid) throw new ApiException(422, "Subscription scope does not belong to this project");
            var id = AuthService.Sha256($"{user.Sub}\n{request.Scope}\n{request.ScopeId}");
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await IngestionEndpoints.LockAsync(db, "subscriptions:" + user.Sub, ct);
            if (!await db.Set<FindingSubscription>().AnyAsync(x => x.Id == id, ct))
            {
                if (await db.Set<FindingSubscription>().CountAsync(x => x.UserId == user.Sub, ct) >= 500) throw new ApiException(422, "Maximum 500 subscriptions per user");
                db.Add(new FindingSubscription { Id = id, UserId = user.Sub, ProjectKey = request.ProjectKey, Scope = request.Scope, ScopeId = request.ScopeId });
                await db.SaveChangesAsync(ct);
            }
            await tx.CommitAsync(ct); return Results.Ok(new { id });
        });
        routes.MapDelete("/subscriptions/{id}", async (string id, HttpContext context, AuthService auth, AppDbContext db, CancellationToken ct) =>
        {
            var user = await auth.RequireAsync(context, "user", ct);
            await db.Set<FindingSubscription>().Where(x => x.Id == id && x.UserId == user.Sub).ExecuteDeleteAsync(ct);
            return Results.NoContent();
        });
        routes.MapGet("/notifications", async (HttpContext context, AuthService auth, AppDbContext db, CancellationToken ct) =>
        {
            var user = await auth.RequireAsync(context, "user", ct); var keys = await auth.AllowedProjectKeysAsync(user, ct: ct);
            var size = InsightEndpoints.PageSize(context.Request); var cursor = InsightEndpoints.DecodeCursor(context.Request, 2);
            var query = db.Set<FindingNotification>().AsNoTracking().Where(x => x.UserId == user.Sub && keys.Contains(x.ProjectKey));
            if (cursor is not null)
            {
                if (!DateTime.TryParse(cursor[0], null, System.Globalization.DateTimeStyles.RoundtripKind, out var date)) throw new ApiException(422, "Invalid cursor");
                var id = cursor[1]; query = query.Where(x => x.CreatedAt < date || x.CreatedAt == date && string.Compare(x.Id, id) < 0);
            }
            var rows = await query.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).Take(size + 1)
                .Select(x => new { x.Id, x.ProjectKey, x.FindingId, x.DecisionId, x.Action, x.CreatedAt, x.ReadAt }).ToListAsync(ct);
            if (rows.Count > size) { rows.RemoveAt(size); InsightEndpoints.Continuation(context, InsightEndpoints.EncodeCursor(rows[^1].CreatedAt.ToString("O"), rows[^1].Id)); }
            return Results.Ok(rows);
        });
        routes.MapPut("/notifications/{id}/read", async (string id, HttpContext context, AuthService auth, AppDbContext db, CancellationToken ct) =>
        {
            var user = await auth.RequireAsync(context, "user", ct); var keys = await auth.AllowedProjectKeysAsync(user, ct: ct);
            await db.Set<FindingNotification>().Where(x => x.Id == id && x.UserId == user.Sub && keys.Contains(x.ProjectKey) && x.ReadAt == null)
                .ExecuteUpdateAsync(s => s.SetProperty(x => x.ReadAt, DateTime.UtcNow), ct);
            return Results.NoContent();
        });
        return app;
    }

    private static async Task<Principal> HumanAsync(HttpContext context, AuthService auth, string projectKey, CancellationToken ct)
    {
        var user = await auth.RequireAsync(context, "user", ct);
        await auth.AssertProjectAccessAsync(user, projectKey, ct: ct); return user;
    }

    private static async Task<DurableFinding> FindingAsync(string id, HttpContext context, AuthService auth, AppDbContext db, CancellationToken ct)
    {
        var row = await db.Set<DurableFinding>().FindAsync([id], ct) ?? throw new ApiException(404, "Finding not found");
        await HumanAsync(context, auth, row.ProjectKey, ct); return row;
    }
}
