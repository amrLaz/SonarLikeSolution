namespace Benefits.Api.Models.DTO
{
    public class ResponseContinuationTokenPaginationDto<T> : ResponseDto<T> where T : class 
    {
        public ResponseContinuationTokenPaginationDto() {
            Result = new List<T>();
        }
        public List<T>? Result { get; set; }
        public bool? IsSuccess { get; set; } = true;
        public PaginationContinuationTokenDto? pagination { get; set; }
        public string Message { get; set; } = "";
    }


}
