using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CodeInsights.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace CodeInsights.Api.Auth;

public sealed record Principal(
    string Kind,
    string Sub = "",
    string Email = "",
    string FullName = "",
    string Role = "",
    string TokenId = "",
    string[]? Scopes = null
)
{
    public bool IsAdmin => Kind == "user" && Role == "admin";
}

public sealed class AuthService(AppDbContext db, Microsoft.Extensions.Options.IOptions<SessionOptions> sessionOptions)
{
    public static string Sha256(string value) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));

    private static readonly Microsoft.AspNetCore.Identity.PasswordHasher<PlatformUser> PasswordHasher = new();
    public static string HashPassword(string password) => PasswordHasher.HashPassword(new PlatformUser(), password);
    public static bool VerifyPassword(string password, string stored)
    {
        try { return PasswordHasher.VerifyHashedPassword(new PlatformUser(), stored, password) != Microsoft.AspNetCore.Identity.PasswordVerificationResult.Failed; }
        catch (FormatException) { return false; }
    }
    public static string Base64Url(byte[] value) => Convert.ToBase64String(value).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    public Task<string> SignSessionTokenAsync(PlatformUser user, CancellationToken ct = default)
    {
        ct.ThrowIfCancellationRequested();
        var settings = sessionOptions.Value;
        var now = DateTime.UtcNow;
        var claims = new[] { new System.Security.Claims.Claim("sub", user.UserId), new System.Security.Claims.Claim("email", user.Email), new System.Security.Claims.Claim("name", user.FullName), new System.Security.Claims.Claim("role", user.Role), new System.Security.Claims.Claim("jti", Guid.NewGuid().ToString()) };
        var token = new System.IdentityModel.Tokens.Jwt.JwtSecurityToken(settings.Issuer, settings.Audience, claims, now, now.AddMinutes(settings.SessionMinutes), new Microsoft.IdentityModel.Tokens.SigningCredentials(settings.SecurityKey(), Microsoft.IdentityModel.Tokens.SecurityAlgorithms.HmacSha256));
        return Task.FromResult(new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler().WriteToken(token));
    }
    private async Task<Principal?> UserAsync(string token, CancellationToken ct)
    {
        try
        {
            var handler = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler { MapInboundClaims = false };
            var claims = handler.ValidateToken(token, sessionOptions.Value.ValidationParameters(), out _);
            var sub = claims.FindFirst("sub")?.Value;
            var user = await db.Set<PlatformUser>().FirstOrDefaultAsync(x => x.UserId == sub && x.IsActive, ct);
            return user is null ? null : new Principal("user", user.UserId, user.Email, user.FullName, user.Role);
        }
        catch (Exception exception) when (exception is Microsoft.IdentityModel.Tokens.SecurityTokenException or ArgumentException) { return null; }
    }
    private async Task<Principal?> CiAsync(string token, CancellationToken ct)
    {
        var hash = Sha256(token);
        var row = await db.Set<PlatformApiToken>()
            .FirstOrDefaultAsync(x => x.TokenHash == hash && x.IsCurrent && !x.Revoked, ct);
        if (row is null || row.ExpiresAt <= DateTime.UtcNow)
            return null;
        string[] scopes;
        try
        {
            scopes = JsonSerializer.Deserialize<string[]>(row.Scopes) ?? [];
        }
        catch (JsonException)
        {
            scopes = [];
        }
        return new Principal("ci", Role: "ci", TokenId: row.TokenId, Scopes: scopes);
    }

    public async Task<Principal?> OptionalAsync(
        HttpContext context,
        CancellationToken ct = default
    ) =>
        context.Request.Headers.ContainsKey("Authorization")
            ? await RequireAsync(context, ct: ct)
            : null;

    public async Task<Principal> RequireAsync(
        HttpContext context,
        string kind = "platform",
        CancellationToken ct = default
    )
    {
        var authorization = context.Request.Headers.Authorization.ToString();
        if (
            !authorization.StartsWith("Bearer ", StringComparison.Ordinal)
            || string.IsNullOrWhiteSpace(authorization[7..])
        )
            throw new ApiException(401, "Authentication required");
        var token = authorization[7..].Trim();
        var principal = kind == "ci" ? await CiAsync(token, ct) : await UserAsync(token, ct);
        if (principal is null && kind == "platform")
            principal = await CiAsync(token, ct);
        if (principal is null)
            throw new ApiException(
                401,
                kind switch
                {
                    "ci" => "Invalid, expired, or revoked platform token",
                    "platform" => "Invalid, expired, revoked, or inactive credential",
                    _ => "Invalid, expired, or inactive session",
                }
            );
        if (kind == "admin" && !principal.IsAdmin)
            throw new ApiException(403, "This action requires one of: admin");
        return principal;
    }

    private static string? Scope(string permission) =>
        permission switch
        {
            "read" => "analysis:read",
            "analysis:write" => permission,
            "integration:write" => permission,
            _ => null,
        };

    public void AssertCiPermission(Principal principal, string permission = "read")
    {
        if (
            principal.Kind == "ci"
            && (Scope(permission) is not { } scope || !(principal.Scopes ?? []).Contains(scope))
        )
            throw new ApiException(403, "Credential scope does not allow this action");
    }

    public async Task<HashSet<string>> AllowedProjectKeysAsync(
        Principal principal,
        string permission = "read",
        CancellationToken ct = default
    )
    {
        if (principal.IsAdmin)
            return (await db.Set<Project>().Select(x => x.Key).ToListAsync(ct)).ToHashSet();
        if (principal.Kind == "ci")
        {
            if (Scope(permission) is not { } scope || !(principal.Scopes ?? []).Contains(scope))
                return [];
            return (
                await db.Set<TokenProjectAccess>()
                    .Where(x => x.TokenId == principal.TokenId)
                    .Select(x => x.ProjectKey)
                    .ToListAsync(ct)
            ).ToHashSet();
        }
        if (principal.Kind != "user")
            return [];
        var grants = await db.Set<UserGrant>()
            .Where(x => x.UserId == principal.Sub)
            .ToListAsync(ct);
        var keys = grants.Where(x => x.ScopeType == "project").Select(x => x.ScopeId).ToHashSet();
        var organizations = grants
            .Where(x => x.ScopeType == "organization")
            .Select(x => x.ScopeId)
            .ToArray();
        keys.UnionWith(
            await db.Set<Project>()
                .Where(x => x.OrganizationId != null && organizations.Contains(x.OrganizationId))
                .Select(x => x.Key)
                .ToListAsync(ct)
        );
        return keys;
    }

    public async Task AssertProjectAccessAsync(
        Principal principal,
        string key,
        string permission = "read",
        CancellationToken ct = default
    )
    {
        if (!(await AllowedProjectKeysAsync(principal, permission, ct)).Contains(key))
            throw new ApiException(403, "Project access denied");
        AssertCiPermission(principal, permission);
        if (principal.Kind == "user" && permission != "read" && !principal.IsAdmin)
            throw new ApiException(403, "Administrator role required");
    }
}

