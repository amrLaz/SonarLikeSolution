using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace CodeInsights.Api.Data;

public sealed class BoardsProjectConfig
{
    public string ProjectKey { get; set; } = "";
    public string OrganizationConfigId { get; set; } = "";
    public string AdoProject { get; set; } = "";
    public string WorkItemType { get; set; } = "Bug";
    public bool Enabled { get; set; }
}

public sealed class FindingWorkItem
{
    public string FindingId { get; set; } = "";
    public string ProjectKey { get; set; } = "";
    public string OrganizationConfigId { get; set; } = "";
    public string OrganizationUrl { get; set; } = "";
    public string AdoProject { get; set; } = "";
    public string WorkItemType { get; set; } = "Bug";
    public int? WorkItemId { get; set; }
    public string State { get; set; } = "pending";
    public string Error { get; set; } = "";
    public string LastDecisionId { get; set; } = "";
    public int SyncedVersion { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class FindingSubscription
{
    public string Id { get; set; } = "";
    public string UserId { get; set; } = "";
    public string ProjectKey { get; set; } = "";
    public string Scope { get; set; } = "";
    public string ScopeId { get; set; } = "";
}

public sealed class FindingNotification
{
    public string Id { get; set; } = "";
    public string UserId { get; set; } = "";
    public string ProjectKey { get; set; } = "";
    public string FindingId { get; set; } = "";
    public string DecisionId { get; set; } = "";
    public string Action { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ReadAt { get; set; }
}

public sealed class BoardsSyncEvent
{
    public string DecisionId { get; set; } = "";
    public string FindingId { get; set; } = "";
    public string State { get; set; } = "pending";
    public string Error { get; set; } = "";
    public DateTime? CompletedAt { get; set; }
}

public static class BoardsModel
{
    public static void Configure(ModelBuilder model)
    {
        model.Entity<BoardsProjectConfig>().ToTable("boards_project_configs").HasKey(x => x.ProjectKey);
        model.Entity<FindingWorkItem>().ToTable("finding_work_items").HasKey(x => x.FindingId);
        model.Entity<FindingSubscription>().ToTable("finding_subscriptions").HasKey(x => x.Id);
        model.Entity<FindingSubscription>().HasIndex(x => new { x.UserId, x.Scope, x.ScopeId }).IsUnique();
        model.Entity<FindingSubscription>().HasIndex(x => x.ProjectKey);
        model.Entity<FindingNotification>().ToTable("finding_notifications").HasKey(x => x.Id);
        model.Entity<FindingNotification>().HasIndex(x => new { x.UserId, x.CreatedAt, x.Id });
        model.Entity<BoardsSyncEvent>().ToTable("boards_sync_events").HasKey(x => x.DecisionId);
        model.Entity<BoardsSyncEvent>().HasIndex(x => x.FindingId);
        foreach (var type in new[] { typeof(BoardsProjectConfig), typeof(FindingWorkItem), typeof(FindingSubscription), typeof(FindingNotification), typeof(BoardsSyncEvent) })
        foreach (var property in model.Entity(type).Metadata.GetProperties())
            property.SetColumnName(JsonNamingPolicy.SnakeCaseLower.ConvertName(property.Name));
    }
}
