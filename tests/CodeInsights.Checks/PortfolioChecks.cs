using System.Text.Json;
using CodeInsights.Api;
using CodeInsights.Api.Contracts;
using CodeInsights.Api.Data;
using CodeInsights.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;

internal static class PortfolioChecks
{
    public static async Task RunAsync()
    {
        var now = DateTimeOffset.UtcNow;
        AnalysisRecord Row(int bugs, string version = "1") => new()
        {
            AnalysisId = Guid.NewGuid().ToString(), ProjectKey = "portfolio", Branch = "feature/check", CommitSha = "abcdef",
            Status = "completed", Completeness = "complete", ProfileId = "profile", ProfileVersion = "1", FormulaVersion = version,
            CreatedAt = now.ToString("yyyy-MM-ddTHH:mm:ss.ffffffzzz"),
            Measurements = JsonSerializer.Serialize(new Dictionary<string, MeasurementValue> { ["bugs"] = new("measured", bugs), ["coverage"] = new("absent") }, ApiJson.Options),
            AffectedFiles = "{\"old.cs\":[]}", Bugs = bugs
        };
        var previous = Row(0); var current = Row(2);
        var trend = PortfolioTrends.Describe(current, previous, [], now);
        Check(trend.Dimensions["bugs"].Trend == "regressed" && trend.Dimensions["bugs"].Delta == 2, "zero baseline is measured and regression is explicit");
        Check(trend.Dimensions["coverage"].Value == null && trend.Dimensions["coverage"].Trend == "not_comparable", "absent is not zero");
        Check(PortfolioTrends.Describe(Row(2, "2"), previous, [], now).ComparisonState == "version_break", "formula break");
        Check(PortfolioTrends.Describe(Row(2, "0"), Row(1, "0"), [], now).ComparisonState == "version_unknown", "unknown historical formula is not comparable");
        current.ProfileVersion = "2";
        Check(PortfolioTrends.Describe(current, previous, [], now).Dimensions["bugs"].Delta == null, "profile break suppresses delta");
        current.ProfileVersion = "1"; current.Completeness = "incomplete";
        Check(PortfolioTrends.Describe(current, previous, [], now).ComparisonState == "incomplete", "incomplete comparison");
        current.Completeness = "complete";
        var target = new PortfolioObjective { ProjectKey = current.ProjectKey, Branch = current.Branch, Dimension = "bugs", Target = 1, ProfileId = "profile", ProfileVersion = "1", FormulaVersion = "1" };
        Check(PortfolioTrends.Describe(current, previous, [target], now).Objectives.Single().State == "unmet", "lower-is-better objective");
        current.Status = "failed";
        Check(PortfolioTrends.Describe(current, previous, [target], now).Objectives.Single().State == "unknown", "failed analysis cannot satisfy an objective");
        current.Status = "completed";
        target.FormulaVersion = "2";
        Check(PortfolioTrends.Describe(current, previous, [target], now).Objectives.Single().State == "version_break", "objective contract change");
        Check(PortfolioTrends.Describe(current, null, [], now.AddDays(8)).Freshness == "stale", "stale sample");

        if (Environment.GetEnvironmentVariable("CODEINSIGHTS_TEST_DB") is { Length: > 0 } connection)
        {
            var info = new NpgsqlConnectionStringBuilder(connection);
            Check(info.Host is "localhost" or "127.0.0.1" && info.Database is "codeinsights_p1" or "codeinsights_test" or "codeinsights_checks", "isolated local PostgreSQL required");
            await using var db = new AppDbContext(new DbContextOptionsBuilder<AppDbContext>().UseNpgsql(connection).Options);
            var fixture = Row(3); fixture.ProjectKey = "portfolio-" + Guid.NewGuid().ToString("N"); fixture.CreatedAt = now.AddYears(-10).ToString("yyyy-MM-ddTHH:mm:ss.ffffffzzz");
            db.Add(fixture); await db.SaveChangesAsync();
            try
            {
                await new RetentionService(db, NullLogger<RetentionService>.Instance).RunAsync();
                db.ChangeTracker.Clear();
                var retained = await db.Set<AnalysisRecord>().SingleAsync(x => x.AnalysisId == fixture.AnalysisId);
                Check(retained.DetailsPurged && retained.AffectedFiles == "{}" && retained.Bugs == 3 && retained.Measurements == fixture.Measurements, "purge retains ID, dimensions and versions");
                await new RetentionService(db, NullLogger<RetentionService>.Instance).RunAsync();
                Check(await db.Set<AnalysisRecord>().AnyAsync(x => x.AnalysisId == fixture.AnalysisId), "repeat purge preserves history");
            }
            finally { await db.Set<AnalysisRecord>().Where(x => x.AnalysisId == fixture.AnalysisId).ExecuteDeleteAsync(); }
        }
        else Console.WriteLine("Portfolio retention PostgreSQL check skipped: CODEINSIGHTS_TEST_DB not set.");
        Console.WriteLine("Portfolio comparison checks passed.");
    }

    private static void Check(bool value, string message)
    {
        if (!value) throw new InvalidOperationException("Portfolio: " + message);
    }
}
