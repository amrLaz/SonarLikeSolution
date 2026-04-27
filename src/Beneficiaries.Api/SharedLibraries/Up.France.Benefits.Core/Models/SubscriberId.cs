using Newtonsoft.Json;
using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core.Models
{
    [ExcludeFromCodeCoverage]
    public sealed class SubscriberId
    {
        [JsonProperty("distributorRef")]
        public string DistributorRef { get; set; } = null!;
        [JsonProperty("productRef")]
        public string ProductRef { get; set; } = null!;
        [Required]
        [JsonProperty("beneficiaryServiceRef")]
        public string BeneficiaryServiceRef { get; set; } = null!;
        [Required]
        [JsonProperty("cardId")]
        public string CardId { get; set; } = null!;
    }
}
