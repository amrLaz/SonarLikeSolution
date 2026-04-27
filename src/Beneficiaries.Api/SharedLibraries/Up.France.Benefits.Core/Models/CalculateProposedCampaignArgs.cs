using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core.Models
{
    [ExcludeFromCodeCoverage]
    public sealed class CalculateProposedCampaignArgs
    {
        public CalculateProposedCampaignArgs()
        {
        }

        public string Benefeciaryref { get; set; } = null!;
    }
}
