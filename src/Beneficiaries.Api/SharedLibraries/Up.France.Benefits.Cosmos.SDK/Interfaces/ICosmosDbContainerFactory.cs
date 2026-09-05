using Microsoft.Azure.Cosmos;
using System.Threading.Tasks;

namespace Up.France.Benefits.Cosmos.SDK.Interfaces
{
    public interface ICosmosDbContainerFactory
    {
        /// <summary>
        ///     Returns a CosmosDbContainer wrapper
        /// </summary>
        /// <param name="containerName"></param>
        /// <returns></returns>
        ICosmosDbContainer GetContainer(string containerName);

        CosmosClient GetClient();

        string GetDatabaseName();
        /// <summary>
        ///     Ensure the database is created
        /// </summary>
        /// <returns></returns>
        Task EnsureDbSetupAsync();
    }
}
