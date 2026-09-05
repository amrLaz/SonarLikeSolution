using System.Text.Json;
using CodeInsights.Api.Auth;
using CodeInsights.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace CodeInsights.Api.Services;

/// <summary>Preserves human decisions independently of scanner occurrences and report retention.</summary>
public static class FindingCollaboration
{
    public static string Identity(string project, string branch, FindingOccurrence finding, bool fingerprintIsUnique = true) =>
        AuthService.Sha256(JsonSerializer.Serialize(new object?[] { "finding/1", project, branch, finding.Tool, finding.RuleId,
            fingerprintIsUnique && !string.IsNullOrEmpty(finding.Fingerprint) ? new object?[] { "fingerprint", finding.Fingerprint }
                : new object?[] { "exact_location", finding.Path, finding.Line, finding.Message } }));

    public static Task<int> LockAsync(AppDbContext db, string project, string branch, CancellationToken ct) =>
        db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({"collaboration:" + JsonSerializer.Serialize(new[] { project, branch })}, 0))", ct);

    /// <summary>Caller owns the analysis transaction. Missing findings never imply resolution.</summary>
    public static async Task ObserveAsync(AppDbContext db, AnalysisRecord analysis, IReadOnlyCollection<FindingOccurrence> occurrences, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction is null) throw new InvalidOperationException("Observation requires a transaction");
        await LockAsync(db, analysis.ProjectKey, analysis.Branch, ct);
        var fingerprints = occurrences.Where(x => !string.IsNullOrEmpty(x.Fingerprint)).GroupBy(x => (x.Tool, x.RuleId, x.Fingerprint)).ToDictionary(g => g.Key, g => g.Count());
        var identified = occurrences.Select(x => (Occurrence: x, Id: Identity(analysis.ProjectKey, analysis.Branch, x,
            string.IsNullOrEmpty(x.Fingerprint) || fingerprints[(x.Tool, x.RuleId, x.Fingerprint)] == 1))).ToArray();
        var ownership = await db.Set<ProjectOwnership>().FindAsync([analysis.ProjectKey], ct);
        var seenAt = DateTimeOffset.TryParse(analysis.CreatedAt, out var time) ? time.UtcDateTime : DateTime.UtcNow;
        // ponytail: chunks bound SQL parameters and loaded tracking records; bulk upsert is the upgrade path for measured ingestion bottlenecks.
        foreach (var chunk in identified.GroupBy(x => x.Id).Chunk(500))
        {
            var ids = chunk.Select(x => x.Key).ToArray();
            var existing = await db.Set<DurableFinding>().Where(x => ids.Contains(x.Id)).ToDictionaryAsync(x => x.Id, ct);
            foreach (var group in chunk)
            {
                var occurrence = group.First().Occurrence;
                if (!existing.TryGetValue(group.Key, out var finding))
                {
                    finding = new DurableFinding { Id = group.Key, ProjectKey = analysis.ProjectKey, Branch = analysis.Branch,
                        Tool = occurrence.Tool, RuleId = occurrence.RuleId, Category = occurrence.Category, Message = occurrence.Message,
                        IdentityKind = !string.IsNullOrEmpty(occurrence.Fingerprint) && fingerprints[(occurrence.Tool, occurrence.RuleId, occurrence.Fingerprint)] == 1 ? "fingerprint" : "exact_location",
                        AssigneeUserId = ownership?.OwnerUserId, TeamId = ownership?.TeamId };
                    db.Add(finding);
                }
                if (seenAt >= finding.LastSeenAt)
                {
                    var reopen = finding.State == "resolved" && finding.LastAnalysisId != analysis.AnalysisId && seenAt > finding.LastSeenAt;
                    finding.LastAnalysisId = analysis.AnalysisId; finding.LastSeenAt = seenAt; finding.Path = occurrence.Path; finding.Line = occurrence.Line;
                    if (reopen)
                    {
                        finding.State = "open"; finding.Version++;
                        await DecisionAsync(db, finding, new Principal("system"), "reopened_by_scan", "Finding observed in a later analysis", ct);
                    }
                    if (finding.Category != occurrence.Category || finding.Message != occurrence.Message)
                    {
                        finding.Category = occurrence.Category; finding.Message = occurrence.Message;
                        finding.HotspotReview = "not_reviewed"; finding.Version++;
                        if (finding.State is "false_positive" or "accepted_risk")
                        {
                            finding.State = "open"; finding.ExceptionReason = null; finding.ExceptionExpiresAt = null;
                        }
                        await DecisionAsync(db, finding, new Principal("system"), "evidence_changed", "Scanner evidence changed; hotspot review and exception reset", ct);
                    }
                }
                foreach (var item in group) item.Occurrence.FindingId = finding.Id;
            }
        }
    }

    public static string EffectiveState(DurableFinding finding, DateTime now) =>
        finding.State is "false_positive" or "accepted_risk" && finding.ExceptionExpiresAt <= now ? "open" : finding.State;

    /// <summary>Expired reviews are immediately ineffective; maintenance records their reopening durably.</summary>
    public static async Task ExpireAsync(AppDbContext db, CancellationToken ct)
    {
        var now = DateTime.UtcNow;
        var rows = await db.Set<DurableFinding>().AsNoTracking().Where(x => (x.State == "false_positive" || x.State == "accepted_risk") && x.ExceptionExpiresAt <= now)
            .OrderBy(x => x.ExceptionExpiresAt).Take(100).Select(x => new { x.Id, x.ProjectKey, x.Branch }).ToListAsync(ct);
        foreach (var item in rows)
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await LockAsync(db, item.ProjectKey, item.Branch, ct);
            var row = await db.Set<DurableFinding>().SingleAsync(x => x.Id == item.Id, ct);
            if (row.State is "false_positive" or "accepted_risk" && row.ExceptionExpiresAt <= now)
            {
                row.State = "open"; row.Version++;
                await DecisionAsync(db, row, new Principal("system"), "exception_expired", "Review expiry reached; finding reopened", ct);
                await db.SaveChangesAsync(ct);
            }
            await tx.CommitAsync(ct);
            db.Entry(row).State = EntityState.Detached;
        }
    }

    public static async Task DecisionAsync(AppDbContext db, DurableFinding finding, Principal actor, string action, string reason, CancellationToken ct)
    {
        var decision = new FindingDecision { FindingId = finding.Id, ProjectKey = finding.ProjectKey, ActorUserId = actor.Sub,
            ActorEmail = actor.Email, Action = action, Reason = reason, Snapshot = JsonSerializer.Serialize(View(finding), ApiJson.Options) };
        db.Add(decision);
        await BoardsDelivery.EnqueueAsync(db, finding, decision, ct);
    }

    public static object View(DurableFinding x) => new { x.Id, x.ProjectKey, x.Branch, x.Tool, x.RuleId, x.Category, x.Message, x.Path, x.Line,
        x.IdentityKind, x.State, effective_state = EffectiveState(x, DateTime.UtcNow), x.HotspotReview, x.AssigneeUserId, x.TeamId,
        x.ExceptionReason, x.ExceptionExpiresAt, x.LastAnalysisId, x.LastSeenAt, x.UpdatedAt, x.Version };
}
