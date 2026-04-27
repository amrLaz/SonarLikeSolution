using Up.France.Benefits.Model.Models.Entites;

namespace Up.France.Benefits.Abstraction.Repositories
{
    public interface IEventRepository
    {
        Task<(List<Event>, int, int)> GetEventsByOperationAndAccount(string accountId, string operationId);


    }
}
