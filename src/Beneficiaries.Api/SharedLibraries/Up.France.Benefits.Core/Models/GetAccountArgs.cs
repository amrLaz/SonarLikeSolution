using Newtonsoft.Json;
using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core
{
    [ExcludeFromCodeCoverage]
    public class GetAccountArgs
    {
        public GetAccountArgs()
        {

        }

        public GetAccountArgs(string accountRefNo, string cardId)
        {
            AccountRefNo = accountRefNo;
            CardId = cardId;
        }

        public string AccountRefNo { get; set; } = null!;
        public string CardId { get; set; } = null!;
    }
}
