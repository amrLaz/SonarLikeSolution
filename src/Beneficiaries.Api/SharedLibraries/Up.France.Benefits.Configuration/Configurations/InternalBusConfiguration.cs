using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public class InternalBusConfiguration : IServiceBusConfiguration
    {
        public string ConnectionString { get; set; }
        public string Key { get; set; }
    }
}
