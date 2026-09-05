using Azure.Core;
using Azure.Identity;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using Up.France.Benefits.Configuration;
using Up.France.Benefits.Cosmos.SDK;
using Up.France.Benefits.Cosmos.SDK.Interfaces;
using Up.France.Benefits.Hosting;

namespace Up.Frence.Benefits.Api.Health
{
    public class CosmosDBHealthCheck : IHealthCheck
    {
        private readonly BenefitsConfiguration _settings;
        private readonly ICosmosDbContainerFactory _cosmosDbContainerFactory;

        

        public CosmosDBHealthCheck(IOptions<BenefitsConfiguration> options, ICosmosDbContainerFactory cosmosDbContainerFactory)
        {
            _settings = options.Value;
            _cosmosDbContainerFactory = cosmosDbContainerFactory;
        }

        public async Task<HealthCheckResult> CheckHealthAsync(HealthCheckContext context, CancellationToken cancellationToken = default)
        {
            try
            {

                CosmosClient client = _cosmosDbContainerFactory.GetClient();
                var database = client.GetDatabase(_cosmosDbContainerFactory.GetDatabaseName());

                await database.ReadAsync();

                return HealthCheckResult.Healthy();
            }
            catch (Exception ex)
            {
                return HealthCheckResult.Unhealthy("CosmosDB is not available.", ex);
            }
        }
    }
}
