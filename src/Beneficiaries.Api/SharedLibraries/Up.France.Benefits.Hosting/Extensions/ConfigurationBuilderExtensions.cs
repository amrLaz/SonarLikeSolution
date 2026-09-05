using Azure.Extensions.AspNetCore.Configuration.Secrets;
using Azure.Security.KeyVault.Secrets;
using Microsoft.Extensions.Configuration;
using System;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Hosting
{
    [ExcludeFromCodeCoverage]
    public static class ConfigurationBuilderExtensions
    {
        public static void ConfigureKeyVault(this IConfigurationBuilder config)
        {
            string keyVaultEndpoint = EnvironmentVariable.KeyVaultEndPoint();

            if (string.IsNullOrEmpty(keyVaultEndpoint))
                throw new InvalidOperationException("KEYVAULT_ENDPOINT environment variable is missing.");

            var secretClient = new SecretClient(new(keyVaultEndpoint), IdentityCredential.Build());
            config.AddAzureKeyVault(secretClient, new KeyVaultSecretManager());
        }
    }
}
