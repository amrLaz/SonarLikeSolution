using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core.Models
{
    [ExcludeFromCodeCoverage]
    public sealed class CreateAccountArgs
    {
        [Required]
        [JsonProperty("subscriberIds")]
        public List<SubscriberId> SubscriberIds { get; set; } = null!;

        [Required]
        [JsonProperty("idCompteWeb")]
        public string IdCompteWeb { get; set; } = null!;

        [Required]
        [JsonProperty("paymentMeanType")]
        public string PaymentMeanType { get; set; } = null!;

        [Required]
        [JsonProperty("customerLanguage")]
        public string CustomerLanguage { get; set; } = null!;

        [Required]
        [JsonProperty("normalReturnURL")]
        public string NormalReturnUrl { get; set; } = null!;

        [Required]
        [JsonProperty("requestDateTime")]
        public DateTime RequestDateTime { get; set; }

        [Required]
        [JsonProperty("returnContext")]
        public string ReturnContext { get; set; } = null!;
    }
}
