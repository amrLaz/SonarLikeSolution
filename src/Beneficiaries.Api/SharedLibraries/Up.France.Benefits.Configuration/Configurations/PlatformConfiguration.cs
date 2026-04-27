using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public class PlatformConfiguration
    {
        public ExternalConfiguration External { get; set; }

        public InternalConfiguration Internal { get; set; }
    }

    [ExcludeFromCodeCoverage]
    public class ExternalConfiguration
    {
        public ExternalStorageConfiguration Storage { get; set; }

        public ExternalBusConfiguration Bus { get; set; }

        public ExternalServiceConfiguration Services { get; set; }
    }

    [ExcludeFromCodeCoverage]
    public class InternalConfiguration
    {
        public InternalEventHubConfiguration EventHubNamespace { get; set; }
        public InternalBusConfiguration Bus { get; set; }
        public InternalStorageConfiguration Storage { get; set; }
        public InternalPaymentClientConfiguration PaymentClient { get; set; }
    }
}
