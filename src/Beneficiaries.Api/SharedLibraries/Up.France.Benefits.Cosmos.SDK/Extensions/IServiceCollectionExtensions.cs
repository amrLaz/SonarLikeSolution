using Azure.Core;
using Azure.Identity;
using Microsoft.Azure.Cosmos;
using Microsoft.Extensions.DependencyInjection;
using System.Collections.Generic;
using Up.France.Benefits.Configuration;
using Up.France.Benefits.Cosmos.SDK.Interfaces;
using System;
using Up.France.Benefits.Hosting;
using Microsoft.Extensions.Diagnostics.HealthChecks;

namespace Up.France.Benefits.Cosmos.SDK
{
    public static class IServiceCollectionExtensions
    {
        /// <summary>
        ///     Register a singleton instance of Cosmos Db Container Factory, which is a wrapper for the CosmosClient.
        /// </summary>
        /// <param name="services"></param>
        /// <param name="endpointUrl"></param>
        /// <param name="primaryKey"></param>
        /// <param name="databaseName"></param>
        /// <param name="containers"></param>
        /// <returns></returns>
        public static IServiceCollection AddCosmosDb(this IServiceCollection services,
                                                     string endpointUrl,
                                                     string databaseName,
                                                     List<ContainerInfo> containers)
        {

            string identityId = EnvironmentVariable.IdentityId();

            if (string.IsNullOrEmpty(identityId))
                throw new InvalidOperationException("SERVICEIDENTITY_CLIENTID environment variable is missing.");

            TokenCredential credential = new DefaultAzureCredential(new DefaultAzureCredentialOptions() { ManagedIdentityClientId = identityId });
            var client = new CosmosClient(endpointUrl, credential);
            CosmosDbContainerFactory cosmosDbClientFactory = new(client, databaseName, containers);
            services.AddSingleton<ICosmosDbContainerFactory>(cosmosDbClientFactory);
            
            return services;
        }
    }
}
