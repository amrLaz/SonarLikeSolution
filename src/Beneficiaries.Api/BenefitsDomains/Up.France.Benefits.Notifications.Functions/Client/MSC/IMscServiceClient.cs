using System.Threading.Tasks;
using Microsoft.Extensions.Logging;

namespace Up.France.Benefits.Notifications.Functions
{
    public interface IMscServiceClient
    {
        Task ProcessAuthorizationAccepted(ILogger log, OperationManagement.Notifications.Model.Notification result, string accountId);

        Task ProcessAuthorizationDenied(ILogger log, OperationManagement.Notifications.Model.Notification result, string accountId);
    }
}
