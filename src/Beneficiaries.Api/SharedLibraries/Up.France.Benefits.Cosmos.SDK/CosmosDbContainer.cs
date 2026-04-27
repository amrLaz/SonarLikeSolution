using Microsoft.Azure.Cosmos;
using System.Diagnostics.CodeAnalysis;
using Up.France.Benefits.Cosmos.SDK.Interfaces;

namespace Up.France.Benefits.Cosmos.SDK
{
    [ExcludeFromCodeCoverage]
    public class CosmosDbContainer : ICosmosDbContainer
    {
        public Container _container { get; }

        public CosmosDbContainer(CosmosClient cosmosClient,
                                 string databaseName,
                                 string containerName)
        {
            _container = cosmosClient.GetContainer(databaseName, containerName);
        }
    }
}
