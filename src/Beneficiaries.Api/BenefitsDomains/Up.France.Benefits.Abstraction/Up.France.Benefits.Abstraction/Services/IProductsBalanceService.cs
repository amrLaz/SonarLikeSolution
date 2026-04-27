using Up.France.Benefits.Core.Queries;

namespace Up.France.Benefits.Abstraction.Services
{
    public interface IProductsBalanceService
    {
        Task<Model.Model.Entites.AccountBalance> getBalance(AccountBalanceQuery accountBalanceQuery);

    }
}
