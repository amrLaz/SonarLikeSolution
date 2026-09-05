using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using System.Diagnostics.CodeAnalysis;
using Up.France.Benefits.Configuration;
using Up.NCommon.HttpClientWrappers;

namespace Gestion.Compte.MoveUp
{
    [ExcludeFromCodeCoverage]
    public static class GestionCompteMoveUpClientExtensions
    {
        public static void ConfigureGestionCompteMoveUpClient(this IServiceCollection services)
        {

            string GestionCompteMoveUpClientSoap = Environment.GetEnvironmentVariable("GestionCompteMoveUpClientIsSoap");
            
            bool isSoap = string.Equals(GestionCompteMoveUpClientSoap, "true", StringComparison.OrdinalIgnoreCase);

            if (isSoap)
            {
                var GestionCompteMoveUpClientBuilderSoap = services.AddHttpClient("GestionCompteMoveUpClientSoap");

                GestionCompteMoveUpClientBuilderSoap.AddTypedClient<IGestionCompteMoveUpClient>((client, provider) =>
                {
                    var config = provider.GetService<BenefitsConfiguration>();
                    return new GestionCompteMoveUpClientSoap(
                        new RestHttpClient(client),
                        provider.GetService<ILogger<GestionCompteMoveUpClientSoap>>(),
                        config.GestionCompteMoveUpSoap.WsBaseUrl);
                });
                return;

            }

            var GestionCompteMoveUpClientBuilder = services.AddHttpClient("GestionCompteMoveUpClient")
                .ConfigureHttpClient((provider, httpClient) =>
                {
                    var config = provider.GetService<BenefitsConfiguration>();

                    httpClient.DefaultRequestHeaders.Add("Ocp-Apim-Subscription-Key", config.GestionCompteMoveUp.OcpApimSubscriptionKey);

                    httpClient.DefaultRequestHeaders.Add("Accept", "application/json");
                }
            );

            GestionCompteMoveUpClientBuilder.AddTypedClient<IGestionCompteMoveUpClient>((client, provider) =>
            {

                var config = provider.GetService<BenefitsConfiguration>();
                return new GestionCompteMoveUpClient(
                    new RestHttpClient(client),
                    provider.GetService<ILogger<GestionCompteMoveUpClient>>(),
                    config.GestionCompteMoveUp.WsBaseUrl);
            });
        }
    }
}
