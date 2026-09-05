using System.Diagnostics.CodeAnalysis;
using Up.France.Benefits.Configuration.Configurations;
using static System.Collections.Specialized.BitVector32;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public class FallBackServiceConfiguration
    {
        public ApplicationConfiguration Application { get; set; }
        public DataBaseConfiguration Database { get; set; }
        public EventHubTriggerConfiguration EventHubTrigger { get; set; }

    }
}
