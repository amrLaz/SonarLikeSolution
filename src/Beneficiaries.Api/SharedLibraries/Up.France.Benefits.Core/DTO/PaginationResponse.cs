using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core.DTO
{
    [ExcludeFromCodeCoverage]
    public class PaginationResponse
    {
        public int Offset { get; set; }
        public int Limit { get; set; }
        public int TotalOffset { get; set; }
        public int Total { get; set; }
    }
}
