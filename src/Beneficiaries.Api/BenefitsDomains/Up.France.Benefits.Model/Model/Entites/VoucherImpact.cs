namespace Up.France.Benefits.Model.Models.Entites
{
    public class VoucherImpact
    {
        public string externalReference { get; set; } = null!;
        public AmountImpact amountImpact { get; set; } = null!;
        public string voucherReason { get; set; } = null!;
    }
}
