using System.Text.Json;
using CodeInsights.Api.Auth;
using CodeInsights.Api.Data;
using CodeInsights.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace CodeInsights.Api.Endpoints;

public static class SecurityReviewEndpoints
{
    public static IEndpointRouteBuilder MapSecurityReviewEndpoints(this IEndpointRouteBuilder app)
    {
        var routes = app.MapGroup("/api/v1/collaboration").RequireAuthorization();
        routes.MapGet("/findings/{id}/matches", async (string id, HttpContext context, AuthService auth, AppDbContext db, CancellationToken ct) =>
        {
            var actor = await auth.RequireAsync(context, "user", ct);
            var finding = await db.Set<DurableFinding>().AsNoTracking().SingleOrDefaultAsync(f => f.Id == id, ct) ?? throw new ApiException(404, "Finding not found");
            await auth.AssertProjectAccessAsync(actor, finding.ProjectKey, ct: ct);
            var cursor = InsightEndpoints.DecodeCursor(context.Request, 1)?[0]; var size = InsightEndpoints.PageSize(context.Request);
            var rows = await db.Set<FindingIdentityMatch>().AsNoTracking().Where(m => m.FindingId == id && (cursor == null || string.Compare(m.Id, cursor) > 0))
                .OrderBy(m => m.Id).Take(size + 1).Select(m => new { m.Id, m.AnalysisId, m.IngestionId, m.Branch, m.Method, m.BaseSha, m.HeadSha, m.OldPath, m.OldLine, m.Path, m.Line, m.CreatedAt }).ToListAsync(ct);
            if (rows.Count > size) { rows.RemoveAt(size); InsightEndpoints.Continuation(context, InsightEndpoints.EncodeCursor(rows[^1].Id)); }
            return Results.Ok(rows);
        });
        routes.MapGet("/hotspots", async (HttpContext context, AuthService auth, AppDbContext db, CancellationToken ct) =>
        {
            var actor = await auth.RequireAsync(context, "user", ct);
            var project = context.Request.Query["project_key"].ToString(); var branch = context.Request.Query["branch"].ToString();
            if (string.IsNullOrWhiteSpace(project) || string.IsNullOrWhiteSpace(branch)) throw new ApiException(422, "project_key and branch are required");
            await auth.AssertProjectAccessAsync(actor, project, ct: ct);
            var analysis = await db.Set<AnalysisRecord>().AsNoTracking().Where(a => a.ProjectKey == project && a.Branch == branch && a.Status == "completed")
                .OrderByDescending(a => a.CreatedAt).ThenByDescending(a => a.AnalysisId).Select(a => new { a.AnalysisId, a.CommitSha, a.GateSnapshot }).FirstOrDefaultAsync(ct);
            var now = DateTime.UtcNow;
            var analysisId = analysis?.AnalysisId;
            var query = db.Set<DurableFinding>().AsNoTracking().Where(f => f.ProjectKey == project && f.Branch == branch && f.Category == "security_hotspot"
                && analysisId != null && f.LastAnalysisId == analysisId && (f.HotspotReview == "not_reviewed"
                || (f.State == "false_positive" || f.State == "accepted_risk") && f.ExceptionExpiresAt <= now));
            var cursor = InsightEndpoints.DecodeCursor(context.Request, 1)?[0]; var size = InsightEndpoints.PageSize(context.Request);
            var items = await query.Where(f => cursor == null || string.Compare(f.Id, cursor) > 0).OrderBy(f => f.Id).Take(size + 1).Select(f => new
            {
                f.Id, f.Tool, f.RuleId, f.Message, f.Path, f.Line, f.Version, f.State, f.HotspotReview, f.AssigneeUserId, f.TeamId,
                priority = db.Set<FindingOccurrence>().Where(o => o.FindingId == f.Id && o.AnalysisId == f.LastAnalysisId).OrderByDescending(o => o.Id).Select(o => o.Severity).FirstOrDefault()
            }).ToListAsync(ct);
            if (items.Count > size) { items.RemoveAt(size); InsightEndpoints.Continuation(context, InsightEndpoints.EncodeCursor(items[^1].Id)); }
            using var snapshot = JsonDocument.Parse(analysis?.GateSnapshot ?? "{}");
            return Results.Ok(new { project_key = project, branch, analysis_id = analysis?.AnalysisId, commit_sha = analysis?.CommitSha,
                review = snapshot.RootElement.TryGetProperty("security_review", out var review) ? review.Clone() : (JsonElement?)null, items });
        });
        return app;
    }
}
