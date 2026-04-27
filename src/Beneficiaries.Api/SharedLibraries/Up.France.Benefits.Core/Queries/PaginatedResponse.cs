using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core
{
    [ExcludeFromCodeCoverage]
    public class PaginatedResponse<T>
    {
        public T[] Data { get; set; }

        public int TotalItems { get; set; }

        public bool HasNextPage { get; set; }
    }
}
