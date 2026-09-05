using CodeInsights.Api.Auth;
using CodeInsights.Api.Contracts;
using CodeInsights.Api.Data;
using CodeInsights.Api.Services;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace CodeInsights.Api.Endpoints;

public static class ProfileEndpoints
{
    public static async Task<ProfileDefinition> ResolveAsync(AppDbContext db, string id, string version, CancellationToken ct)
    {
        var row = await db.Set<ProfileVersion>().FindAsync([id, version], ct);
        if (row is not null) return JsonSerializer.Deserialize<ProfileDefinition>(row.Definition, ApiJson.Options)!;
        if (GateEvaluation.Catalog.TryGetValue(id, out var old) && old.Version == version)
            return new ProfileDefinition { ProfileId = id, Version = version, Stack = id, RequiredTools = old.RequiredTools, RequiredMetrics = old.RequiredMetrics };
        throw new ApiException(422, "Assign a published profile version to the project before importing");
    }
    public static IEndpointRouteBuilder MapProfileEndpoints(this IEndpointRouteBuilder app)
    {
        var routes = app.MapGroup("/api/v1/profiles").RequireAuthorization();
        routes.MapGet("", async (HttpContext context, AuthService auth, AppDbContext db, CancellationToken ct) =>
        {
            var principal = await auth.RequireAsync(context, ct: ct); auth.AssertCiPermission(principal);
            var size = InsightEndpoints.PageSize(context.Request);
            var cursor = InsightEndpoints.DecodeCursor(context.Request, 2);
            var query = db.Set<ProfileVersion>().AsNoTracking();
            if (cursor is not null) { var id = cursor[0]; var version = cursor[1]; query = query.Where(x => string.Compare(x.ProfileId, id) > 0 || x.ProfileId == id && string.Compare(x.Version, version) > 0); }
            var rows = await query.OrderBy(x => x.ProfileId).ThenBy(x => x.Version).Take(size + 1).Select(x => new { x.ProfileId, x.Version, x.Definition }).ToListAsync(ct);
            if (rows.Count > size) { rows.RemoveAt(size); InsightEndpoints.Continuation(context, InsightEndpoints.EncodeCursor(rows[^1].ProfileId, rows[^1].Version)); }
            return Results.Ok(rows.Select(x => JsonSerializer.Deserialize<ProfileDefinition>(x.Definition, ApiJson.Options)));
        });
        routes.MapPost("", async (HttpContext context, AuthService auth, AppDbContext db, AuditService audit, CancellationToken ct) =>
        {
            var user = await auth.RequireAsync(context, "admin", ct);
            var profile = await ApiJson.ReadAsync<ProfileDefinition>(context, ct);
            Validate(profile);
            if (GateEvaluation.Catalog.ContainsKey(profile.ProfileId) || await db.Set<ProfileVersion>().AnyAsync(x => x.ProfileId == profile.ProfileId && x.Version == profile.Version, ct))
                throw new ApiException(409, "Profile versions are immutable; publish a new version");
            db.Add(new ProfileVersion { ProfileId = profile.ProfileId, Version = profile.Version, Definition = JsonSerializer.Serialize(profile, ApiJson.Options) });
            audit.Log(user.Email, user.Role, "profile.publish", "profile", resourceLabel: $"{profile.ProfileId}/{profile.Version}");
            await db.SaveChangesAsync(ct);
            return Results.Created("/api/v1/profiles", profile);
        });
        routes.MapGet("/projects/{key}", async (string key, HttpContext context, AuthService auth, AppDbContext db, CancellationToken ct) =>
        {
            var user = await auth.RequireAsync(context, ct: ct); await auth.AssertProjectAccessAsync(user, key, ct: ct);
            var policy = await db.Set<IngestionProjectPolicy>().FindAsync([key], ct);
            return Results.Json(JsonSerializer.SerializeToElement(policy is null ? null : new ProfileAssignment(policy.ProfileId, policy.ProfileVersion, policy.Enforcement), ApiJson.Options));
        });
        routes.MapPut("/projects/{key}", async (string key, HttpContext context, AuthService auth, AppDbContext db, AuditService audit, CancellationToken ct) =>
        {
            var user = await auth.RequireAsync(context, "admin", ct); await auth.AssertProjectAccessAsync(user, key, "analysis:write", ct);
            var body = await ApiJson.ReadAsync<ProfileAssignment>(context, ct);
            await ResolveAsync(db, body.ProfileId, body.ProfileVersion, ct);
            if (body.Enforcement is not ("informative" or "blocking")) throw new ApiException(422, "Invalid enforcement");
            var row = await db.Set<IngestionProjectPolicy>().FindAsync([key], ct);
            if (row is null) { row = new IngestionProjectPolicy { ProjectKey = key }; db.Add(row); }
            row.ProfileId = body.ProfileId; row.ProfileVersion = body.ProfileVersion; row.Enforcement = body.Enforcement;
            audit.Log(user.Email, user.Role, "profile.assign", "project", resourceLabel: key, details: body);
            await db.SaveChangesAsync(ct); return Results.Ok(body);
        });
        routes.MapGet("/projects/{key}/exceptions", async (string key, HttpContext context, AuthService auth, AppDbContext db, CancellationToken ct) =>
        {
            var user = await auth.RequireAsync(context, ct: ct); await auth.AssertProjectAccessAsync(user, key, ct: ct);
            return Results.Ok(await db.Set<ProfileException>().Where(x => x.ProjectKey == key).OrderByDescending(x => x.CreatedAt).Take(100)
                .Select(x => new { x.Id, x.Tool, x.RuleId, x.Path, x.Reason, x.ExpiresAt }).ToListAsync(ct));
        });
        routes.MapPost("/projects/{key}/exceptions", async (string key, HttpContext context, AuthService auth, AppDbContext db, AuditService audit, CancellationToken ct) =>
        {
            var user = await auth.RequireAsync(context, "admin", ct); await auth.AssertProjectAccessAsync(user, key, "analysis:write", ct);
            var body = await ApiJson.ReadAsync<ExceptionRequest>(context, ct);
            if (string.IsNullOrWhiteSpace(body.Tool) || string.IsNullOrWhiteSpace(body.RuleId) || string.IsNullOrWhiteSpace(body.Reason) || body.Reason.Length > 2000 || body.ExpiresAt <= DateTime.UtcNow || body.Path is not null && !IngestionValidation.SafePath(body.Path)) throw new ApiException(422, "Exception requires tool/rule, reason, future expiry and a safe optional path");
            var row = new ProfileException { ProjectKey = key, Tool = body.Tool, RuleId = body.RuleId, Path = body.Path, Reason = body.Reason, ExpiresAt = body.ExpiresAt.ToUniversalTime() };
            db.Add(row); audit.Log(user.Email, user.Role, "profile.exception", "project", resourceLabel: key, details: body);
            await db.SaveChangesAsync(ct); return Results.Created($"/api/v1/profiles/projects/{key}/exceptions", new { row.Id });
        });
        return app;
    }
    public static void Validate(ProfileDefinition profile)
    {
        string[] metrics = ["bugs", "code_smells", "vulnerabilities", "security_hotspots", "coverage", "dependency_vulnerabilities", "license_violations"];
        if (string.IsNullOrWhiteSpace(profile.ProfileId) || profile.ProfileId.Length > 100 || string.IsNullOrWhiteSpace(profile.Version) || profile.Version.Length > 50
            || profile.RequiredTools is null || profile.RequiredTools.Length is < 1 or > 100 || profile.RequiredTools.Any(string.IsNullOrWhiteSpace)
            || profile.RequiredMetrics is null || profile.RequiredMetrics.Except(metrics).Any() || profile.Rules is null || profile.Rules.Length > 10000
            || profile.Conditions is null || profile.Conditions.Length > 100 || profile.Conditions.Any(c => !metrics.Contains(c.Metric) || c.Operator is not ("min" or "max") || !double.IsFinite(c.Threshold) || c.Threshold < 0)
            || profile.Rules.Any(r => string.IsNullOrWhiteSpace(r.Tool) || string.IsNullOrWhiteSpace(r.RuleId) || r.Category is not ("bug" or "code_smell" or "vulnerability" or "security_hotspot" or "secret" or "unknown"))
            || profile.Rules.Select(r => (r.Tool, r.RuleId)).Distinct().Count() != profile.Rules.Length
            || profile.AllowedLicenses is null || profile.DeniedLicenses is null || profile.AllowedLicenses.Intersect(profile.DeniedLicenses).Any())
            throw new ApiException(422, "Invalid profile definition, dimensions, conditions or licence policy");
    }
}
