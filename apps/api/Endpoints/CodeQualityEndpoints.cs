using System.Text.Json;
using CodeInsights.Api.Auth;
using CodeInsights.Api.Contracts;
using CodeInsights.Api.Data;
using CodeInsights.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace CodeInsights.Api.Endpoints;

/// <summary>Authorized, paginated file and producer evidence at the publication commit.</summary>
public static class CodeQualityEndpoints
{
    public static WebApplication MapCodeQualityEndpoints(this WebApplication app)
    {
        app.MapGet("/api/v1/analyses/{id}/code-quality", ReadAsync).RequireAuthorization();
        return app;
    }

    private static async Task<IResult> ReadAsync(string id, HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct)
    {
        var analysis = await AnalysisEndpoints.FindAsync(id, context, db, auth, ct);
        var row = await db.Set<IngestionRecord>().AsNoTracking().Where(x => x.AnalysisId == id && x.CompletedAt != null).OrderByDescending(x => x.Revision).FirstOrDefaultAsync(ct);
        if (analysis.DetailsPurged || row?.DetailsPurged == true) throw new ApiException(410, "Analysis details were purged");
        if (row is null) return Results.Ok(new { state = "unavailable", reason = "legacy_analysis" });
        var data = JsonSerializer.Deserialize<CodeQualitySnapshot>(row.CodeData, ApiJson.Options) ?? new();
        var manifest = JsonSerializer.Deserialize<IngestionManifest>(row.Manifest, ApiJson.Options)!;
        var path = context.Request.Query["path"].ToString();
        if (path.Length > 4096 || path.StartsWith('/') || path.Split('/').Contains("..")) throw new ApiException(422, "Invalid scope path");
        var scope = context.Request.Query["scope"].ToString();
        if (scope is not ("" or "global" or "new_code")) throw new ApiException(422, "Invalid scope");
        var view = context.Request.Query["view"].ToString();
        if (view.Length == 0) view = "files";
        var limit = InsightEndpoints.PageSize(context.Request);
        var cursor = context.Request.Query["cursor"].ToString();
        if (!int.TryParse(cursor.Length == 0 ? "0" : cursor, out var offset) || offset < 0 || offset > 250_000) throw new ApiException(422, "Invalid cursor");
        var coverage = await db.Set<CoverageLine>().AsNoTracking().Where(x => x.IngestionId == row.Id).Select(x => new ImportedCoverage(x.Path, x.Line, x.Covered)).ToArrayAsync(ct);
        var measured = manifest.Reports.Any(r => r.Format is "lcov" or "cobertura") && manifest.Reports.Where(r => r.Format is "lcov" or "cobertura").All(r => r.State == "measured");
        CodeQualityTotals Totals(string selectedPath)
        {
            var totals = CodeQualityData.Summarize(data, coverage, selectedPath, scope == "new_code", manifest.GitDiff, measured);
            if (manifest.Reports.Any(r => r.Format == "jscpd" && r.State != "measured")) totals = totals with { DuplicationState = "unavailable", DuplicateBlocks = null };
            if (manifest.Reports.Any(r => r.Format == "cloc" && r.State != "measured")) totals = totals with { CodeLines = null };
            if (manifest.Reports.Any(r => r.Format == "cobertura" && r.State != "measured")) totals = totals with { ClassComplexity = null };
            return totals;
        }
        bool InPath(string p) => path.Length == 0 || p == path || p.StartsWith(path.TrimEnd('/') + "/", StringComparison.Ordinal);
        var added = manifest.GitDiff.Files.ToDictionary(x => x.Path, x => x.AddedLines.ToHashSet(), StringComparer.Ordinal);
        bool InScope(string p, int line) => InPath(p) && (scope != "new_code" || manifest.GitDiff.State == "available" && added.TryGetValue(p, out var lines) && lines.Contains(line));
        string? Link(string p, int line) => FindingEvidenceLinks.AzureDevOpsSource(manifest.RepositoryUrl, manifest.CommitSha, p, line);
        var paths = coverage.Select(x => x.Path).Concat(data.Reports.SelectMany(r => r.Branches.Select(x => x.Path)))
            .Concat(data.Reports.SelectMany(r => r.Metrics.Select(x => x.Path)))
            .Concat(data.Reports.SelectMany(r => r.Duplicates.SelectMany(x => new[] { x.First.Path, x.Second.Path }))).Distinct().Where(InPath).Order(StringComparer.Ordinal).ToArray();
        IEnumerable<object> items;
        if (view is "files" or "directories")
        {
            var names = view == "files" ? paths : paths.SelectMany(p => p.Split('/').SkipLast(1).Select((_, i) => string.Join('/', p.Split('/').Take(i + 1))))
                .Distinct().Order(StringComparer.Ordinal).ToArray();
            // ponytail: at most 100 summaries scan the bounded snapshot; materialize per-file aggregates if observed request latency exceeds its budget.
            items = names.Skip(offset).Take(limit + 1).Select(p => (object)new { path = p, totals = Totals(p), source_url = view == "files" ? Link(p, 1) : null });
        }
        else if (view == "lines") items = coverage.Where(x => InScope(x.Path, x.Line)).OrderBy(x => x.Path).ThenBy(x => x.Line).Select(x => (object)new { x.Path, x.Line, x.Covered, source_url = Link(x.Path, x.Line) });
        else if (view == "branches") items = data.Reports.SelectMany(r => r.Branches.Where(x => InScope(x.Path, x.Line)).Select(x => (object)new { r.ReportId, r.Tool, r.ToolVersion, x.Path, x.Line, x.Kind, x.Identity, x.Covered, x.Total, source_url = Link(x.Path, x.Line) }));
        else if (view == "duplicates") items = data.Reports.SelectMany(r => r.Duplicates.Where(x => InPath(x.First.Path) || InPath(x.Second.Path))
            .Where(x => scope != "new_code" || manifest.GitDiff.State == "available" && new[] { x.First, x.Second }.Any(l => InPath(l.Path) && added.TryGetValue(l.Path, out var lines) && lines.Any(n => n >= l.Start && n <= l.End)))
            .Select(x => (object)new { r.ReportId, r.Tool, r.ToolVersion, x.Language, x.Lines, x.Tokens,
                first = new { x.First.Path, x.First.Start, x.First.End, source_url = Link(x.First.Path, x.First.Start) },
                second = new { x.Second.Path, x.Second.Start, x.Second.End, source_url = Link(x.Second.Path, x.Second.Start) } }));
        else throw new ApiException(422, "view must be files, directories, lines, branches or duplicates");
        var page = items.Skip(view is "files" or "directories" ? 0 : offset).Take(limit + 1).ToList();
        var next = page.Count > limit ? (int?)(offset + limit) : null;
        if (page.Count > limit) page.RemoveAt(limit);
        return Results.Ok(new { state = "available", manifest.CommitSha, scope = scope.Length == 0 ? "global" : scope, path, view,
            totals = Totals(path),
            provenance = data.Reports.Select(x => new { x.ReportId, x.Tool, x.ToolVersion, x.Format }), items = page, next_cursor = next });
    }
}
