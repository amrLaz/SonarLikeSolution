using Up.France.Benefits.Core.Models;
using Up.France.Benefits.Core.Queries;
using Up.France.Benefits.Model.Model.Entites;
using Up.France.Benefits.Model.Models.Entites;

namespace Up.France.Benefits.Abstraction.Queries
{
    public interface IGetEventsQuery
    {
        Task<(List<Event>, int, int)> GetEventsByOperationAndAccount(string accountId, string operationId);
    }
}