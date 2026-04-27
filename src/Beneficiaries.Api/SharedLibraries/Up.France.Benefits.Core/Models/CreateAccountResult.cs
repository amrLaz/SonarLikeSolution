using Newtonsoft.Json;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core.Models
{
    [ExcludeFromCodeCoverage]
    public sealed class CreateAccountResult : AccountClientResult
    {
        [Required]
        [JsonProperty("redirectionStatusCode")]
        public string RedirectionStatusCode { get; set; } = null!;

        [Required]
        [JsonProperty("redirectionStatusMessage")]
        public string RedirectionStatusMessage { get; set; } = null!;

        [Required]
        [JsonProperty("redirectionUrl")]
        public string RedirectionUrl { get; set; } = null!;

        [Required]
        [JsonProperty("redirectionVersion")]
        public string RedirectionVersion { get; set; } = null!;

        [Required]
        [JsonProperty("redirectionData")]
        public string RedirectionData { get; set; } = null!;

        [Required]
        [JsonProperty("seal")]
        public string Seal { get; set; } = null!;

        [Required]
        [JsonProperty("subscriberPaymentMeanIds")]
        public Dictionary<string, long> SubscriberPaymentMeanIds { get; set; } = null!;
    }
}
