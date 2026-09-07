using System.Linq.Expressions;
using System.Text.Json;
using CodeInsights.Api.Auth;
using CodeInsights.Api.Contracts;
using CodeInsights.Api.Data;
using CodeInsights.Api.Services;
using Microsoft.AspNetCore.WebUtilities;
using Microsoft.EntityFrameworkCore;

namespace CodeInsights.Api.Endpoints;

/// <summary>Bounded analysis reads and dashboard aggregates.</summary>
public static class InsightEndpoints
{
    internal static readonly Expression<Func<AnalysisRecord, AnalysisRecord>> Summary =
        x => new AnalysisRecord
        {
            AnalysisId = x.AnalysisId,
            ProjectKey = x.ProjectKey,
            CommitSha = x.CommitSha,
            Branch = x.Branch,
            CiProvider = x.CiProvider,
            ProviderRunId = x.ProviderRunId,
            Status = x.Status,
            QualityGate = x.QualityGate,
            MaintainabilityScore = x.MaintainabilityScore,
            SecurityScore = x.SecurityScore,
            ReliabilityScore = x.ReliabilityScore,
            CodeSmells = x.CodeSmells,
            Vulnerabilities = x.Vulnerabilities,
            SecurityHotspots = x.SecurityHotspots,
            Bugs = x.Bugs,
            Coverage = x.Coverage,
            Duplication = x.Duplication,
            DependencyVulnerabilities = x.DependencyVulnerabilities,
            GateFailures = x.GateFailures,
            CreatedAt = x.CreatedAt,
            PrId = x.PrId,
            PrDecorationStatus = x.PrDecorationStatus,
            Measurements = x.Measurements,
            ToolExecutions = x.ToolExecutions,
            Completeness = x.Completeness,
            ProfileId = x.ProfileId,
            ProfileVersion = x.ProfileVersion,
            FormulaVersion = x.FormulaVersion,
            GateSnapshot = x.GateSnapshot,
            QualityGateSummary = x.QualityGateSummary,
            ErrorCount = x.ErrorCount,
            WarningCount = x.WarningCount,
            InfoCount = x.InfoCount,
            StartedAt = x.StartedAt,
            CompletedAt = x.CompletedAt,
            DetailsPurged = x.DetailsPurged,
        };

    public static IEndpointRouteBuilder MapInsightEndpoints(this IEndpointRouteBuilder app)
    {
        var routes = app.MapGroup("/api/v1/insights").RequireAuthorization();
        routes.MapGet("/analyses", ListAnalysesAsync);
        routes.MapGet("/summary", SummaryAsync);
        routes.MapGet("/branches", BranchesAsync);
        routes.MapGet("/rules", RulesAsync);
        routes.MapGet("/analyses/{id}/findings", FindingsAsync);
        routes.MapGet("/analyses/{id}/findings/export/csv", FindingsExportAsync);
        routes.MapGet("/analyses/{id}/components", ComponentsAsync);
        routes.MapGet(
            "/analyses/{id}/comparison",
            async (
                string id,
                HttpContext context,
                AppDbContext db,
                AuthService auth,
                CancellationToken ct
            ) =>
            {
                var ingestion = await LatestAsync(id, context, db, auth, ct);
                return ingestion == null
                        ? Results.Ok(
                            new { state = "unavailable", reason = "ingestion_unavailable" }
                        )
                    : ingestion.DetailsPurged
                        ? Results.Ok(new { state = "unavailable", reason = "details_purged" })
                    : Results.Json(JsonSerializer.Deserialize<JsonElement>(ingestion.Comparison));
            }
        );
        return app;
    }

    private static async Task<IResult> RulesAsync(
        HttpContext context,
        AppDbContext db,
        AuthService auth,
        CancellationToken ct
    )
    {
        var analyses = await VisibleAsync(context, db, auth, ct);
        var projectKey = context.Request.Query["project_key"].ToString();
        if (projectKey.Length > 0)
            analyses = analyses.Where(analysis => analysis.ProjectKey == projectKey);
        var ids = analyses
            .Where(x =>
                !analyses.Any(y =>
                    y.ProjectKey == x.ProjectKey
                    && (
                        string.Compare(y.CreatedAt, x.CreatedAt) > 0
                        || y.CreatedAt == x.CreatedAt
                            && string.Compare(y.AnalysisId, x.AnalysisId) > 0
                    )
                )
            )
            .Select(x => x.AnalysisId);
        var query = db.Set<FindingOccurrence>()
            .AsNoTracking()
            .Where(x =>
                ids.Contains(x.AnalysisId)
                && !db.Set<IngestionRecord>()
                    .Any(i =>
                        i.AnalysisId == x.AnalysisId
                        && i.CompletedAt != null
                        && i.Id != x.IngestionId
                        && i.Revision
                            > (
                                db.Set<IngestionRecord>()
                                    .Where(j => j.Id == x.IngestionId)
                                    .Select(j => (int?)j.Revision)
                                    .FirstOrDefault()
                                ?? 0
                            )
                    )
            );
        var search = context.Request.Query["search"].ToString().ToLowerInvariant();
        var category = context.Request.Query["category"].ToString();
        var severity = context.Request.Query["severity"].ToString().ToLowerInvariant();
        var language = context.Request.Query["language"].ToString();
        var requestedStatus = context.Request.Query["status"].ToString().ToLowerInvariant();
        if (requestedStatus.Length > 0 && requestedStatus is not ("all" or "enabled" or "disabled" or "unmanaged"))
            throw new ApiException(422, "status must be enabled, disabled or unmanaged");
        if (search.Length > 0)
            query = query.Where(x =>
                x.RuleId.ToLower().Contains(search) || x.Tool.ToLower().Contains(search)
            );
        if (category.Length > 0 && category != "all")
            query = query.Where(x => x.Category == category);
        if (severity.Length > 0 && severity != "all")
            query = query.Where(x => x.Severity.ToLower() == severity);
        ProfileDefinition? profile = null;
        if (projectKey.Length > 0)
        {
            var policy = await db.Set<IngestionProjectPolicy>().AsNoTracking().SingleOrDefaultAsync(item => item.ProjectKey == projectKey, ct);
            if (policy is not null) profile = await ProfileEndpoints.ResolveAsync(db, policy.ProfileId, policy.ProfileVersion, ct);
        }
        var rows = await query
            .GroupBy(x => new
            {
                x.Tool,
                x.RuleId,
                x.Category,
                x.Severity,
            })
            .Select(g => new
            {
                Id = g.Min(x => x.Id),
                g.Key.Tool,
                g.Key.RuleId,
                g.Key.Category,
                g.Key.Severity,
                Occurrences = g.Count(),
                Files = g.Where(x => x.Path != null)
                    .Select(x => x.AnalysisId + ":" + x.Path)
                    .Distinct()
                    .Count(),
                Projects = g.Select(x => x.AnalysisId).Distinct().Count(),
            })
            .OrderBy(x => x.Id)
            .ToListAsync(ct);
        var enriched = rows.Select(row =>
        {
            var catalogue = profile?.RuleCatalog.Where(rule => rule.Tool == row.Tool && rule.RuleId == row.RuleId).ToArray() ?? [];
            var catalogueRule = catalogue.Length == 1 ? catalogue[0] : null;
            var identity = catalogueRule is null ? null : new DisabledRule(catalogueRule.Tool, catalogueRule.ToolVersion, catalogueRule.RuleId);
            var managed = identity is not null && ExecutableProfiles.CanManage(profile!, identity);
            var status = !managed ? "unmanaged" : profile!.DisabledRules.Contains(identity!) ? "disabled" : "enabled";
            return new RuleInsight(row.Id, row.Tool, catalogueRule?.ToolVersion, row.RuleId, row.Category, row.Severity,
                catalogueRule?.Language ?? "Non disponible", row.Occurrences, row.Files, row.Projects, status, profile?.ProfileId, profile?.Version);
        });
        if (language.Length > 0 && language != "all") enriched = enriched.Where(row => row.Language.Equals(language, StringComparison.OrdinalIgnoreCase));
        if (requestedStatus.Length > 0 && requestedStatus != "all") enriched = enriched.Where(row => row.Status == requestedStatus);
        var cursor = NumericCursor(context.Request);
        var size = PageSize(context.Request);
        var page = enriched.Where(row => row.Id > cursor).Take(size + 1).ToList();
        if (page.Count > size)
        {
            page.RemoveAt(size);
            Continuation(context, page[^1].Id.ToString());
        }
        return Results.Ok(
            page.Select(x => new
            {
                key = x.Id.ToString(),
                tool = x.Tool,
                tool_version = x.ToolVersion,
                rule_id = x.RuleId,
                title = $"{x.Tool} · {x.RuleId}",
                category = x.Category,
                severity = x.Severity,
                language = x.Language,
                occurrences = x.Occurrences,
                file_count = x.Files,
                project_count = x.Projects,
                projects = Array.Empty<string>(),
                status = x.Status,
                profile_id = x.ProfileId,
                profile_version = x.ProfileVersion,
            })
        );
    }

    private sealed record RuleInsight(long Id, string Tool, string? ToolVersion, string RuleId, string Category, string Severity,
        string Language, int Occurrences, int Files, int Projects, string Status, string? ProfileId, string? ProfileVersion);

    private static async Task<IngestionRecord?> LatestAsync(
        string id,
        HttpContext context,
        AppDbContext db,
        AuthService auth,
        CancellationToken ct
    )
    {
        await AnalysisEndpoints.FindAsync(id, context, db, auth, ct);
        return await db.Set<IngestionRecord>()
            .AsNoTracking()
            .Where(x => x.AnalysisId == id && x.CompletedAt != null)
            .OrderByDescending(x => x.Revision)
            .FirstOrDefaultAsync(ct);
    }

    private static long NumericCursor(HttpRequest request)
    {
        var cursor = request.Query["cursor"].ToString();
        if (cursor.Length == 0)
            return 0;
        return long.TryParse(cursor, out var value) && value >= 0
            ? value
            : throw new ApiException(422, "Invalid cursor");
    }

    private static async Task<IResult> FindingsAsync(
        string id,
        HttpContext context,
        AppDbContext db,
        AuthService auth,
        CancellationToken ct
    )
    {
        var (ingestion, query) = await FilteredFindingsAsync(id, context, db, auth, ct);
        var cursor = NumericCursor(context.Request);
        var size = PageSize(context.Request);
        var rows = await query
            .Where(x => x.Id > cursor)
            .OrderBy(x => x.Id)
            .Take(size + 1)
            .Select(x => new
            {
                x.Id,
                x.FindingId,
                x.ReportId,
                x.Tool,
                x.OriginalTool,
                x.RuleId,
                x.Severity,
                x.OriginalSeverity,
                x.Category,
                x.Message,
                x.Path,
                x.Line,
                x.Fingerprint,
                x.Excepted,
                x.Evidence,
            })
            .ToListAsync(ct);
        if (rows.Count > size)
        {
            rows.RemoveAt(size);
            Continuation(context, rows[^1].Id.ToString());
        }
        var manifest = ingestion is null
            ? null
            : JsonSerializer.Deserialize<IngestionManifest>(ingestion.Manifest, ApiJson.Options);
        var analysisRecord = await db.Set<AnalysisRecord>().AsNoTracking().SingleAsync(x => x.AnalysisId == id, ct);
        var directAnalysis = ingestion is null ? analysisRecord : null;
        var sourcePaths = (await db.Set<AnalysisSource>().AsNoTracking().Where(x => x.AnalysisId == id && x.State == "received").Select(x => x.Path).ToListAsync(ct)).ToHashSet(StringComparer.Ordinal);
        var directIntegration = directAnalysis is null
            ? null
            : await db.Set<ProjectIntegration>().AsNoTracking().FirstOrDefaultAsync(x => x.ProjectKey == directAnalysis.ProjectKey, ct);
        return Results.Ok(
            rows.Select(x =>
            {
                var evidence = JsonSerializer.Deserialize<FindingEvidence>(
                    x.Evidence,
                    ApiJson.Options
                );
                return new
                {
                    x.Id,
                    x.FindingId,
                    x.Tool,
                    x.OriginalTool,
                    x.RuleId,
                    x.Severity,
                    x.OriginalSeverity,
                    x.Category,
                    x.Message,
                    x.Path,
                    x.Line,
                    x.Fingerprint,
                    x.Excepted,
                    prompt_available = !analysisRecord.DetailsPurged && x.Path is not null && x.Line is not null && sourcePaths.Contains(x.Path.Replace('\\', '/')),
                    prompt_unavailable_reason = analysisRecord.DetailsPurged ? "source_purged" : x.Path is null || x.Line is null ? "location_unavailable" : !sourcePaths.Contains(x.Path.Replace('\\', '/')) ? "source_unavailable" : null,
                    tool_version = manifest
                        ?.Reports.FirstOrDefault(r => r.ReportId == x.ReportId)
                        ?.ToolVersion,
                    commit_sha = manifest?.CommitSha,
                    source_url = evidence?.Locations?.Any(l =>
                        l.Kind == "primary"
                        && l.Path == x.Path
                        && l.Line == x.Line
                        && l.RepositoryRelative
                    ) == true
                        ? FindingEvidenceLinks.AzureDevOpsSource(
                            manifest?.RepositoryUrl,
                            manifest?.CommitSha,
                            x.Path,
                            x.Line
                        )
                        : directAnalysis is not null && directIntegration is not null && x.Path is not null
                            ? AnalysisFindings.RepoFileUrl(
                                directIntegration.RepoProvider,
                                directIntegration.RepoUrl,
                                directAnalysis.CommitSha,
                                x.Path,
                                x.Line,
                                x.Line
                            )
                            : null,
                    evidence = evidence is null
                        ? null
                        : new
                        {
                            evidence.DriverVersion,
                            evidence.DocumentationUrl,
                            evidence.DocumentationSource,
                            evidence.DocumentationVersion,
                            evidence.DocumentationStatus,
                            evidence.LocationsTruncated,
                            locations = (evidence.Locations ?? []).Select(l => new
                            {
                                l.Kind,
                                l.Flow,
                                l.Thread,
                                l.Step,
                                l.Path,
                                l.Line,
                                l.EndLine,
                                l.Column,
                                l.EndColumn,
                                l.RepositoryRelative,
                                source_url = l.RepositoryRelative
                                    ? FindingEvidenceLinks.AzureDevOpsSource(
                                        manifest?.RepositoryUrl,
                                        manifest?.CommitSha,
                                        l.Path,
                                        l.Line
                                    )
                                    : null,
                            }),
                        },
                };
            })
        );
    }

    private static async Task<(IngestionRecord? Ingestion, IQueryable<FindingOccurrence> Query)> FilteredFindingsAsync(
        string id, HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct)
    {
        var ingestion = await LatestAsync(id, context, db, auth, ct);
        if (ingestion?.DetailsPurged == true || await db.Set<AnalysisRecord>().AnyAsync(x => x.AnalysisId == id && x.DetailsPurged, ct))
            throw new ApiException(410, "Analysis details were purged");
        var query = db.Set<FindingOccurrence>().AsNoTracking()
            .Where(x => x.AnalysisId == id && (ingestion == null || x.IngestionId == ingestion.Id));
        var category = context.Request.Query["category"].ToString();
        var severity = context.Request.Query["severity"].ToString();
        var rule = context.Request.Query["rule"].ToString();
        var path = context.Request.Query["path"].ToString();
        if (category.Length > 0 && category != "all")
            query = query.Where(x => x.Category == category);
        if (severity.Length > 0 && severity != "all")
        {
            var values = severity switch
            {
                "blocker" => new[] { "critical", "error", "blocker" },
                "medium" => new[] { "warning", "medium" },
                "low" => new[] { "low", "convention" },
                _ => new[] { severity },
            };
            query = query.Where(x => values.Contains(x.Severity.ToLower()));
        }
        if (rule.Length > 0)
            query = query.Where(x => x.RuleId.ToLower().Contains(rule.ToLower()));
        if (path.Length > 0)
            query = query.Where(x => x.Path != null && x.Path.ToLower().Contains(path.ToLower()));
        var mine = context.Request.Query["mine"] == "true";
        var team = context.Request.Query["team_id"].ToString();
        var state = context.Request.Query["state"].ToString();
        if (mine || team.Length > 0 || state.Length > 0 && state != "all")
        {
            var actor = await auth.RequireAsync(context, "user", ct);
            var findings = CollaborationEndpoints.FilterState(
                db.Set<DurableFinding>().AsNoTracking(),
                state
            );
            if (mine)
                findings = findings.Where(x => x.AssigneeUserId == actor.Sub);
            if (team.Length > 0)
                findings = findings.Where(x => x.TeamId == team);
            query = query.Where(x => findings.Any(f => f.Id == x.FindingId));
        }
        return (ingestion, query);
    }

    private static async Task<IResult> FindingsExportAsync(
        string id, HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct)
    {
        var (ingestion, query) = await FilteredFindingsAsync(id, context, db, auth, ct);
        var rows = await query.OrderBy(finding => finding.Id).ToListAsync(ct);
        var manifest = ingestion is null ? null : JsonSerializer.Deserialize<IngestionManifest>(ingestion.Manifest, ApiJson.Options);
        var prefix = id[..Math.Min(id.Length, 8)];
        return Results.File(ExportService.FindingsCsv(rows, manifest), "text/csv", $"issues-{prefix}.csv");
    }

    private static async Task<IResult> ComponentsAsync(
        string id,
        HttpContext context,
        AppDbContext db,
        AuthService auth,
        CancellationToken ct
    )
    {
        var ingestion = await LatestAsync(id, context, db, auth, ct);
        if (ingestion?.DetailsPurged == true)
            throw new ApiException(410, "Analysis details were purged");
        var cursor = NumericCursor(context.Request);
        var size = PageSize(context.Request);
        var rows = await db.Set<SbomComponent>()
            .AsNoTracking()
            .Where(x =>
                x.AnalysisId == id
                && (ingestion == null || x.IngestionId == ingestion.Id)
                && x.Id > cursor
            )
            .OrderBy(x => x.Id)
            .Take(size + 1)
            .Select(x => new
            {
                x.Id,
                x.Reference,
                x.Name,
                x.Version,
                x.Purl,
                x.Ecosystem,
                x.Licenses,
                x.Relationship,
                x.LicenseDecision,
                x.Vulnerabilities,
                x.Dependencies,
                x.Source,
                x.ObservedAt,
            })
            .ToListAsync(ct);
        if (rows.Count > size)
        {
            rows.RemoveAt(size);
            Continuation(context, rows[^1].Id.ToString());
        }
        return Results.Ok(
            rows.Select(x => new
            {
                x.Id,
                x.Reference,
                x.Name,
                x.Version,
                x.Purl,
                x.Ecosystem,
                licenses = JsonSerializer.Deserialize<JsonElement>(x.Licenses),
                x.Relationship,
                x.LicenseDecision,
                vulnerabilities = JsonSerializer.Deserialize<JsonElement>(x.Vulnerabilities),
                dependencies = JsonSerializer.Deserialize<JsonElement>(x.Dependencies),
                x.Source,
                x.ObservedAt,
            })
        );
    }

    public static int PageSize(HttpRequest request)
    {
        var value = request.Query["limit"].ToString();
        if (value.Length == 0)
            return 50;
        if (!int.TryParse(value, out var size) || size < 1 || size > 100)
            throw new ApiException(422, "limit must be between 1 and 100");
        return size;
    }

    private static async Task<IResult> BranchesAsync(
        HttpContext context,
        AppDbContext db,
        AuthService auth,
        CancellationToken ct
    )
    {
        if (string.IsNullOrWhiteSpace(context.Request.Query["project_key"]))
            throw new ApiException(422, "project_key is required");
        var query = await VisibleAsync(context, db, auth, ct);
        var cursor = DecodeCursor(context.Request, 1)?[0];
        var size = PageSize(context.Request);
        var prefix = context.Request.Query["prefix"].ToString();
        if (prefix.Length > 0)
            query = query.Where(x => x.Branch.StartsWith(prefix));
        var names = await query
            .Select(x => x.Branch)
            .Distinct()
            .Where(x => cursor == null || string.Compare(x, cursor) > 0)
            .OrderBy(x => x)
            .Take(size + 1)
            .ToListAsync(ct);
        if (names.Count > size)
        {
            names.RemoveAt(size);
            Continuation(context, EncodeCursor(names[^1]));
        }
        var counts = await query
            .Where(x => names.Contains(x.Branch))
            .GroupBy(x => x.Branch)
            .Select(g => new { Name = g.Key, Count = g.Count() })
            .ToListAsync(ct);
        var latest = await query
            .Where(x =>
                names.Contains(x.Branch)
                && !query.Any(y =>
                    y.Branch == x.Branch
                    && (
                        string.Compare(y.CreatedAt, x.CreatedAt) > 0
                        || y.CreatedAt == x.CreatedAt
                            && string.Compare(y.AnalysisId, x.AnalysisId) > 0
                    )
                )
            )
            .Select(Summary)
            .ToListAsync(ct);
        return Results.Ok(
            counts
                .OrderBy(x => x.Name)
                .Select(x => new
                {
                    name = x.Name,
                    count = x.Count,
                    latest = latest
                        .Where(y => y.Branch == x.Name)
                        .Select(y => GateEvaluation.ToResponse(y, false))
                        .FirstOrDefault(),
                })
        );
    }

    public static string EncodeCursor(params string[] values) =>
        WebEncoders.Base64UrlEncode(JsonSerializer.SerializeToUtf8Bytes(values));

    public static string[]? DecodeCursor(HttpRequest request, int count)
    {
        var cursor = request.Query["cursor"].ToString();
        if (cursor.Length == 0)
            return null;
        try
        {
            var parts = JsonSerializer.Deserialize<string[]>(WebEncoders.Base64UrlDecode(cursor));
            return parts?.Length == count && parts.All(x => !string.IsNullOrEmpty(x))
                ? parts
                : throw new ApiException(422, "Invalid cursor");
        }
        catch (Exception e) when (e is FormatException or JsonException)
        {
            throw new ApiException(422, "Invalid cursor");
        }
    }

    public static void Continuation(HttpContext context, string? cursor)
    {
        if (cursor == null)
            return;
        context.Response.Headers["X-Next-Cursor"] = cursor;
        var query = context.Request.Query.ToDictionary(
            x => x.Key,
            x => (string?)x.Value.ToString()
        );
        query["cursor"] = cursor;
        context.Response.Headers.Link =
            $"<{QueryHelpers.AddQueryString(context.Request.PathBase + context.Request.Path, query)}>; rel=\"next\"";
    }

    public static async Task<IResult> ListAnalysesAsync(
        HttpContext context,
        AppDbContext db,
        AuthService auth,
        CancellationToken ct
    )
    {
        var query = await VisibleAsync(context, db, auth, ct);
        var size = PageSize(context.Request);
        var cursor = context.Request.Query["cursor"].ToString();
        if (cursor.Length > 0)
        {
            string[] parts;
            try
            {
                parts =
                    JsonSerializer.Deserialize<string[]>(WebEncoders.Base64UrlDecode(cursor)) ?? [];
            }
            catch (Exception e) when (e is FormatException or JsonException)
            {
                throw new ApiException(422, "Invalid cursor");
            }
            if (parts.Length != 2 || parts.Any(string.IsNullOrEmpty))
                throw new ApiException(422, "Invalid cursor");
            var date = parts[0];
            var id = parts[1];
            query = query.Where(x =>
                string.Compare(x.CreatedAt, date) < 0
                || x.CreatedAt == date && string.Compare(x.AnalysisId, id) < 0
            );
        }
        var rows = await query
            .OrderByDescending(x => x.CreatedAt)
            .ThenByDescending(x => x.AnalysisId)
            .Select(Summary)
            .Take(size + 1)
            .ToListAsync(ct);
        if (rows.Count > size)
        {
            rows.RemoveAt(size);
            Continuation(
                context,
                WebEncoders.Base64UrlEncode(
                    JsonSerializer.SerializeToUtf8Bytes(
                        new[] { rows[^1].CreatedAt, rows[^1].AnalysisId }
                    )
                )
            );
        }
        return Results.Ok(rows.Select(x => GateEvaluation.ToResponse(x, false)));
    }

    private static async Task<IQueryable<AnalysisRecord>> VisibleAsync(
        HttpContext context,
        AppDbContext db,
        AuthService auth,
        CancellationToken ct,
        Principal? principal = null
    )
    {
        var user = principal ?? await auth.RequireAsync(context, ct: ct);
        var visible = await auth.AllowedProjectKeysAsync(user, ct: ct);
        var key = context.Request.Query["project_key"].ToString();
        if (key.Length > 0)
            await auth.AssertProjectAccessAsync(user, key, ct: ct);
        var query = db.Set<AnalysisRecord>()
            .AsNoTracking()
            .Where(x => visible.Contains(x.ProjectKey));
        if (key.Length > 0)
            query = query.Where(x => x.ProjectKey == key);
        var branch = context.Request.Query["branch"].ToString();
        if (branch.Length > 0)
            query = query.Where(x => x.Branch == branch);
        var scope = context.Request.Query["scope"].ToString();
        if (scope.Length > 0 && scope != "overall")
            throw new ApiException(422, "Use the comparison endpoint for New Code");
        foreach (var field in new[] { "from", "to" })
        {
            var date = context.Request.Query[field].ToString();
            if (date.Length == 0)
                continue;
            if (!DateTimeOffset.TryParse(date, out var parsed))
            {
                throw new ApiException(422, "Invalid date filter");
            }
            var normalized = parsed.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.ffffffzzz");
            query =
                field == "from"
                    ? query.Where(x => string.Compare(x.CreatedAt, normalized) >= 0)
                    : query.Where(x => string.Compare(x.CreatedAt, normalized) <= 0);
        }
        return query;
    }

    private static async Task<IResult> SummaryAsync(
        HttpContext context,
        AppDbContext db,
        AuthService auth,
        CancellationToken ct
    )
    {
        var principal = await auth.RequireAsync(context, ct: ct);
        var query = await VisibleAsync(context, db, auth, ct, principal);
        var size = PageSize(context.Request);
        var favoritesOnly = context.Request.Query["favorites_only"].ToString().ToLowerInvariant() switch
        {
            "" or "false" or "0" or "no" or "off" => false,
            "true" or "1" or "yes" or "on" => true,
            _ => throw new ApiException(422, "Invalid favorites_only filter"),
        };
        var cursor = DecodeCursor(context.Request, 2);
        bool? cursorFavorite = cursor?[0] switch
        {
            null => null,
            "1" => true,
            "0" => false,
            _ => throw new ApiException(422, "Invalid cursor"),
        };
        var cursorKey = cursor?[1] ?? string.Empty;
        var analysisProjectKeys = query.Select(x => x.ProjectKey).Distinct();
        var projectQuery = db.Set<Project>()
            .AsNoTracking()
            .Where(x => analysisProjectKeys.Contains(x.Key))
            .Select(x => new
            {
                ProjectKey = x.Key,
                IsFavorite = principal.Kind == "user"
                    && db.Set<UserProjectFavorite>()
                        .Any(f => f.UserId == principal.Sub && f.ProjectId == x.Id),
            });
        if (favoritesOnly)
            projectQuery = projectQuery.Where(x => x.IsFavorite);
        if (cursorFavorite.HasValue)
            projectQuery = cursorFavorite.Value
                ? projectQuery.Where(x => !x.IsFavorite || string.Compare(x.ProjectKey, cursorKey) > 0)
                : projectQuery.Where(x => !x.IsFavorite && string.Compare(x.ProjectKey, cursorKey) > 0);
        var projects = await projectQuery
            .OrderByDescending(x => x.IsFavorite)
            .ThenBy(x => x.ProjectKey)
            .Take(size + 1)
            .ToListAsync(ct);
        string? next = null;
        if (projects.Count > size)
        {
            projects.RemoveAt(size);
            next = EncodeCursor(projects[^1].IsFavorite ? "1" : "0", projects[^1].ProjectKey);
            Continuation(context, next);
        }
        var projectKeys = projects.Select(x => x.ProjectKey).ToArray();
        var favoriteKeys = projects
            .Where(x => x.IsFavorite)
            .Select(x => x.ProjectKey)
            .ToHashSet();
        query = query.Where(x => projectKeys.Contains(x.ProjectKey));
        var counts = await query
            .GroupBy(x => x.ProjectKey)
            .Select(g => new
            {
                ProjectKey = g.Key,
                Count = g.Count(),
                BranchCount = g.Select(x => x.Branch).Distinct().Count(),
                Pass = g.Count(x => x.QualityGate == "pass"),
                Fail = g.Count(x => x.QualityGate == "fail"),
                Unknown = g.Count(x => x.QualityGate == "unknown"),
            })
            .ToListAsync(ct);
        var latest = await query
            .Where(x =>
                !query.Any(y =>
                    y.ProjectKey == x.ProjectKey
                    && (
                        string.Compare(y.CreatedAt, x.CreatedAt) > 0
                        || y.CreatedAt == x.CreatedAt
                            && string.Compare(y.AnalysisId, x.AnalysisId) > 0
                    )
                )
            )
            .Select(Summary)
            .ToListAsync(ct);
        var latestIds = latest.Select(x => x.AnalysisId).ToArray();
        var severityRows = await db.Set<FindingOccurrence>()
            .AsNoTracking()
            .Where(x =>
                latestIds.Contains(x.AnalysisId)
                && !db.Set<IngestionRecord>()
                    .Any(i =>
                        i.AnalysisId == x.AnalysisId
                        && i.CompletedAt != null
                        && i.Id != x.IngestionId
                        && i.Revision
                            > (
                                db.Set<IngestionRecord>()
                                    .Where(j => j.Id == x.IngestionId)
                                    .Select(j => (int?)j.Revision)
                                    .FirstOrDefault()
                                ?? 0
                            )
                    )
            )
            .GroupBy(x => new { x.AnalysisId, x.Severity })
            .Select(g => new
            {
                g.Key.AnalysisId,
                g.Key.Severity,
                Count = g.Count(),
            })
            .ToListAsync(ct);
        var issueCounts = severityRows
            .GroupBy(x => x.AnalysisId)
            .ToDictionary(
                group => group.Key,
                group =>
                    group
                        .GroupBy(x => AnalysisFindings.SeverityBucket(x.Severity))
                        .ToDictionary(bucket => bucket.Key, bucket => bucket.Sum(x => x.Count))
            );
        return Results.Ok(
            new
            {
                next_cursor = next,
                projects = counts
                    .Select(g => new
                    {
                        project_key = g.ProjectKey,
                        is_favorite = favoriteKeys.Contains(g.ProjectKey),
                        total_count = g.Count,
                        pass_count = g.Pass,
                        fail_count = g.Fail,
                        unknown_count = g.Unknown,
                        latest = latest
                            .Where(x => x.ProjectKey == g.ProjectKey)
                            .Select(x => GateEvaluation.ToResponse(x, false))
                            .FirstOrDefault(),
                        issue_counts = latest
                            .Where(x => x.ProjectKey == g.ProjectKey)
                            .Select(x => issueCounts.GetValueOrDefault(x.AnalysisId, []))
                            .FirstOrDefault()
                            ?? [],
                        branch_count = g.BranchCount,
                        // ponytail: branch details are read only through their separately bounded endpoint.
                        branches_truncated = g.BranchCount > 0,
                        branches = Array.Empty<object>(),
                    })
                    .OrderByDescending(x => x.is_favorite)
                    .ThenBy(x => x.project_key),
            }
        );
    }
}
