using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public sealed class JackpotConfiguration
    {
        public decimal VoucherEventMaximumCashbackAmount { get; set; } 
        public decimal VoucherEventBMSCMaximumCashbackAmount { get; set; }
        public decimal WalletMonthlyCashbackLimitAmount { get; set; }
        public string LoadVoucherReason { get; set; }
    }
}
