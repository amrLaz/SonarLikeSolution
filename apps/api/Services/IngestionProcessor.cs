using CodeInsights.Api.Auth;
using CodeInsights.Api.Contracts;
using CodeInsights.Api.Data;
using CodeInsights.Api.Endpoints;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using System.Text.Json;

namespace CodeInsights.Api.Services;

public sealed class IngestionProcessor(AppDbContext db, ReportStorage storage, IOptions<IngestionOptions> options)
{
    public async Task ProcessAsync(string id, string leaseOwner, CancellationToken ct)
    {
        var row = await db.Set<IngestionRecord>().SingleAsync(x => x.Id == id, ct);
        if (row.State == "completed") return;
        var manifest = JsonSerializer.Deserialize<IngestionManifest>(row.Manifest, ApiJson.Options)!;
        var profile = JsonSerializer.Deserialize<ProfileDefinition>(row.ProfileSnapshot, ApiJson.Options)!;
        var reports = await db.Set<IngestionReport>().Where(x => x.IngestionId == id).ToListAsync(ct);
        var findings = new List<FindingOccurrence>(); var components = new List<SbomComponent>();
        var coverage = new Dictionary<(string Path, int Line), bool>();
        var exceptions = JsonSerializer.Deserialize<List<ProfileException>>(row.ExceptionSnapshot, ApiJson.Options) ?? [];
        var coverageMeasured = false;
        var assessedSboms = 0;
        foreach (var descriptor in manifest.Reports.Where(x => x.State == "measured"))
        {
            var report = reports.Single(x => x.ReportId == descriptor.ReportId);
            if (report.State != "received") throw new InvalidDataException("Finalized report was not received");
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeout.CancelAfter(TimeSpan.FromSeconds(options.Value.ParseTimeoutSeconds));
            await using var stream = await storage.OpenAsync(report.BlobName, timeout.Token);
            ImportedReport imported;
            try { imported = await ReportImports.ParseAsync(stream, descriptor.Format, descriptor.FormatVersion, descriptor.Tool, timeout.Token); }
            catch (InvalidDataException ex)
            {
                report.Error = ex.Message[..Math.Min(ex.Message.Length, 500)];
                await db.SaveChangesAsync(ct);
                throw;
            }
            coverageMeasured |= descriptor.Format is "cobertura" or "lcov";
            if (imported.VulnerabilityAssessmentMeasured == true) assessedSboms++;
            if ((long)findings.Count + components.Count + coverage.Count + imported.Findings.Count + imported.Components.Count + imported.Coverage.Count > 250_000)
                throw new InvalidDataException("Publication exceeds the 250000 normalized-entry limit");
            foreach (var f in imported.Findings)
            {
                var category = profile.Rules.FirstOrDefault(x => x.Tool == descriptor.Tool && x.RuleId == f.RuleId)?.Category ?? f.Category;
                findings.Add(new FindingOccurrence { IngestionId = id, AnalysisId = row.AnalysisId, ReportId = descriptor.ReportId, Tool = descriptor.Tool, OriginalTool = f.Tool, RuleId = f.RuleId,
                    Severity = f.Severity, OriginalSeverity = f.OriginalSeverity, Category = category, Message = f.Message, Path = f.Path, Line = f.Line, Fingerprint = f.Fingerprint,
                    Excepted = exceptions.Any(x => x.Tool == descriptor.Tool && x.RuleId == f.RuleId && (x.Path is null || x.Path == f.Path)) });
            }
            foreach (var c in imported.Coverage) coverage[(c.Path, c.Line)] = coverage.GetValueOrDefault((c.Path, c.Line)) || c.Covered;
            foreach (var c in imported.Components)
            {
                var decision = c.Licenses.Any(profile.DeniedLicenses.Contains) ? "denied" : c.Licenses.Count > 0 && c.Licenses.All(profile.AllowedLicenses.Contains) ? "allowed" : "review";
                components.Add(new SbomComponent { IngestionId = id, AnalysisId = row.AnalysisId, ReportId = descriptor.ReportId, Reference = c.Reference, Name = c.Name,
                    Version = c.Version, Purl = c.Purl, Ecosystem = c.Ecosystem, Licenses = JsonSerializer.Serialize(c.Licenses, ApiJson.Options), Relationship = c.Relationship,
                    LicenseDecision = decision, Source = descriptor.Tool + "/" + descriptor.ToolVersion,
                    Vulnerabilities = JsonSerializer.Serialize(imported.Vulnerabilities.Where(x => x.ComponentReference == c.Reference), ApiJson.Options),
                    Dependencies = JsonSerializer.Serialize(imported.Dependencies.Where(x => x.From == c.Reference), ApiJson.Options) });
            }
        }
        var completeTools = profile.RequiredTools.All(t => manifest.Reports.Any(r => r.Tool == t && r.State == "measured") && manifest.Reports.Where(r => r.Tool == t).All(r => r.State == "measured"));
        var metrics = new Dictionary<string, double?>();
        foreach (var (metric, category) in new[] { ("bugs", "bug"), ("code_smells", "code_smell"), ("vulnerabilities", "vulnerability"), ("security_hotspots", "security_hotspot") })
            metrics[metric] = completeTools && manifest.Reports.Where(r => r.Format == "sarif").All(r => r.State == "measured") && profile.Rules.Any(r => r.Category == category) ? findings.Count(f => !f.Excepted && f.Category == category) : null;
        metrics["coverage"] = coverageMeasured && coverage.Count > 0 && manifest.Reports.Where(r => r.Format is "cobertura" or "lcov").All(r => r.State == "measured") ? 100.0 * coverage.Count(x => x.Value) / coverage.Count : null;
        var sboms = manifest.Reports.Where(r => r.Format is "cyclonedx" or "spdx").ToArray();
        metrics["dependency_vulnerabilities"] = assessedSboms > 0 && assessedSboms == sboms.Length && completeTools ? components.Sum(c => JsonSerializer.Deserialize<JsonElement>(c.Vulnerabilities).GetArrayLength()) : null;
        metrics["license_violations"] = components.Count > 0 && sboms.All(r => r.State == "measured") && components.All(c => c.LicenseDecision != "review") ? components.Count(c => c.LicenseDecision == "denied") : null;
        var metricStates = metrics.ToDictionary(x => x.Key, x =>
        {
            var sources = manifest.Reports.Where(r => x.Key switch
            {
                "coverage" => r.Format is "cobertura" or "lcov",
                "dependency_vulnerabilities" or "license_violations" => r.Format is "cyclonedx" or "spdx",
                _ => r.Format == "sarif"
            }).ToArray();
            return sources.Any(r => r.State == "failed") ? "failed" : sources.Any(r => r.State == "absent") ? "absent"
                : x.Value is not null ? "measured" : sources.Length == 0 && profile.RequiredMetrics.Contains(x.Key) ? "absent" : "not_measured";
        });
        var complete = completeTools && profile.RequiredMetrics.All(m => metrics.GetValueOrDefault(m) is not null) && !manifest.Reports.Any(r => r.State is "failed" or "absent");
        var conditions = profile.Conditions.Select(c => new { metric = c.Metric, @operator = c.Operator == "max" ? "<=" : ">=", required = true, threshold = c.Threshold, value = metrics.GetValueOrDefault(c.Metric), state = metricStates.GetValueOrDefault(c.Metric, "not_measured"),
            result = metrics.GetValueOrDefault(c.Metric) is not { } value ? "unknown" : (c.Operator == "max" ? value <= c.Threshold : value >= c.Threshold) ? "pass" : "fail", provenance = "normalized-reports/v1" }).ToArray();
        row.QualityGate = conditions.Any(x => x.result == "fail") ? "fail" : !complete || conditions.Length == 0 || conditions.Any(x => x.result == "unknown") ? "unknown" : "pass";
        row.TechnicalState = complete ? "complete" : "incomplete";
        row.GateSnapshot = JsonSerializer.Serialize(new { formula_version = "imports/1", profile.ProfileId, profile_version = profile.Version, conditions, metrics, exceptions = exceptions.Select(x => new { x.Id, x.Tool, x.RuleId, x.Path, x.Reason, x.ExpiresAt }), technical_state = row.TechnicalState == "complete" ? "success" : row.TechnicalState }, ApiJson.Options);
        row.Comparison = await CompareAsync(row, manifest, findings, coverage, completeTools, ct);
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await IngestionEndpoints.LockAsync(db, row.BuildKey, ct);
        if (!await db.Set<DurableJob>().AnyAsync(x => x.ResourceId == id && x.Kind == "ingest" && x.LeaseOwner == leaseOwner && x.LeaseUntil > DateTime.UtcNow, ct)) throw new OperationCanceledException("Job lease lost");
        await db.Set<FindingOccurrence>().Where(x => x.IngestionId == id).ExecuteDeleteAsync(ct);
        await db.Set<CoverageLine>().Where(x => x.IngestionId == id).ExecuteDeleteAsync(ct);
        await db.Set<SbomComponent>().Where(x => x.IngestionId == id).ExecuteDeleteAsync(ct);
        // ponytail: one report is capped at 250k normalized entries; bulk COPY is the upgrade path if measured import latency requires it.
        db.AddRange(findings); db.AddRange(components);
        db.AddRange(coverage.Select(c => new CoverageLine { IngestionId = id, Path = c.Key.Path, Line = c.Key.Line, Covered = c.Value }));
        row.State = "completed"; row.CompletedAt = DateTime.UtcNow; row.Error = "";
        var later = await db.Set<IngestionRecord>().AnyAsync(x => x.AnalysisId == row.AnalysisId && x.Revision > row.Revision && x.State == "completed", ct);
        if (!later)
        {
            var analysis = await db.Set<AnalysisRecord>().FindAsync([row.AnalysisId], ct);
            if (analysis is null) { analysis = new AnalysisRecord { AnalysisId = row.AnalysisId, CreatedAt = ApiJson.Iso(row.CreatedAt) }; db.Add(analysis); }
            analysis.ProjectKey = row.ProjectKey; analysis.Branch = manifest.Branch; analysis.CommitSha = manifest.CommitSha; analysis.CiProvider = manifest.CiProvider;
            analysis.Status = "completed"; analysis.QualityGate = row.QualityGate; analysis.Completeness = complete ? "complete" : "incomplete";
            analysis.ProfileId = profile.ProfileId; analysis.ProfileVersion = profile.Version; analysis.FormulaVersion = "imports/1"; analysis.GateSnapshot = row.GateSnapshot;
            analysis.Bugs = Int("bugs"); analysis.CodeSmells = Int("code_smells"); analysis.Vulnerabilities = Int("vulnerabilities"); analysis.SecurityHotspots = Int("security_hotspots");
            analysis.Coverage = Int("coverage"); analysis.DependencyVulnerabilities = Int("dependency_vulnerabilities");
            analysis.Measurements = JsonSerializer.Serialize(metrics.ToDictionary(x => x.Key, x => new MeasurementValue(metricStates[x.Key], x.Value is { } number ? checked((int)number) : null, "normalized-reports", "imports/1")), ApiJson.Options);
            analysis.ToolExecutions = JsonSerializer.Serialize(manifest.Reports.Select(r => new { tool = r.Tool, version = r.ToolVersion, status = r.State == "measured" ? "success" : r.State }), ApiJson.Options);
            analysis.GateFailures = JsonSerializer.Serialize(conditions.Where(x => x.result != "pass").Select(x => $"{x.metric}: {x.value?.ToString() ?? "not measured"} {x.@operator} {x.threshold} ({x.result})"));
            analysis.PrId = manifest.PrId; analysis.PrRepoId = manifest.PrRepoId; analysis.PrAdoProject = manifest.PrAdoProject; analysis.PrTargetBranch = "";
            await FindingCollaboration.ObserveAsync(db, analysis, findings, ct);
            db.Add(new DurableJob { Kind = "ado", ResourceId = id });
            var channels = await db.Set<NotificationChannel>().Where(x => x.Enabled && (row.QualityGate == "fail" && x.OnFail || row.QualityGate == "pass" && x.OnPass)).Select(x => x.Id).ToListAsync(ct);
            foreach (var channel in channels) db.Add(new DurableJob { Kind = "notification", ResourceId = id + ":" + channel });
        }
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
        int? Int(string key) => metrics[key] is { } value ? checked((int)value) : null;
    }

    private async Task<string> CompareAsync(IngestionRecord row, IngestionManifest manifest, List<FindingOccurrence> current, Dictionary<(string Path, int Line), bool> coverage, bool completeTools, CancellationToken ct)
    {
        string Unavailable(string reason) => JsonSerializer.Serialize(new { state = "unavailable", reason });
        if (manifest.GitDiff.State != "available" || manifest.GitDiff.BaseSha != manifest.TargetSha || manifest.GitDiff.HeadSha != manifest.CommitSha) return Unavailable("git_history_unavailable");
        var candidates = from i in db.Set<IngestionRecord>().AsNoTracking() join a in db.Set<AnalysisRecord>() on i.AnalysisId equals a.AnalysisId
            where i.ProjectKey == row.ProjectKey && a.CommitSha == manifest.TargetSha && i.State == "completed" && i.TechnicalState == "complete"
            orderby i.CreatedAt descending, i.Revision descending select i;
        IngestionRecord? baseline = null;
        IngestionManifest? baselineManifest = null;
        await foreach (var candidate in candidates.AsAsyncEnumerable().WithCancellation(ct))
        {
            var origin = JsonSerializer.Deserialize<IngestionManifest>(candidate.Manifest, ApiJson.Options);
            if (origin is null || origin.CommitSha != manifest.TargetSha || !string.Equals(origin.RepositoryUrl.TrimEnd('/'), manifest.RepositoryUrl.TrimEnd('/'), StringComparison.OrdinalIgnoreCase)) continue;
            baseline = candidate; baselineManifest = origin; break;
        }
        if (baseline is null) return Unavailable("baseline_absent");
        if (baseline.DetailsPurged) return Unavailable("baseline_details_purged");
        if (baseline.ProfileSnapshot != row.ProfileSnapshot) return Unavailable("profiles_incompatible");
        if (!completeTools || manifest.Reports.Any(x => x.State != "measured") || baselineManifest!.Reports.Any(x => x.State != "measured")) return Unavailable("producers_incomplete");
        static HashSet<(string Tool, string Version, string Format, string FormatVersion)> Producers(IngestionManifest m) => m.Reports.Select(x => (x.Tool, x.ToolVersion, x.Format, x.FormatVersion)).ToHashSet();
        if (!Producers(manifest).SetEquals(Producers(baselineManifest))) return Unavailable("producers_incompatible");
        var old = await db.Set<FindingOccurrence>().AsNoTracking().Where(x => x.IngestionId == baseline.Id && !x.Excepted).ToListAsync(ct);
        return Compare(manifest.GitDiff, old, current, coverage, baseline.Id);
    }

    public static string Compare(GitDiff diff, List<FindingOccurrence> old, List<FindingOccurrence> current, Dictionary<(string Path, int Line), bool> coverage, string baselineId)
    {
        old = old.Where(x => !x.Excepted).ToList();
        current = current.Where(x => !x.Excepted).ToList();
        var files = diff.Files.ToDictionary(x => x.Path, StringComparer.Ordinal);
        var byFingerprint = old.Where(x => !string.IsNullOrEmpty(x.Fingerprint)).ToLookup(x => (x.Tool, x.RuleId, x.Fingerprint));
        // ponytail: a single rule/file with many un-fingerprinted findings remains quadratic; add a mapped-line index if benchmarks require it.
        var byPath = old.ToLookup(x => (x.Tool, x.RuleId, x.Path));
        var used = new HashSet<long>(); var ambiguous = new HashSet<long>(); var states = new List<object>();
        int added = 0, persistent = 0, indeterminate = 0;
        foreach (var finding in current)
        {
            var file = finding.Path is null ? null : files.GetValueOrDefault(finding.Path);
            var samePath = byPath[(finding.Tool, finding.RuleId, file?.OldPath ?? finding.Path)].ToList();
            var candidates = !string.IsNullOrEmpty(finding.Fingerprint) ? byFingerprint[(finding.Tool, finding.RuleId, finding.Fingerprint)].ToList() : [];
            if (candidates.Count == 0)
                candidates = samePath.Where(f => f.Message == finding.Message &&
                    (string.IsNullOrEmpty(f.Fingerprint) || string.IsNullOrEmpty(finding.Fingerprint) || f.Fingerprint == finding.Fingerprint) &&
                    (file is null ? f.Line == finding.Line : f.Line is { } line && file.LineMap.GetValueOrDefault(line.ToString()) == finding.Line)).ToList();
            string state;
            if (candidates.Count == 1 && used.Add(candidates[0].Id)) { state = "persistent"; persistent++; }
            else if (candidates.Count == 0 && finding.Line is { } n && file?.AddedLines.Contains(n) == true
                && !samePath.Any(f => f.Message == finding.Message && (string.IsNullOrEmpty(f.Fingerprint) || string.IsNullOrEmpty(finding.Fingerprint)))) { state = "new"; added++; }
            else
            {
                state = "indeterminate"; indeterminate++;
                // Missing location evidence must not turn the possible prior occurrence into a resolution.
                foreach (var candidate in candidates.Count > 0 ? candidates : samePath) ambiguous.Add(candidate.Id);
            }
            // Summary comparison is bounded; finding detail remains in its paginated endpoint.
            if (states.Count < 100) states.Add(new { finding.Tool, finding.RuleId, finding.Path, finding.Line, state });
        }
        var resolved = old.Count(f => !used.Contains(f.Id) && !ambiguous.Contains(f.Id));
        var changedLines = diff.Files.SelectMany(f => f.AddedLines.Select(line => (f.Path, Line: line))).ToHashSet();
        var lines = coverage.Where(c => changedLines.Contains(c.Key)).ToList();
        return JsonSerializer.Serialize(new { state = "available", baseline_id = baselineId, new_count = added, persistent_count = persistent, resolved_count = resolved,
            indeterminate_count = indeterminate, coverage = lines.Count == 0 ? (double?)null : 100.0 * lines.Count(x => x.Value) / lines.Count, findings = states, findings_truncated = current.Count > states.Count }, ApiJson.Options);
    }
}
