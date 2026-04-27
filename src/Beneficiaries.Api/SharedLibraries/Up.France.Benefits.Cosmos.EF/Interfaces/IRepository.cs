using System.Threading;
using System.Threading.Tasks;
using Up.France.Benefits.Core;

namespace Up.France.Benefits.Cosmos.EF
{
    public interface IRepository<T, TKey> where T : BusinessEntity<TKey>
    {
        Task<T> GetTrackingByIdAsync(TKey id, CancellationToken cancellationToken = default);

        Task<T> GetByIdAsync(TKey id, string partitionkey, CancellationToken cancellationToken = default);

        Task<T> GetTrackingByIdAsync(TKey id, string partitionkey, CancellationToken cancellationToken = default);

        Task<T> GetTrackingByPartitionKeyAsync(string partitionkey, CancellationToken cancellationToken = default);

        Task<T> GetByPartitionKeyAsync(string partitionkey, CancellationToken cancellationToken = default);

        Task<bool> VerifyIdExistsAsync(TKey id, CancellationToken cancellationToken = default);

        Task AddAsync(T item, CancellationToken cancellationToken = default);

        Task UpdateAsync(T item, CancellationToken cancellationToken = default);

        Task DeleteByIdAsync(TKey id, CancellationToken cancellationToken = default);

        Task DeleteByIdAsync(TKey id, string partitionkey, CancellationToken cancellationToken = default);

        Task DeleteByPartitionKeyAsync(string partitionkey, CancellationToken cancellationToken = default);

        Task DeleteAsync(T item, CancellationToken cancellationToken = default);
    }
}
