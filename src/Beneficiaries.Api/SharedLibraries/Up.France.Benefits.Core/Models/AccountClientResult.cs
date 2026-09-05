using Newtonsoft.Json;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core
{
    [ExcludeFromCodeCoverage]
    public class AccountClientResult
    {
        [JsonProperty("responseCode")]
        public string ResponseCode { get; set; }
    }
}
