using System;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core
{
    [ExcludeFromCodeCoverage]
    public class RequestPagination
    {
        #region Properties

        public PaginationProerties PaginationProperties { get; set; }
        public DateTime? StartDate { get; set; }
        public DateTime? EndDate { get; set; }

        #endregion Properties
    }

    [ExcludeFromCodeCoverage]
    public class PaginationProerties
    {
        #region Properties

        public string SortPropertyName { get; set; }
        public string SortOrder { get; set; }
        public int? ItemsPerPage { get; set; }
        public int? RequestPage { get; set; }

        #endregion Properties
    }
}
