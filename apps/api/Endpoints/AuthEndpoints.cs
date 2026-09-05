using System.Text;
using CodeInsights.Api.Auth;
using CodeInsights.Api.Data;
using CodeInsights.Api.Services;
using Microsoft.EntityFrameworkCore;

namespace CodeInsights.Api.Endpoints;

public static class AuthEndpoints
{
    public sealed record LoginRequest(string Email, string Password);

    public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);

    public sealed record CreateUserRequest(
        string Email,
        string FullName,
        string Role = "default",
        string? Password = null
    );

    public sealed record UpdateUserRequest(
        string? Role = null,
        bool? IsActive = null,
        string? FullName = null
    );

    public sealed record UserGrantsRequest
    {
        public string[] OrganizationIds { get; init; } = [];
        public string[] ProjectKeys { get; init; } = [];
    }

    public sealed record ResetPasswordRequest(string NewPassword);

    private static void Required(string? value, string field)
    {
        if (value is null)
            throw new ApiException(
                422,
                new[]
                {
                    new
                    {
                        type = "missing",
                        loc = new[] { "body", field },
                        msg = "Field required",
                    },
                }
            );
    }

    private static void ValidRole(
        string role,
        string detail = "Role must be admin, regular, or default"
    )
    {
        if (role is not ("admin" or "regular" or "default"))
            throw new ApiException(422, detail);
    }

    private static async Task<PlatformUser> FindUser(
        AppDbContext db,
        string id,
        CancellationToken ct
    ) =>
        await db.Set<PlatformUser>().FindAsync([id], ct)
        ?? throw new ApiException(404, "User not found");

    private static async Task<Principal> Self(
        AuthService auth,
        HttpContext context,
        CancellationToken ct
    )
    {
        var principal = await auth.RequireAsync(context, "user", ct);
        if (principal.Role is not ("admin" or "regular" or "default"))
            throw new ApiException(403, "This action requires one of: admin, regular, default");
        return principal;
    }

    public static IEndpointRouteBuilder MapAuthEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/v1/auth").RequireAuthorization();
        group
            .MapPost(
                "/login",
                async (
                    HttpContext context,
                    AppDbContext db,
                    AuthService auth,
                    AuditService audit,
                    CancellationToken ct
                ) =>
                {
                    var request = await ApiJson.ReadAsync<LoginRequest>(context, ct);
                    Required(request.Email, "email");
                    Required(request.Password, "password");
                    var email = request.Email.Trim().ToLowerInvariant();
                    var user = await db.Set<PlatformUser>()
                        .FirstOrDefaultAsync(
                            x => x.Email == email && x.AuthProvider == "local" && x.IsActive,
                            ct
                        );
                    if (
                        user?.HashedPassword is null
                        || !AuthService.VerifyPassword(request.Password, user.HashedPassword)
                    )
                        throw new ApiException(401, "Invalid credentials");
                    user.LastLoginAt = DateTime.UtcNow;
                    audit.Log(
                        user.Email,
                        user.Role,
                        "user.login",
                        "session",
                        resourceLabel: user.Email,
                        details: new { provider = "local" }
                    );
                    await db.SaveChangesAsync(ct);
                    return new
                    {
                        token = await auth.SignSessionTokenAsync(user, ct),
                        user = new
                        {
                            user.UserId,
                            user.Email,
                            user.FullName,
                            user.Role,
                        },
                    };
                }
            )
            .Accepts<LoginRequest>("application/json")
            .AllowAnonymous();
        group.MapGet(
            "/me",
            async (HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct) =>
            {
                var principal = await Self(auth, context, ct);
                var user = await FindUser(db, principal.Sub, ct);
                return new
                {
                    user.UserId,
                    user.Email,
                    user.FullName,
                    user.Role,
                    user.AuthProvider,
                    last_login_at = user.LastLoginAt.HasValue
                        ? ApiJson.Iso(user.LastLoginAt.Value)
                        : null,
                    permissions = new
                    {
                        is_admin = principal.IsAdmin,
                        project_keys = (
                            await auth.AllowedProjectKeysAsync(principal, ct: ct)
                        ).Order(StringComparer.Ordinal),
                    },
                };
            }
        );
        group
            .MapPut(
                "/me/password",
                async (
                    HttpContext context,
                    AppDbContext db,
                    AuthService auth,
                    CancellationToken ct
                ) =>
                {
                    var principal = await Self(auth, context, ct);
                    var request = await ApiJson.ReadAsync<ChangePasswordRequest>(context, ct);
                    Required(request.CurrentPassword, "current_password");
                    Required(request.NewPassword, "new_password");
                    var user = await FindUser(db, principal.Sub, ct);
                    if (user.AuthProvider != "local" || user.HashedPassword is null)
                        throw new ApiException(
                            400,
                            "Password change not available for SSO accounts"
                        );
                    if (!AuthService.VerifyPassword(request.CurrentPassword, user.HashedPassword))
                        throw new ApiException(401, "Current password is incorrect");
                    if (request.NewPassword.EnumerateRunes().Count() < 8)
                        throw new ApiException(422, "New password must be at least 8 characters");
                    user.HashedPassword = AuthService.HashPassword(request.NewPassword);
                    await db.SaveChangesAsync(ct);
                    return new { status = "password updated" };
                }
            )
            .Accepts<ChangePasswordRequest>("application/json");
        group.MapGet(
            "/users",
            async (HttpContext context, AppDbContext db, AuthService auth, CancellationToken ct) =>
            {
                await auth.RequireAsync(context, "admin", ct);
                var users = await db.Set<PlatformUser>().OrderBy(x => x.CreatedAt).ToListAsync(ct);
                var grants = await db.Set<UserGrant>().ToListAsync(ct);
                return users.Select(user => new
                {
                    user.UserId,
                    user.Email,
                    user.FullName,
                    user.Role,
                    user.AuthProvider,
                    user.IsActive,
                    created_at = ApiJson.Iso(user.CreatedAt),
                    last_login_at = user.LastLoginAt.HasValue
                        ? ApiJson.Iso(user.LastLoginAt.Value)
                        : null,
                    grants = grants
                        .Where(g => g.UserId == user.UserId)
                        .Select(g => new { g.ScopeType, g.ScopeId }),
                });
            }
        );
        group
            .MapPost(
                "/users",
                async (
                    HttpContext context,
                    AppDbContext db,
                    AuthService auth,
                    AuditService audit,
                    CancellationToken ct
                ) =>
                {
                    var caller = await auth.RequireAsync(context, "admin", ct);
                    var request = await ApiJson.ReadAsync<CreateUserRequest>(context, ct);
                    Required(request.Email, "email");
                    Required(request.FullName, "full_name");
                    Required(request.Role, "role");
                    var email = request.Email.Trim().ToLowerInvariant();
                    if (await db.Set<PlatformUser>().AnyAsync(x => x.Email == email, ct))
                        throw new ApiException(409, "A user with this email already exists");
                    ValidRole(request.Role);
                    if (!string.IsNullOrEmpty(request.Password) && request.Password.EnumerateRunes().Count() < 8)
                        throw new ApiException(422, "Password must be at least 8 characters");
                    var user = new PlatformUser
                    {
                        UserId = Guid.NewGuid().ToString(),
                        Email = email,
                        FullName = request.FullName.Trim(),
                        Role = request.Role,
                        HashedPassword = string.IsNullOrEmpty(request.Password)
                            ? null
                            : AuthService.HashPassword(request.Password),
                        AuthProvider = "local",
                        IsActive = true,
                    };
                    db.Add(user);
                    audit.Log(
                        caller.Email,
                        caller.Role,
                        "user.create",
                        "user",
                        user.UserId,
                        email,
                        new { role = request.Role }
                    );
                    await db.SaveChangesAsync(ct);
                    return new
                    {
                        user.UserId,
                        user.Email,
                        user.Role,
                    };
                }
            )
            .Accepts<CreateUserRequest>("application/json");
        group
            .MapPut(
                "/users/{user_id}/grants",
                async (
                    string user_id,
                    HttpContext context,
                    AppDbContext db,
                    AuthService auth,
                    AuditService audit,
                    CancellationToken ct
                ) =>
                {
                    var caller = await auth.RequireAsync(context, "admin", ct);
                    var request = await ApiJson.ReadAsync<UserGrantsRequest>(context, ct);
                    var user = await FindUser(db, user_id, ct);
                    if (
                        request.OrganizationIds is null
                        || request.ProjectKeys is null
                        || request.OrganizationIds.Any(x => x is null)
                        || request.ProjectKeys.Any(x => x is null)
                    )
                        throw new ApiException(422, "Grants must be arrays of strings");
                    var organizations = request.OrganizationIds.ToHashSet();
                    var projects = (request.ProjectKeys ?? []).ToHashSet();
                    var knownOrganizations = (
                        await db.Set<Organization>()
                            .Where(x => organizations.Contains(x.Id))
                            .Select(x => x.Id)
                            .ToListAsync(ct)
                    ).ToHashSet();
                    var knownProjects = (
                        await db.Set<Project>()
                            .Where(x => projects.Contains(x.Key))
                            .Select(x => x.Key)
                            .ToListAsync(ct)
                    ).ToHashSet();
                    if (
                        !organizations.SetEquals(knownOrganizations)
                        || !projects.SetEquals(knownProjects)
                    )
                        throw new ApiException(422, "Unknown organization or project in grants");
                    await using var transaction = await db.Database.BeginTransactionAsync(ct);
                    await db.Set<UserGrant>()
                        .Where(x => x.UserId == user_id)
                        .ExecuteDeleteAsync(ct);
                    foreach (var id in organizations.Order(StringComparer.Ordinal))
                        db.Add(
                            new UserGrant
                            {
                                Id = Guid.NewGuid().ToString(),
                                UserId = user_id,
                                ScopeType = "organization",
                                ScopeId = id,
                            }
                        );
                    foreach (var key in projects.Order(StringComparer.Ordinal))
                        db.Add(
                            new UserGrant
                            {
                                Id = Guid.NewGuid().ToString(),
                                UserId = user_id,
                                ScopeType = "project",
                                ScopeId = key,
                            }
                        );
                    var result = new
                    {
                        user_id,
                        organization_ids = organizations.Order(StringComparer.Ordinal),
                        project_keys = projects.Order(StringComparer.Ordinal),
                    };
                    audit.Log(
                        caller.Email,
                        caller.Role,
                        "user.grants.replace",
                        "user",
                        user_id,
                        user.Email,
                        new { result.organization_ids, result.project_keys }
                    );
                    await db.SaveChangesAsync(ct);
                    await transaction.CommitAsync(ct);
                    return result;
                }
            )
            .Accepts<UserGrantsRequest>("application/json");
        group
            .MapPut(
                "/users/{user_id}",
                async (
                    string user_id,
                    HttpContext context,
                    AppDbContext db,
                    AuthService auth,
                    AuditService audit,
                    CancellationToken ct
                ) =>
                {
                    var caller = await auth.RequireAsync(context, "admin", ct);
                    var request = await ApiJson.ReadAsync<UpdateUserRequest>(context, ct);
                    var user = await FindUser(db, user_id, ct);
                    var changes = new Dictionary<string, object>();
                    if (request.Role is not null)
                    {
                        ValidRole(request.Role, "Invalid role");
                        changes["role"] = new { from = user.Role, to = request.Role };
                        user.Role = request.Role;
                    }
                    if (request.IsActive is { } active)
                    {
                        changes["is_active"] = new { from = user.IsActive, to = active };
                        user.IsActive = active;
                    }
                    if (request.FullName is not null)
                        user.FullName = request.FullName.Trim();
                    if (changes.Count > 0)
                        audit.Log(
                            caller.Email,
                            caller.Role,
                            changes.ContainsKey("role") ? "user.role.change" : "user.status.change",
                            "user",
                            user.UserId,
                            user.Email,
                            changes
                        );
                    await db.SaveChangesAsync(ct);
                    return new
                    {
                        user.UserId,
                        user.Role,
                        user.IsActive,
                    };
                }
            )
            .Accepts<UpdateUserRequest>("application/json");
        group
            .MapPut(
                "/users/{user_id}/password",
                async (
                    string user_id,
                    HttpContext context,
                    AppDbContext db,
                    AuthService auth,
                    AuditService audit,
                    CancellationToken ct
                ) =>
                {
                    var caller = await auth.RequireAsync(context, "admin", ct);
                    var request = await ApiJson.ReadAsync<ResetPasswordRequest>(context, ct);
                    Required(request.NewPassword, "new_password");
                    var user = await FindUser(db, user_id, ct);
                    if (request.NewPassword.EnumerateRunes().Count() < 8)
                        throw new ApiException(422, "Password must be at least 8 characters");
                    user.HashedPassword = AuthService.HashPassword(request.NewPassword);
                    user.AuthProvider = "local";
                    audit.Log(
                        caller.Email,
                        caller.Role,
                        "user.password.reset",
                        "user",
                        user.UserId,
                        user.Email
                    );
                    await db.SaveChangesAsync(ct);
                    return new { status = "password updated" };
                }
            )
            .Accepts<ResetPasswordRequest>("application/json");
        group.MapDelete(
            "/users/{user_id}",
            async (
                string user_id,
                HttpContext context,
                AppDbContext db,
                AuthService auth,
                AuditService audit,
                CancellationToken ct
            ) =>
            {
                var caller = await auth.RequireAsync(context, "admin", ct);
                if (caller.Sub == user_id)
                    throw new ApiException(400, "Cannot delete your own account");
                var user = await FindUser(db, user_id, ct);
                await using var transaction = await db.Database.BeginTransactionAsync(ct);
                audit.Log(
                    caller.Email,
                    caller.Role,
                    "user.delete",
                    "user",
                    user.UserId,
                    user.Email,
                    new { had_role = user.Role, auth_provider = user.AuthProvider }
                );
                await db.Set<UserGrant>().Where(x => x.UserId == user_id).ExecuteDeleteAsync(ct);
                db.Remove(user);
                await db.SaveChangesAsync(ct);
                await transaction.CommitAsync(ct);
                return new { status = "deleted" };
            }
        );
        group
            .MapGet(
                "/entra/login",
                (HttpContext context, EntraService entra, CancellationToken ct) =>
                    entra.LoginAsync(context, ct)
            )
            .AllowAnonymous();
        group
            .MapGet(
                "/entra/callback",
                (HttpContext context, EntraService entra, CancellationToken ct) =>
                    entra.CallbackAsync(context, ct)
            )
            .AllowAnonymous();
        return endpoints;
    }
}

