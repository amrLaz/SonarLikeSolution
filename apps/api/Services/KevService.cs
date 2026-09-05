using System.Text.Json;
using CodeInsights.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace CodeInsights.Api.Services;

public sealed class KevService(
    AppDbContext db,
    IHttpClientFactory clients,
    ILogger<KevService> logger
)
{
    public const string Source =
        "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

    public async Task<HashSet<string>> GetIdsAsync(CancellationToken ct = default)
    {
        var value = await db.Set<PlatformSetting>()
            .Where(x => x.Key == "kev_catalog_ids")
            .Select(x => x.Value)
            .FirstOrDefaultAsync(ct);
        try
        {
            return JsonSerializer.Deserialize<HashSet<string>>(value ?? "[]") ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }

    public async Task<int> RefreshAsync(CancellationToken ct = default)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(30));
        using var client = clients.CreateClient("kev");
        using var response = await client.GetAsync(Source, timeout.Token);
        response.EnsureSuccessStatusCode();
        using var data = JsonDocument.Parse(
            await response.Content.ReadAsStringAsync(timeout.Token)
        );
        var ids = data.RootElement.TryGetProperty("vulnerabilities", out var entries)
            ? entries.EnumerateArray().Select(e => e.GetProperty("cveID").GetString()!).ToArray()
            : [];
        await SetAsync("kev_catalog_ids", JsonSerializer.Serialize(ids), ct);
        await SetAsync("kev_last_updated", DateTimeOffset.UtcNow.ToString("o"), ct);
        await db.SaveChangesAsync(ct);
        return ids.Length;
    }

    public async Task MaybeRefreshAsync(CancellationToken ct = default)
    {
        try
        {
            var value = await db.Set<PlatformSetting>()
                .Where(x => x.Key == "kev_last_updated")
                .Select(x => x.Value)
                .FirstOrDefaultAsync(ct);
            if (
                DateTimeOffset.TryParse(value, out var last)
                && DateTimeOffset.UtcNow - last < TimeSpan.FromHours(24)
            )
                return;
            logger.LogInformation("KEV catalog refreshed: {Count} entries", await RefreshAsync(ct));
        }
        catch (Exception exception) when (!ct.IsCancellationRequested)
        {
            logger.LogWarning(exception, "KEV refresh skipped");
        }
    }

    private async Task SetAsync(string key, string value, CancellationToken ct)
    {
        var row = await db.Set<PlatformSetting>().FirstOrDefaultAsync(x => x.Key == key, ct);
        if (row is null)
            db.Add(
                new PlatformSetting
                {
                    Id = Guid.NewGuid().ToString(),
                    Key = key,
                    Value = value,
                }
            );
        else
        {
            row.Value = value;
            row.UpdatedAt = DateTime.UtcNow;
        }
    }
}
