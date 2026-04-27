using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;
using Up.France.Benefits.Notifications.Functions.OperationManagement.Notifications.Model;
using Up.France.Services.MSC.DotnetClient.v1;

namespace Up.France.Benefits.Notifications.Functions
{
    public sealed class MscServiceClient : IMscServiceClient
    {
        private const string AUTHORIZATION_ACCEPTED = "AUTHORIZATION_ACCEPTED";
        private const string AUTHORIZATION_DENIED = "AUTHORIZATION_DENIED";
        private const string AUTHORIZATION_CDP_DENIED = "AUTHORIZATION_CDP_DENIED";

        private readonly IEventClient _eventClient;

        private readonly ILogger<MscServiceClient> _logger;

        public MscServiceClient(IEventClient eventClient, ILogger<MscServiceClient> logger)
        {
            _eventClient = eventClient;
            _logger = logger;      }

        private static AmountType GetAmountType(OperationManagement.Notifications.Model.Notification result)
        {
            var succeededParse = Int32.TryParse(result.message.contextData.amount.amount, out int amountValue);

            if (!succeededParse || amountValue == 0)
            {
                return result.message.contextData.operationAmount;
            }
            else
            {
                return result.message.contextData.amount;
            }
        }

        private string GetApplication(OperationManagement.Notifications.Model.Notification result) {
            return France.Services.MSC.DotnetClient.v1.Application.BENEFICIARY.ToString();
        }

        public async Task ProcessAuthorizationAccepted(ILogger log, OperationManagement.Notifications.Model.Notification result, string accountId)
        {
           var amount = FormatAmount(GetAmountType(result));
           
           var busEvent = new BusEvent
            {
                Id = Guid.NewGuid().ToString(),
                Key = AUTHORIZATION_ACCEPTED,
                Payload = JObject.FromObject(new
                {
                    AccountId = accountId,
                    TransactionAmount = amount,
                    TransactionCurrency = "€",
                    BeneficiaryServiceReference = result?.message?.beneficiaryServiceRef,
                    MerchantName = result?.message?.contextData?.nomMarchand,
                    Balance = FormatAmount(result.message.contextData.accountBalance),
                    Application = GetApplication(result)
                })
            };
            var mscResult = await this._eventClient.SendEventAsync(busEvent);
            if(mscResult?.FirstOrDefault()?.Statuses.FirstOrDefault()?.State == State.Undelivered)
            {
                log.LogWarning($"Notification undelivered");
            }
        }

        public async Task ProcessAuthorizationDenied(ILogger log, OperationManagement.Notifications.Model.Notification result, string accountId)
        {
            if (!result.message.productRef.Contains(Products.HYBRID) && !result.message.productRef.Contains(Products.PRDCADEAUUPFRANCE)) return;

            //generate key
            var key = string.Format("{0}{1}{2}", result.message.productRef == Products.CDJ3C ? "08" : "11",
                                                 result.message.contextData.codeRetour ?? string.Empty,
                                                 result.message.contextData.codeRaisonDetaillee ?? string.Empty);
            string reason = "NC";
            try
            {
                reason = ResourceWrapper.GetString(key);
            }
            catch (Exception)
            {
                log.LogWarning($"There is no wording for this key : {key}");
            }

            var amount = FormatAmount(GetAmountType(result));

            string eventKey = AUTHORIZATION_DENIED;
                
            if(result.message.contextData.codeRetour == "05" && result.message.contextData.codeRaisonDetaillee == "PC")
            {
                eventKey = AUTHORIZATION_CDP_DENIED;
            }

            var mscResult = await _eventClient.SendEventAsync(new BusEvent
            {
                Id = Guid.NewGuid().ToString(),
                Key = eventKey,
                Payload = JObject.FromObject(new
                {
                    AccountId = accountId,
                    TransactionAmount = amount,
                    TransactionCurrency = "€",
                    BeneficiaryServiceReference = result?.message?.beneficiaryServiceRef,
                    MerchantName = result?.message?.contextData?.nomMarchand,
                    TransactionDeniedReason = reason,
                    Application = GetApplication(result)
                })
            }).ConfigureAwait(false);
            if(mscResult?.FirstOrDefault()?.Statuses.FirstOrDefault()?.State == State.Undelivered)
            {
                log.LogWarning($"Notification undelivered");
            }
        }

        private static string FormatAmount(AmountType result)
        {
            var paddedAmount = result.amount.PadLeft(3, '0');
            return paddedAmount.Insert(paddedAmount.Length - 2, ",");
        }
    }
}
