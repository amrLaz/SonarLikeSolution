using Up.France.Benefits.Core.Queries;
using Up.France.Benefits.Model.Model.Entites;

namespace Up.France.Benefits.Abstraction.Queries
{
    public interface IGetBalanceQuery
    {
        Task<AccountBalance> GetOperationsByAccountAndProduct(AccountBalanceQuery accountBalanceQuery);
        Task<List<Balance>> GetBalanceForMultiAccounts(List<string> accountIds);
    }
}