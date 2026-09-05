using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core
{
    [ExcludeFromCodeCoverage]
    public sealed class CloseAccountArgs : SuspendAccountArgs
    {
        public CloseAccountArgs()
        {

        }

        public CloseAccountArgs(long pymentMeanId, string accountRefNo, string cardId) : base(accountRefNo, cardId)
        {
            PymentMeanId = pymentMeanId;
        }

        [Required]
        public long PymentMeanId { get; set; }
    }
}
