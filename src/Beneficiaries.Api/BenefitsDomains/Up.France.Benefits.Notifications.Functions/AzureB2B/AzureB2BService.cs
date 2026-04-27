using System.Threading.Tasks;
using Up.France.ODI.Services.Authentication.DotnetClient;

namespace Up.France.Benefits.Notifications.Functions
{
    public class AzureB2BService : IAzureB2BService
    {
        private readonly ADB2CClient _azureB2CClient;
        private readonly string _clientSecret;
        private readonly string[] _scopes;

        public AzureB2BService(AzureB2BConfiguration configuration)
        {
            _azureB2CClient = new ADB2CClient(configuration.Domain, configuration.TenantId, configuration.ClientId);
            _clientSecret = configuration.ClientSecret;
            _scopes = configuration.Scopes;
        }

        public async Task<string> AcquireTokenAsync()
        {
            var tokenResult = await _azureB2CClient
                .GetAccessToken_ClientCredentials(_clientSecret, _scopes).ConfigureAwait(false);
            return tokenResult?.AccessToken;
        }
    }
}
