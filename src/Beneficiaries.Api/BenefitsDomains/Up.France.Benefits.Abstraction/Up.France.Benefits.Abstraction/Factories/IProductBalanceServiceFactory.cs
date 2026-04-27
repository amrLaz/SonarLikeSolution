
using Up.France.Benefits.Abstraction.Services;

namespace Up.France.Benefits.Abstraction.Factories
{
    public interface IProductBalanceServiceFactory
    {
        IProductsBalanceService GetService(int product);
    }
}
