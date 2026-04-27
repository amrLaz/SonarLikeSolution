using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core.Models
{
    [ExcludeFromCodeCoverage]
    public sealed class CalculateWalletArgs
    {
        public CalculateWalletArgs()
        {
        }

        public string Benefeciaryref { get; set; } = null!;

        public bool CalculateVouchers { get; set; }
    }
}
