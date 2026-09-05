using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core
{
    [ExcludeFromCodeCoverage]
    public sealed record ApiResult<T> : ApiResult
    {
        public T Entity;

        public ApiResult(T entity, bool succeeded, string message, int statusCode = 200)
            : base(succeeded, message, statusCode)
        {
            Entity = entity;
        }
    }

    [ExcludeFromCodeCoverage]
    public record ApiResult
    {
        public ApiResult(bool succeeded, string message, int statusCode = 200)
        {
            ApiMessageResult msg = new(message, message, 8, statusCode.ToString());
            List<ApiMessageResult> messages = new()
            {
                msg
            };
            Succeeded = succeeded;
            Messages = messages;
        }

        public bool Succeeded { get; init; }
        public List<ApiMessageResult> Messages { get; init; }
    }

    [ExcludeFromCodeCoverage]
    public sealed record ApiMessageResult
    {
        public ApiMessageResult(string content, string detail, int type, string code)
        {
            Content = content;
            Detail = detail;
            Type = type;
            Code = code;
        }
        public string Content { get; init; }
        public string Detail { get; init; }
        public int Type { get; init; }
        public string Code { get; init; }
    }
}
