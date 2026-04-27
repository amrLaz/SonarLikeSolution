using Newtonsoft.Json;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core.Models
{
    [ExcludeFromCodeCoverage]
    public sealed class CumulativeAmountResult : AccountClientResult
    {
        [JsonProperty("cumulativeAmount")]
        public int CumulativeAmount { get; set; }
    }
}
