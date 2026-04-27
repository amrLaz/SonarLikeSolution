using Microsoft.ApplicationInsights.Channel;
using Microsoft.ApplicationInsights.DataContracts;
using Microsoft.ApplicationInsights.Extensibility;
using System.Diagnostics.CodeAnalysis;
using System.Linq;

namespace Up.France.Benefits.AspNetCore
{
    [ExcludeFromCodeCoverage]
    public class CustomControllerFilter : ITelemetryProcessor
    {
        private ITelemetryProcessor Next { get; set; }
        private static string[] ExcludedLikePaths = new string[] { "favicon", "robots" };
        private static string[] ExcludedExactPaths = new string[] { "GET /", "HEAD /" };

        public CustomControllerFilter(ITelemetryProcessor next)
        {
            Next = next;
        }
        public void Process(ITelemetry item)
        {
            RequestTelemetry telemetry = item as RequestTelemetry;
            if (telemetry != null && ShouldExcludeOperation(telemetry.Name))
            {
                return;
            }

            if (telemetry?.ResponseCode == "401")
            {
                telemetry.Context.Operation.Name = "UnauthorizedApiCall";
            }

            Next.Process(item);
        }
        public bool ShouldExcludeOperation(string telemetryname) {
            return ExcludedLikePaths.Any(path => telemetryname.Contains(path)) || ExcludedExactPaths.Any(path => telemetryname.Equals(path));
        }
    }
}
