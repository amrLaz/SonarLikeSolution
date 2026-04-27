using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Cosmos.Linq;
using Microsoft.Identity.Client;
using System.Collections.Generic;
using System.Drawing.Printing;
using System.Linq;
using Up.France.Benefits.Abstraction.Repositories;
using Up.France.Benefits.Core.Helpers;
using Up.France.Benefits.Core.Models;
using Up.France.Benefits.Core.Queries;
using Up.France.Benefits.Cosmos.SDK;
using Up.France.Benefits.Cosmos.SDK.Interfaces;
using Up.France.Benefits.Model.Model.Entites;
using Up.France.Benefits.Model.Models.Entites;

namespace Up.France.Benefits.Data.Repositories
{
    public class OperationRepository : IOperationRepository
    {
        private readonly Container _operationsContainer;

        public OperationRepository(ICosmosDbContainerFactory cosmosDbContainerFactory)
        {
            _operationsContainer = cosmosDbContainerFactory.GetContainer("Operations")._container;
        }

        public async Task<(List<Operation>, string, int)> GetOperationsByAccount(
            string accountId,
            PaginationParameters paginationParameters,
            OperationsFilters operationsFilters
            )
        {
            List<Operation> operations = new List<Operation>();
            IQueryable<Operation> query;
            string nextContinuationToken = null;
            query = _operationsContainer.GetItemLinqQueryable<Operation>(
            continuationToken: paginationParameters.ContinuationToken,
            requestOptions: new QueryRequestOptions()
            {
                MaxItemCount = paginationParameters.PageSize,
                PartitionKey = new PartitionKey(accountId.ToString())
            });

            query = operationsFilters.applyFilters(query);

            //int operationsCount = await this.GetTotalResultCount(new List<string> { accountId }, operationsFilters);

            int operationsCount = 0;
            
            query = query.OrderByDescending(i => i.operation_date);

            FeedIterator<Operation> feedIterator = query.ToFeedIterator();

            while (feedIterator.HasMoreResults)
            {
                var response = await feedIterator.ReadNextAsync();
                operations.AddRange(response);
                nextContinuationToken = response.ContinuationToken;
                if (response.Count <= paginationParameters.PageSize) { break; }
            }

            return (operations, nextContinuationToken, operationsCount);
        }


        public async Task<(List<Operation>, string, int)> GetOperationsByMultiAccounts(
            OperationsMultiAccountsIds operationsMultiAccountsIds,
            PaginationParameters paginationParameters,
            OperationsFilters operationsFilters
            )
        {
            List<Operation> operations = new List<Operation>();
            IQueryable<Operation> query = null;
            string nextContinuationToken = null;
            query = _operationsContainer.GetItemLinqQueryable<Operation>(
            continuationToken: paginationParameters.ContinuationToken,
            requestOptions: new QueryRequestOptions()
            {
                MaxItemCount = paginationParameters.PageSize,
            }).Where(d => operationsMultiAccountsIds.accountsIds.Contains(d.account));

            query = operationsFilters.applyFilters(query);

            //int operationsCount = await this.GetTotalResultCount(operationsMultiAccountsIds.accountsIds, operationsFilters);

            int operationsCount = 0;

            query = query.OrderByDescending(i => i.operation_date);

            FeedIterator<Operation> feedIterator = query.ToFeedIterator();
           
            while (feedIterator.HasMoreResults)
            {
                var response = await feedIterator.ReadNextAsync();
                operations.AddRange(response);
                nextContinuationToken = response.ContinuationToken;
                if (response.Count <= paginationParameters.PageSize) { break; }
            }

            return (operations, nextContinuationToken, operationsCount);
        }

        public async Task<(List<Operation>, int, int)> GetOperationsByAccountClassicPagination(
            string accountId,
            PaginationParameters paginationParameters,
            OperationsFilters operationsFilters
            )
        {
            List<Operation> operations = new List<Operation>();
            IQueryable<Operation> query = null;

            query = _operationsContainer.GetItemLinqQueryable<Operation>(
            requestOptions: new QueryRequestOptions()
            {
                PartitionKey = new PartitionKey(accountId.ToString())
            });

            query = operationsFilters.applyFilters(query);

            int operationsCount = await this.GetTotalResultCount(new List<string> { accountId }, operationsFilters);

            query = query.OrderByDescending(i => i.operation_date);

            query = query.Skip((paginationParameters.Page - 1) * paginationParameters.PageSize)
                           .Take(paginationParameters.PageSize);

            FeedIterator<Operation> feedIterator = query.ToFeedIterator();

            while (feedIterator.HasMoreResults)
            {
                var response = await feedIterator.ReadNextAsync();
                operations.AddRange(response);
            }
            int totalPageCount =(int) Math.Ceiling((double) operationsCount / paginationParameters.PageSize);

            return (operations, operationsCount, totalPageCount);
        }

        public async Task<int> GetTotalResultCount(
            List<string> operationsMultiAccountsIds,
            OperationsFilters operationsFilters
            )
        {
            IQueryable<Operation> query = null;

            query = _operationsContainer.GetItemLinqQueryable<Operation>()
                .Where(d => operationsMultiAccountsIds.Contains(d.account));

            query = operationsFilters.applyFilters(query);

            return await query.CountAsync();
        }

        public async Task<List<AccountInfos>> CheckIfAccountsHasOperations(
            List<string> accountsIds,
            OperationsFilters filters)
        {
            IQueryable<Operation> query = null;
            List<Operation> operations = new List<Operation>();

            query = _operationsContainer.GetItemLinqQueryable<Operation>()
                .Where(d => accountsIds.Contains(d.account));

            query = filters.applyFilters(query);

            FeedIterator<Operation> feedIterator = query.ToFeedIterator();

            while (feedIterator.HasMoreResults)
            {
                var response = await feedIterator.ReadNextAsync();
                operations.AddRange(response);
            }

            List<AccountInfos> accountInfos = operations.GroupBy(op => op.account).Select(g => new AccountInfos
            {
                serviceReference = g.Key,
                hasTransaction = g.Count() > 0
            }).ToList();
            List<string> fetchedAccountsIds = accountInfos.Select(accountInfo =>  accountInfo.serviceReference ).ToList();
            foreach (var accountId in accountsIds)
            {
                if (!fetchedAccountsIds.Contains(accountId))
                {
                    accountInfos.Add(new AccountInfos { serviceReference = accountId, hasTransaction = false });
                }
            }

            return accountInfos;
        }

        public async Task<Operation> GetOneOperationByAccountAndOperationReference(string accountId, string operationId)
        {
            var query = _operationsContainer
            .GetItemLinqQueryable<Operation>(
                requestOptions: new QueryRequestOptions
                {
                    PartitionKey = new PartitionKey(accountId)
                })
            .Where(i => i.operation_reference == operationId);

            var operation = new Operation();
            using var feed = query.ToFeedIterator();
            if (feed.HasMoreResults)
            {
                FeedResponse<Operation> response  = await feed.ReadNextAsync();
                operation = response.Resource.FirstOrDefault();
            }

            return operation;
        }


        //public IQueryable<Operation> applyFilters(IQueryable<Operation> query, OperationsFilters operationsFilters)
        //{
        //    query = this.applyDateFilter(query, operationsFilters);

        //    query = this.applyFilterLoadUnLoadMustBeCompletedOrAccepter(query, operationsFilters);

        //    query = this.applyOperationTypeFilter(query, operationsFilters);

        //    query = this.applyOperationRefFilter(query, operationsFilters);

        //    query = this.applyMinMaxAmountFilter(query, operationsFilters);

        //    return query;
        //}
        //private IQueryable<Operation> applyFilterLoadUnLoadMustBeCompletedOrAccepter(IQueryable<Operation> query, OperationsFilters operationsFilters)
        //{
        //    if (!(bool)operationsFilters.LoadUnloadMustBeAcceptedOrCompleted)
        //    {
        //        return query;
        //    }

        //    return query.Where(
        //            i =>
        //            (i.operation_type != "LOAD" && i.operation_type != "UNLOAD") ||
        //            (i.operation_status == "COMPLETED" || i.operation_status == "ACCEPTED")
        //        );
        //}
        //private IQueryable<Operation> applyDateFilter(IQueryable<Operation> query, OperationsFilters operationsFilters)
        //{
        //    if (DateTimeFunctions.IsValidDateTime(operationsFilters.DateStart) &&
        //        DateTimeFunctions.IsValidDateTime(operationsFilters.DateEnd))
        //    {
        //        long dateStart = DateTimeFunctions.ConvertToUnixTime((DateTime)operationsFilters.DateStart);
        //        long dateEnd = DateTimeFunctions.ConvertToUnixTime((DateTime)operationsFilters.DateEnd);

        //        return query.Where(
        //            i => i.operation_date >= dateStart &&
        //            i.operation_date <= dateEnd);
        //    }

        //    return query;

        //}
        //private IQueryable<Operation> applyOperationTypeFilter(IQueryable<Operation> query, OperationsFilters operationsFilters)
        //{

        //    if (operationsFilters.operationType != null)
        //    {
        //        return query.Where(i => (i.operation_type == operationsFilters.operationType));
        //    }
        //    return query;
        //}
        //private IQueryable<Operation> applyOperationRefFilter(IQueryable<Operation> query, OperationsFilters operationsFilters)
        //{
        //    if (operationsFilters.operationRef != null)
        //    {
        //        return query.Where(i => (i.operation_reference == operationsFilters.operationRef));
        //    }
        //    return query;
        //}
        //private IQueryable<Operation> applyMinMaxAmountFilter(IQueryable<Operation> query, OperationsFilters operationsFilters)
        //{
        //   if(operationsFilters.amountMin != null)
        //   {
        //        query =  query.Where(i => (i.actual_amount >= operationsFilters.amountMin));
        //   }

        //    if (operationsFilters.amountMax != null)
        //    {
        //        query = query.Where(i => (i.actual_amount <= operationsFilters.amountMax));
        //    }

        //    return query;
        //}
    }
}
