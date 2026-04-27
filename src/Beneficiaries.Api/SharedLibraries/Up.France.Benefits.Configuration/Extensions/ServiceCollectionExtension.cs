using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using System.Diagnostics.CodeAnalysis;
using Up.France.Benefits.Configuration.Configurations;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public static class ServiceCollectionExtensiosn
    {
        public static void SetupConfiguration(this IServiceCollection services, IConfiguration configuration)
        {
            services.Configure<ApplicationConfiguration>(configuration.GetSection("Application"));
            services.Configure<DataBaseConfiguration>(configuration.GetSection("Database"));
            services.Configure<PlatformConfiguration>(configuration.GetSection("Platform"));
            services.Configure<GestionCompteMoveUp>(configuration.GetSection("GestionCompteMoveUp"));
            services.Configure<GestionCompteMoveUpSoap>(configuration.GetSection("GestionCompteMoveUpSoap"));

            services.Configure<VintagePeriodConfig>(configuration.GetSection("VintagePeriodConfig"));


            services.AddSingleton(provider =>
            {
                return new BenefitsConfiguration()
                {
                    Application = provider.GetRequiredService<IOptions<ApplicationConfiguration>>().Value,
                    Database = provider.GetRequiredService<IOptions<DataBaseConfiguration>>().Value,
                    Platform = provider.GetRequiredService<IOptions<PlatformConfiguration>>().Value,
                    GestionCompteMoveUp = provider.GetRequiredService<IOptions<GestionCompteMoveUp>>().Value,
                    GestionCompteMoveUpSoap = provider.GetRequiredService<IOptions<GestionCompteMoveUpSoap>>().Value,
                    VintagePeriodConfig = provider.GetRequiredService<IOptions<VintagePeriodConfig>>().Value
                };
            });
        }
    }
}
