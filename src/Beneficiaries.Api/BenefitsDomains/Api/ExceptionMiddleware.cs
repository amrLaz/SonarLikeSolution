using Benefits.Api.Models.DTO;
using Newtonsoft.Json;

namespace Benefits.Api
{
    public class ErrorHandlingMiddleware
    {
        private readonly RequestDelegate next;

        public ErrorHandlingMiddleware(RequestDelegate next)
        {
            this.next = next;
        }

        public async Task Invoke(HttpContext context)
        {
            try
            {
                await next(context);
            }
            catch (Exception ex)
            {
                var statusCode = context.Response.StatusCode;
                if (ex is ArgumentException)
                {
                    statusCode = 200;
                }
                await HandleExceptionAsync(context, statusCode, ex.Message);
            }
            finally
            {
                var statusCode = context.Response.StatusCode;
                var msg = "";
                if (statusCode == 401)
                {

                    msg = "Unauthorized";

                }
                else if (statusCode == 404)
                {
                    msg = "NotFound";
                }
                else if (statusCode == 400)
                {
                    msg = "BadRequest";
                }
                else if (statusCode != 200 && !context.Response.HasStarted)
                {
                    msg = "Unknown";
                }
                if (!string.IsNullOrWhiteSpace(msg) && !context.Response.HasStarted)
                {
                    await HandleExceptionAsync(context, statusCode, msg);
                }
            }
        }

        private static Task HandleExceptionAsync(HttpContext context, int statusCode, string msg)
        {
            var result = JsonConvert.SerializeObject(new ResponseDto<object>() { IsSuccess = false, Message = msg });
            context.Response.ContentType = "application/json;charset=utf-8";
            return context.Response.WriteAsync(result);
        }
    }

    public static class ErrorHandlingExtensions
    {
        public static IApplicationBuilder UseErrorHandling(this IApplicationBuilder builder)
        {
            return builder.UseMiddleware<ErrorHandlingMiddleware>();
        }
    }

}
