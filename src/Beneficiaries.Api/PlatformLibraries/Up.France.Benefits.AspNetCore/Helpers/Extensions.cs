using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Polly;
using Polly.Extensions.Http;
using Polly.Registry;
using System;
using System.Diagnostics.CodeAnalysis;
using System.Net.Http;
using Up.France.Benefits.Configuration;
using Up.France.ODI.Manufacturer.Account.Client;
using Up.France.ODI.Manufacturer.Account.Client.Configuration;
using Up.France.ODI.Services.Authentication.DotnetClient;

namespace Up.France.Benefits.AspNetCore
{
    [ExcludeFromCodeCoverage]
    public static class Extensions
    {
        private const string _waitAndRetryPolicyKey = "WaitAndRetryPolicy";

        public static void ConfigureMoveUpAccountClient(this IServiceCollection services, IConfiguration configuration)
        {
            IPolicyRegistry<string> registry = services.AddPolicyRegistry();

            IAsyncPolicy<HttpResponseMessage> httWaitAndpRetryPolicy =
                // Handle HttpRequestExceptions, 408 and 5xx status codes
                HttpPolicyExtensions.HandleTransientHttpError()
                    // What to do if any of the above erros occur:
                    // Retry 3 times, each time wait 1,2 and 4 seconds before retrying.
                    .WaitAndRetryAsync(3, retryAttempt => TimeSpan.FromSeconds(Math.Pow(2, retryAttempt)));

            registry.Add(_waitAndRetryPolicyKey, httWaitAndpRetryPolicy);

            var applicationId = configuration.GetSection("Application:Manufacturer:Common:ApplicationId").Value;
            var userId = configuration.GetSection("Application:Manufacturer:Common:UserId").Value;
            var distributor = configuration.GetSection("Application:Manufacturer:Common:Distributor").Value;

            services.Configure<ManufacturerAccountConfiguration>(option =>
            {
                option.ApplicationId = applicationId;
                option.UserId = userId;
                option.Distributor = distributor;
                option.GenericContract = configuration.GetSection("Application:Manufacturer:Account:GenericContract").Value;
            });
            services.AddSingleton(provider => provider.GetRequiredService<IOptions<ManufacturerAccountConfiguration>>().Value);

            services.AddHttpClient<IManufacturerAccountClient, ManufacturerAccountClient>()
                 .ConfigureHttpClient(http =>
                 {
                     http.BaseAddress = new Uri(string.Join("/", configuration.GetSection("APIManagement:BaseUrl").Value, configuration["Application:Manufacturer:Account:Url"]));
                     http.DefaultRequestHeaders.Add(
                         configuration.GetSection("APIManagement:Key").Value,
                         configuration.GetSection("APIManagement:Value").Value
                     );
                 })
                .AddPolicyHandlerFromRegistry(_waitAndRetryPolicyKey);
        }

        public static void ConfigureAdB2CClient(this IServiceCollection services)
        {
            services.AddScoped<ADB2CClient, ADB2CClient>((provider) =>
            {
                var config = services.BuildServiceProvider().GetService<BenefitsConfiguration>();

                return new ADB2CClient(config.Platform.External.Services.MSC.AzureB2B.Domain,
                    config.Platform.External.Services.MSC.AzureB2B.TenantId, config.Platform.External.Services.MSC.AzureB2B.ClientId);
            });
        }
    }
}
