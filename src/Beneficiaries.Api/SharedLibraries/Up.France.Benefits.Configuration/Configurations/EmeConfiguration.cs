using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public sealed class EmeConfiguration
    {
        public long InitialThirdId { get; set; }
        public long InitialAccountId { get; set; }
    }
}
