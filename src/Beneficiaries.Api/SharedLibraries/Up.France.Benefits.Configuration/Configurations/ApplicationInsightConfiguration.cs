using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public class ApplicationInsightConfiguration
    {
        public string InstrumentationKey { get; set; }
    }
}
