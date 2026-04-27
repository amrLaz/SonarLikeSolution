using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public sealed class AzureB2BConfiguration
	{
		public string Instance { get; set; }
		public string Domain { get; set; }
		public string TenantId { get; set; }
		public string ClientId { get; set; }
		public string ClientSecret { get; set; }
		public string[] Scopes { get; set; }
	}
}
