namespace Benefits.Api.Models.DTO
{
    public class PaginationContinuationTokenDto
    {
        public int? totalResultCount { get; set; }
        public string? continuationToken { get; set; }
        public int? pageSize { get; set; }
    }
}