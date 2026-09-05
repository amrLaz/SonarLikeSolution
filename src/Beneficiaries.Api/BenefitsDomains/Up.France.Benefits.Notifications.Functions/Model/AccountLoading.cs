using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Up.France.Benefits.Notifications.Functions.OperationManagement.Notifications.Model
{
    /**
     * 
     {
        "Media":"NotificationPush",
        "EventType":"HYBRIDE_LOAD_NOTIFICATION",
        "Application":"HYBRIDE",
        "SendDate":"2026-01-07 10:00:00",
        "distributorRef":"UPFRANCE",
        "fileDate":"2026-01-07T02:10:24.000Z",
        "fileId":1225,
        "actionDate":"2026-01-06T19:59:10.000Z",
        "actionCode":"LOAD",
        "beneficiaryServiceRef":"698e004045c14fc5acbb30eb4eebd972",
        "funderContratRef":"GENERIQUE",
        "operationId":"0YoLv8",
        "origin":"DF14-B",
        "reason":"DEMAHYBR|17158987|2026|CAPPS|SOLUTPP",
        "accountNumber":"94176337058",
        "requested_amount":55.0,
        "currency":978,
        "amount":55.0,
        "balance":60.16,
        "resultCode":"SUCCESS",
        "_sourceFile":"abfss://bronze@upfrdatalakeprodsa.dfs.core.windows.net/Move-Up/DF22-B-LoadUnloadListExtract/staging/UPFRANCE/s2196457.OPDF2201.20260107021007",
        "_ingestionDate":"2026-01-07T04:30:40.030Z",
        "_curationDate":"2026-01-07T04:31:41.530Z"
    }
     */
    public class AccountLoading
    {
        [JsonPropertyName("Media")]
        public Media Media { get; set; }
        public EventType EventType { get; set; }
        public string Application { get; set; }
        public DateTime SendDate { get; set; }
        
        public string AccountId { get; set; }
        
        [JsonPropertyName("distributorRef")]
        public string DistributorRef { get; set; }

        [JsonPropertyName("beneficiaryServiceRef")]
        public string BeneficiaryServiceRef { get; set; }

        [JsonPropertyName("funderContratRef")]
        public string FunderContratRef { get; set; }

        [JsonPropertyName("operationId")]
        public string OperationId { get; set; }

        [JsonPropertyName("origin")]
        public string Origin { get; set; }

        [JsonPropertyName("reason")]
        public string Reason { get; set; }
        
        [JsonPropertyName("voucherImpacts")]
        public List<VoucherImpact> VoucherImpacts { get; set; } = new List<VoucherImpact>();

        [JsonPropertyName("resultCode")]
        public string ResultCode { get; set; }
        
        [JsonPropertyName("accountNumber")]
        public string AccountNumber { get; set; }
        [JsonPropertyName("requested_amount")]
        public decimal RequestedAmount { get; set; }
        [JsonPropertyName("currency")]
        public int Currency { get; set; }
        [JsonPropertyName("amount")]
        public decimal Amount { get; set; }
        [JsonPropertyName("balance")]
        public decimal Balance { get; set; }

        [JsonPropertyName("seqNbr")]
        public int SeqNbr { get; set; }

        [JsonPropertyName("actionDate")]
        public DateTime ActionDate { get; set; }

        [JsonPropertyName("actionCode")]
        public ActionCode ActionCode { get; set; }
        
        public string ErrorMessage { get; set; }

        public string _sourceFile { get; set; }
        public DateTime _ingestionDate { get; set; }
        public DateTime _curationDate { get; set; }
    }
    
    public enum Media
    {
        NotificationPush = 1
    }
    
    public enum EventType
    {
        HYBRIDE_LOAD_NOTIFICATION,
        HYBRIDE_UNLOAD_NOTIFICATION,
        CDJ4C_LOAD_NOTIFICATION,
        CDJ4C_UNLOAD_NOTIFICATION,
        CDJ3C_LOAD_NOTIFICATION,
        CDJ3C_UNLOAD_NOTIFICATION
    }
    
    public enum ActionCode
    {
        LOAD = 1,
        UNLOAD = 2,
        STATUS_UNLOAD = 3, 
        CREDIT_ADJUSTMENT = 4,
        DEBIT_ADJUSTMENT = 5,
        RESET_ACCOUNT = 6
    }

    // Un impact individuel : <voucherImpact>
    public class VoucherImpact
    {
        // <externalReference> obligatoire (UUID 32 hex)
        [JsonPropertyName("voucherExternalReference")]
        public string VoucherExternalReference { get; set; }

        // <amountImpact> obligatoire
        [JsonPropertyName("voucherAmount")]
        public decimal VoucherAmount { get; set; }
        
        // <amountImpact> obligatoire
        [JsonPropertyName("voucherExponent")]
        public int VoucherExponent { get; set; }

        // <status> obligatoire
        [JsonPropertyName("voucherStatus")]
        public VoucherStatus VoucherStatus { get; set; }

        // <voucherReason> optionnel (ajout DF22-B, code raison libre)
        [JsonPropertyName("voucherReason")]
        public string VoucherReason { get; set; }
    }

    // Structure du montant
    public class Amount
    {
        [JsonPropertyName("amount")]
        public int AmountValue { get; set; }          // 1 à 10 digits

        [JsonPropertyName("exponent")]
        public int Exponent { get; set; }             // généralement 2 pour centimes

        [JsonPropertyName("currency")]
        public string Currency { get; set; }          // code ISO 3 digits, ex. "978" pour EUR
    }

    // Énumération pour <status>
    public enum VoucherStatus
    {
        ACTIVE,
        PENDING,
        EXPIRED,
        PROCESSED
    }

    // Énumération pour <reason> (nullable car optionnel)
    public enum VoucherReason
    {
        CANCELLED,
        UNLOADED_EXPIRED,
        UNLOADED_PENDING,
        UNLOADED_ACTIVE,
        SPENT
    }
}