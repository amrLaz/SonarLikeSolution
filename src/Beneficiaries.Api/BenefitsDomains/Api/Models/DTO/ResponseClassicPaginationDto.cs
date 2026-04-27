namespace Benefits.Api.Models.DTO
{

    public class ResponseClassicPaginationDto<T> : ResponseDto<T> where T : class
    {
        public ResponseClassicPaginationDto()
        {
            Result = new List<T>();
        }
        public object? Result { get; set; }
        public bool? IsSuccess { get; set; } = true;
        public PaginationClassicPaginationDto? pagination { get; set; }
        public string Message { get; set; } = "";
    }
}
