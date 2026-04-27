using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public class ApplicationConfiguration
    {
        public ApplicationInsightConfiguration Insight { get; set; }
        public ServiceIdentityConfiguration ServiceIdentity { get; set; }
        public ServiceConfiguration Services { get; set; }
        public RegistrationConfiguration AzureB2CRegistration { get; set; }
        public RegistrationConfiguration AzureEntraIdRegistration { get; set; }
        public string TelemetryLatencyConnectionString { get; set; }
    }
}
