using Microsoft.Extensions.DependencyInjection;
using Up.France.Benefits.Abstraction.Factories;
using Up.France.Benefits.Abstraction.Queries;
using Up.France.Benefits.Abstraction.Services;
using Up.France.Benefits.Business.Helpers;
using Up.France.Benefits.Business.Queries;
using Up.France.Benefits.Business.Services;

namespace Up.France.Benefits.Business;
public static class DependencyInjection
{
    public static IServiceCollection AddBusiness(this IServiceCollection services)
    {
        
        services.AddScoped<UpDejeunerHybrideService>();
        services.AddScoped<UpCAPDematService>();
        services.AddScoped<UpCadhocHybrideService>();
        services.AddScoped<UpDejeuner4CService>();
        services.AddScoped<UpCadhoc4CService>();
        services.AddScoped<IVintageBalanceService, VintageBalanceService>();
        services.AddScoped<IGetOperationQuery, GetOperationQuery>();
        services.AddScoped<IGetBalanceQuery, GetBalanceQuery>();
        services.AddScoped<IGetEventsQuery, GetEventsQuery>();
        services.AddScoped<ICashBackCalculator, CashBackCalculator>();
        services.AddScoped<IAuthorizableBalanceService, AuthorizableBalanceService>();
        services.AddScoped<IProductBalanceServiceFactory, ProductBalanceServiceFactory>();

        return services;
    }
}