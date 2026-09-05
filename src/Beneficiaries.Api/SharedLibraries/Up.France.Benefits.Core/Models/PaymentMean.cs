using Newtonsoft.Json;
using System.Diagnostics.CodeAnalysis;


namespace Up.France.Benefits.Core
{
    [ExcludeFromCodeCoverage]

    public class PaymentMean
    {
        [JsonProperty("paymentMeanId")]
        public long PaymentMeanId { get; set; }

        [JsonProperty("paymentMeanType")]
        public string PaymentMeanType { get; set; } = null!;

        [JsonProperty("paymentMeanBrand")]
        public string PaymentMeanBrand { get; set; } = null!;

        [JsonProperty("maskedPan")]
        public string MaskedPan { get; set; } = null!;

        [JsonProperty("expDate")]
        public string ExpDate { get; set; } = null!;

        [JsonProperty("alias")]
        public string Alias { get; set; } = null!;

        [JsonProperty("mandateId")]
        public string MandateId { get; set; } = null!;

        [JsonProperty("enrolmentStatus")]
        public string EnrolmentStatus { get; set; } = null!;


    }
}
