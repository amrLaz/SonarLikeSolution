using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core.Models
{
    [ExcludeFromCodeCoverage]
    public sealed class SuspendAccountClientResult : AccountClientResult
    {
        public string SubscriberStatus { get; set; } = null!;
    }
}
