using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.DependencyInjection;
using System.Diagnostics.CodeAnalysis;
using Up.NCore.Abstractions.Auth;
using Up.NCore.Identity.Auth;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public static class ConfigureAuthorizationExtension
    {
        public static void ConfigureAuthorization(this IServiceCollection services)
        {
            using var provider = services.BuildServiceProvider();
            var config = provider.GetService<BenefitsConfiguration>();
            services.AddAuthorization(options =>
            {
                options.DefaultPolicy = new AuthorizationPolicyBuilder()
                .RequireAuthenticatedUser()
                .Build();
            }).AddJwtAuthentication(config.Application.AzureB2CRegistration, config.Application.AzureEntraIdRegistration);
            
            services.AddHttpContextAccessor();
            services.AddScoped<IAuthenticator, HttpContextAuthenticator>();
        }
    }
}
