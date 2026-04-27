using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using System.Diagnostics.CodeAnalysis;
using Up.France.Benefits.Configuration;
using Up.France.Benefits.Hosting;
using Up.NCommon.WebApi.Extensions;

namespace Up.France.Benefits.AspNetCore.Web
{
    [ExcludeFromCodeCoverage]
    public static class HostBuilderCreator
    {
        public static IHostBuilder Create<TStartup>(string[] args)
            where TStartup : class
        {
            
            return Host.CreateDefaultBuilder(args)
                .ConfigureAppConfiguration((context, config) =>
                {
                    config.ConfigureKeyVault();
                })
                .ConfigureServices((context, services) =>
                {
                    services.SetupConfiguration(context.Configuration);
                    services.AddLogging();                    
                    services.ConfigureAI();
                    services.AddApplicationInsightsTelemetryProcessor<CustomControllerFilter>();
                    services.ConfigureAuthorization();
                })               
                .ConfigureWebHostDefaults(webBuilder =>
                {
                    webBuilder.UseStartup<TStartup>();
                });
        }
    }
}