using CodeInsights.Api.Auth;
using CodeInsights.Api.Contracts;
using CodeInsights.Api.Data;
using CodeInsights.Api.Services;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace CodeInsights.Api.Endpoints;

/// <summary>Authorized versioned code boundaries, branch archives and commit-pinned file exploration.</summary>
public static class CodeEndpoints
{
    public static IEndpointRouteBuilder MapCodeEndpoints(this IEndpointRouteBuilder app)
    {
        var routes = app.MapGroup("/api/v1/code").RequireAuthorization();
        routes.MapGet("/projects/{key}/configuration", async (string key, HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct) =>
        {
            await Access(key, context, db, auth, false, ct);
            var snapshot = await CodeScopes.CaptureAsync(db, key, ct);
            return Results.Ok(new { snapshot.Definition, version = snapshot.Definition?.Version, repository_url = snapshot.Definition?.RepositoryUrl,
                snapshot.BaselineSha, snapshot.BaselineAnalysisId, snapshot.Reason });
        });
        routes.MapGet("/projects/{key}/versions", async (string key, HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct) =>
        {
            await Access(key, context, db, auth, false, ct);
            var size = InsightEndpoints.PageSize(context.Request);
            var cursor = context.Request.Query["cursor"].ToString();
            var rows = await db.Set<CodeScopeVersion>().AsNoTracking().Where(x => x.ProjectKey == key && string.Compare(x.Version, cursor) > 0).OrderBy(x => x.Version).Take(size + 1).ToListAsync(ct);
            if (rows.Count > size) { rows.RemoveAt(size); InsightEndpoints.Continuation(context, rows[^1].Version); }
            return Results.Ok(rows.Select(x => JsonSerializer.Deserialize<CodeScopeDefinition>(x.Definition, ApiJson.Options)));
        });
        routes.MapPost("/projects/{key}/versions", async (string key, HttpContext context, AppDbContext db, AuthService auth, AuditService audit, CancellationToken ct) =>
        {
            var actor = await Access(key, context, db, auth, true, ct);
            var body = await ApiJson.ReadAsync<CodeScopeDefinition>(context, ct);
            CodeScopes.Validate(body);
            if (body.ReferenceKind == "analysis" && !await db.Set<AnalysisRecord>().AnyAsync(x => x.AnalysisId == body.ReferenceAnalysisId && x.ProjectKey == key, ct))
                throw new ApiException(422, "Reference analysis must belong to this project");
            if (await db.Set<CodeScopeVersion>().AnyAsync(x => x.ProjectKey == key && x.Version == body.Version, ct)) throw new ApiException(409, "Code scope versions are immutable");
            db.Add(new CodeScopeVersion { ProjectKey = key, Version = body.Version, Definition = JsonSerializer.Serialize(body, ApiJson.Options) });
            audit.Log(actor.Email, actor.Role, "code_scope.publish", "project", resourceLabel: key, details: body);
            await db.SaveChangesAsync(ct);
            return Results.Created($"/api/v1/code/projects/{Uri.EscapeDataString(key)}/versions", body);
        });
        routes.MapPut("/projects/{key}/configuration", async (string key, HttpContext context, AppDbContext db, AuthService auth, AuditService audit, CancellationToken ct) =>
        {
            var actor = await Access(key, context, db, auth, true, ct);
            var body = await ApiJson.ReadAsync<Contracts.CodeScopeAssignment>(context, ct);
            if (!await db.Set<CodeScopeVersion>().AnyAsync(x => x.ProjectKey == key && x.Version == body.Version, ct)) throw new ApiException(422, "Publish the code scope version first");
            var row = await db.Set<Data.CodeScopeAssignment>().FindAsync([key], ct);
            if (row is null) { row = new Data.CodeScopeAssignment { ProjectKey = key }; db.Add(row); }
            row.Version = body.Version;
            audit.Log(actor.Email, actor.Role, "code_scope.assign", "project", resourceLabel: key, details: body);
            await db.SaveChangesAsync(ct); return Results.Ok(body);
        });
        routes.MapGet("/projects/{key}/branches", async (string key, HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct) =>
        {
            await Access(key, context, db, auth, false, ct);
            var cursor = context.Request.Query["cursor"].ToString(); var size = InsightEndpoints.PageSize(context.Request);
            var rows = await db.Set<AnalysisRecord>().Where(x => x.ProjectKey == key).Select(x => x.Branch).Distinct()
                .Where(x => string.Compare(x, cursor) > 0).OrderBy(x => x).Take(size + 1).ToListAsync(ct);
            if (rows.Count > size) { rows.RemoveAt(size); InsightEndpoints.Continuation(context, rows[^1]); }
            var archived = await db.Set<ArchivedCodeBranch>().Where(x => x.ProjectKey == key && rows.Contains(x.Branch) && x.Archived).Select(x => x.Branch).ToListAsync(ct);
            var scope = await CodeScopes.CaptureAsync(db, key, ct);
            return Results.Ok(rows.Select(branch => new { branch, archived = archived.Contains(branch), is_main = branch == scope.Definition?.MainBranch }));
        });
        routes.MapPut("/projects/{key}/branches", async (string key, HttpContext context, AppDbContext db, AuthService auth, AuditService audit, CancellationToken ct) =>
        {
            var actor = await Access(key, context, db, auth, true, ct);
            var body = await ApiJson.ReadAsync<BranchArchiveRequest>(context, ct);
            if (!CodeScopes.Branch(body.Branch)) throw new ApiException(422, "Invalid branch");
            var row = await db.Set<ArchivedCodeBranch>().FindAsync([key, body.Branch], ct);
            if (row is null) { row = new ArchivedCodeBranch { ProjectKey = key, Branch = body.Branch }; db.Add(row); }
            row.Archived = body.Archived;
            audit.Log(actor.Email, actor.Role, "code_branch.archive", "project", resourceLabel: key, details: body);
            await db.SaveChangesAsync(ct); return Results.Ok(body);
        });
        routes.MapGet("/analyses/{id}/files", FilesAsync);
        routes.MapGet("/analyses/{id}/file", FileAsync);
        return app;
    }

    private static async Task<Principal> Access(string key, HttpContext context, AppDbContext db, AuthService auth, bool write, CancellationToken ct)
    {
        var user = await auth.RequireAsync(context, write ? "admin" : "platform", ct);
        await auth.AssertProjectAccessAsync(user, key, write ? "analysis:write" : "read", ct);
        return user;
    }

    private static async Task<IngestionRecord> Find(string id, HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct)
    {
        await AnalysisEndpoints.FindAsync(id, context, db, auth, ct);
        var row = await db.Set<IngestionRecord>().AsNoTracking().Where(x => x.AnalysisId == id && x.State == "completed").OrderByDescending(x => x.Revision).FirstOrDefaultAsync(ct)
            ?? throw new ApiException(404, "No imported code inventory for this analysis");
        if (row.DetailsPurged) throw new ApiException(410, "Code details removed by retention");
        return row;
    }

    private static async Task<IResult> FilesAsync(string id, HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct)
    {
        var row = await Find(id, context, db, auth, ct);
        var manifest = JsonSerializer.Deserialize<IngestionManifest>(row.Manifest, ApiJson.Options)!;
        var scope = CodeScopes.Read(row.CodeScopeSnapshot).Definition;
        var prefix = context.Request.Query["prefix"].ToString(); var cursor = context.Request.Query["cursor"].ToString(); var size = InsightEndpoints.PageSize(context.Request);
        var paths = manifest.RepositoryFiles.Length > 0 ? manifest.RepositoryFiles : await db.Set<FindingOccurrence>().Where(x => x.IngestionId == row.Id && x.Path != null).Select(x => x.Path!)
            .Union(db.Set<CoverageLine>().Where(x => x.IngestionId == row.Id).Select(x => x.Path)).Distinct().ToArrayAsync(ct);
        var page = paths.Where(p => CodeScopes.Includes(scope, p) && p.StartsWith(prefix, StringComparison.Ordinal) && string.CompareOrdinal(p, cursor) > 0).Order(StringComparer.Ordinal).Take(size + 1).ToList();
        if (page.Count > size) { page.RemoveAt(size); InsightEndpoints.Continuation(context, page[^1]); }
        var coverage = await db.Set<CoverageLine>().Where(x => x.IngestionId == row.Id && page.Contains(x.Path)).GroupBy(x => x.Path)
            .Select(g => new { path = g.Key, executable = g.Count(), covered = g.Count(x => x.Covered) }).ToListAsync(ct);
        var findings = await db.Set<FindingOccurrence>().Where(x => x.IngestionId == row.Id && x.Path != null && page.Contains(x.Path)).GroupBy(x => x.Path)
            .Select(g => new { path = g.Key, count = g.Count() }).ToListAsync(ct);
        var findingMeasured = row.TechnicalState == "complete" && manifest.Reports.Any(r => r.Format == "sarif") && manifest.Reports.Where(r => r.Format == "sarif").All(r => r.State == "measured");
        var coverageMeasured = manifest.Reports.Any(r => r.Format is "lcov" or "cobertura") && manifest.Reports.Where(r => r.Format is "lcov" or "cobertura").All(r => r.State == "measured");
        return Results.Ok(new { manifest.CommitSha, inventory_state = manifest.RepositoryFiles.Length > 0 ? "git_tree" : "reported_files_only", scope,
            files = page.Select(path => new { path, kind = CodeScopes.Kind(scope, path), source_url = FindingEvidenceLinks.AzureDevOpsSource(manifest.RepositoryUrl, manifest.CommitSha, path, null),
                finding_state = findingMeasured ? "measured" : "not_measured", finding_count = findingMeasured ? findings.FirstOrDefault(x => x.path == path)?.count ?? 0 : (int?)null,
                coverage_state = coverageMeasured && coverage.Any(x => x.path == path) ? "measured" : "not_measured",
                executable_lines = coverageMeasured ? coverage.FirstOrDefault(x => x.path == path)?.executable : null,
                covered_lines = coverageMeasured ? coverage.FirstOrDefault(x => x.path == path)?.covered : null }) });
    }

    private static async Task<IResult> FileAsync(string id, HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct)
    {
        var row = await Find(id, context, db, auth, ct);
        var path = context.Request.Query["path"].ToString();
        if (!IngestionValidation.SafePath(path)) throw new ApiException(422, "Invalid file path");
        var scope = CodeScopes.Read(row.CodeScopeSnapshot).Definition;
        if (!CodeScopes.Includes(scope, path)) throw new ApiException(404, "File outside component");
        var manifest = JsonSerializer.Deserialize<IngestionManifest>(row.Manifest, ApiJson.Options)!;
        var cursorText = context.Request.Query["cursor"].ToString();
        if (!int.TryParse(cursorText.Length == 0 ? "0" : cursorText, out var after) || after < 0) throw new ApiException(422, "Invalid line cursor");
        var size = InsightEndpoints.PageSize(context.Request);
        var coverage = db.Set<CoverageLine>().Where(x => x.IngestionId == row.Id && x.Path == path);
        var findings = db.Set<FindingOccurrence>().Where(x => x.IngestionId == row.Id && x.Path == path);
        var lines = await coverage.Select(x => x.Line).Union(findings.Where(x => x.Line != null).Select(x => x.Line!.Value)).Where(x => x > after).OrderBy(x => x).Take(size + 1).ToListAsync(ct);
        if (lines.Count > size) { lines.RemoveAt(size); InsightEndpoints.Continuation(context, lines[^1].ToString()); }
        var measured = await coverage.Where(x => lines.Contains(x.Line)).ToDictionaryAsync(x => x.Line, x => x.Covered, ct);
        var occurrences = await findings.Where(x => x.Line != null && lines.Contains(x.Line.Value)).OrderBy(x => x.Id).Take(501)
            .Select(x => new { x.Id, x.Line, x.Tool, x.RuleId, x.Category, x.Severity, x.Message }).ToListAsync(ct);
        var truncated = occurrences.Count > 500; if (truncated) occurrences.RemoveAt(500);
        return Results.Ok(new { path, manifest.CommitSha, kind = CodeScopes.Kind(scope, path), findings_truncated = truncated,
            lines = lines.Select(line => new { line, covered = measured.TryGetValue(line, out var hit) ? (bool?)hit : null,
                source_url = FindingEvidenceLinks.AzureDevOpsSource(manifest.RepositoryUrl, manifest.CommitSha, path, line), findings = occurrences.Where(x => x.Line == line) }) });
    }
}
