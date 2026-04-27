using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public class ExternalServiceConfiguration
    {
        public WorldlineConnectionConfiguration Worldline { get; set; }

        public BeneficiaireConnectionConfiguration Beneficiaire { get; set; }
        
        public ParantezConnectionConfiguration Parantez { get; set; }
        public UptimiseConnectionConfiguration Uptimise { get; set; }

        public BeneficiaireInfoConnectionConfiguration BeneficiaireInfo { get; set; }

        public MSCConnectionConfiguration MSC { get; set; }

        public GpsConnectionConfiguration Gps { get; set; }
    }

    [ExcludeFromCodeCoverage]
    public class MSCConnectionConfiguration
    {
        public string HostName { get; set; }
        public AzureB2BConfiguration AzureB2B { get; set; }
    }

    [ExcludeFromCodeCoverage]
    public class BeneficiaireInfoConnectionConfiguration
    {
        public string EndPoint { get; set; }
        public string HostName { get; set; }
        public string ApiKey { get; set; }
    }

    [ExcludeFromCodeCoverage]
    public class UptimiseConnectionConfiguration
    {
        public string EndPoint { get; set; }
        public string ApiKey { get; set; }
    }

    [ExcludeFromCodeCoverage]
    public class BeneficiaireConnectionConfiguration
    {
        public string EndPoint { get; set; }
        public string HostName { get; set; }
        public string ApiKey { get; set; }
    }

    [ExcludeFromCodeCoverage]
    public class ParantezConnectionConfiguration
    {
        public string EndPoint { get; set; }
        public string ApiKey { get; set; }
    }

    [ExcludeFromCodeCoverage]
    public class WorldlineConnectionConfiguration
    {
        public string HostName { get; set; }
        public string IPAddress { get; set; }
        public string ApiKey { get; set; }
        public string ProductRef { get; set; }
        public string DistributorRef { get; set; }
        public string ClientCertificateName { get; set; }
        public string ClientCertificatePassword { get; set; }
        public bool ClientCertificateEnabled { get; set; }
    }

    [ExcludeFromCodeCoverage]
    public class GpsConnectionConfiguration
    {
        public string EndPoint { get; set; }
        public string HostName { get; set; }
    }
}
