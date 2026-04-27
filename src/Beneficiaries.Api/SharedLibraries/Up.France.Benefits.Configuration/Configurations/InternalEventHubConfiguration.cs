using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public class InternalEventHubConfiguration : IEventHubConfiguration
    {
        public string ConnectionString { get; set; }

        public string Key { get; set; }

        public InternalHubConfiguration Hub { get; set; }
    }

    [ExcludeFromCodeCoverage]
    public class InternalHubConfiguration
    {
        public string CashbackCreated { get; set; }
        public string CashbackUnloaded { get; set; }
        public string CashbackUpdated { get; set; }
    }
}
