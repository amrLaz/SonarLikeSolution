using Microsoft.Azure.Functions.Worker.Extensions.OpenApi.Extensions;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System;
using System.Diagnostics.CodeAnalysis;
using Up.France.Benefits.AspNetCore;
using Up.France.Benefits.Configuration;
using Up.France.Benefits.Hosting;

namespace Up.France.Benefits.NetCore.Function
{
    [ExcludeFromCodeCoverage]
    public static class HostBuilderCreator
    {
        public static IHostBuilder Create(Action<IServiceCollection, IConfiguration> configure, string[] args)
        {
            return Create(configure, false, args);
        }

        public static IHostBuilder CreateForOpenApi(Action<IServiceCollection, IConfiguration> configure, string[] args)
        {
            return Create(configure, true, args);
        }

        private static IHostBuilder Create(Action<IServiceCollection, IConfiguration> configure, bool useOpenApi, string[] args)
        {
            var builder = new HostBuilder();

            if (useOpenApi)
                builder.ConfigureFunctionsWorkerDefaults(worker => worker.UseNewtonsoftJson())
                       .ConfigureOpenApi();
            else
                builder.ConfigureFunctionsWorkerDefaults();
                
            builder.ConfigureAppConfiguration((context, config) =>
            {
                config.AddEnvironmentVariables();
                config.ConfigureKeyVault();
            })
            .ConfigureServices((context, services) =>
            {
                services.SetupConfiguration(context.Configuration);
                services.AddLogging();
                services.AddApplicationInsightsTelemetryWorkerService();
                configure(services, context.Configuration);
            });

            return builder;
        }
    }
}