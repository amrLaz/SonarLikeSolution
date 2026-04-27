namespace Benefits.Api.Models.DTO
{
    public class PaginationClassicPaginationDto
    {
        public int? totalResultCount { get; set; }
        public int? page { get; set; }
        public int? totalPageCount { get; set; }
        public int? pageSize { get; set; }
    }
}