using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace CodeInsights.Api.Data;

public sealed class CollaborationTeam
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string ProjectKey { get; set; } = "";
    public string Name { get; set; } = "";
    public string? OwnerUserId { get; set; }
}

public sealed class ProjectOwnership
{
    public string ProjectKey { get; set; } = "";
    public string? TeamId { get; set; }
    public string? OwnerUserId { get; set; }
}

public sealed class DurableFinding
{
    public string Id { get; set; } = "";
    public string ProjectKey { get; set; } = "";
    public string Branch { get; set; } = "";
    public string Tool { get; set; } = "";
    public string RuleId { get; set; } = "";
    public string Category { get; set; } = "unknown";
    public string Message { get; set; } = "";
    public string? Path { get; set; }
    public int? Line { get; set; }
    public string IdentityKind { get; set; } = "exact_location";
    public string State { get; set; } = "open";
    public string HotspotReview { get; set; } = "not_reviewed";
    public string? AssigneeUserId { get; set; }
    public string? TeamId { get; set; }
    public string? ExceptionReason { get; set; }
    public DateTime? ExceptionExpiresAt { get; set; }
    public string LastAnalysisId { get; set; } = "";
    public DateTime LastSeenAt { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public int Version { get; set; } = 1;
}

public sealed class FindingDecision
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string FindingId { get; set; } = "";
    public string ProjectKey { get; set; } = "";
    public string ActorUserId { get; set; } = "";
    public string ActorEmail { get; set; } = "";
    public string Action { get; set; } = "";
    public string Reason { get; set; } = "";
    public string Snapshot { get; set; } = "{}";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public static class CollaborationModel
{
    public static void Configure(ModelBuilder model)
    {
        model.Entity<CollaborationTeam>().ToTable("collaboration_teams").HasKey(x => x.Id);
        model.Entity<CollaborationTeam>().HasIndex(x => new { x.ProjectKey, x.Name }).IsUnique();
        model.Entity<ProjectOwnership>().ToTable("project_ownerships").HasKey(x => x.ProjectKey);
        model.Entity<DurableFinding>().ToTable("durable_findings").HasKey(x => x.Id);
        model.Entity<DurableFinding>().HasIndex(x => new { x.ProjectKey, x.Branch, x.Id });
        model.Entity<DurableFinding>().HasIndex(x => new { x.AssigneeUserId, x.TeamId });
        model.Entity<FindingDecision>().ToTable("finding_decisions").HasKey(x => x.Id);
        model.Entity<FindingDecision>().HasIndex(x => new { x.FindingId, x.CreatedAt, x.Id });
        // Decisions deliberately have no cascade to occurrences or analyses: retention cannot erase a review.
        foreach (var type in new[] { typeof(CollaborationTeam), typeof(ProjectOwnership), typeof(DurableFinding), typeof(FindingDecision) })
        foreach (var property in model.Entity(type).Metadata.GetProperties())
            property.SetColumnName(JsonNamingPolicy.SnakeCaseLower.ConvertName(property.Name));
    }
}
