using Gestion.Compte.MoveUp.Responses;
using Up.France.Benefits.Core.Queries;
using Up.France.Benefits.Model.Model.Entites;

namespace Up.France.Benefits.Abstraction.Repositories
{
    public interface IBalanceRepository
    {
        Task<GetBalanceWsResponseDTO> GetBalanceByAcountAndProduct(AccountBalanceQuery accountBalanceQuery);
        Task<decimal?> GetBalanceDevOps(string accountId);
        Task<List<Balance>> GetBalanceDevOpsForMultiAccounts(List<string> accountsIds);

    }
}
