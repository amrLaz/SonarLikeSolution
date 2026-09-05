using Microsoft.Azure.Cosmos;
using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Linq;
using System.Threading.Tasks;
using Up.France.Benefits.Configuration;
using Up.France.Benefits.Cosmos.SDK.Interfaces;

namespace Up.France.Benefits.Cosmos.SDK
{
    [ExcludeFromCodeCoverage]
    public class CosmosDbContainerFactory : ICosmosDbContainerFactory
    {
        /// <summary>
        ///     Azure Cosmos DB Client
        /// </summary>
        private readonly CosmosClient _cosmosClient;
        private readonly string _databaseName;
        private readonly List<ContainerInfo> _containers;

        /// <summary>
        ///     Ctor
        /// </summary>
        /// <param name="cosmosClient"></param>
        /// <param name="databaseName"></param>
        /// <param name="containers"></param>
        public CosmosDbContainerFactory(CosmosClient cosmosClient,
                                   string databaseName,
                                   List<ContainerInfo> containers)
        {
            _databaseName = databaseName ?? throw new ArgumentNullException(nameof(databaseName));
            _containers = containers ?? throw new ArgumentNullException(nameof(containers));
            _cosmosClient = cosmosClient ?? throw new ArgumentNullException(nameof(cosmosClient));
        }

        public ICosmosDbContainer GetContainer(string containerName)
        {
            if (!_containers.Any(x => x.Name == containerName))
            {
                throw new ArgumentException($"Unable to find container: {containerName}");
            }

            return new CosmosDbContainer(_cosmosClient, _databaseName, containerName);
        }

        public CosmosClient GetClient()
        {
            return _cosmosClient;
        }

        public string GetDatabaseName()
        {
            return _databaseName;
        }

        public async Task EnsureDbSetupAsync()
        {
            Microsoft.Azure.Cosmos.DatabaseResponse database = await _cosmosClient.CreateDatabaseIfNotExistsAsync(_databaseName);

            foreach (ContainerInfo container in _containers)
            {
                await database.Database.CreateContainerIfNotExistsAsync(container.Name, $"{container.PartitionKey}");
            }
        }
    }
}
