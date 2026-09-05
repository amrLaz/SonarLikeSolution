using Newtonsoft.Json;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;
using System.Runtime.InteropServices;
using Up.France.Benefits.Core.Models;

namespace Up.France.Benefits.Core
{
    [ExcludeFromCodeCoverage]
    public sealed class AccountDetailResult : AccountClientResult
    {
        [Required]
        [JsonProperty("paymentMeans")]
        public List<PaymentMean> PaymentMeans { get; set; } = null!;
        [Required]
        [JsonProperty("subscriberStatus")]
        public string SubscriberStatus { get; set; } = null!;
        [Required]
        [JsonProperty("waitUpdate")]
        public string WaitUpdate { get; set; } = null!;
    }
}
