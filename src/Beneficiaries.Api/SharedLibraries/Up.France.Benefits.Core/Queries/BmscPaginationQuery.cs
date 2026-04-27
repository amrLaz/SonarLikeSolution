using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core.Queries
{
    [ExcludeFromCodeCoverage]
    public sealed class BmscPaginationQuery
    {
        [Required]
        public int Take { get; set; }

        [Required]
        public int Page { get; set; }
    }
}
