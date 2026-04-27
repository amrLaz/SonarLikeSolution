using Microsoft.AspNetCore.Mvc;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Up.France.Benefits.Core.Queries
{
    public class PaginationParameters
    {
        const int defaultPageSize = 10;

        [FromHeader]
        public string? ContinuationToken { get; set; }
        public int PageSize { get; set; } = defaultPageSize;
        public int Page { get; set; } = 1;

    }
}
