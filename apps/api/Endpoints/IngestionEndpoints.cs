using CodeInsights.Api.Auth;
using CodeInsights.Api.Contracts;
using CodeInsights.Api.Data;
using CodeInsights.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.Text.Json;

namespace CodeInsights.Api.Endpoints;

public static class IngestionEndpoints
{
    public static IEndpointRouteBuilder MapIngestionEndpoints(this IEndpointRouteBuilder app)
    {
        var routes = app.MapGroup("/api/v1/ingestions").RequireAuthorization();
        routes.MapGet("/queue", async (HttpContext context, AuthService auth, AppDbContext db, CancellationToken ct) =>
        {
            await auth.RequireAsync(context, "admin", ct);
            return Results.Ok(await db.Set<DurableJob>().AsNoTracking().GroupBy(x => new { x.Kind, x.State })
                .Select(g => new { g.Key.Kind, g.Key.State, count = g.Count(), oldest_created_at = g.Min(x => x.CreatedAt), max_attempts = g.Max(x => x.Attempts) }).ToListAsync(ct));
        });
        routes.MapPost("", CreateAsync);
        routes.MapGet("", async (HttpContext context, AuthService auth, AppDbContext db, CancellationToken ct) =>
        {
            var user = await auth.RequireAsync(context, ct: ct);
            var keys = await auth.AllowedProjectKeysAsync(user, ct: ct);
            var key = context.Request.Query["project_key"].ToString();
            if (key.Length > 0) await auth.AssertProjectAccessAsync(user, key, ct: ct);
            var size = InsightEndpoints.PageSize(context.Request);
            var cursor = InsightEndpoints.DecodeCursor(context.Request, 2);
            var query = db.Set<IngestionRecord>().AsNoTracking().Where(x => keys.Contains(x.ProjectKey) && (key == "" || x.ProjectKey == key));
            if (cursor is not null)
            {
                if (!DateTime.TryParse(cursor[0], null, System.Globalization.DateTimeStyles.RoundtripKind, out var date)) throw new ApiException(422, "Invalid cursor");
                var id = cursor[1]; query = query.Where(x => x.CreatedAt < date || x.CreatedAt == date && string.Compare(x.Id, id) < 0);
            }
            var rows = await query.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id).Take(size + 1)
                .Select(x => new { ingestion_id = x.Id, x.AnalysisId, x.ProjectKey, x.Revision, x.State, x.TechnicalState, x.QualityGate, x.Error, x.CreatedAt, x.DetailsPurged }).ToListAsync(ct);
            if (rows.Count > size) { rows.RemoveAt(size); InsightEndpoints.Continuation(context, InsightEndpoints.EncodeCursor(rows[^1].CreatedAt.ToString("O"), rows[^1].ingestion_id)); }
            return Results.Ok(rows);
        });
        routes.MapGet("/{id}", async (string id, HttpContext context, AuthService auth, AppDbContext db, CancellationToken ct) =>
            Results.Ok(await ReceiptAsync(await FindAsync(id, context, auth, db, "read", ct), db, ct)));
        routes.MapPut("/{id}/reports/{reportId}", UploadAsync).DisableAntiforgery();
        routes.MapGet("/{id}/reports/{reportId}", async (string id, string reportId, HttpContext context, AuthService auth, AppDbContext db, ReportStorage storage, CancellationToken ct) =>
        {
            var ingestion = await FindAsync(id, context, auth, db, "read", ct);
            if (ingestion.DetailsPurged) throw new ApiException(410, "Report removed by retention");
            var report = await db.Set<IngestionReport>().FindAsync([id, reportId], ct) ?? throw new ApiException(404, "Report not found");
            if (report.State != "received") throw new ApiException(409, "Report not received");
            return Results.Stream(await storage.OpenAsync(report.BlobName, ct), "application/octet-stream", reportId + ".report");
        });
        routes.MapPost("/{id}/finalize", async (string id, HttpContext context, AuthService auth, AppDbContext db, CancellationToken ct) =>
        {
            var ingestion = await FindAsync(id, context, auth, db, "analysis:write", ct);
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await LockAsync(db, ingestion.BuildKey, ct);
            await db.Entry(ingestion).ReloadAsync(ct);
            if (ingestion.State == "receiving")
            {
                if (await db.Set<IngestionReport>().AnyAsync(x => x.IngestionId == id && x.State == "expected", ct))
                    throw new ApiException(409, "Expected reports have not all been uploaded; finalize a manifest declaring missing/failed producers explicitly");
                ingestion.State = "queued";
                db.Add(new DurableJob { ResourceId = id });
                await db.SaveChangesAsync(ct);
            }
            await tx.CommitAsync(ct);
            return Results.Accepted($"/api/v1/ingestions/{id}", await ReceiptAsync(ingestion, db, ct));
        });
        return app;
    }

    public static Task<int> LockAsync(AppDbContext db, string key, CancellationToken ct) =>
        db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({key}, 0))", ct);

    public static async Task<IngestionRecord> FindAsync(string id, HttpContext context, AuthService auth, AppDbContext db, string permission, CancellationToken ct)
    {
        var user = await auth.RequireAsync(context, ct: ct);
        var row = await db.Set<IngestionRecord>().FindAsync([id], ct) ?? throw new ApiException(404, "Ingestion not found");
        await auth.AssertProjectAccessAsync(user, row.ProjectKey, permission, ct);
        return row;
    }

    public static async Task<object> ReceiptAsync(IngestionRecord row, AppDbContext db, CancellationToken ct) => new
    {
        ingestion_id = row.Id, row.AnalysisId, row.ProjectKey, row.Revision, row.State, row.TechnicalState, row.QualityGate,
        row.Error, row.CreatedAt, row.CompletedAt, row.DetailsPurged,
        gate_snapshot = JsonSerializer.Deserialize<JsonElement>(row.GateSnapshot),
        analysis_url = $"/?analysis_id={row.AnalysisId}",
        jobs = await db.Set<DurableJob>().AsNoTracking().Where(x => x.ResourceId == row.Id || x.ResourceId.StartsWith(row.Id + ":"))
            .OrderBy(x => x.CreatedAt).Take(100).Select(x => new { x.Kind, x.State, x.Attempts, x.AvailableAt, x.LeaseUntil, x.Error }).ToListAsync(ct),
        reports = await db.Set<IngestionReport>().AsNoTracking().Where(x => x.IngestionId == row.Id).OrderBy(x => x.ReportId)
            .Select(x => new { x.ReportId, x.State, x.SizeBytes, x.Sha256, x.Error }).ToListAsync(ct)
    };

    private static async Task<IResult> CreateAsync(HttpContext context, AuthService auth, AppDbContext db, IOptions<IngestionOptions> options, CancellationToken ct)
    {
        var user = await auth.RequireAsync(context, ct: ct);
        auth.AssertCiPermission(user, "analysis:write");
        var manifest = await ApiJson.ReadAsync<IngestionManifest>(context, ct);
        IngestionValidation.Validate(manifest, options.Value);
        ExecutableProfiles.Validate(manifest);
        if (string.IsNullOrEmpty(manifest.ProjectKey))
        {
            var keys = await auth.AllowedProjectKeysAsync(user, "analysis:write", ct);
            var matches = await db.Set<ProjectIntegration>().Where(x => keys.Contains(x.ProjectKey) && x.RepoUrl == manifest.RepositoryUrl)
                .Select(x => x.ProjectKey).Distinct().Take(2).ToListAsync(ct);
            if (matches.Count != 1) throw new ApiException(422, "Set project_key or configure a unique repository/project association");
            manifest.ProjectKey = matches[0];
        }
        await auth.AssertProjectAccessAsync(user, manifest.ProjectKey, "analysis:write", ct);
        var policy = await db.Set<IngestionProjectPolicy>().FindAsync([manifest.ProjectKey], ct);
        var project = await db.Set<Project>().SingleAsync(x => x.Key == manifest.ProjectKey, ct);
        var profileId = policy?.ProfileId ?? project.AnalysisProfileId;
        var profileVersion = policy?.ProfileVersion ?? project.AnalysisProfileVersion;
        if ((manifest.ProfileId.Length > 0 && manifest.ProfileId != profileId) || (manifest.ProfileVersion.Length > 0 && manifest.ProfileVersion != profileVersion))
            throw new ApiException(422, "Profile does not match project assignment");
        var profile = await ProfileEndpoints.ResolveAsync(db, profileId ?? "", profileVersion ?? "", ct);
        var buildKey = AuthService.Sha256(JsonSerializer.Serialize(new[] { manifest.ProjectKey, manifest.CiProvider, manifest.RepositoryUrl, manifest.BuildId, manifest.CommitSha }));
        manifest.Reports = manifest.Reports.OrderBy(x => x.ReportId, StringComparer.Ordinal).ToList();
        var requestedHash = AuthService.Sha256(JsonSerializer.Serialize(manifest, ApiJson.Options));
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LockAsync(db, buildKey, ct);
        var existing = await db.Set<IngestionRecord>().FirstOrDefaultAsync(x => x.BuildKey == buildKey && x.ManifestHash == requestedHash, ct);
        if (existing is not null) return Results.Ok(await ReceiptAsync(existing, db, ct));
        var previous = await db.Set<IngestionRecord>().Where(x => x.BuildKey == buildKey).OrderByDescending(x => x.Revision).FirstOrDefaultAsync(ct);
        if (previous is not null)
        {
            var old = JsonSerializer.Deserialize<IngestionManifest>(previous.Manifest, ApiJson.Options)!;
            if (old.Branch != manifest.Branch || old.TargetSha != manifest.TargetSha || old.SourceSha != manifest.SourceSha || old.SourceRoot != manifest.SourceRoot)
                throw new ApiException(409, "Build context cannot change between contributions");
            manifest.Reports = old.Reports.Where(x => manifest.Reports.All(y => y.ReportId != x.ReportId)).Concat(manifest.Reports).OrderBy(x => x.ReportId).ToList();
            IngestionValidation.Validate(manifest, options.Value);
        }
        var row = new IngestionRecord { AnalysisId = previous?.AnalysisId ?? Guid.NewGuid().ToString(), ProjectKey = manifest.ProjectKey,
            BuildKey = buildKey, ManifestHash = requestedHash, Manifest = JsonSerializer.Serialize(manifest, ApiJson.Options),
            ProfileSnapshot = JsonSerializer.Serialize(profile, ApiJson.Options), Revision = (previous?.Revision ?? 0) + 1 };
        var codeScope = await CodeScopes.CaptureAsync(db, manifest.ProjectKey, ct);
        CodeScopes.ValidatePublication(manifest, codeScope);
        row.CodeScopeSnapshot = JsonSerializer.Serialize(codeScope, ApiJson.Options);
        row.SecurityReviewSnapshot = await SecurityReviewEvaluation.CaptureAsync(db, row.ProjectKey, manifest.Branch, row.CreatedAt, ct);
        row.ExceptionSnapshot = JsonSerializer.Serialize(await db.Set<ProfileException>().AsNoTracking().Where(x => x.ProjectKey == row.ProjectKey && x.ExpiresAt > row.CreatedAt && x.CreatedAt <= row.CreatedAt).ToListAsync(ct), ApiJson.Options);
        db.Add(row);
        if (previous is null)
        {
            var analysis = new AnalysisRecord
            {
                AnalysisId = row.AnalysisId, ProjectKey = manifest.ProjectKey, CommitSha = manifest.CommitSha, Branch = manifest.Branch,
                CiProvider = manifest.CiProvider, ProviderRunId = manifest.BuildId, RepositoryUrl = manifest.RepositoryUrl,
                Status = "running", QualityGate = "pending", QualityGateSummary = GateEvaluation.Summary("pending", 0),
                CreatedAt = ApiJson.Iso(row.CreatedAt), StartedAt = row.CreatedAt, PrId = manifest.PrId ?? "", PrRepoId = manifest.PrRepoId ?? "",
                PrAdoProject = manifest.PrAdoProject ?? "", PrAdoOrgUrl = manifest.PrAdoOrgUrl ?? "", PrSourceSha = manifest.SourceSha,
                PrTargetSha = manifest.TargetSha, PrDecorationStatus = "queued", DecorationRevision = 1,
            };
            db.Add(analysis);
            db.Add(new DurableJob { Kind = "pr-decoration", ResourceId = $"{analysis.AnalysisId}:1" });
        }
        else
        {
            var analysis = await db.Set<AnalysisRecord>().FindAsync([row.AnalysisId], ct) ?? throw new ApiException(409, "Analysis for the previous contribution is missing");
            analysis.Status = "running"; analysis.QualityGate = "pending"; analysis.QualityGateSummary = GateEvaluation.Summary("pending", 0); analysis.CompletedAt = null;
            analysis.DecorationRevision++; analysis.PrDecorationStatus = "queued";
            db.Add(new DurableJob { Kind = "pr-decoration", ResourceId = $"{analysis.AnalysisId}:{analysis.DecorationRevision}" });
        }
        foreach (var descriptor in manifest.Reports)
        {
            var oldReport = previous is null ? null : await db.Set<IngestionReport>().FindAsync([previous.Id, descriptor.ReportId], ct);
            var received = descriptor.State == "measured" && oldReport?.State == "received" && oldReport.Sha256 == descriptor.Sha256 && !previous!.DetailsPurged;
            db.Add(new IngestionReport { IngestionId = row.Id, ReportId = descriptor.ReportId, Sha256 = descriptor.Sha256, SizeBytes = descriptor.SizeBytes,
                BlobName = received ? oldReport!.BlobName : "", State = received ? "received" : descriptor.State == "measured" ? "expected" : descriptor.State });
        }
        await db.SaveChangesAsync(ct);
        await tx.CommitAsync(ct);
        return Results.Created($"/api/v1/ingestions/{row.Id}", await ReceiptAsync(row, db, ct));
    }

    private static async Task<IResult> UploadAsync(string id, string reportId, HttpContext context, AuthService auth, AppDbContext db, ReportStorage storage, CancellationToken ct)
    {
        var ingestion = await FindAsync(id, context, auth, db, "analysis:write", ct);
        var report = await db.Set<IngestionReport>().FindAsync([id, reportId], ct) ?? throw new ApiException(404, "Report not declared");
        if (report.State == "received") return Results.Ok(new { report_id = reportId, state = "received" });
        if (ingestion.State != "receiving" || report.State != "expected") throw new ApiException(409, "Report is not awaiting upload");
        if (context.Request.ContentLength is { } size && size != report.SizeBytes) throw new ApiException(422, "Content length does not match manifest");
        var name = $"{ingestion.ProjectKey}/{id}/{Guid.NewGuid():N}";
        await storage.UploadAsync(name, context.Request.Body, report.SizeBytes, report.Sha256, ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await LockAsync(db, ingestion.BuildKey, ct);
        await db.Entry(report).ReloadAsync(ct);
        await db.Entry(ingestion).ReloadAsync(ct);
        if (report.State == "received" || ingestion.State != "receiving")
        {
            await storage.DeleteAsync(name, ct);
            if (report.State != "received") throw new ApiException(409, "Ingestion closed during upload");
        }
        else { report.BlobName = name; report.State = "received"; await db.SaveChangesAsync(ct); }
        await tx.CommitAsync(ct);
        return Results.Ok(new { report_id = reportId, state = "received" });
    }
}
