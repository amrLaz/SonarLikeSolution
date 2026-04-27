using Microsoft.Azure.Cosmos;
using Microsoft.Azure.Cosmos.Linq;
using Up.France.Benefits.Abstraction.Repositories;
using Up.France.Benefits.Core.Queries;
using Up.France.Benefits.Cosmos.SDK.Interfaces;
using Up.France.Benefits.Model.Models.Entites;

namespace Up.France.Benefits.Data.Repositories
{
    public class EventRepository : IEventRepository
    {
        private readonly Container _eventsContainer;
        private readonly EventsFilters _eventsFilters;
        private readonly PaginationParameters _paginationParameters;


        public EventRepository(
            ICosmosDbContainerFactory cosmosDbContainerFactory,
            EventsFilters eventsFilters,
            PaginationParameters paginationParameters
        )
        {
            _eventsContainer = cosmosDbContainerFactory.GetContainer("Events")._container;
            _eventsFilters = eventsFilters;
            _paginationParameters = paginationParameters;
        }

        public async Task<(List<Event>, int, int)> GetEventsByOperationAndAccount(string accountId, string operationId)
        {
            var query = _eventsContainer
                .GetItemLinqQueryable<Event>(
                    requestOptions: new QueryRequestOptions
                    {
                        PartitionKey = new PartitionKey(accountId)
                    })
                .Where(i => i.operation_id == operationId);
            query = _eventsFilters.applyFilters(query);

            int eventsCount = await this.GetEventscountByOperationAndAccount(accountId, operationId);

            query = query.OrderByDescending(i => i.event_date);

            query = query.Skip((_paginationParameters.Page - 1) * _paginationParameters.PageSize)
               .Take(_paginationParameters.PageSize);

            var events = new List<Event>();
            using var feed = query.ToFeedIterator();
            while (feed.HasMoreResults)
            {
                var response = await feed.ReadNextAsync();
                events.AddRange(response);
            }
            int totalPageCount = (int)Math.Ceiling((double)eventsCount / _paginationParameters.PageSize);

            return (events, eventsCount, totalPageCount);
        }

        public async Task<int> GetEventscountByOperationAndAccount(string accountId, string operationId)
        {
            IQueryable<Event> query = null;

            query = _eventsContainer.GetItemLinqQueryable<Event>(
                requestOptions: new QueryRequestOptions
            {
                PartitionKey = new PartitionKey(accountId)
            })
                .Where(d => d.operation_id == operationId);

            query = _eventsFilters.applyFilters(query);

            return await query.CountAsync();
        }




    }
}
