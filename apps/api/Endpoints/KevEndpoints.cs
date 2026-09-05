using CodeInsights.Api.Auth;
using CodeInsights.Api.Data;
using CodeInsights.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace CodeInsights.Api.Endpoints;

public static class KevEndpoints
{
    public static void MapKevEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet(
            "/api/v1/kev/status",
            async (
                HttpContext context,
                AppDbContext db,
                AuthService auth,
                KevService kev,
                CancellationToken ct
            ) =>
            {
                var principal = await auth.RequireAsync(context, "platform", ct);
                auth.AssertCiPermission(principal);
                return Results.Json(
                    new
                    {
                        count = (await kev.GetIdsAsync(ct)).Count,
                        last_updated = await db.Set<PlatformSetting>()
                            .Where(x => x.Key == "kev_last_updated")
                            .Select(x => x.Value)
                            .FirstOrDefaultAsync(ct),
                        source = KevService.Source,
                    },
                    ApiJson.Options
                );
            }
        );
        app.MapPost(
            "/api/v1/kev/refresh",
            async (HttpContext context, AuthService auth, KevService kev, CancellationToken ct) =>
            {
                await auth.RequireAsync(context, "admin", ct);
                try
                {
                    return Results.Json(
                        new
                        {
                            count = await kev.RefreshAsync(ct),
                            refreshed_at = DateTimeOffset.UtcNow.ToString("o"),
                        },
                        ApiJson.Options
                    );
                }
                catch (Exception exception) when (!ct.IsCancellationRequested)
                {
                    throw new ApiException(502, "KEV refresh failed: " + exception.Message);
                }
            }
        );
    }
}

