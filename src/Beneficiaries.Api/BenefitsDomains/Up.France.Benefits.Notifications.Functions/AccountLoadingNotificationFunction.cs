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
using Azure.Messaging.ServiceBus;
using Up.France.Benefits.Messaging;
using Up.France.Benefits.Notifications.Functions.OperationManagement.Notifications.Model;
using Up.NCommon.DistributedCache;


namespace Up.France.Benefits.Notifications.Functions
{
    [ExcludeFromCodeCoverage]
    public class AccountLoadingNotificationFunction
    {
        private const string  SUCCESS = "SUCCESS";
        private const string  RED_ACCOUNT_LOADED_EVENT_KEY = "RED_ACCOUNT_LOADED";
        private const string  FUNDER_CONTRAT_DEJEUNER = "GENERIQUE";
        private const string  FUNDER_CONTRAT_CADHOC = "GENERIQUECADEAU";
        
        private static Dictionary<string, string> UniverseByFunderContratRef = new()
        {
            { FUNDER_CONTRAT_DEJEUNER, "Déjeuner" },
            { FUNDER_CONTRAT_CADHOC, "Cadhoc" }
        };
        
        private readonly IBeneficiaryServiceClient _beneficiaryServiceClient;
        private readonly IDistributedCache _distributedCache;
        private readonly CacheConfiguration _cacheConfiguration;
        private readonly TelemetryClient _telemetryClient;
        private readonly ILogger<AccountLoadingNotificationFunction> _logger;
        private readonly ServiceBusSender _serviceBusSender;
        private readonly AccountLoadingNotificationSettings _notificationSettings;
        private readonly IEventHubPublisher<EventTrackerConfiguration> _eventHubPublisher;
        private readonly EventTrackerConfiguration _eventTrackerConfiguration;
        
        public AccountLoadingNotificationFunction(
                IBeneficiaryServiceClient beneficiaryServiceClient,
                IDistributedCache distributedCache,
                CacheConfiguration cacheConfiguration,
                AccountLoadingNotificationSettings notificationSettings,
                TelemetryClient telemetryClient, 
                ILogger<AccountLoadingNotificationFunction> logger,
                ServiceBusClient serviceBusClient,
                IEventHubPublisher<EventTrackerConfiguration> eventHubPublisher,
                EventTrackerConfiguration eventTrackerConfiguration)
        {
            _beneficiaryServiceClient = beneficiaryServiceClient;
            _distributedCache = distributedCache;
            _cacheConfiguration = cacheConfiguration;
            _telemetryClient = telemetryClient;
            _logger = logger;
            _notificationSettings = notificationSettings;
            _serviceBusSender = serviceBusClient.CreateSender("up-france-odi-services-prod-notification-tp");
            _eventHubPublisher = eventHubPublisher;
            _eventTrackerConfiguration = eventTrackerConfiguration;
        }
        
        private static string GetUniverse(string funderContratRef)
        {
            if (UniverseByFunderContratRef.TryGetValue(funderContratRef, out var universe))
            {
                return universe;
            }

            return "";
        }
        /// <summary>
        /// Extrait les informations du champ Reason formaté (ProductCode|Prefix|Data).
        /// </summary>
        /// <param name="reason">La chaîne Reason brute reçue dans l'événement.</param>
        /// <returns>Un tuple contenant le code produit, le préfixe de commande, et les données complémentaires (AuthorizationRef, TotalDays, etc.)</returns>
        private static (string ProductCode, string CommandPrefix, string AdditionalData) ExtractReasonData(string reason)
        {
            if (string.IsNullOrWhiteSpace(reason))
            {
                return (string.Empty, string.Empty, string.Empty);
            }

            var parts = reason.Split('|');

            // Extraction sécurisée des parties
            var productCode = parts.Length > 0 ? parts[0] : string.Empty;
            var prefix = parts.Length > 1 ? parts[1] : string.Empty;
            var data = parts.Length > 2 ? parts[2] : string.Empty;

            return (productCode, prefix, data);
        }
        
        /// <summary>
        /// Extrait les informations du champ VoucherReason formaté (ProductCode|Prefix|Data).
        /// </summary>
        /// <param name="reason">La chaîne Reason brute reçue dans l'événement.</param>
        /// <returns>Un tuple contenant le code produit, le préfixe de commande, et les données complémentaires (AuthorizationRef, TotalDays, etc.)</returns>
        private static (string ProductCode, string CommandPrefix, string AdditionalData) ExtractVoucherReasonData(string reason)
        {
            if (string.IsNullOrWhiteSpace(reason))
            {
                return (string.Empty, string.Empty, string.Empty);
            }

            var parts = reason.Split('|');

            // Extraction sécurisée des parties
            var productCode = parts.Length > 0 ? parts[0] : string.Empty;
            var prefix = parts.Length > 1 ? parts[1] : string.Empty;
            var data = parts.Length > 2 ? parts[2] : string.Empty;

            return (productCode, prefix, data);
        }
        

        private bool IsWebOrder(AccountLoading accountLoading)
        {
            string[] typesOfOrderAllowed = _notificationSettings.TypesOfOrder?
                .Split(',', StringSplitOptions.RemoveEmptyEntries)
                .Select(v => v.Trim())
                .ToArray() ?? Array.Empty<string>();
            
            var voucherReason = accountLoading.VoucherImpacts?.FirstOrDefault()?.VoucherReason;
            if (string.IsNullOrEmpty(voucherReason))
            {
                return true;
            }
            var reasonData = ExtractVoucherReasonData(voucherReason);
            // Si une liste de types de commande est configurée, vérifier l'appartenance
            if (typesOfOrderAllowed.Length > 0)
            {
                return typesOfOrderAllowed.Contains(reasonData.CommandPrefix, StringComparer.OrdinalIgnoreCase);
            }
            return reasonData.CommandPrefix.Equals("WEB", StringComparison.OrdinalIgnoreCase);
        }
        
        private bool IsEventSupported(AccountLoading accountLoading)
        {
            var reasonData = ExtractReasonData(accountLoading.Reason);
            if ((accountLoading.ActionCode == ActionCode.LOAD && accountLoading.ResultCode == SUCCESS)
                && (reasonData.ProductCode == "DEMAHYBR")
                && IsWebOrder(accountLoading))
            {
                return true;
            }

            return false;
        }
        
        [Function(nameof(AccountLoadingNotificationFunction))]
        public async Task RunAsync([EventHubTrigger("account-loading", Connection = "AccountLoadingEventHubNamespaceConnectionString", ConsumerGroup = "operation_management")] EventData[] events)
        {
            var now = DateTimeOffset.UtcNow;
            var exceptions = new List<Exception>();
            var accountLoadings = new List<AccountLoading>();
            foreach (var @event in events)
            {
                var message = Encoding.UTF8.GetString(@event.Body.ToArray());

                _logger.LogInformation($"Eventhub trigger function processing message: {message}");

                var accountLoading = JsonConvert.DeserializeObject<AccountLoading>(message);
                try
                {
                    if (IsEventSupported(accountLoading))
                    {
                        string[] whiteListedRefs = _notificationSettings.WhiteListing?
                            .Split(',', StringSplitOptions.RemoveEmptyEntries)
                            .Select(v => v.Trim())
                            .ToArray() ?? Array.Empty<string>();

                        if (whiteListedRefs.Length > 0 &&
                            !whiteListedRefs.Contains(accountLoading.BeneficiaryServiceRef))
                        {
                            accountLoading.ErrorMessage = "BeneficiaryServiceRef not in white listing.";
                            continue;
                        }

                        var accountId = await DetermineUserAccountId(accountLoading).ConfigureAwait(false);

                        if (accountId == null)
                        {
                            var errorMsg = $"There is no account related to the beneficiaryServiceRef : {accountLoading.BeneficiaryServiceRef}";
                            _logger.LogError(errorMsg);
                            accountLoading.ErrorMessage = errorMsg ;
                            continue;
                        }

                        if (accountId == string.Empty)
                        {
                            var errorMsg = $"The user ID of the found account is empty for the beneficiaryServiceRef: {accountLoading.BeneficiaryServiceRef}";
                            _logger.LogError(errorMsg);
                            accountLoading.ErrorMessage = errorMsg ;
                            continue;
                        }

                        accountLoading.AccountId = accountId;
                        await ScheduleMessageAsync(accountLoading, accountId).ConfigureAwait(false);
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, ex.Message);
                    exceptions.Add(ex);
                    accountLoading.ErrorMessage = ex.Message;
                }
                finally
                {
                    accountLoadings.Add(accountLoading);
                }
            }

            await PublishTrackingEventAsync(accountLoadings);
            
            if(exceptions.Any())
            {
                throw new AggregateException("Encountered errors while trying send transactions notifications.", exceptions);
            }
        }
        
        public List<TrackingEvent> Normalize(IEnumerable<AccountLoading> accountLoadings)
        {
            var createdAt = DateTime.UtcNow;
            var timestamp = new DateTimeOffset(createdAt).ToUnixTimeSeconds();
            
            var trackingEvents = accountLoadings.Select((accountLoading) => new TrackingEvent
            {
                Id = Guid.NewGuid().ToString(),
                EventType = "account_loading_processed",
                Timestamp = timestamp,
                CreatedAt = createdAt,
                Subject = "Account Loading Processed",
                Target = accountLoading.BeneficiaryServiceRef,
                Channel = TrackingChannel.PUSH_NOTIFICATION,
                CorrelationId = accountLoading.VoucherImpacts.FirstOrDefault()?.VoucherExternalReference ?? Guid.NewGuid().ToString(),
                Content = new Dictionary<string, object>
                {
                    { "beneficiaryServiceRef", accountLoading.BeneficiaryServiceRef },
                    { "accountId", accountLoading.AccountId },
                    { "amount", accountLoading.Amount },
                    { "currency", accountLoading.Currency },
                    { "actionCode", accountLoading.ActionCode },
                    { "resultCode", accountLoading.ResultCode },
                    { "reason", accountLoading.Reason },
                    { "isScheduled", accountLoading.ErrorMessage == null },
                    { "errorMessage", accountLoading.ErrorMessage ?? string.Empty },
                    { "voucherImpacts", accountLoading.VoucherImpacts.Select((voucherImpact) =>
                    {
                        return new Dictionary<string, object>
                        {
                            { "amountImpact", voucherImpact.VoucherAmount },
                            { "voucherReason", voucherImpact.VoucherReason },
                            { "externalReference", voucherImpact.VoucherExternalReference },
                            { "status", voucherImpact.VoucherStatus }
                        };
                    }).ToList() }
                }
            }).ToList();

            return trackingEvents;
        }
        
        private Task PublishTrackingEventAsync(IEnumerable<AccountLoading> accountLoadings)
        {
            var events = Normalize(accountLoadings);
            return _eventHubPublisher.PublishBatchAsync(events, _eventTrackerConfiguration.HubName);
        }
 
        private async Task<string> DetermineUserAccountId(AccountLoading accountLoading)
        {
            ArgumentNullException.ThrowIfNullOrEmpty(accountLoading.BeneficiaryServiceRef);

            var benefKey = string.Format(_cacheConfiguration.BeneficiaryKey, accountLoading.BeneficiaryServiceRef);

            var accountId = await DistributedCache.RetrieveOrSetObjectIfNotExistsAsync(
                _distributedCache,
                benefKey,
                async () =>
                {
                    var accountInfo = (await _beneficiaryServiceClient.GetAccountInformationByBeneficiaryRefAsync(accountLoading.BeneficiaryServiceRef))?.BeneficiaryInformation;

                    return accountInfo?.UuidUser;
                },
                TimeSpan.FromDays(_cacheConfiguration.AccountExpireTime)
            ).ConfigureAwait(false);

            return accountId;
        }
        
        private async Task ScheduleMessageAsync(AccountLoading accountLoading, string accountId)
        {
            var now = DateTime.UtcNow;
            var parisTimeZone = TimeZoneInfo.FindSystemTimeZoneById("Europe/Paris");
            var parisNow = TimeZoneInfo.ConvertTimeFromUtc(now, parisTimeZone);

            // Vérifier si l'heure actuelle est entre 9h30 et 18h30
            var currentTimeOfDay = parisNow.TimeOfDay;
            var isWithinBusinessHours = currentTimeOfDay >= new TimeSpan(9, 30, 0) && currentTimeOfDay <= new TimeSpan(18, 30, 0);

            DateTime startTime;
            DateTime endTime;

            if (isWithinBusinessHours)
            {
                // Utiliser l'heure actuelle comme heure de démarrage
                startTime = parisNow;
                endTime = startTime.AddMinutes(_notificationSettings.SmoothingWindowMinutes);
            }
            else
            {
                // Utilisation de la configuration injectée
                startTime = parisNow.Date
                    .AddHours(_notificationSettings.ScheduleStartHour)
                    .AddMinutes(_notificationSettings.ScheduleStartMinute);
                
                endTime = startTime.AddMinutes(_notificationSettings.SmoothingWindowMinutes);

                // Si la fenêtre actuelle est passée, passer au lendemain
                if (parisNow >= endTime)
                {
                    startTime = startTime.AddDays(1);
                    endTime = endTime.AddDays(1);
                }
            }
            
            // Convertir en UTC pour la planification
            var random = new Random();
            var timeSpan = endTime - startTime;
            var randomMinutes = random.Next(0, (int)timeSpan.TotalMinutes);
            var scheduledTimeParis = startTime.AddMinutes(randomMinutes);
            
            var messageBody = JsonConvert.SerializeObject(new 
            { 
                EventType = RED_ACCOUNT_LOADED_EVENT_KEY,
                AccountId = accountId,
                AccountLoading = accountLoading,
                Universe = GetUniverse(accountLoading.FunderContratRef),
                Amount = accountLoading.Amount,
                Currency = accountLoading.Currency,
                Balance = accountLoading.Balance
            });
            
            var message = new ServiceBusMessage(messageBody)
            {
                ScheduledEnqueueTime = TimeZoneInfo.ConvertTimeToUtc(scheduledTimeParis, parisTimeZone)
            };
            
            await _serviceBusSender.SendMessageAsync(message).ConfigureAwait(false);
            
            _logger.LogInformation($"Message planifié pour {scheduledTimeParis:O} Paris)");
        }
    }
}
