using Microsoft.Azure.Cosmos;
using Microsoft.EntityFrameworkCore;
using System.Diagnostics.CodeAnalysis;
using System.Threading;
using System.Threading.Tasks;
using Up.France.Benefits.Core;

namespace Up.France.Benefits.Cosmos.EF
{
    [ExcludeFromCodeCoverage]
    public class Repository<T, TKey> : IRepository<T, TKey>
        where T : BusinessEntity<TKey>
    {
        public readonly DbContext _context;

        public Repository(DbContext context)
        {
            _context = context;
        }

        public async Task<T> GetTrackingByIdAsync(TKey id, CancellationToken cancellationToken = default)
        {
            T result = default;

            try
            {
                result = await _context.Set<T>().FindAsync(new object[] { id }, cancellationToken);
            }
            catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
            {

            }

            return result;
        }

        public async Task<T> GetTrackingByIdAsync(TKey id, string partitionkey, CancellationToken cancellationToken = default)
        {
            T result = default;

            try
            {
                result = await _context.Set<T>().FindAsync(new object[] { id }, cancellationToken);
            }
            catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
            {

            }

            return result;
        }

        public async Task<T> GetByIdAsync(TKey id, string partitionkey, CancellationToken cancellationToken = default)
        {
            T result = default;

            try
            {
                result = await _context.Set<T>().AsNoTracking().WithPartitionKey(partitionkey).SingleOrDefaultAsync(x => x.Id.Equals(id), cancellationToken);
            }
            catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
            {

            }

            return result;
        }

        public async Task<T> GetTrackingByPartitionKeyAsync(string partitionkey, CancellationToken cancellationToken = default)
        {
            T result = default;

            try
            {
                result = await _context.Set<T>().WithPartitionKey(partitionkey).FirstOrDefaultAsync(cancellationToken);
            }
            catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
            {

            }

            return result;
        }

        public async Task<T> GetByPartitionKeyAsync(string partitionkey, CancellationToken cancellationToken = default)
        {
            T result = default;

            try
            {
                result = await _context.Set<T>().AsNoTracking().WithPartitionKey(partitionkey).FirstOrDefaultAsync(cancellationToken);
            }
            catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
            {

            }

            return result;
        }

        public Task<bool> VerifyIdExistsAsync(TKey id, CancellationToken cancellationToken = default)
        {
            return _context.Set<T>().AsNoTracking().AsNoTracking().AnyAsync(x => x.Id.Equals(id), cancellationToken);
        }

        public async Task AddAsync(T item, CancellationToken cancellationToken = default)
        {
            await _context.Set<T>().AddAsync(item, cancellationToken);

            await _context.SaveChangesAsync(cancellationToken);
        }

        public async Task UpdateAsync(T item, CancellationToken cancellationToken = default)
        {
            _context.Set<T>().Update(item);

            await _context.SaveChangesAsync(cancellationToken);
        }

        public async Task DeleteByIdAsync(TKey id, CancellationToken cancellationToken = default)
        {
            var item = await GetTrackingByIdAsync(id, cancellationToken);

            _context.Set<T>().Remove(item);

            await _context.SaveChangesAsync(cancellationToken);
        }

        public async Task DeleteByIdAsync(TKey id, string partitionkey, CancellationToken cancellationToken = default)
        {
            var item = await GetTrackingByIdAsync(id, partitionkey, cancellationToken);

            _context.Set<T>().Remove(item);

            await _context.SaveChangesAsync(cancellationToken);
        }

        public async Task DeleteByPartitionKeyAsync(string partitionkey, CancellationToken cancellationToken = default)
        {
            var item = await GetTrackingByPartitionKeyAsync(partitionkey, cancellationToken);

            _context.Set<T>().Remove(item);

            await _context.SaveChangesAsync(cancellationToken);
        }

        public async Task DeleteAsync(T item, CancellationToken cancellationToken = default)
        {
            _context.Set<T>().Remove(item);

            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}
