using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core
{
    [ExcludeFromCodeCoverage]
    public class SuspendAccountArgs
    {
        public SuspendAccountArgs()
        {

        }

        public SuspendAccountArgs(string accountRefNo, string cardId)
        {
            AccountRefNo = accountRefNo;
            CardId = cardId;
        }

        [Required]
        public string AccountRefNo { get; set; } = null!;

        [Required]
        public string CardId { get; set; } = null!;
    }
}
