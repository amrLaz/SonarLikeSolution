using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public class ExternalBusConfiguration : IServiceBusConfiguration
    {
        public string ConnectionString { get; set; }
        public string Key { get; set; }
        public ExternalTopicConfiguration Topic { get; set; }
        public ExternalSubscriptionConfiguration Subscription { get; set; }
    }

    [ExcludeFromCodeCoverage]
    public class ExternalTopicConfiguration
    {
        public string EmeAccountRequest { get; set; }
        public string EmeAccountResponse { get; set; }
        public string EmeThirdRequest { get; set; }
        public string EmeThirdResponse { get; set; }
        public string LoyaltyRegistration { get; set; }
        public string ParantezCachback { get; set; }
        public string UnloadCachback { get; set; }
        public string ParantezRefusedCachback { get; set; }
        public string EsbErpOrders { get; set; }
        public string UptimiseCdpCardOpposition { get; set; }
        public string LoyaltyCampaignNotification { get; set; }
        public string LoyaltyVoucherTransactionError { get; set; }

    }

    [ExcludeFromCodeCoverage]
    public class ExternalSubscriptionConfiguration
    {
        public string EmeAccountRequest { get; set; }
        public string EmeAccountResponse { get; set; }
        public string EmeThirdRequest { get; set; }
        public string EmeThirdResponse { get; set; }
        public string LoyaltyRegistration { get; set; }
        public string ParantezNotification { get; set; }
        public string ParantezCachback { get; set; }
        public string UptimiseCdpCardOpposition { get; set; }
    }
}
