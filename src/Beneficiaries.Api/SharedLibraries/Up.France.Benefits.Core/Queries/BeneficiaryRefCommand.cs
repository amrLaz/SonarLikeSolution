using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core
{
    [ExcludeFromCodeCoverage]
    public class BeneficiaryRefCommand : IBeneficiaryRefCommand
    {
        [Required]
        public string BeneficiaryRef { get; set; }
    }
}
