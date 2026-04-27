using Microsoft.Azure.Functions.Worker.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Diagnostics.CodeAnalysis;
using System.IO;
using System.Net;
using System.Threading.Tasks;
using Up.France.Benefits.Core;

namespace Up.France.Benefits.NetCore.Function
{
    [ExcludeFromCodeCoverage]
    public static class FunctionExtensions
    {
        public static async Task<ValidationWrapper<T>> ReadFunctionBodyAsync<T>(this Stream body)
        {
            using StreamReader reader = new(body);

            var content = await reader.ReadToEndAsync();

            return content.BuildValidationWrapper<T>();
        }

        public static async Task<HttpResponseData> CreateJsonResponse<T>(this HttpRequestData request, T obj, HttpStatusCode statusCode = HttpStatusCode.OK)
        {
            var response = request.CreateResponse();

            await response.WriteAsJsonAsync<T>(obj, statusCode);

            return response;
        }

        public static IConfiguration GetConfiguration(this IServiceCollection services)
        {
            var localRootPath = Environment.GetEnvironmentVariable("AzureWebJobsScriptRoot");
            var azureRootPath = $"{Environment.GetEnvironmentVariable("HOME")}/site/wwwroot";

            var actualRootPath = localRootPath ?? azureRootPath;

            var configuration = new ConfigurationBuilder()
                .SetBasePath(actualRootPath);

            #if DEBUG
            //configuration.AddJsonFile("local.settings.json", optional: false, reloadOnChange: true);
            #endif

            configuration.AddEnvironmentVariables();

            return configuration.Build();
        }

        public static ValidationWrapper<T> BuildValidationWrapper<T>(this string res)
        {
            ValidationWrapper<T> body = new();

            body.Value = JsonConvert.DeserializeObject<T>(res);

            var results = new List<ValidationResult>();
            body.IsValid = Validator.TryValidateObject(body.Value, new ValidationContext(body.Value, null, null), results, true);
            body.ValidationResults = results;

            return body;
        }
    }
}
