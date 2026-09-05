using Ardalis.Specification;
using System.Collections.Generic;
using System.Threading.Tasks;
using Up.France.Benefits.Core;

namespace Up.France.Benefits.Cosmos.SDK.Interfaces
{
    public interface IRepository<T, TKey> where T : BusinessEntity<TKey>
    {
        /// <summary>
        ///     Get items given a string SQL query directly.
        ///     Likely in production, you may want to use alternatives like Parameterized Query or LINQ to avoid SQL Injection and avoid having to work with strings directly.
        ///     This is kept here for demonstration purpose.
        /// </summary>
        /// <param name="query"></param>
        /// <returns></returns>
        Task<IEnumerable<T>> GetItemsAsync(string query);
        /// <summary>
        ///     Get items given a specification.
        /// </summary>
        /// <param name="specification"></param>
        /// <returns></returns>
        Task<IEnumerable<T>> GetItemsAsync(ISpecification<T> specification);

        /// <summary>
        ///     Get the count on items that match the specification
        /// </summary>
        /// <param name="specification"></param>
        /// <returns></returns>
        Task<int> GetItemsCountAsync(ISpecification<T> specification);
        /// <summary>
        ///     Get one item by Id
        /// </summary>
        /// <param name="id"></param>
        /// <returns></returns>
        Task<T> GetItemAsync(TKey id, string partitionKey);
        Task AddItemAsync(T item);
        Task UpdateItemAsync(TKey id, T item);
        Task DeleteItemAsync(TKey id, string partitionKey);
    }
}
