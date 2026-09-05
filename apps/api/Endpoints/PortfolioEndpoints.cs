using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;
using CodeInsights.Api.Auth;
using CodeInsights.Api.Data;
using CodeInsights.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace CodeInsights.Api.Endpoints;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public sealed record PortfolioObjectiveRequest(string ProjectKey, string Branch, string Dimension, int Target,
    string ProfileId, string ProfileVersion, string FormulaVersion, DateTimeOffset DueAt);

/// <summary>Authorized, paginated portfolio history with reproducible measure versions.</summary>
public static class PortfolioEndpoints
{
    public static IEndpointRouteBuilder MapPortfolioEndpoints(this IEndpointRouteBuilder app)
    {
        var routes = app.MapGroup("/api/v1/portfolio").RequireAuthorization();
        routes.MapGet("/history", HistoryAsync);
        routes.MapGet("/export", async (HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct) =>
        {
            var page = await ReadAsync(context, db, auth, ct);
            return Results.File(JsonSerializer.SerializeToUtf8Bytes(page, ApiJson.Options), "application/json", "codeinsights-portfolio.json");
        });
        routes.MapPut("/objectives", async (PortfolioObjectiveRequest request, HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct) =>
        {
            var user = await auth.RequireAsync(context, "admin", ct);
            await auth.AssertProjectAccessAsync(user, request.ProjectKey, ct: ct);
            if (string.IsNullOrWhiteSpace(request.Branch) || request.Branch.Length > 500 || !PortfolioTrends.Dimensions.Contains(request.Dimension)
                || request.Target < 0 || (PortfolioTrends.HigherIsBetter(request.Dimension) || request.Dimension == "duplication") && request.Target > 100
                || string.IsNullOrWhiteSpace(request.ProfileId) || string.IsNullOrWhiteSpace(request.ProfileVersion) || string.IsNullOrWhiteSpace(request.FormulaVersion)
                || request.ProfileId.Length > 100 || request.ProfileVersion.Length > 50 || request.FormulaVersion.Length > 50 || request.DueAt == default)
                throw new ApiException(422, "A valid branch, measured dimension, target, versions and due date are required");
            await using var transaction = await db.Database.BeginTransactionAsync(ct);
            await FindingCollaboration.LockAsync(db, request.ProjectKey, "portfolio-objective:" + JsonSerializer.Serialize(new[] { request.Branch, request.Dimension }), ct);
            var objective = await db.Set<PortfolioObjective>().FirstOrDefaultAsync(x => x.ProjectKey == request.ProjectKey && x.Branch == request.Branch && x.Dimension == request.Dimension, ct);
            if (objective == null) { objective = new PortfolioObjective { ProjectKey = request.ProjectKey, Branch = request.Branch, Dimension = request.Dimension }; db.Add(objective); }
            objective.Target = request.Target; objective.ProfileId = request.ProfileId; objective.ProfileVersion = request.ProfileVersion;
            objective.FormulaVersion = request.FormulaVersion; objective.DueAt = request.DueAt.UtcDateTime;
            db.Add(new AuditLog { Id = Guid.NewGuid().ToString(), ActorEmail = user.Email, ActorRole = user.Role,
                Action = "portfolio.objective.updated", ResourceType = "project", ResourceId = request.ProjectKey,
                Details = JsonSerializer.Serialize(request, ApiJson.Options) });
            await db.SaveChangesAsync(ct);
            await transaction.CommitAsync(ct);
            return Results.Ok(new { objective.Id, objective.ProjectKey, objective.Branch, objective.Dimension, objective.Target,
                objective.ProfileId, objective.ProfileVersion, objective.FormulaVersion, objective.DueAt });
        });
        return app;
    }

    private static async Task<IResult> HistoryAsync(HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct)
        => Results.Ok(await ReadAsync(context, db, auth, ct));

    private static async Task<object> ReadAsync(HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct)
    {
        var user = await auth.RequireAsync(context, ct: ct);
        auth.AssertCiPermission(user);
        var allowed = await auth.AllowedProjectKeysAsync(user, ct: ct);
        var request = context.Request;
        var project = request.Query["project_key"].ToString();
        if (project.Length > 0) await auth.AssertProjectAccessAsync(user, project, ct: ct);
        var branch = request.Query["branch"].ToString(); var organization = request.Query["organization_id"].ToString();
        var team = request.Query["team_id"].ToString(); var commit = request.Query["commit"].ToString();
        if (commit.Length > 128 || project.Length > 100 || branch.Length > 500 || organization.Length > 100 || team.Length > 100)
            throw new ApiException(422, "Portfolio filter is too long");
        var all = db.Set<AnalysisRecord>().AsNoTracking().Where(x => allowed.Contains(x.ProjectKey));
        var query = all;
        if (project.Length > 0) query = query.Where(x => x.ProjectKey == project);
        if (branch.Length > 0) query = query.Where(x => x.Branch == branch);
        if (organization.Length > 0) query = query.Where(x => db.Set<Project>().Any(p => p.Key == x.ProjectKey && p.OrganizationId == organization));
        if (team.Length > 0) query = query.Where(x => db.Set<ProjectOwnership>().Any(p => p.ProjectKey == x.ProjectKey && p.TeamId == team));
        if (commit.Length > 0) query = query.Where(x => x.CommitSha.StartsWith(commit));
        var from = ParseDate(request.Query["from"].ToString()); var to = ParseDate(request.Query["to"].ToString());
        if (from > to) throw new ApiException(422, "from must precede to");
        if (from != null || to != null)
        {
            // P0 and P1 use different ISO precision/suffixes; compare instants rather than their text.
            var fromText = from?.ToString("O", CultureInfo.InvariantCulture); var toText = to?.ToString("O", CultureInfo.InvariantCulture);
            var datedIds = db.Set<AnalysisRecord>().FromSqlInterpolated($"SELECT * FROM analysis_records WHERE ({fromText}::timestamptz IS NULL OR NULLIF(created_at, '')::timestamptz >= {fromText}::timestamptz) AND ({toText}::timestamptz IS NULL OR NULLIF(created_at, '')::timestamptz <= {toText}::timestamptz)").Select(x => x.AnalysisId);
            query = query.Where(x => datedIds.Contains(x.AnalysisId));
        }
        var latest = request.Query["latest"].ToString();
        if (latest.Length > 0 && latest is not ("true" or "false")) throw new ApiException(422, "latest must be true or false");
        if (latest == "true")
        {
            var scope = query;
            query = query.Where(x => !scope.Any(y => y.ProjectKey == x.ProjectKey && y.Branch == x.Branch &&
                (string.Compare(y.CreatedAt, x.CreatedAt) > 0 || y.CreatedAt == x.CreatedAt && string.Compare(y.AnalysisId, x.AnalysisId) > 0)));
        }
        var cursor = InsightEndpoints.DecodeCursor(request, 2); var size = InsightEndpoints.PageSize(request);
        if (cursor != null) { var date = cursor[0]; var id = cursor[1]; query = query.Where(x => string.Compare(x.CreatedAt, date) < 0 || x.CreatedAt == date && string.Compare(x.AnalysisId, id) < 0); }
        var rows = await query.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.AnalysisId)
            .Select(InsightEndpoints.Summary).Take(size + 1).ToListAsync(ct);
        string? next = null;
        if (rows.Count > size) { rows.RemoveAt(size); next = InsightEndpoints.EncodeCursor(rows[^1].CreatedAt, rows[^1].AnalysisId); InsightEndpoints.Continuation(context, next); }
        var ids = rows.Select(x => x.AnalysisId).ToArray();
        var predecessors = await all.Where(x => ids.Contains(x.AnalysisId)).Select(x => new
        {
            x.AnalysisId, x.DetailsPurged,
            PreviousId = all.Where(y => y.ProjectKey == x.ProjectKey && y.Branch == x.Branch &&
                (string.Compare(y.CreatedAt, x.CreatedAt) < 0 || y.CreatedAt == x.CreatedAt && string.Compare(y.AnalysisId, x.AnalysisId) < 0))
                .OrderByDescending(y => y.CreatedAt).ThenByDescending(y => y.AnalysisId).Select(y => y.AnalysisId).FirstOrDefault(),
            IngestionPurged = db.Set<IngestionRecord>().Where(i => i.AnalysisId == x.AnalysisId && i.CompletedAt != null)
                .OrderByDescending(i => i.Revision).Select(i => (bool?)i.DetailsPurged).FirstOrDefault()
        }).ToDictionaryAsync(x => x.AnalysisId, ct);
        var previousIds = predecessors.Values.Select(x => x.PreviousId).OfType<string>().Distinct().ToArray();
        var previous = await all.Where(x => previousIds.Contains(x.AnalysisId)).Select(InsightEndpoints.Summary).ToDictionaryAsync(x => x.AnalysisId, ct);
        var keys = rows.Select(x => x.ProjectKey).Distinct().ToArray();
        var objectives = await db.Set<PortfolioObjective>().AsNoTracking().Where(x => keys.Contains(x.ProjectKey)).ToListAsync(ct);
        var now = DateTimeOffset.UtcNow;
        var points = rows.Select(row =>
        {
            var predecessor = predecessors[row.AnalysisId]; row.DetailsPurged = predecessor.DetailsPurged || predecessor.IngestionPurged == true;
            return PortfolioTrends.Describe(row, predecessor.PreviousId == null ? null : previous.GetValueOrDefault(predecessor.PreviousId), objectives, now);
        }).ToArray();
        return new { schema_version = 1, generated_at = now, scope = new { project_key = project, branch, organization_id = organization, team_id = team, commit, from, to, latest = latest == "true" },
            freshness_days = 7, items = points, next_cursor = next };
    }

    private static DateTimeOffset? ParseDate(string text)
    {
        if (text.Length == 0) return null;
        if (!DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var date)) throw new ApiException(422, "Invalid portfolio date");
        return date.ToUniversalTime();
    }
}
