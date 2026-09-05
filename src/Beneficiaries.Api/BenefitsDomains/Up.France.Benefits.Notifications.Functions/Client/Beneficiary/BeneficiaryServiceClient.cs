using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace Up.France.Benefits.Notifications.Functions.Client
{
    public class BeneficiaryServiceClient : IBeneficiaryServiceClient
    {
        private readonly IAzureB2BService _azureB2BService;
        private readonly BeneficiaryConfiguration _beneficiaryConfiguration;

        private readonly ILogger<BeneficiaryServiceClient> _logger;

        public BeneficiaryServiceClient(BeneficiaryConfiguration beneficiaryConfiguration, 
                                        IAzureB2BService azureB2BService,
                                        ILogger<BeneficiaryServiceClient> logger)
        {
            _azureB2BService = azureB2BService;
            _beneficiaryConfiguration = beneficiaryConfiguration ?? throw new ArgumentNullException(nameof(beneficiaryConfiguration));
            _logger = logger;
        }

        public async Task<AccountResponse> GetAccountInformationAsync(string cardId)
        {
            ArgumentNullException.ThrowIfNullOrEmpty(cardId);

            var token = await _azureB2BService.AcquireTokenAsync();
            using var client = new ProxyClient(_beneficiaryConfiguration.ApiUrl, new Dictionary<string, string> { { "Ocp-Apim-Subscription-Key", _beneficiaryConfiguration.ApiKey }, { "Authorization", $"Bearer {token}" } });
            
            _logger.LogInformation($"Calling beneficiary service for card {cardId}");
            _logger.LogInformation($"Beneficiary service URL: {_beneficiaryConfiguration.ApiUrl}cards/{cardId}/beneficiary");
        
            using var result = await client.HttpGetAsync<AccountResponse>($"cards/{cardId}/beneficiary");

            return result?.Body;
        }

        public async Task<AccountResponse> GetAccountInformationByBeneficiaryRefAsync(string beneficiaryRef)
        {
            ArgumentNullException.ThrowIfNullOrEmpty(beneficiaryRef);

            var token = await _azureB2BService.AcquireTokenAsync();
            using var client = new ProxyClient(_beneficiaryConfiguration.ApiUrl, new Dictionary<string, string> { { "Ocp-Apim-Subscription-Key", _beneficiaryConfiguration.ApiKey }, { "Authorization", $"Bearer {token}" } });
            
            _logger.LogInformation($"Calling beneficiary service for beneficiaryRef {beneficiaryRef}");
            _logger.LogInformation($"Beneficiary service URL: {_beneficiaryConfiguration.ApiUrl}accounts/{beneficiaryRef}/beneficiary");
        
            using var result = await client.HttpGetAsync<AccountResponse>($"accounts/{beneficiaryRef}/beneficiary");

            return result?.Body;
        }
    }
}
