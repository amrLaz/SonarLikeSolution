using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public class RegistrationConfiguration
    {
        public string Instance { get; set; }
        public string Domain { get; set; }
        public string Policy { get; set; }
        public string Issuer { get; set; }
        public string TenantId { get; set; }
        public string ClientId { get; set; }
        public string Audience { get; set; }
    }
}
