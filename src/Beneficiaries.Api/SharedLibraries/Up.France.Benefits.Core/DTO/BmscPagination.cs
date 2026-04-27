using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core.DTO
{
    [ExcludeFromCodeCoverage]
    public sealed class BmscPagination<T>
    {
        public IEnumerable<T> Entities { get; set; } = null!;

        public PaginationResponse Pagination { get; set; } = null!;
    }
}
