﻿using Ardalis.Specification;
using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Cosmos.Linq;
using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Linq;
using System.Threading.Tasks;
using Up.France.Benefits.Cosmos.SDK.Interfaces;
using Up.France.Benefits.Core;

namespace Up.France.Benefits.Cosmos.SDK
{
    [ExcludeFromCodeCoverage]
    public abstract class CosmosDbRepository<T, TKey> : IRepository<T, TKey>, IContainerContext<T, TKey>
        where T : BusinessEntity<TKey>, IPartitionedEntity
    {
        /// <summary>
        ///     Name of the CosmosDB container
        /// </summary>
        public abstract string ContainerName { get; }

        /// <summary>
        ///     Generate id
        /// </summary>
        /// <param name="entity"></param>
        /// <returns></returns>
        public abstract TKey GenerateId(T entity);

        /// <summary>
        ///     Resolve the partition key
        /// </summary>
        /// <param name="entityId"></param>
        /// <returns></returns>
        public abstract PartitionKey ResolvePartitionKey(string partitionKey);

        /// <summary>
        ///     Cosmos DB factory
        /// </summary>
        private readonly ICosmosDbContainerFactory _cosmosDbContainerFactory;

        /// <summary>
        ///     Cosmos DB container
        /// </summary>
        private readonly Microsoft.Azure.Cosmos.Container _container;

        private readonly ISpecificationEvaluator _specificationEvaluator;

        public CosmosDbRepository(ICosmosDbContainerFactory cosmosDbContainerFactory, ISpecificationEvaluator specificationEvaluator)
        {
            _cosmosDbContainerFactory = cosmosDbContainerFactory ?? throw new ArgumentNullException(nameof(ICosmosDbContainerFactory));
            _container = _cosmosDbContainerFactory.GetContainer(ContainerName)._container;
            _specificationEvaluator = specificationEvaluator;
        }

        #region Methods

        public async Task<T> GetItemAsync(TKey id, string partitionKey)
        {
            try
            {
                ItemResponse<T> response = await _container.ReadItemAsync<T>(id.ToString(), ResolvePartitionKey(partitionKey));
                return response.Resource;
            }
            catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                return default;
            }
        }

        // Search data using SQL query string
        // This shows how to use SQL string to read data from Cosmos DB for demonstration purpose.
        // For production, try to use safer alternatives like Parameterized Query and LINQ if possible.
        // Using string can expose SQL Injection vulnerability, e.g. select * from c where c.id=1 OR 1=1. 
        // String can also be hard to work with due to special characters and spaces when advanced querying like search and pagination is required.
        public async Task<IEnumerable<T>> GetItemsAsync(string queryString)
        {
            FeedIterator<T> resultSetIterator = _container.GetItemQueryIterator<T>(new QueryDefinition(queryString));
            List<T> results = new List<T>();
            while (resultSetIterator.HasMoreResults)
            {
                FeedResponse<T> response = await resultSetIterator.ReadNextAsync();

                results.AddRange(response.ToList());
            }

            return results;
        }

        /// <inheritdoc cref="IRepository{T}.GetItemsAsync(Ardalis.Specification.ISpecification{T})"/>
        public async Task<IEnumerable<T>> GetItemsAsync(ISpecification<T> specification)
        {
            IQueryable<T> queryable = ApplySpecification(specification);
            FeedIterator<T> iterator = queryable.ToFeedIterator<T>();

            List<T> results = new List<T>();
            while (iterator.HasMoreResults)
            {
                FeedResponse<T> response = await iterator.ReadNextAsync();

                results.AddRange(response.ToList());
            }

            return results;
        }

        /// <inheritdoc cref="IRepository{T}.GetItemsCountAsync(ISpecification{T})"/>
        public async Task<int> GetItemsCountAsync(ISpecification<T> specification)
        {
            IQueryable<T> queryable = ApplySpecification(specification);
            return await queryable.CountAsync();
        }

        public async Task AddItemAsync(T item)
        {
            item.Id = GenerateId(item);
            await _container.CreateItemAsync<T>(item, ResolvePartitionKey(item.PartitionKey));
        }

        public async Task UpdateItemAsync(TKey id, T item)
        {
            // Update
            await _container.UpsertItemAsync<T>(item, ResolvePartitionKey(item.PartitionKey));
        }

        public async Task DeleteItemAsync(TKey id, string partitionKey)
        {
            await _container.DeleteItemAsync<T>(id.ToString(), ResolvePartitionKey(partitionKey));
        }

        #endregion

        /// <summary>
        ///     Evaluate specification and return IQueryable
        /// </summary>
        /// <param name="specification"></param>
        /// <returns></returns>
        private IQueryable<T> ApplySpecification(ISpecification<T> specification)
        {
            return _specificationEvaluator.GetQuery(_container.GetItemLinqQueryable<T>(), specification);
        }
    }
}
