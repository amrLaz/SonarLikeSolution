using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public sealed class OrderConfiguration
    {
        public string SourceApplication { get; set; }
        public string CustomerType { get; set; }
        public string BuyerCustomerAccountNumber { get; set; }
        public string InvoicedCustomerAccountNumber { get; set; }
        public string ContractId { get; set; }
        public string OrderReason { get; set; }
        public string PaymentTerm { get; set; }
        public string PaymentMeans { get; set; }
        public string LinesArticleId { get; set; }
        public string LinesTaxGroup { get; set; }
    }
}
