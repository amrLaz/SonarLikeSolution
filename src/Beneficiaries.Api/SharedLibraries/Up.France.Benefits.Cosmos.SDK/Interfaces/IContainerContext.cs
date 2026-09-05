using Microsoft.Azure.Cosmos;
using Up.France.Benefits.Core;

namespace Up.France.Benefits.Cosmos.SDK.Interfaces
{
    /// <summary>
    ///  Defines the container level context
    /// </summary>
    /// <typeparam name="T"></typeparam>
    public interface IContainerContext<T, TKey> where T : BusinessEntity<TKey>
    {
        string ContainerName { get; }
        TKey GenerateId(T entity);
        PartitionKey ResolvePartitionKey(string partitionKey);
    }
}
