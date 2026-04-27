using System;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Hosting
{
    [ExcludeFromCodeCoverage]
    public static class EnvironmentVariable
    {
        public static string KeyVaultEndPoint()
        {
            return Environment.GetEnvironmentVariable("KEYVAULT_ENDPOINT");
        }

        public static string IdentityId()
        {
            return Environment.GetEnvironmentVariable("SERVICEIDENTITY_CLIENTID");
        }
        public static int MaxMessagesToReceiveFromServiceBus()
        {
            return int.Parse(Environment.GetEnvironmentVariable("MAX_MESSAGES_TO_RECEIVE_FROM_SERVICE_BUS"));
        }
        public static string RegexSubscriberIdPattern()
        {
            return Environment.GetEnvironmentVariable("REGEX_SUBSCRIBERID_PATTERN");
        }
    }
}
