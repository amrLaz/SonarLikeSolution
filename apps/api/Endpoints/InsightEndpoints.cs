using System.Linq.Expressions;
using System.Text.Json;
using CodeInsights.Api.Auth;
using CodeInsights.Api.Data;
using CodeInsights.Api.Services;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;

namespace CodeInsights.Api.Endpoints;

/// <summary>Bounded analysis reads and server-side portfolio aggregates.</summary>
public static class InsightEndpoints
{
    internal static readonly Expression<Func<AnalysisRecord, AnalysisRecord>> Summary = x => new AnalysisRecord
    {
        AnalysisId = x.AnalysisId, ProjectKey = x.ProjectKey, CommitSha = x.CommitSha,
        Branch = x.Branch, CiProvider = x.CiProvider, Status = x.Status, QualityGate = x.QualityGate,
        MaintainabilityScore = x.MaintainabilityScore, SecurityScore = x.SecurityScore,
        ReliabilityScore = x.ReliabilityScore, CodeSmells = x.CodeSmells, Vulnerabilities = x.Vulnerabilities,
        SecurityHotspots = x.SecurityHotspots, Bugs = x.Bugs, Coverage = x.Coverage,
        Duplication = x.Duplication, DependencyVulnerabilities = x.DependencyVulnerabilities,
        GateFailures = x.GateFailures, CreatedAt = x.CreatedAt, PrId = x.PrId,
        PrDecorationStatus = x.PrDecorationStatus, Measurements = x.Measurements,
        ToolExecutions = x.ToolExecutions, Completeness = x.Completeness, ProfileId = x.ProfileId,
        ProfileVersion = x.ProfileVersion, FormulaVersion = x.FormulaVersion, GateSnapshot = x.GateSnapshot,
    };

    public static IEndpointRouteBuilder MapInsightEndpoints(this IEndpointRouteBuilder app)
    {
        var routes = app.MapGroup("/api/v1/insights").RequireAuthorization();
        routes.MapGet("/analyses", ListAnalysesAsync);
        routes.MapGet("/summary", SummaryAsync);
        routes.MapGet("/branches", BranchesAsync);
        routes.MapGet("/rules", RulesAsync);
        routes.MapGet("/analyses/{id}/findings", FindingsAsync);
        routes.MapGet("/analyses/{id}/components", ComponentsAsync);
        routes.MapGet("/analyses/{id}/comparison", async (string id, HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct) =>
        {
            var ingestion = await LatestAsync(id, context, db, auth, ct);
            return ingestion == null ? Results.Ok(new { state = "unavailable", reason = "legacy_analysis" })
                : ingestion.DetailsPurged ? Results.Ok(new { state = "unavailable", reason = "details_purged" })
                : Results.Json(JsonSerializer.Deserialize<JsonElement>(ingestion.Comparison));
        });
        return app;
    }

    private static async Task<IResult> RulesAsync(HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct)
    {
        var analyses = await VisibleAsync(context, db, auth, ct);
        var ids = analyses.Where(x => !analyses.Any(y => y.ProjectKey == x.ProjectKey &&
            (string.Compare(y.CreatedAt, x.CreatedAt) > 0 || y.CreatedAt == x.CreatedAt && string.Compare(y.AnalysisId, x.AnalysisId) > 0))).Select(x => x.AnalysisId);
        var query = db.Set<FindingOccurrence>().AsNoTracking().Where(x => ids.Contains(x.AnalysisId) &&
            !db.Set<IngestionRecord>().Any(i => i.AnalysisId == x.AnalysisId && i.CompletedAt != null && i.Id != x.IngestionId &&
                i.Revision > (db.Set<IngestionRecord>().Where(j => j.Id == x.IngestionId).Select(j => (int?)j.Revision).FirstOrDefault() ?? 0)));
        var search = context.Request.Query["search"].ToString().ToLowerInvariant();
        var category = context.Request.Query["category"].ToString();
        var severity = context.Request.Query["severity"].ToString().ToLowerInvariant();
        if (search.Length > 0) query = query.Where(x => x.RuleId.ToLower().Contains(search) || x.Tool.ToLower().Contains(search));
        if (category.Length > 0 && category != "all") query = query.Where(x => x.Category == category);
        if (severity.Length > 0 && severity != "all") query = query.Where(x => x.Severity.ToLower() == severity);
        var cursor = NumericCursor(context.Request); var size = PageSize(context.Request);
        var rows = await query.GroupBy(x => new { x.Tool, x.RuleId, x.Category, x.Severity }).Select(g => new
        {
            Id = g.Min(x => x.Id), g.Key.Tool, g.Key.RuleId, g.Key.Category, g.Key.Severity,
            Occurrences = g.Count(), Files = g.Where(x => x.Path != null).Select(x => x.AnalysisId + ":" + x.Path).Distinct().Count(),
            Projects = g.Select(x => x.AnalysisId).Distinct().Count(),
        }).Where(x => x.Id > cursor).OrderBy(x => x.Id).Take(size + 1).ToListAsync(ct);
        if (rows.Count > size) { rows.RemoveAt(size); Continuation(context, rows[^1].Id.ToString()); }
        return Results.Ok(rows.Select(x => new { key = x.Id.ToString(), rule_id = x.RuleId, title = $"{x.Tool} · {x.RuleId}", category = x.Category, severity = x.Severity, language = "Non disponible", occurrences = x.Occurrences, file_count = x.Files, project_count = x.Projects, projects = Array.Empty<string>(), status = "active" }));
    }

    private static async Task<IngestionRecord?> LatestAsync(string id, HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct)
    {
        await AnalysisEndpoints.FindAsync(id, context, db, auth, ct);
        return await db.Set<IngestionRecord>().AsNoTracking().Where(x => x.AnalysisId == id && x.CompletedAt != null)
            .OrderByDescending(x => x.Revision).FirstOrDefaultAsync(ct);
    }

    private static long NumericCursor(HttpRequest request)
    {
        var cursor = request.Query["cursor"].ToString();
        if (cursor.Length == 0) return 0;
        return long.TryParse(cursor, out var value) && value >= 0 ? value : throw new ApiException(422, "Invalid cursor");
    }

    private static async Task<IResult> FindingsAsync(string id, HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct)
    {
        var ingestion = await LatestAsync(id, context, db, auth, ct);
        if (ingestion?.DetailsPurged == true) throw new ApiException(410, "Analysis details were purged");
        var query = db.Set<FindingOccurrence>().AsNoTracking().Where(x => x.AnalysisId == id && (ingestion == null || x.IngestionId == ingestion.Id));
        var category = context.Request.Query["category"].ToString();
        var severity = context.Request.Query["severity"].ToString();
        var rule = context.Request.Query["rule"].ToString();
        var path = context.Request.Query["path"].ToString();
        if (category.Length > 0 && category != "all") query = query.Where(x => x.Category == category);
        if (severity.Length > 0 && severity != "all")
        {
            var values = severity switch { "blocker" => new[] { "critical", "error", "blocker" }, "medium" => new[] { "warning", "medium" }, "low" => new[] { "low", "convention" }, _ => new[] { severity } };
            query = query.Where(x => values.Contains(x.Severity.ToLower()));
        }
        if (rule.Length > 0) query = query.Where(x => x.RuleId.ToLower().Contains(rule.ToLower()));
        if (path.Length > 0) query = query.Where(x => x.Path != null && x.Path.ToLower().Contains(path.ToLower()));
        var cursor = NumericCursor(context.Request); var size = PageSize(context.Request);
        var rows = await query.Where(x => x.Id > cursor).OrderBy(x => x.Id).Take(size + 1).Select(x => new
        { x.Id, x.Tool, x.RuleId, x.Severity, x.OriginalSeverity, x.Category, x.Message, x.Path, x.Line, x.Fingerprint, x.Excepted }).ToListAsync(ct);
        if (rows.Count > size) { rows.RemoveAt(size); Continuation(context, rows[^1].Id.ToString()); }
        return Results.Ok(rows);
    }

    private static async Task<IResult> ComponentsAsync(string id, HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct)
    {
        var ingestion = await LatestAsync(id, context, db, auth, ct);
        if (ingestion?.DetailsPurged == true) throw new ApiException(410, "Analysis details were purged");
        var cursor = NumericCursor(context.Request); var size = PageSize(context.Request);
        var rows = await db.Set<SbomComponent>().AsNoTracking().Where(x => x.AnalysisId == id && (ingestion == null || x.IngestionId == ingestion.Id) && x.Id > cursor)
            .OrderBy(x => x.Id).Take(size + 1).Select(x => new { x.Id, x.Reference, x.Name, x.Version, x.Purl, x.Ecosystem, x.Licenses, x.Relationship, x.LicenseDecision, x.Vulnerabilities, x.Dependencies, x.Source, x.ObservedAt }).ToListAsync(ct);
        if (rows.Count > size) { rows.RemoveAt(size); Continuation(context, rows[^1].Id.ToString()); }
        return Results.Ok(rows.Select(x => new { x.Id, x.Reference, x.Name, x.Version, x.Purl, x.Ecosystem, licenses = JsonSerializer.Deserialize<JsonElement>(x.Licenses), x.Relationship, x.LicenseDecision, vulnerabilities = JsonSerializer.Deserialize<JsonElement>(x.Vulnerabilities), dependencies = JsonSerializer.Deserialize<JsonElement>(x.Dependencies), x.Source, x.ObservedAt }));
    }

    public static int PageSize(HttpRequest request)
    {
        var value = request.Query["limit"].ToString();
        if (value.Length == 0) return 50;
        if (!int.TryParse(value, out var size) || size < 1 || size > 100)
            throw new ApiException(422, "limit must be between 1 and 100");
        return size;
    }

    private static async Task<IResult> BranchesAsync(HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(context.Request.Query["project_key"])) throw new ApiException(422, "project_key is required");
        var query = await VisibleAsync(context, db, auth, ct);
        var cursor = DecodeCursor(context.Request, 1)?[0]; var size = PageSize(context.Request);
        var prefix = context.Request.Query["prefix"].ToString();
        if (prefix.Length > 0) query = query.Where(x => x.Branch.StartsWith(prefix));
        var names = await query.Select(x => x.Branch).Distinct().Where(x => cursor == null || string.Compare(x, cursor) > 0).OrderBy(x => x).Take(size + 1).ToListAsync(ct);
        if (names.Count > size) { names.RemoveAt(size); Continuation(context, EncodeCursor(names[^1])); }
        var counts = await query.Where(x => names.Contains(x.Branch)).GroupBy(x => x.Branch).Select(g => new { Name = g.Key, Count = g.Count() }).ToListAsync(ct);
        var latest = await query.Where(x => names.Contains(x.Branch) && !query.Any(y => y.Branch == x.Branch &&
            (string.Compare(y.CreatedAt, x.CreatedAt) > 0 || y.CreatedAt == x.CreatedAt && string.Compare(y.AnalysisId, x.AnalysisId) > 0))).Select(Summary).ToListAsync(ct);
        return Results.Ok(counts.OrderBy(x => x.Name).Select(x => new { name = x.Name, count = x.Count, latest = latest.Where(y => y.Branch == x.Name).Select(y => GateEvaluation.ToResponse(y, false)).FirstOrDefault() }));
    }

    public static string EncodeCursor(params string[] values) => WebEncoders.Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(values));

    public static string[]? DecodeCursor(HttpRequest request, int count)
    {
        var cursor = request.Query["cursor"].ToString();
        if (cursor.Length == 0) return null;
        try
        {
            var parts = JsonSerializer.Deserialize<string[]>(WebEncoders.Base64UrlDecode(cursor));
            return parts?.Length == count && parts.All(x => !string.IsNullOrEmpty(x)) ? parts : throw new ApiException(422, "Invalid cursor");
        }
        catch (Exception e) when (e is FormatException or JsonException) { throw new ApiException(422, "Invalid cursor"); }
    }

    public static void Continuation(HttpContext context, string? cursor)
    {
        if (cursor == null) return;
        context.Response.Headers["X-Next-Cursor"] = cursor;
        var query = context.Request.Query.ToDictionary(x => x.Key, x => (string?)x.Value.ToString());
        query["cursor"] = cursor;
        context.Response.Headers.Link = $"<{QueryHelpers.AddQueryString(context.Request.PathBase + context.Request.Path, query)}>; rel=\"next\"";
    }

    public static async Task<IResult> ListAnalysesAsync(HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct)
    {
        var query = await VisibleAsync(context, db, auth, ct);
        var size = PageSize(context.Request);
        var cursor = context.Request.Query["cursor"].ToString();
        if (cursor.Length > 0)
        {
            string[] parts;
            try { parts = JsonSerializer.Deserialize<string[]>(WebEncoders.Base64UrlDecode(cursor)) ?? []; }
            catch (Exception e) when (e is FormatException or JsonException) { throw new ApiException(422, "Invalid cursor"); }
            if (parts.Length != 2 || parts.Any(string.IsNullOrEmpty)) throw new ApiException(422, "Invalid cursor");
            var date = parts[0]; var id = parts[1];
            query = query.Where(x => string.Compare(x.CreatedAt, date) < 0 || x.CreatedAt == date && string.Compare(x.AnalysisId, id) < 0);
        }
        var rows = await query.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.AnalysisId)
            .Select(Summary).Take(size + 1).ToListAsync(ct);
        if (rows.Count > size)
        {
            rows.RemoveAt(size);
            Continuation(context, WebEncoders.Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(new[] { rows[^1].CreatedAt, rows[^1].AnalysisId })));
        }
        return Results.Ok(rows.Select(x => GateEvaluation.ToResponse(x, false)));
    }

    private static async Task<IQueryable<AnalysisRecord>> VisibleAsync(HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct)
    {
        var user = await auth.RequireAsync(context, ct: ct);
        var visible = await auth.AllowedProjectKeysAsync(user, ct: ct);
        var key = context.Request.Query["project_key"].ToString();
        if (key.Length > 0) await auth.AssertProjectAccessAsync(user, key, ct: ct);
        var query = db.Set<AnalysisRecord>().AsNoTracking().Where(x => visible.Contains(x.ProjectKey));
        if (key.Length > 0) query = query.Where(x => x.ProjectKey == key);
        var branch = context.Request.Query["branch"].ToString();
        if (branch.Length > 0) query = query.Where(x => x.Branch == branch);
        var scope = context.Request.Query["scope"].ToString();
        if (scope.Length > 0 && scope != "overall") throw new ApiException(422, "Use the comparison endpoint for New Code");
        foreach (var field in new[] { "from", "to" })
        {
            var date = context.Request.Query[field].ToString();
            if (date.Length == 0) continue;
            if (!DateTimeOffset.TryParse(date, out var parsed)) throw new ApiException(422, "Invalid date filter");
            var normalized = parsed.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.ffffffzzz");
            query = field == "from" ? query.Where(x => string.Compare(x.CreatedAt, normalized) >= 0) : query.Where(x => string.Compare(x.CreatedAt, normalized) <= 0);
        }
        return query;
    }

    private static async Task<IResult> SummaryAsync(HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct)
    {
        var query = await VisibleAsync(context, db, auth, ct);
        var size = PageSize(context.Request);
        var cursor = DecodeCursor(context.Request, 1)?[0];
        var projects = await query.Select(x => x.ProjectKey).Distinct().Where(x => cursor == null || string.Compare(x, cursor) > 0).OrderBy(x => x).Take(size + 1).ToListAsync(ct);
        string? next = null;
        if (projects.Count > size) { projects.RemoveAt(size); next = EncodeCursor(projects[^1]); Continuation(context, next); }
        query = query.Where(x => projects.Contains(x.ProjectKey));
        var counts = await query.GroupBy(x => x.ProjectKey).Select(g => new
        {
            ProjectKey = g.Key, Count = g.Count(), BranchCount = g.Select(x => x.Branch).Distinct().Count(),
            Pass = g.Count(x => x.FormulaVersion != "0" && x.QualityGate == "pass"),
            Fail = g.Count(x => x.FormulaVersion != "0" && x.QualityGate == "fail"),
            Unknown = g.Count(x => x.FormulaVersion != "0" && x.QualityGate == "unknown"),
            Legacy = g.Count(x => x.FormulaVersion == "0"),
        }).ToListAsync(ct);
        var latest = await query.Where(x => !query.Any(y => y.ProjectKey == x.ProjectKey &&
            (string.Compare(y.CreatedAt, x.CreatedAt) > 0 || y.CreatedAt == x.CreatedAt && string.Compare(y.AnalysisId, x.AnalysisId) > 0)))
            .Select(Summary).ToListAsync(ct);
        return Results.Ok(new { next_cursor = next, projects = counts.Select(g => new
        {
            project_key = g.ProjectKey, total_count = g.Count, pass_count = g.Pass,
            fail_count = g.Fail, unknown_count = g.Unknown, legacy_count = g.Legacy,
            latest = latest.Where(x => x.ProjectKey == g.ProjectKey).Select(x => GateEvaluation.ToResponse(x, false)).FirstOrDefault(),
            branch_count = g.BranchCount,
            // ponytail: branch details are read only through their separately bounded endpoint.
            branches_truncated = g.BranchCount > 0,
            branches = Array.Empty<object>(),
        }).OrderBy(x => x.project_key) });
    }
}
