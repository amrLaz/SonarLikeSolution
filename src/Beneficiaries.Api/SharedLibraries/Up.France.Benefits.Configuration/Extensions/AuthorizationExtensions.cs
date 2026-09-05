using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public static class AuthorizationExtensions
    {
        public const string AZURE_AD_SCHEME = "AzureAdScheme";
        public const string AZURE_SERVICE_SCHEME = "AzureServiceScheme";
        public const int STATUS_CODE = 401;

        public static AuthenticationBuilder AddJwtAuthentication(this IServiceCollection services,
            RegistrationConfiguration AzureB2CRegistration,
            RegistrationConfiguration AzureEntraIdRegistration
            )
        {
            return services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                .AddJwtBearer(JwtBearerDefaults.AuthenticationScheme, options =>
                {
                    var authority = $"{AzureB2CRegistration.Issuer}/{AzureB2CRegistration.TenantId}/tfp/{AzureB2CRegistration.Policy}/v2.0/";
                    var issuer = $"{AzureB2CRegistration.Issuer}/{AzureB2CRegistration.TenantId}/v2.0/";
                    options.RequireHttpsMetadata = false;
                    options.Authority = authority;
                    options.Audience = AzureB2CRegistration.Audience;
                    options.TokenValidationParameters = new TokenValidationParameters
                    {
                        ValidateAudience = true,
                        ValidateIssuerSigningKey = false,
                        ValidateIssuer = true,
                        ValidIssuer = issuer,
                        ValidateLifetime = true,
                    };
                }).AddJwtBearer(AZURE_AD_SCHEME, options =>
                {
                    options.Authority = $"{AzureEntraIdRegistration.Issuer}/{AzureEntraIdRegistration.TenantId}/v2.0";
                    options.Audience = AzureEntraIdRegistration.Audience;

                    options.TokenValidationParameters = new TokenValidationParameters
                    {
                        ValidateAudience = true,
                        ValidateIssuerSigningKey = true,
                        ValidateIssuer = true,
                        ValidIssuer = AzureEntraIdRegistration.Issuer,
                        ValidateLifetime = true,
                    };
                });
        }
    }
}
