using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core
{
    [ExcludeFromCodeCoverage]
    public class PaginatedQuery
    {
        public PaginatedQuery()
        {

        }

        public PaginatedQuery(int pagination, int page)
        {
            Pagination = pagination;
            Page = page;
        }

        public int Pagination { get; set; } = 15;
        public int Page { get; set; } = 0;
    }
}
