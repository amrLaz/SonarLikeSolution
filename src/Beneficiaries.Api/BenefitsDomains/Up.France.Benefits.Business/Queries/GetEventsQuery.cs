using Up.France.Benefits.Abstraction.Queries;
using Up.France.Benefits.Abstraction.Repositories;
using Up.France.Benefits.Core.Models;
using Up.France.Benefits.Core.Queries;
using Up.France.Benefits.Model.Model.Entites;
using Up.France.Benefits.Model.Models.Entites;

namespace Up.France.Benefits.Business.Queries
{

    public sealed class GetEventsQuery : IGetEventsQuery
    {
        private IEventRepository _eventRepositry;

        public GetEventsQuery(IEventRepository eventRepositry)
        {
            _eventRepositry = eventRepositry;
        }

        public async Task<(List<Event>, int, int)> GetEventsByOperationAndAccount(string accountId, string operationId)
        {
            return await _eventRepositry.GetEventsByOperationAndAccount(accountId, operationId);
        }

    }
}
