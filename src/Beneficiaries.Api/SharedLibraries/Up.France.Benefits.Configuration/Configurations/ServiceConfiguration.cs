using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public class ServiceConfiguration
    {
        public ServiceConnectionConfiguration Eme { get; set; }
        public ServiceConnectionConfiguration Fidelity { get; set; }
        public ServiceConnectionConfiguration Campaign { get; set; }
        public ServiceConnectionConfiguration Terms { get; set; }
        public ServiceConnectionConfiguration Jackpot { get; set; }
        public ServiceConnectionConfiguration Parantez { get; set; }
        public InternalSettingsConfiguration Settings { get; set; }
    }

    [ExcludeFromCodeCoverage]
    public class ServiceConnectionConfiguration
    {
        public EndPointConfiguration Api { get; set; }

        public EndPointConfiguration Grpc { get; set; }
    }
}
