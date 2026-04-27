using Microsoft.Extensions.DependencyInjection;
using Up.France.Benefits.Abstraction.Factories;
using Up.France.Benefits.Abstraction.Services;
using Up.France.Benefits.Business.Services;
public class ProductBalanceServiceFactory : IProductBalanceServiceFactory
{
    private readonly IServiceProvider _serviceProvider;

    public ProductBalanceServiceFactory(IServiceProvider serviceProvider)
    {
        _serviceProvider = serviceProvider;
    }

    public IProductsBalanceService GetService(int product)
    {
        return product switch
        {
            12 => _serviceProvider.GetRequiredService<UpDejeunerHybrideService>(),
            20 => _serviceProvider.GetRequiredService<UpCadhocHybrideService>(),
            11 => _serviceProvider.GetRequiredService<UpCadhocHybrideService>(),
            24 => _serviceProvider.GetRequiredService<UpCadhoc4CService>(),
            30 => _serviceProvider.GetRequiredService<UpCAPDematService>(),
            _ => throw new ArgumentException("Unsupported product"),
        };
    }
}