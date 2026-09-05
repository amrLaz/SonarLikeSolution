using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public class ServiceIdentityConfiguration
    {
        public string ClientId { get; set; }
        public string Id { get; set; }
        public string PrincipalId { get; set; }
    }
}
