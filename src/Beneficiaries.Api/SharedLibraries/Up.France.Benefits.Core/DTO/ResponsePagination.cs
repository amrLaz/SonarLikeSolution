using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core
{
    [ExcludeFromCodeCoverage]
    public class ResponsePagination<T> where T : class
    {
        public ResponsePagination()
        {
            Entity = new List<T>();
        }
        public int Skip { get; set; }
        public int Take { get; set; }
        public int Count { get; set; }
        public string Order { get; set; } = null!;
        public int Direction { get; set; }
        public List<T> Entity { get; set; }
        public ApiResult Response { get; set; } = null!;
    }
}
