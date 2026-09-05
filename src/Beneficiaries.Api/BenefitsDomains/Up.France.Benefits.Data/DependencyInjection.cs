using Microsoft.Extensions.DependencyInjection;
using Up.France.Benefits.Abstraction.Repositories;
using Up.France.Benefits.Data.Repositories;
using Up.France.Benefits.Cosmos.SDK;
using Up.France.Benefits.Configuration;
using Gestion.Compte.MoveUp.Factories;
using Gestion.Compte.MoveUp.Abstract;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Primitives;
using Up.France.Benefits.Core.Queries;

namespace Up.France.Benefits.Data;
public static class DependencyInjection
{
    public static IServiceCollection AddData(this IServiceCollection services)
    {
        var OperationsContainerInfo = new ContainerInfo { Name = "Operations", PartitionKey = "account" };
        var BalancesContainerInfo = new ContainerInfo { Name = "Balances", PartitionKey = "account" };
        var EventsContainerInfo = new ContainerInfo { Name = "Events", PartitionKey = "operation_id" };

        using var provider = services.BuildServiceProvider();
        var config = provider.GetService<BenefitsConfiguration>();
        
        if (config == null)
        {
            throw new InvalidOperationException("BenefitsConfiguration is not registered.");
        }

        services.AddCosmosDb(
           endpointUrl: config.Database.Benefits.EndPoint,
           databaseName: config.Database.BenefitsCadhoc.Name,
           containers: new List<ContainerInfo> { OperationsContainerInfo, BalancesContainerInfo, EventsContainerInfo }
        );
        services.AddHttpContextAccessor();

        services.AddScoped<EventsFilters>(sp =>
        {
            var http = sp.GetRequiredService<IHttpContextAccessor>().HttpContext;
            var q = http?.Request.Query;

            string? GetString(string key) =>
                q?.TryGetValue(key, out var v) == true && !StringValues.IsNullOrEmpty(v)
                    ? v.ToString()
                    : null;

            DateTime? GetDate(string key)
            {
                if (q?.TryGetValue(key, out var v) == true &&
                    DateTime.TryParse(v.ToString(), out var dt))
                    return dt;
                return null;
            }

            double? GetDouble(string key)
            {
                if (q?.TryGetValue(key, out var v) == true &&
                    double.TryParse(v.ToString(), System.Globalization.NumberStyles.Any,
                                    System.Globalization.CultureInfo.InvariantCulture, out var d))
                    return d;
                return null;
            }

            List<string>? GetList(string key)
            {
                if (q?.TryGetValue(key, out var v) == true && v.Count > 0)
                    return v.ToList();
                return null;
            }

            return new EventsFilters
            {
                event_reference = GetString("event_reference"),
                event_type = GetString("event_type"),
                event_date_start = GetDate("event_date_start"),
                event_date_end = GetDate("event_date_end"),
                event_amount = GetDouble("event_amount"),
                event_status = GetString("event_status")
            };
        });

        services.AddScoped<PaginationParameters>(sp =>
        {
            var http = sp.GetRequiredService<IHttpContextAccessor>().HttpContext;
            var q = http?.Request.Query;
            var h = http?.Request.Headers;

            int TryGetInt(string? value, int defaultValue)
                => int.TryParse(value, out var i) ? i : defaultValue;

            var pagination = new PaginationParameters();

            // allow ?page / ?pageSize in query OR X-Page / X-PageSize headers
            pagination.Page = TryGetInt(q?["page"].ToString() ?? h?["X-Page"], pagination.Page);
            pagination.PageSize = TryGetInt(q?["pageSize"].ToString() ?? h?["X-PageSize"], pagination.PageSize);

            return pagination;
        });

        services.AddScoped<IOperationRepository, OperationRepository>();
        services.AddScoped<IBalanceRepository, BalanceRepository>();
        services.AddScoped<IEventRepository, EventRepository>();

        services.AddSingleton<IBeneficiaryAccountDetailsRequestFactory, BeneficiaryAccountDetailsRequestFactory>();

        return services;
    }



    //public static IServiceCollection AddFallBackData(this IServiceCollection services)
    //{
    //    var containerInfo = new ContainerInfo();
    //    containerInfo.Name = "Operations";
    //    containerInfo.PartitionKey = "account";
    //    using var provider = services.BuildServiceProvider();
    //    var config = provider.GetService<BenefitsConfiguration>();
    //    services.AddCosmosDb(
    //       endpointUrl: config.Database.Benefits.EndPoint,
    //       databaseName: config.Database.BenefitsCadhoc.Name,
    //       containers: new List<ContainerInfo> { containerInfo }
    //    );
    //    services.AddScoped<IOperationRepository, OperationRepository>();
    //    services.AddScoped<IBalanceRepository, BalanceRepository>();
    //    services.AddSingleton<AccountBalanceRequestFactory>();


    //    return services;
    //}
}