using Azure.Messaging.EventHubs;
using Microsoft.ApplicationInsights;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Caching.Distributed;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Up.France.Benefits.Notifications.Functions.OperationManagement.Notifications.Model;
using Up.NCommon.DistributedCache;


namespace Up.France.Benefits.Notifications.Functions
{
    [ExcludeFromCodeCoverage]
    public class TransactionNotificationFunction
    {
        private readonly IBeneficiaryServiceClient _beneficiaryServiceClient;
        private readonly IMscServiceClient _mscServiceClient;
        private readonly IDistributedCache _distributedCache;
        private readonly CacheConfiguration _cacheConfiguration;
        private readonly TelemetryClient _telemetryClient;
        private readonly ILogger<TransactionNotificationFunction> _logger;

        public TransactionNotificationFunction(IBeneficiaryServiceClient beneficiaryServiceClient,
                                               IMscServiceClient mscServiceClient,
                                               IDistributedCache distributedCache,
                                               CacheConfiguration cacheConfiguration,
                                               TelemetryClient telemetryClient, 
                                               ILogger<TransactionNotificationFunction> logger)
        {
            _beneficiaryServiceClient = beneficiaryServiceClient;
            _mscServiceClient = mscServiceClient;
            _distributedCache = distributedCache;
            _cacheConfiguration = cacheConfiguration;
            _telemetryClient = telemetryClient;
            _logger = logger;
        }

        private static bool IsAuthorizationOperation(Notification notification)
        {
            return notification.message.contextData.operationType ==
                   notificationMessageContextDataOperationType.AUTHORIZATION;
        }

        private static bool IsOperationNatureAllowed(OperationManagement.Notifications.Model.Notification notification)
        {
            return notification.message.contextData.operationNature == notificationMessageContextDataOperationNature.PURCHASE ||
                   notification.message.contextData.operationNature == notificationMessageContextDataOperationNature.PURCHASE_CANCELLATION;
        }

        private static bool IsProductAllowed(OperationManagement.Notifications.Model.Notification notification) {
            return (notification.distributorRef.Contains(Distributors.CDJFRANCE) ||
                         notification.distributorRef.Contains(Distributors.CDJFRANCEMCO) || 
                         notification.distributorRef.Contains(Distributors.UPFRANCE) ||
                         notification.distributorRef.Contains(Distributors.RMUPFRANCE) ||
                         notification.distributorRef.Contains(Distributors.RMUPFRANCEI)) &&
                        (notification.message.productRef.Contains(Products.CDJ3C) ||
                         notification.message.productRef.Contains(Products.CDJ4C) ||
                         notification.message.productRef.Contains(Products.HYBRID) ||
                         notification.message.productRef.Contains(Products.RMPRDHYREPASUPFRANCE) ||
                         notification.message.productRef.Contains(Products.RMPRDHYREPASUPFRANCEI) ||
                         notification.message.productRef.Contains(Products.PRDCADEAUUPFRANCE) ||
                         notification.message.productRef.Contains(Products.RMPRDCADEAUUPFRANCE) ||
                         notification.message.productRef.Contains(Products.RMPRDCADEAUUPFRANCEI));
        }

        private static bool IsOperationAllowed(OperationManagement.Notifications.Model.Notification notification)
        {
            return IsAuthorizationOperation(notification)
                   && IsOperationNatureAllowed(notification)
                   && IsProductAllowed(notification);
        }
        
        [Function(nameof(TransactionNotificationFunction))]
        public async Task RunAsync([EventHubTrigger("%HubName%", Connection = "EF1T_EventHub_NamespaceConnectionString", ConsumerGroup = "%OperationMangementConsumerGroup%")] EventData[] events)
        {
            var now = DateTimeOffset.UtcNow;
            var exceptions = new List<Exception>();
            foreach (var @event in events)
            {
                try
                {
                    var message = Encoding.UTF8.GetString(@event.Body.ToArray());

                    _logger.LogInformation($"Eventhub trigger function processing message: {message}");

                    var result = JsonConvert.DeserializeObject<Ef1tNotification>(message);

                    if (result?.notification?.message == null) { continue; }

                    var notif = result?.notification;

                    if (notif.message.contextData?.operationDateTime == null)
                    {
                        _logger.LogWarning($"Unable to deduce a transaction date. {notif.message.messageId}");
                        continue;
                    }

                    var transactionDate = notif.message.contextData.operationDateTime.ToUniversalTime();
                    var totalLagBeforeSend = now - transactionDate;

                    LogBegin(_logger, @event.EnqueuedTime, now, transactionDate, totalLagBeforeSend, this._telemetryClient);

                    if (totalLagBeforeSend > TimeSpan.FromMinutes(5)) { continue; }

                    if (IsOperationAllowed(notif))
                    {
                        _logger.LogInformation($"Product is allowed for notification {notif.message.messageId}");
                        var accountId = await DetermineUserAccountId(notif).ConfigureAwait(false);

                        if (accountId == null)
                        {
                            _logger.LogError($"there is no account related to the id card : {notif.message.contextData.cardId}");
                            continue;
                        }

                        if (accountId == string.Empty)
                        {
                            _logger.LogError($"the user id of the founded account is empty for the id card: {notif.message.contextData.cardId}");
                            continue;
                        }

                        if (notif.message.contextData.codeRetour != TransactionStates.OK && notif.message.contextData.codeRetour != TransactionStates.OK_PARTIAL)
                        {
                            await _mscServiceClient.ProcessAuthorizationDenied(_logger, notif, accountId).ConfigureAwait(false);
                        }
                        else if(notif.message.contextData.operationNature == notificationMessageContextDataOperationNature.PURCHASE)
                        {
                            await _mscServiceClient.ProcessAuthorizationAccepted(_logger, notif, accountId).ConfigureAwait(false);
                        }
                    }

                    LogEnd(transactionDate, this._telemetryClient);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, ex.Message);
                    exceptions.Add(ex);
                }
            }

            if(exceptions.Any())
            {
                throw new AggregateException("Encountered errors while trying send transactions notifications.", exceptions);
            }
        }

        private async Task<string> DetermineUserAccountId(OperationManagement.Notifications.Model.Notification notif)
        {
            ArgumentNullException.ThrowIfNullOrEmpty(notif?.message?.contextData?.cardId);

            var benefKey = string.Format(_cacheConfiguration.BeneficiaryKey, notif?.message?.contextData?.cardId);

            var accountId = await DistributedCache.RetrieveOrSetObjectIfNotExistsAsync(
                _distributedCache,
                benefKey,
                async () =>
                {
                    var accountInfo = (await _beneficiaryServiceClient.GetAccountInformationAsync(notif?.message?.contextData?.cardId))?.BeneficiaryInformation;

                    return accountInfo?.UuidUser;
                },
                TimeSpan.FromDays(_cacheConfiguration.AccountExpireTime)
            ).ConfigureAwait(false);

            return accountId;
        }

        private static void LogEnd(DateTime transactionDate, TelemetryClient telemetryClient)
        {
            var totalLag = DateTime.UtcNow - transactionDate;
            telemetryClient?.TrackMetric("totalLag", totalLag.TotalSeconds);
        }

        private static void LogBegin(ILogger log, DateTimeOffset enqueuedTimeUtc, DateTimeOffset now, DateTime transactionDate, TimeSpan totalLagBeforeSend, TelemetryClient telemetryClient)
        {
            var arrivalLag = enqueuedTimeUtc - transactionDate;
            var dequeueLag = now - enqueuedTimeUtc;

            log.LogInformation($"Duration MoveUp => Service Bus EF1T : {arrivalLag:c}");
            log.LogInformation($"Duration ServiceBusEF1T => Azure Function: {dequeueLag:c}");
            log.LogWarning($"Duration MoveUp => Azure Function : {totalLagBeforeSend:c}");

            telemetryClient.TrackMetric("arrivalLag", arrivalLag.TotalSeconds);
            telemetryClient.TrackMetric("dequeueLag", dequeueLag.TotalSeconds);
            telemetryClient.TrackMetric("totalLagBeforeSend", totalLagBeforeSend.TotalSeconds);
        }
    }
}
