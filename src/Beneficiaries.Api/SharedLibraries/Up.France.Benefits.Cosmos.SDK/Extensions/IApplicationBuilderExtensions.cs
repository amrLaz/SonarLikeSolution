using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;
using System.Diagnostics.CodeAnalysis;
using Up.France.Benefits.Cosmos.SDK.Interfaces;

namespace Up.France.Benefits.Cosmos.SDK
{
    /// <summary>
    ///     Extension methods for IApplicationBuilder 
    /// </summary>
    [ExcludeFromCodeCoverage]
    public static class IApplicationBuilderExtensions
    {
        /// <summary>
        ///     Ensure Cosmos DB is created
        /// </summary>
        /// <param name="builder"></param>
        public static void EnsureCosmosDbIsCreated(this IApplicationBuilder builder)
        {
            using IServiceScope serviceScope = builder.ApplicationServices.GetRequiredService<IServiceScopeFactory>().CreateScope();
            ICosmosDbContainerFactory factory = serviceScope.ServiceProvider.GetService<ICosmosDbContainerFactory>();

            factory.EnsureDbSetupAsync().Wait();
        }
    }
}
