using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using StackExchange.Redis;
using System;
using System.Net;
using Azure.Messaging.ServiceBus;
using Up.France.Benefits.Messaging;
using Up.France.Benefits.Notifications.Functions;
using Up.France.Benefits.Notifications.Functions.Client;
using Up.France.ODI.Services.Authentication.DotnetClient;

using Up.France.Services.MSC.DotnetClient.v1;
using Up.NCommon.DistributedCache;

var host = new HostBuilder()
    .ConfigureFunctionsWorkerDefaults()
    .ConfigureServices(services =>
    {
        services.AddApplicationInsightsTelemetryWorkerService();
        FunctionsAssemblyResolver.RedirectAssembly();
        var localRootPath = Environment.GetEnvironmentVariable("AzureWebJobsScriptRoot");
        var azureRootPath = $"{Environment.GetEnvironmentVariable("HOME")}/site/wwwroot";

        var actualRootPath = localRootPath ?? azureRootPath;

        var configuration = new ConfigurationBuilder()
            .SetBasePath(actualRootPath)
            .AddJsonFile("local.settings.json", optional: true, reloadOnChange: true)
            .AddEnvironmentVariables()
            .Build();
        
        BindConfigurations(services, configuration);
        ConfigureCache(services, configuration);
        
        services.AddScoped<IBeneficiaryServiceClient, BeneficiaryServiceClient>();
        services.AddScoped<IAzureB2BService, AzureB2BService>();
        services.AddScoped<IMscServiceClient, MscServiceClient>();

        var mscConf = services.BuildServiceProvider().GetRequiredService<IOptions<MSCConfiguration>>().Value;
        var azureB2BConf = services.BuildServiceProvider().GetRequiredService<IOptions<AzureB2BConfiguration>>().Value;

        services.AddHttpClient("MscClient", (provider, client) => client.BaseAddress = new Uri(mscConf.Url, UriKind.Absolute))
        .AddTypedClient<IEventClient>((client) =>
        {
            var authenticationResult = (new ADB2CClient(azureB2BConf.Domain,
                azureB2BConf.TenantId,
                azureB2BConf.ClientId))
                .GetAccessToken_ClientCredentials(azureB2BConf.ClientSecret,
                azureB2BConf.ScopesMSC).GetAwaiter().GetResult();

            var eventClient = new EventClient(mscConf.Url, client);
            eventClient.SetBearerToken(authenticationResult.AccessToken);
            return eventClient;
        });
        
        services.AddSingleton<ServiceBusClient>(sp =>
        {
            var connectionString = services.BuildServiceProvider().GetRequiredService<IOptions<MSCConfiguration>>().Value.ServiceBusConnectionString;
            return new ServiceBusClient(connectionString);
        });
        
        services.AddTransient<IEventHubPublisher<EventTrackerConfiguration>>(sp =>
        {
            var config = sp.GetRequiredService<EventTrackerConfiguration>();
            return new EventHubPublisher<EventTrackerConfiguration>(config);
        });

    })
    .Build();

void BindConfigurations(IServiceCollection services, IConfiguration configuration)
{
    services.Configure<AzureB2BConfiguration>(configuration.GetSection("AzureB2BConfiguration"));
    services.AddSingleton(resolver =>
        resolver.GetRequiredService<IOptions<AzureB2BConfiguration>>().Value);

    services.Configure<BeneficiaryConfiguration>(configuration.GetSection("BeneficiaryConfiguration"));
    services.AddSingleton(resolver =>
        resolver.GetRequiredService<IOptions<BeneficiaryConfiguration>>().Value);

    services.Configure<MSCConfiguration>(configuration.GetSection("MSC"));
    services.AddSingleton(resolver =>
        resolver.GetRequiredService<IOptions<MSCConfiguration>>().Value);

    services.Configure<CacheConfiguration>(configuration.GetSection("Redis"));
    services.AddSingleton(resolver =>
        resolver.GetRequiredService<IOptions<CacheConfiguration>>().Value);
    
    services.Configure<AccountLoadingNotificationSettings>(configuration.GetSection("AccountLoading"));
    services.AddSingleton(resolver =>
        resolver.GetRequiredService<IOptions<AccountLoadingNotificationSettings>>().Value);
        
    services.Configure<EventTrackerConfiguration>(configuration.GetSection("EventTracker"));
    services.AddSingleton(resolver =>
        resolver.GetRequiredService<IOptions<EventTrackerConfiguration>>().Value);
}

void ConfigureCache(IServiceCollection services, IConfiguration configuration)
{
    services.AddDistributedRedisCache(options =>
    {
        var configurationOptions = new ConfigurationOptions();
        configurationOptions.EndPoints.Add(new DnsEndPoint(configuration["Redis:Url"], Convert.ToInt32(configuration["Redis:Port"])));
        configurationOptions.Ssl = true;
        configurationOptions.Password = configuration["Redis:AccessKey"];
        configurationOptions.AllowAdmin = true;
        configurationOptions.KeepAlive = 30;
        configurationOptions.ConnectTimeout = 15000;
        configurationOptions.SyncTimeout = 15000;

        options.InstanceName = configuration.GetValue<string>("Redis:Name");
        options.ConfigurationOptions = configurationOptions;
    });
}

await host.RunAsync();
