using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace CodeInsights.Api.Data;

/// <summary>A version-bound target for one measured dimension of a project branch.</summary>
public sealed class PortfolioObjective
{
    public string Id { get; set; } = Guid.NewGuid().ToString();
    public string ProjectKey { get; set; } = "";
    public string Branch { get; set; } = "";
    public string Dimension { get; set; } = "";
    public int Target { get; set; }
    public string ProfileId { get; set; } = "";
    public string ProfileVersion { get; set; } = "";
    public string FormulaVersion { get; set; } = "";
    public DateTime DueAt { get; set; }
}

/// <summary>Persistence mapping for portfolio objectives.</summary>
public static class PortfolioModel
{
    public static void Configure(ModelBuilder builder)
    {
        builder.Entity<PortfolioObjective>(e =>
        {
            e.ToTable("portfolio_objectives");
            e.HasKey(x => x.Id);
            foreach (var property in e.Metadata.GetProperties())
                property.SetColumnName(JsonNamingPolicy.SnakeCaseLower.ConvertName(property.Name));
            e.HasIndex(x => new { x.ProjectKey, x.Branch, x.Dimension }).IsUnique();
        });
    }
}
