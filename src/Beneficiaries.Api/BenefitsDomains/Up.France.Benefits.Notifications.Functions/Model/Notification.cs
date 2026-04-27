
using System;
using Newtonsoft.Json;
using Newtonsoft.Json.Converters;

namespace Up.France.Benefits.Notifications.Functions.OperationManagement.Notifications.Model
{
    public class Ef1tNotification
    {
        public Notification notification { get; set; }
    }

    public enum Application
    {
        BENEFICIARY = 1,
        FINANCEUR = 2,
        COHESIA = 3,
        COMMERCANT = 4,
        CADHOC = 5
    }

    public partial class Notification
    {

        private notificationMessage messageField;

        private string distributorRefField;

        private int interfaceVersionField;

        /// <remarks/>
        public notificationMessage message
        {
            get
            {
                return this.messageField;
            }
            set
            {
                this.messageField = value;
            }
        }

        /// <remarks/>
        public string distributorRef
        {
            get
            {
                return this.distributorRefField;
            }
            set
            {
                this.distributorRefField = value;
            }
        }

        /// <remarks/>
        public int interfaceVersion
        {
            get
            {
                return this.interfaceVersionField;
            }
            set
            {
                this.interfaceVersionField = value;
            }
        }
    }

    public partial class notificationMessage
    {

        private notificationMessageContextData contextDataField;

        private ElementDataListType notificationPrefsField;

        private System.DateTime messageDateField;

        private string messageIdField;

        private string productRefField;

        private string funderContractRefField;

        private string beneficiaryServiceRefField;

        /// <remarks/>
        public notificationMessageContextData contextData
        {
            get
            {
                return this.contextDataField;
            }
            set
            {
                this.contextDataField = value;
            }
        }

        public ElementDataListType notificationPrefs
        {
            get
            {
                return this.notificationPrefsField;
            }
            set
            {
                this.notificationPrefsField = value;
            }
        }

        public System.DateTime messageDate
        {
            get
            {
                return this.messageDateField;
            }
            set
            {
                this.messageDateField = value;
            }
        }

        public string messageId
        {
            get
            {
                return this.messageIdField;
            }
            set
            {
                this.messageIdField = value;
            }
        }

        public string productRef
        {
            get
            {
                return this.productRefField;
            }
            set
            {
                this.productRefField = value;
            }
        }

        public string funderContractRef
        {
            get
            {
                return this.funderContractRefField;
            }
            set
            {
                this.funderContractRefField = value;
            }
        }

        public string beneficiaryServiceRef
        {
            get
            {
                return this.beneficiaryServiceRefField;
            }
            set
            {
                this.beneficiaryServiceRefField = value;
            }
        }
    }

    public partial class notificationMessageContextData
    {

        private System.DateTime operationDateTimeField;
        private notificationMessageContextDataOperationType operationTypeField;

        private notificationMessageContextDataOperationNature operationNatureField;

        private bool operationNatureFieldSpecified;

        private AmountType operationAmountField;

        private string accountNumberField;

        private AmountType accountBalanceField;

        private AmountType accountAvailableField;

        private string accountCategoryField;

        private string reasonField;

        private string operationIdField;

        private string codeMCCField;

        private string canalAcceptationValueField;

        private string nomMarchandField;

        private string dateTransactionField;

        private string idContratAffilieField;

        private string idAcceptationField;

        private string idMarchandField;

        private string idStructureField;

        private string villeMarchandField;

        private string codepostalMarchandField;

        private string numAutField;

        private string cardIdField;

        private string psnField;

        private string truncatedPANField;

        private string codeRetourField;

        private string codeRaisonDetailleeField;

        private string idTerminalField;

        private string traceNumberField;

        private string posEntryModeField;

        private AmountType amountField;

        private string countryCodeField;

        private string oriAcquirerIdField;

        private string oriMontantField;

        private string oriDateTransactionField;

        private string oriTraceNumberField;

        private string respIssuerMessageField;

        private string respAcceptorMessageField;

        private string respPartialApprovalFlagField;

        private string respCardStatusField;

        private string lastEmvCommandResultField;

        private EcommType ecommField;

        private string authorizationReferenceField;

        private PaymentComplementType paymentComplementField;

        private string cardSchemeCodeField;

        private string maskField;

        public System.DateTime operationDateTime
        {
            get
            {
                return this.operationDateTimeField;
            }
            set
            {
                this.operationDateTimeField = value;
            }
        }

        [JsonConverter(typeof(StringEnumConverter))]
        public notificationMessageContextDataOperationType operationType
        {
            get
            {
                return this.operationTypeField;
            }
            set
            {
                this.operationTypeField = value;
            }
        }

        [JsonConverter(typeof(StringEnumConverter))]
        public notificationMessageContextDataOperationNature operationNature
        {
            get
            {
                return this.operationNatureField;
            }
            set
            {
                this.operationNatureField = value;
            }
        }

        public bool operationNatureSpecified
        {
            get
            {
                return this.operationNatureFieldSpecified;
            }
            set
            {
                this.operationNatureFieldSpecified = value;
            }
        }

        public AmountType operationAmount
        {
            get
            {
                return this.operationAmountField;
            }
            set
            {
                this.operationAmountField = value;
            }
        }

        public string accountNumber
        {
            get
            {
                return this.accountNumberField;
            }
            set
            {
                this.accountNumberField = value;
            }
        }

        public AmountType accountBalance
        {
            get
            {
                return this.accountBalanceField;
            }
            set
            {
                this.accountBalanceField = value;
            }
        }

        public AmountType accountAvailable
        {
            get
            {
                return this.accountAvailableField;
            }
            set
            {
                this.accountAvailableField = value;
            }
        }

        public string accountCategory
        {
            get
            {
                return this.accountCategoryField;
            }
            set
            {
                this.accountCategoryField = value;
            }
        }

        public string reason
        {
            get
            {
                return this.reasonField;
            }
            set
            {
                this.reasonField = value;
            }
        }

        public string operationId
        {
            get
            {
                return this.operationIdField;
            }
            set
            {
                this.operationIdField = value;
            }
        }

        public string codeMCC
        {
            get
            {
                return this.codeMCCField;
            }
            set
            {
                this.codeMCCField = value;
            }
        }

        public string canalAcceptationValue
        {
            get
            {
                return this.canalAcceptationValueField;
            }
            set
            {
                this.canalAcceptationValueField = value;
            }
        }

        public string nomMarchand
        {
            get
            {
                return this.nomMarchandField;
            }
            set
            {
                this.nomMarchandField = value;
            }
        }

        public string dateTransaction
        {
            get
            {
                return this.dateTransactionField;
            }
            set
            {
                this.dateTransactionField = value;
            }
        }

        public string idContratAffilie
        {
            get
            {
                return this.idContratAffilieField;
            }
            set
            {
                this.idContratAffilieField = value;
            }
        }

        public string idAcceptation
        {
            get
            {
                return this.idAcceptationField;
            }
            set
            {
                this.idAcceptationField = value;
            }
        }

        public string idMarchand
        {
            get
            {
                return this.idMarchandField;
            }
            set
            {
                this.idMarchandField = value;
            }
        }

        public string idStructure
        {
            get
            {
                return this.idStructureField;
            }
            set
            {
                this.idStructureField = value;
            }
        }

        public string villeMarchand
        {
            get
            {
                return this.villeMarchandField;
            }
            set
            {
                this.villeMarchandField = value;
            }
        }

        public string codepostalMarchand
        {
            get
            {
                return this.codepostalMarchandField;
            }
            set
            {
                this.codepostalMarchandField = value;
            }
        }

        public string numAut
        {
            get
            {
                return this.numAutField;
            }
            set
            {
                this.numAutField = value;
            }
        }

        public string cardId
        {
            get
            {
                return this.cardIdField;
            }
            set
            {
                this.cardIdField = value;
            }
        }

        public string psn
        {
            get
            {
                return this.psnField;
            }
            set
            {
                this.psnField = value;
            }
        }

        public string truncatedPAN
        {
            get
            {
                return this.truncatedPANField;
            }
            set
            {
                this.truncatedPANField = value;
            }
        }

        public string codeRetour
        {
            get
            {
                return this.codeRetourField;
            }
            set
            {
                this.codeRetourField = value;
            }
        }

        public string codeRaisonDetaillee
        {
            get
            {
                return this.codeRaisonDetailleeField;
            }
            set
            {
                this.codeRaisonDetailleeField = value;
            }
        }

        public string idTerminal
        {
            get
            {
                return this.idTerminalField;
            }
            set
            {
                this.idTerminalField = value;
            }
        }

        public string traceNumber
        {
            get
            {
                return this.traceNumberField;
            }
            set
            {
                this.traceNumberField = value;
            }
        }

        public string posEntryMode
        {
            get
            {
                return this.posEntryModeField;
            }
            set
            {
                this.posEntryModeField = value;
            }
        }

        public AmountType amount
        {
            get
            {
                return this.amountField;
            }
            set
            {
                this.amountField = value;
            }
        }

        public string countryCode
        {
            get
            {
                return this.countryCodeField;
            }
            set
            {
                this.countryCodeField = value;
            }
        }

        public string oriAcquirerId
        {
            get
            {
                return this.oriAcquirerIdField;
            }
            set
            {
                this.oriAcquirerIdField = value;
            }
        }

        public string oriMontant
        {
            get
            {
                return this.oriMontantField;
            }
            set
            {
                this.oriMontantField = value;
            }
        }

        public string oriDateTransaction
        {
            get
            {
                return this.oriDateTransactionField;
            }
            set
            {
                this.oriDateTransactionField = value;
            }
        }

        public string oriTraceNumber
        {
            get
            {
                return this.oriTraceNumberField;
            }
            set
            {
                this.oriTraceNumberField = value;
            }
        }

        public string respIssuerMessage
        {
            get
            {
                return this.respIssuerMessageField;
            }
            set
            {
                this.respIssuerMessageField = value;
            }
        }

        public string respAcceptorMessage
        {
            get
            {
                return this.respAcceptorMessageField;
            }
            set
            {
                this.respAcceptorMessageField = value;
            }
        }

        public string respPartialApprovalFlag
        {
            get
            {
                return this.respPartialApprovalFlagField;
            }
            set
            {
                this.respPartialApprovalFlagField = value;
            }
        }

        public string respCardStatus
        {
            get
            {
                return this.respCardStatusField;
            }
            set
            {
                this.respCardStatusField = value;
            }
        }

        public string lastEmvCommandResult
        {
            get
            {
                return this.lastEmvCommandResultField;
            }
            set
            {
                this.lastEmvCommandResultField = value;
            }
        }

        public VoucherImpactTypeObject voucherImpacts { get; set; }

        public EcommType ecomm
        {
            get
            {
                return this.ecommField;
            }
            set
            {
                this.ecommField = value;
            }
        }

        public string authorizationReference
        {
            get
            {
                return this.authorizationReferenceField;
            }
            set
            {
                this.authorizationReferenceField = value;
            }
        }

        public PaymentComplementType paymentComplement
        {
            get
            {
                return this.paymentComplementField;
            }
            set
            {
                this.paymentComplementField = value;
            }
        }

        public string cardSchemeCode
        {
            get
            {
                return this.cardSchemeCodeField;
            }
            set
            {
                this.cardSchemeCodeField = value;
            }
        }

        public string mask
        {
            get
            {
                return this.maskField;
            }
            set
            {
                this.maskField = value;
            }
        }
    }

    public enum notificationMessageContextDataOperationType
    {

        /// <remarks/>
        BALANCE_NOTIFICATION,

        /// <remarks/>
        AUTHORIZATION,
    }

    public enum notificationMessageContextDataOperationNature
    {

        /// <remarks/>
        LOAD,

        /// <remarks/>
        UNLOAD,

        /// <remarks/>
        PURCHASE,

        /// <remarks/>
        CASH_WITHDRAWAL,

        /// <remarks/>
        LOAD_CANCELLATION,

        /// <remarks/>
        PURCHASE_CANCELLATION,

        /// <remarks/>
        CASH_WITHDRAWAL_CANCELLATION,

        /// <remarks/>
        ACTIVATION,

        /// <remarks/>
        ACTIVATION_WITH_LOAD,

        /// <remarks/>
        ACTIVATION_CANCELLATION,

        /// <remarks/>
        ACTIVATION_WITH_LOAD_CANCELLATION,

        /// <remarks/>
        BALANCE_INQUIRY,

        /// <remarks/>
        RETURN,

        /// <remarks/>
        PURCHASE_ADVICE,

        /// <remarks/>
        RETURN_ADVICE,

        /// <remarks/>
        CANCELLATION_ADVICE,

        /// <remarks/>
        PURCHASE_CREDIT_ADJUSTMENT,

        /// <remarks/>
        PURCHASE_DEBIT_ADJUSTMENT,
    }

    public partial class AmountType : BoundlessAmountType
    {
    }

    public partial class BoundlessAmountType
    {

        private string amountField;

        private string exponentField;

        private string currencyField;

        public string amount
        {
            get
            {
                return this.amountField;
            }
            set
            {
                this.amountField = value;
            }
        }

        public string exponent
        {
            get
            {
                return this.exponentField;
            }
            set
            {
                this.exponentField = value;
            }
        }

        public string currency
        {
            get
            {
                return this.currencyField;
            }
            set
            {
                this.currencyField = value;
            }
        }
    }

    public partial class ElementDataListType
    {

        private ElementDataListTypeItem[] itemField;

        private string nbrItemsField;

        public ElementDataListTypeItem[] Item
        {
            get
            {
                return this.itemField;
            }
            set
            {
                this.itemField = value;
            }
        }

        public string nbrItems
        {
            get
            {
                return this.nbrItemsField;
            }
            set
            {
                this.nbrItemsField = value;
            }
        }
    }

    public partial class ElementDataListTypeItem
    {

        private string eltNameField;

        private string eltValueField;

        public string eltName
        {
            get
            {
                return this.eltNameField;
            }
            set
            {
                this.eltNameField = value;
            }
        }

        public string eltValue
        {
            get
            {
                return this.eltValueField;
            }
            set
            {
                this.eltValueField = value;
            }
        }
    }

    public partial class PaymentComplementType
    {

        private AmountType complementAmountField;

        private System.DateTime scpRequestDateField;

        private System.DateTime scpResponseDateField;

        private bool scpResponseDateFieldSpecified;

        private string substitutionPaymentReasonField;

        private string scpResponseCodeField;

        public AmountType complementAmount
        {
            get
            {
                return this.complementAmountField;
            }
            set
            {
                this.complementAmountField = value;
            }
        }

        public System.DateTime scpRequestDate
        {
            get
            {
                return this.scpRequestDateField;
            }
            set
            {
                this.scpRequestDateField = value;
            }
        }

        public System.DateTime scpResponseDate
        {
            get
            {
                return this.scpResponseDateField;
            }
            set
            {
                this.scpResponseDateField = value;
            }
        }

        public bool scpResponseDateSpecified
        {
            get
            {
                return this.scpResponseDateFieldSpecified;
            }
            set
            {
                this.scpResponseDateFieldSpecified = value;
            }
        }

        public string substitutionPaymentReason
        {
            get
            {
                return this.substitutionPaymentReasonField;
            }
            set
            {
                this.substitutionPaymentReasonField = value;
            }
        }

        public string scpResponseCode
        {
            get
            {
                return this.scpResponseCodeField;
            }
            set
            {
                this.scpResponseCodeField = value;
            }
        }
    }

    public partial class WalletType
    {

        private string additionalDataField;

        private string identifierField;

        private string nameField;

        public string additionalData
        {
            get
            {
                return this.additionalDataField;
            }
            set
            {
                this.additionalDataField = value;
            }
        }

        public string identifier
        {
            get
            {
                return this.identifierField;
            }
            set
            {
                this.identifierField = value;
            }
        }

        public string name
        {
            get
            {
                return this.nameField;
            }
            set
            {
                this.nameField = value;
            }
        }
    }

    public partial class EcommType
    {

        private string[] additionalDataField;

        private WalletType walletField;

        private string cardholderAuthMethodField;

        private string indicatorField;

        private string cryptogramField;

        private string cryptogramCalcMethodField;

        private string cryptogramProcessInfoField;

        private string resultUseSecArchField;

        private string securityTypeField;

        private string transacIdAcceptorField;

        public string[] additionalData
        {
            get
            {
                return this.additionalDataField;
            }
            set
            {
                this.additionalDataField = value;
            }
        }

        public WalletType wallet
        {
            get
            {
                return this.walletField;
            }
            set
            {
                this.walletField = value;
            }
        }

        public string cardholderAuthMethod
        {
            get
            {
                return this.cardholderAuthMethodField;
            }
            set
            {
                this.cardholderAuthMethodField = value;
            }
        }

        public string indicator
        {
            get
            {
                return this.indicatorField;
            }
            set
            {
                this.indicatorField = value;
            }
        }

        public string cryptogram
        {
            get
            {
                return this.cryptogramField;
            }
            set
            {
                this.cryptogramField = value;
            }
        }

        public string cryptogramCalcMethod
        {
            get
            {
                return this.cryptogramCalcMethodField;
            }
            set
            {
                this.cryptogramCalcMethodField = value;
            }
        }

        public string cryptogramProcessInfo
        {
            get
            {
                return this.cryptogramProcessInfoField;
            }
            set
            {
                this.cryptogramProcessInfoField = value;
            }
        }

        public string resultUseSecArch
        {
            get
            {
                return this.resultUseSecArchField;
            }
            set
            {
                this.resultUseSecArchField = value;
            }
        }

        public string securityType
        {
            get
            {
                return this.securityTypeField;
            }
            set
            {
                this.securityTypeField = value;
            }
        }

        public string transacIdAcceptor
        {
            get
            {
                return this.transacIdAcceptorField;
            }
            set
            {
                this.transacIdAcceptorField = value;
            }
        }
    }

    public partial class EcommExtendedType : EcommType
    {

        private string cardholderAuthentificationField;

        private string modifiedSecurityModeField;

        private string securityProtocolField;

        private string ucafCollectionIndicatorField;

        public string cardholderAuthentification
        {
            get
            {
                return this.cardholderAuthentificationField;
            }
            set
            {
                this.cardholderAuthentificationField = value;
            }
        }

        public string modifiedSecurityMode
        {
            get
            {
                return this.modifiedSecurityModeField;
            }
            set
            {
                this.modifiedSecurityModeField = value;
            }
        }

        public string securityProtocol
        {
            get
            {
                return this.securityProtocolField;
            }
            set
            {
                this.securityProtocolField = value;
            }
        }

        public string ucafCollectionIndicator
        {
            get
            {
                return this.ucafCollectionIndicatorField;
            }
            set
            {
                this.ucafCollectionIndicatorField = value;
            }
        }
    }

    public partial class VoucherImpactType
    {

        private string externalReferenceField;

        private AmountType amountImpactField;

        public string externalReference
        {
            get
            {
                return this.externalReferenceField;
            }
            set
            {
                this.externalReferenceField = value;
            }
        }

        public AmountType amountImpact
        {
            get
            {
                return this.amountImpactField;
            }
            set
            {
                this.amountImpactField = value;
            }
        }
    }


    public partial class VoucherImpactWithStatusType : VoucherImpactType
    {

        private VoucherImpactWithStatusTypeStatus statusField;

        private VoucherImpactWithStatusTypeReason reasonField;

        private bool reasonFieldSpecified;

        [JsonConverter(typeof(StringEnumConverter))]
        public VoucherImpactWithStatusTypeStatus status
        {
            get
            {
                return this.statusField;
            }
            set
            {
                this.statusField = value;
            }
        }

        [JsonConverter(typeof(StringEnumConverter))]
        public VoucherImpactWithStatusTypeReason reason
        {
            get
            {
                return this.reasonField;
            }
            set
            {
                this.reasonField = value;
            }
        }

        public bool reasonSpecified
        {
            get
            {
                return this.reasonFieldSpecified;
            }
            set
            {
                this.reasonFieldSpecified = value;
            }
        }
    }

    public enum VoucherImpactWithStatusTypeStatus
    {

        /// <remarks/>
        ACTIVE,

        /// <remarks/>
        PENDING,

        /// <remarks/>
        EXPIRED,

        /// <remarks/>
        PROCESSED,
    }

    public enum VoucherImpactWithStatusTypeReason
    {

        /// <remarks/>
        CANCELLED,

        /// <remarks/>
        UNLOADED_EXPIRED,

        /// <remarks/>
        UNLOADED_PENDING,

        /// <remarks/>
        UNLOADED_ACTIVE,

        /// <remarks/>
        SPENT,
    }

    public partial class CRO : HeaderType
    {

        private BeneficiaryAccountOperation[] beneficiaryAccountOperationField;

        public BeneficiaryAccountOperation[] BeneficiaryAccountOperation
        {
            get
            {
                return this.beneficiaryAccountOperationField;
            }
            set
            {
                this.beneficiaryAccountOperationField = value;
            }
        }
    }

    public partial class BeneficiaryAccountOperation
    {

        private Card[] cardField;

        private string productRefField;

        private string funderContractRefField;

        private string beneficiaryServiceRefField;

        private string funderContractLabelField;

        private string beneficiaryServiceLabelField;

        public Card[] Card
        {
            get
            {
                return this.cardField;
            }
            set
            {
                this.cardField = value;
            }
        }

        public string productRef
        {
            get
            {
                return this.productRefField;
            }
            set
            {
                this.productRefField = value;
            }
        }

        public string funderContractRef
        {
            get
            {
                return this.funderContractRefField;
            }
            set
            {
                this.funderContractRefField = value;
            }
        }

        public string beneficiaryServiceRef
        {
            get
            {
                return this.beneficiaryServiceRefField;
            }
            set
            {
                this.beneficiaryServiceRefField = value;
            }
        }

        public string funderContractLabel
        {
            get
            {
                return this.funderContractLabelField;
            }
            set
            {
                this.funderContractLabelField = value;
            }
        }

        public string beneficiaryServiceLabel
        {
            get
            {
                return this.beneficiaryServiceLabelField;
            }
            set
            {
                this.beneficiaryServiceLabelField = value;
            }
        }
    }

    public partial class Card : cardType
    {

        private FirstPresentment[] firstPresentmentField;

        private SecondPresentment[] secondPresentmentField;

        private FirstChargeback[] firstChargebackField;

        private SecondChargeback[] secondChargebackField;

        private RetrievalRequest[] retrievalRequestField;

        private FeeCollection[] feeCollectionField;

        private Authorization[] authorizationField;

        public FirstPresentment[] FirstPresentment
        {
            get
            {
                return this.firstPresentmentField;
            }
            set
            {
                this.firstPresentmentField = value;
            }
        }

        public SecondPresentment[] SecondPresentment
        {
            get
            {
                return this.secondPresentmentField;
            }
            set
            {
                this.secondPresentmentField = value;
            }
        }

        public FirstChargeback[] FirstChargeback
        {
            get
            {
                return this.firstChargebackField;
            }
            set
            {
                this.firstChargebackField = value;
            }
        }

        public SecondChargeback[] SecondChargeback
        {
            get
            {
                return this.secondChargebackField;
            }
            set
            {
                this.secondChargebackField = value;
            }
        }

        public RetrievalRequest[] RetrievalRequest
        {
            get
            {
                return this.retrievalRequestField;
            }
            set
            {
                this.retrievalRequestField = value;
            }
        }

        public FeeCollection[] FeeCollection
        {
            get
            {
                return this.feeCollectionField;
            }
            set
            {
                this.feeCollectionField = value;
            }
        }

        public Authorization[] Authorization
        {
            get
            {
                return this.authorizationField;
            }
            set
            {
                this.authorizationField = value;
            }
        }
    }

    public partial class FirstPresentment : operationType
    {

        private string canalAcceptationValueField;

        private string posEntryModeField;

        private string cardStatusField;

        private AmountType transactionAmountField;

        private AmountType reconciliationAmountField;

        private ExchangeRateType exchangeRateField;

        private AmountType cardholderAmountField;

        private ExchangeRateType cardholderConversionRateField;

        private System.DateTime transmissionDateAndTimeField;

        private string numAutField;

        private interchangeFee[] interchangeFeesField;

        private string clearingStatusField;

        private bool authorizationNotFoundField;

        private bool unknownPANField;

        private bool duplicateCtrlTopField;

        private bool latePresentationTopField;

        private bool counterfeitCardTopField;

        private string idMarchandField;

        private string nomMarchandField;

        private string villeMarchandField;

        private string rueMarchandField;

        private string codepostalMarchandField;

        private string regionMarchandField;

        private string idTerminalField;

        private string idAcceptationField;

        private string codeMCCField;

        private string countryCodeField;

        private string traceNumberField;

        private string idRemiseField;

        private bool accountImpactField;

        private System.DateTime dateTransactionField;

        private System.DateTime settlementDateField;

        private bool settlementDateFieldSpecified;

        private string donneePriveeField;

        private string typePaiementOrigineField;

        private string idReseauField;

        private string authorizationReferenceField;

        private FirstPresentmentBackofficeStatus backofficeStatusField;

        private bool backofficeStatusFieldSpecified;

        private string backofficeFolderIdField;

        private string backofficeFolderNameField;

        private string originalIdOperationField;

        private EcommExtendedType ecommField;

        /// <remarks/>
        public string canalAcceptationValue
        {
            get
            {
                return this.canalAcceptationValueField;
            }
            set
            {
                this.canalAcceptationValueField = value;
            }
        }

        /// <remarks/>
        public string posEntryMode
        {
            get
            {
                return this.posEntryModeField;
            }
            set
            {
                this.posEntryModeField = value;
            }
        }

        /// <remarks/>
        public string cardStatus
        {
            get
            {
                return this.cardStatusField;
            }
            set
            {
                this.cardStatusField = value;
            }
        }

        /// <remarks/>
        public AmountType transactionAmount
        {
            get
            {
                return this.transactionAmountField;
            }
            set
            {
                this.transactionAmountField = value;
            }
        }

        /// <remarks/>
        public AmountType reconciliationAmount
        {
            get
            {
                return this.reconciliationAmountField;
            }
            set
            {
                this.reconciliationAmountField = value;
            }
        }

        /// <remarks/>
        public ExchangeRateType exchangeRate
        {
            get
            {
                return this.exchangeRateField;
            }
            set
            {
                this.exchangeRateField = value;
            }
        }

        /// <remarks/>
        public AmountType cardholderAmount
        {
            get
            {
                return this.cardholderAmountField;
            }
            set
            {
                this.cardholderAmountField = value;
            }
        }

        /// <remarks/>
        public ExchangeRateType cardholderConversionRate
        {
            get
            {
                return this.cardholderConversionRateField;
            }
            set
            {
                this.cardholderConversionRateField = value;
            }
        }

        /// <remarks/>
        public System.DateTime transmissionDateAndTime
        {
            get
            {
                return this.transmissionDateAndTimeField;
            }
            set
            {
                this.transmissionDateAndTimeField = value;
            }
        }

        /// <remarks/>
        public string numAut
        {
            get
            {
                return this.numAutField;
            }
            set
            {
                this.numAutField = value;
            }
        }

        public interchangeFee[] interchangeFees
        {
            get
            {
                return this.interchangeFeesField;
            }
            set
            {
                this.interchangeFeesField = value;
            }
        }

        /// <remarks/>
        public string clearingStatus
        {
            get
            {
                return this.clearingStatusField;
            }
            set
            {
                this.clearingStatusField = value;
            }
        }

        /// <remarks/>
        public bool authorizationNotFound
        {
            get
            {
                return this.authorizationNotFoundField;
            }
            set
            {
                this.authorizationNotFoundField = value;
            }
        }

        /// <remarks/>
        public bool unknownPAN
        {
            get
            {
                return this.unknownPANField;
            }
            set
            {
                this.unknownPANField = value;
            }
        }

        /// <remarks/>
        public bool duplicateCtrlTop
        {
            get
            {
                return this.duplicateCtrlTopField;
            }
            set
            {
                this.duplicateCtrlTopField = value;
            }
        }

        /// <remarks/>
        public bool latePresentationTop
        {
            get
            {
                return this.latePresentationTopField;
            }
            set
            {
                this.latePresentationTopField = value;
            }
        }

        /// <remarks/>
        public bool counterfeitCardTop
        {
            get
            {
                return this.counterfeitCardTopField;
            }
            set
            {
                this.counterfeitCardTopField = value;
            }
        }

        /// <remarks/>
        public string idMarchand
        {
            get
            {
                return this.idMarchandField;
            }
            set
            {
                this.idMarchandField = value;
            }
        }

        /// <remarks/>
        public string nomMarchand
        {
            get
            {
                return this.nomMarchandField;
            }
            set
            {
                this.nomMarchandField = value;
            }
        }

        /// <remarks/>
        public string villeMarchand
        {
            get
            {
                return this.villeMarchandField;
            }
            set
            {
                this.villeMarchandField = value;
            }
        }

        /// <remarks/>
        public string rueMarchand
        {
            get
            {
                return this.rueMarchandField;
            }
            set
            {
                this.rueMarchandField = value;
            }
        }

        /// <remarks/>
        public string codepostalMarchand
        {
            get
            {
                return this.codepostalMarchandField;
            }
            set
            {
                this.codepostalMarchandField = value;
            }
        }

        /// <remarks/>
        public string regionMarchand
        {
            get
            {
                return this.regionMarchandField;
            }
            set
            {
                this.regionMarchandField = value;
            }
        }

        /// <remarks/>
        public string idTerminal
        {
            get
            {
                return this.idTerminalField;
            }
            set
            {
                this.idTerminalField = value;
            }
        }

        /// <remarks/>
        public string idAcceptation
        {
            get
            {
                return this.idAcceptationField;
            }
            set
            {
                this.idAcceptationField = value;
            }
        }

        /// <remarks/>
        public string codeMCC
        {
            get
            {
                return this.codeMCCField;
            }
            set
            {
                this.codeMCCField = value;
            }
        }

        /// <remarks/>
        public string countryCode
        {
            get
            {
                return this.countryCodeField;
            }
            set
            {
                this.countryCodeField = value;
            }
        }

        /// <remarks/>
        public string traceNumber
        {
            get
            {
                return this.traceNumberField;
            }
            set
            {
                this.traceNumberField = value;
            }
        }

        /// <remarks/>
        public string idRemise
        {
            get
            {
                return this.idRemiseField;
            }
            set
            {
                this.idRemiseField = value;
            }
        }

        /// <remarks/>
        public bool accountImpact
        {
            get
            {
                return this.accountImpactField;
            }
            set
            {
                this.accountImpactField = value;
            }
        }

        /// <remarks/>
        public System.DateTime dateTransaction
        {
            get
            {
                return this.dateTransactionField;
            }
            set
            {
                this.dateTransactionField = value;
            }
        }

        /// <remarks/>
        public System.DateTime settlementDate
        {
            get
            {
                return this.settlementDateField;
            }
            set
            {
                this.settlementDateField = value;
            }
        }

        /// <remarks/>
        [System.Xml.Serialization.XmlIgnoreAttribute()]
        public bool settlementDateSpecified
        {
            get
            {
                return this.settlementDateFieldSpecified;
            }
            set
            {
                this.settlementDateFieldSpecified = value;
            }
        }

        public VoucherImpactTypeObject voucherImpacts { get; set; }

        public string donneePrivee
        {
            get
            {
                return this.donneePriveeField;
            }
            set
            {
                this.donneePriveeField = value;
            }
        }

        /// <remarks/>
        public string typePaiementOrigine
        {
            get
            {
                return this.typePaiementOrigineField;
            }
            set
            {
                this.typePaiementOrigineField = value;
            }
        }

        /// <remarks/>
        public string idReseau
        {
            get
            {
                return this.idReseauField;
            }
            set
            {
                this.idReseauField = value;
            }
        }

        /// <remarks/>
        public string authorizationReference
        {
            get
            {
                return this.authorizationReferenceField;
            }
            set
            {
                this.authorizationReferenceField = value;
            }
        }

        [JsonConverter(typeof(StringEnumConverter))]
        public FirstPresentmentBackofficeStatus backofficeStatus
        {
            get
            {
                return this.backofficeStatusField;
            }
            set
            {
                this.backofficeStatusField = value;
            }
        }

        public bool backofficeStatusSpecified
        {
            get
            {
                return this.backofficeStatusFieldSpecified;
            }
            set
            {
                this.backofficeStatusFieldSpecified = value;
            }
        }

        /// <remarks/>
        public string backofficeFolderId
        {
            get
            {
                return this.backofficeFolderIdField;
            }
            set
            {
                this.backofficeFolderIdField = value;
            }
        }

        /// <remarks/>
        public string backofficeFolderName
        {
            get
            {
                return this.backofficeFolderNameField;
            }
            set
            {
                this.backofficeFolderNameField = value;
            }
        }

        /// <remarks/>
        public string originalIdOperation
        {
            get
            {
                return this.originalIdOperationField;
            }
            set
            {
                this.originalIdOperationField = value;
            }
        }

        /// <remarks/>
        public EcommExtendedType ecomm
        {
            get
            {
                return this.ecommField;
            }
            set
            {
                this.ecommField = value;
            }
        }
    }

    public partial class ExchangeRateType
    {

        private string rateField;

        private string exponentField;

        public string rate
        {
            get
            {
                return this.rateField;
            }
            set
            {
                this.rateField = value;
            }
        }

        public string exponent
        {
            get
            {
                return this.exponentField;
            }
            set
            {
                this.exponentField = value;
            }
        }
    }

    public partial class interchangeFee
    {

        private interchangeFeeInterchangeFeeAmount interchangeFeeAmountField;

        private string interchangeFeeCodeField;

        /// <remarks/>
        public interchangeFeeInterchangeFeeAmount interchangeFeeAmount
        {
            get
            {
                return this.interchangeFeeAmountField;
            }
            set
            {
                this.interchangeFeeAmountField = value;
            }
        }

        /// <remarks/>
        public string interchangeFeeCode
        {
            get
            {
                return this.interchangeFeeCodeField;
            }
            set
            {
                this.interchangeFeeCodeField = value;
            }
        }
    }

    public partial class interchangeFeeInterchangeFeeAmount : BoundlessAmountType
    {
    }

    public enum FirstPresentmentBackofficeStatus
    {

        /// <remarks/>
        OPEN,

        /// <remarks/>
        CLOSED,
    }

    public partial class operationType
    {

        private string idContratAffilieField;

        private string idStructureField;

        private string accountCategoryField;

        private string accountNumberField;

        private string idOperationField;

        private string cardSchemeCodeField;

        private string messageTypeIdentifierField;

        private string functionCodeField;

        private string transactionTypeField;

        private System.DateTime processingDateField;

        private bool reversalFlagField;

        public string idContratAffilie
        {
            get
            {
                return this.idContratAffilieField;
            }
            set
            {
                this.idContratAffilieField = value;
            }
        }

        public string idStructure
        {
            get
            {
                return this.idStructureField;
            }
            set
            {
                this.idStructureField = value;
            }
        }

        public string accountCategory
        {
            get
            {
                return this.accountCategoryField;
            }
            set
            {
                this.accountCategoryField = value;
            }
        }

        public string accountNumber
        {
            get
            {
                return this.accountNumberField;
            }
            set
            {
                this.accountNumberField = value;
            }
        }

        public string idOperation
        {
            get
            {
                return this.idOperationField;
            }
            set
            {
                this.idOperationField = value;
            }
        }

        public string cardSchemeCode
        {
            get
            {
                return this.cardSchemeCodeField;
            }
            set
            {
                this.cardSchemeCodeField = value;
            }
        }

        public string messageTypeIdentifier
        {
            get
            {
                return this.messageTypeIdentifierField;
            }
            set
            {
                this.messageTypeIdentifierField = value;
            }
        }

        public string functionCode
        {
            get
            {
                return this.functionCodeField;
            }
            set
            {
                this.functionCodeField = value;
            }
        }

        public string transactionType
        {
            get
            {
                return this.transactionTypeField;
            }
            set
            {
                this.transactionTypeField = value;
            }
        }

        public System.DateTime processingDate
        {
            get
            {
                return this.processingDateField;
            }
            set
            {
                this.processingDateField = value;
            }
        }

        public bool reversalFlag
        {
            get
            {
                return this.reversalFlagField;
            }
            set
            {
                this.reversalFlagField = value;
            }
        }
    }

    public partial class SecondPresentment : operationType
    {

        private bool partialFlagField;

        private AmountType transactionAmountField;

        private AmountType reconciliationAmountField;

        private ExchangeRateType exchangeRateField;

        private AmountType cardholderAmountField;

        private ExchangeRateType cardholderConversionRateField;

        private System.DateTime transmissionDateAndTimeField;

        private interchangeFee[] interchangeFeesField;

        private OriginalOperationType originalOperationField;

        /// <remarks/>
        public bool partialFlag
        {
            get
            {
                return this.partialFlagField;
            }
            set
            {
                this.partialFlagField = value;
            }
        }

        /// <remarks/>
        public AmountType transactionAmount
        {
            get
            {
                return this.transactionAmountField;
            }
            set
            {
                this.transactionAmountField = value;
            }
        }

        /// <remarks/>
        public AmountType reconciliationAmount
        {
            get
            {
                return this.reconciliationAmountField;
            }
            set
            {
                this.reconciliationAmountField = value;
            }
        }

        /// <remarks/>
        public ExchangeRateType exchangeRate
        {
            get
            {
                return this.exchangeRateField;
            }
            set
            {
                this.exchangeRateField = value;
            }
        }

        /// <remarks/>
        public AmountType cardholderAmount
        {
            get
            {
                return this.cardholderAmountField;
            }
            set
            {
                this.cardholderAmountField = value;
            }
        }

        /// <remarks/>
        public ExchangeRateType cardholderConversionRate
        {
            get
            {
                return this.cardholderConversionRateField;
            }
            set
            {
                this.cardholderConversionRateField = value;
            }
        }

        /// <remarks/>
        public System.DateTime transmissionDateAndTime
        {
            get
            {
                return this.transmissionDateAndTimeField;
            }
            set
            {
                this.transmissionDateAndTimeField = value;
            }
        }

        public interchangeFee[] interchangeFees
        {
            get
            {
                return this.interchangeFeesField;
            }
            set
            {
                this.interchangeFeesField = value;
            }
        }

        /// <remarks/>
        public OriginalOperationType originalOperation
        {
            get
            {
                return this.originalOperationField;
            }
            set
            {
                this.originalOperationField = value;
            }
        }
    }

    public partial class OriginalOperationType
    {

        private string originalIdOperationField;

        private string originalMessageTypeIdentifierField;

        private AmountType originalTransactionAmountField;

        private AmountType originalReconciliationAmountField;

        private AmountType originalCardholderAmountField;

        private ExchangeRateType originalCardholderConversionRateField;

        private System.DateTime originalTransmissionDateAndTimeField;

        private string originalNumAutField;

        private interchangeFee[] originalInterchangeFeesField;

        private string originalIdMarchandField;

        private string originalNomMarchandField;

        private string originalIdTerminalField;

        private string originalIdAcceptationField;

        private string originalCodeMCCField;

        private string originalCountryCodeField;

        private string originalTraceNumberField;

        private System.DateTime originalDateTransactionField;

        private string originalAccountCategoryField;

        private EcommExtendedType originalEcommField;

        /// <remarks/>
        public string originalIdOperation
        {
            get
            {
                return this.originalIdOperationField;
            }
            set
            {
                this.originalIdOperationField = value;
            }
        }

        /// <remarks/>
        public string originalMessageTypeIdentifier
        {
            get
            {
                return this.originalMessageTypeIdentifierField;
            }
            set
            {
                this.originalMessageTypeIdentifierField = value;
            }
        }

        /// <remarks/>
        public AmountType originalTransactionAmount
        {
            get
            {
                return this.originalTransactionAmountField;
            }
            set
            {
                this.originalTransactionAmountField = value;
            }
        }

        /// <remarks/>
        public AmountType originalReconciliationAmount
        {
            get
            {
                return this.originalReconciliationAmountField;
            }
            set
            {
                this.originalReconciliationAmountField = value;
            }
        }

        /// <remarks/>
        public AmountType originalCardholderAmount
        {
            get
            {
                return this.originalCardholderAmountField;
            }
            set
            {
                this.originalCardholderAmountField = value;
            }
        }

        /// <remarks/>
        public ExchangeRateType originalCardholderConversionRate
        {
            get
            {
                return this.originalCardholderConversionRateField;
            }
            set
            {
                this.originalCardholderConversionRateField = value;
            }
        }

        /// <remarks/>
        public System.DateTime originalTransmissionDateAndTime
        {
            get
            {
                return this.originalTransmissionDateAndTimeField;
            }
            set
            {
                this.originalTransmissionDateAndTimeField = value;
            }
        }

        /// <remarks/>
        public string originalNumAut
        {
            get
            {
                return this.originalNumAutField;
            }
            set
            {
                this.originalNumAutField = value;
            }
        }

        public interchangeFee[] originalInterchangeFees
        {
            get
            {
                return this.originalInterchangeFeesField;
            }
            set
            {
                this.originalInterchangeFeesField = value;
            }
        }

        /// <remarks/>
        public string originalIdMarchand
        {
            get
            {
                return this.originalIdMarchandField;
            }
            set
            {
                this.originalIdMarchandField = value;
            }
        }

        /// <remarks/>
        public string originalNomMarchand
        {
            get
            {
                return this.originalNomMarchandField;
            }
            set
            {
                this.originalNomMarchandField = value;
            }
        }

        /// <remarks/>
        public string originalIdTerminal
        {
            get
            {
                return this.originalIdTerminalField;
            }
            set
            {
                this.originalIdTerminalField = value;
            }
        }

        /// <remarks/>
        public string originalIdAcceptation
        {
            get
            {
                return this.originalIdAcceptationField;
            }
            set
            {
                this.originalIdAcceptationField = value;
            }
        }

        /// <remarks/>
        public string originalCodeMCC
        {
            get
            {
                return this.originalCodeMCCField;
            }
            set
            {
                this.originalCodeMCCField = value;
            }
        }

        /// <remarks/>
        public string originalCountryCode
        {
            get
            {
                return this.originalCountryCodeField;
            }
            set
            {
                this.originalCountryCodeField = value;
            }
        }

        /// <remarks/>
        public string originalTraceNumber
        {
            get
            {
                return this.originalTraceNumberField;
            }
            set
            {
                this.originalTraceNumberField = value;
            }
        }

        /// <remarks/>
        public System.DateTime originalDateTransaction
        {
            get
            {
                return this.originalDateTransactionField;
            }
            set
            {
                this.originalDateTransactionField = value;
            }
        }

        /// <remarks/>
        public string originalAccountCategory
        {
            get
            {
                return this.originalAccountCategoryField;
            }
            set
            {
                this.originalAccountCategoryField = value;
            }
        }

        /// <remarks/>
        public EcommExtendedType originalEcomm
        {
            get
            {
                return this.originalEcommField;
            }
            set
            {
                this.originalEcommField = value;
            }
        }
    }

    public partial class FirstChargeback : operationType
    {

        private bool partialFlagField;

        private AmountType transactionAmountField;

        private string documentationIndicatorField;

        private string cardIssuerReferenceDataField;

        private string reasonCodeField;

        private string messageTextField;

        private OriginalOperationType originalOperationField;

        /// <remarks/>
        public bool partialFlag
        {
            get
            {
                return this.partialFlagField;
            }
            set
            {
                this.partialFlagField = value;
            }
        }

        /// <remarks/>
        public AmountType transactionAmount
        {
            get
            {
                return this.transactionAmountField;
            }
            set
            {
                this.transactionAmountField = value;
            }
        }

        /// <remarks/>
        public string documentationIndicator
        {
            get
            {
                return this.documentationIndicatorField;
            }
            set
            {
                this.documentationIndicatorField = value;
            }
        }

        /// <remarks/>
        public string cardIssuerReferenceData
        {
            get
            {
                return this.cardIssuerReferenceDataField;
            }
            set
            {
                this.cardIssuerReferenceDataField = value;
            }
        }

        /// <remarks/>
        public string reasonCode
        {
            get
            {
                return this.reasonCodeField;
            }
            set
            {
                this.reasonCodeField = value;
            }
        }

        /// <remarks/>
        public string messageText
        {
            get
            {
                return this.messageTextField;
            }
            set
            {
                this.messageTextField = value;
            }
        }

        /// <remarks/>
        public OriginalOperationType originalOperation
        {
            get
            {
                return this.originalOperationField;
            }
            set
            {
                this.originalOperationField = value;
            }
        }
    }

    public partial class SecondChargeback : operationType
    {

        private bool partialFlagField;

        private AmountType transactionAmountField;

        private string documentationIndicatorField;

        private string cardIssuerReferenceDataField;

        private string reasonCodeField;

        private string messageTextField;

        private OriginalOperationType originalOperationField;

        /// <remarks/>
        public bool partialFlag
        {
            get
            {
                return this.partialFlagField;
            }
            set
            {
                this.partialFlagField = value;
            }
        }

        /// <remarks/>
        public AmountType transactionAmount
        {
            get
            {
                return this.transactionAmountField;
            }
            set
            {
                this.transactionAmountField = value;
            }
        }

        /// <remarks/>
        public string documentationIndicator
        {
            get
            {
                return this.documentationIndicatorField;
            }
            set
            {
                this.documentationIndicatorField = value;
            }
        }

        /// <remarks/>
        public string cardIssuerReferenceData
        {
            get
            {
                return this.cardIssuerReferenceDataField;
            }
            set
            {
                this.cardIssuerReferenceDataField = value;
            }
        }

        /// <remarks/>
        public string reasonCode
        {
            get
            {
                return this.reasonCodeField;
            }
            set
            {
                this.reasonCodeField = value;
            }
        }

        /// <remarks/>
        public string messageText
        {
            get
            {
                return this.messageTextField;
            }
            set
            {
                this.messageTextField = value;
            }
        }

        /// <remarks/>
        public OriginalOperationType originalOperation
        {
            get
            {
                return this.originalOperationField;
            }
            set
            {
                this.originalOperationField = value;
            }
        }
    }

    public partial class RetrievalRequest : operationType
    {

        private string retrievalDocumentCodeField;

        private OriginalOperationType originalOperationField;

        /// <remarks/>
        public string retrievalDocumentCode
        {
            get
            {
                return this.retrievalDocumentCodeField;
            }
            set
            {
                this.retrievalDocumentCodeField = value;
            }
        }

        /// <remarks/>
        public OriginalOperationType originalOperation
        {
            get
            {
                return this.originalOperationField;
            }
            set
            {
                this.originalOperationField = value;
            }
        }
    }

    public partial class FeeCollection : operationType
    {

        private string directionField;

        private string collectionDisbursementFlagField;

        private string reasonCodeField;

        private string messageTextField;

        private System.DateTime actionDateAndTimeField;

        private bool actionDateAndTimeFieldSpecified;

        private string documentationIndicatorField;

        private System.DateTime settlementDateField;

        private bool settlementDateFieldSpecified;

        private string feeCollectionControlNumberField;

        private AmountType transactionAmountField;

        private AmountType reconciliationAmountField;

        private ExchangeRateType exchangeRateField;

        private OriginalOperationType originalOperationField;

        /// <remarks/>
        public string direction
        {
            get
            {
                return this.directionField;
            }
            set
            {
                this.directionField = value;
            }
        }

        /// <remarks/>
        public string CollectionDisbursementFlag
        {
            get
            {
                return this.collectionDisbursementFlagField;
            }
            set
            {
                this.collectionDisbursementFlagField = value;
            }
        }

        /// <remarks/>
        public string reasonCode
        {
            get
            {
                return this.reasonCodeField;
            }
            set
            {
                this.reasonCodeField = value;
            }
        }

        /// <remarks/>
        public string messageText
        {
            get
            {
                return this.messageTextField;
            }
            set
            {
                this.messageTextField = value;
            }
        }

        /// <remarks/>
        public System.DateTime actionDateAndTime
        {
            get
            {
                return this.actionDateAndTimeField;
            }
            set
            {
                this.actionDateAndTimeField = value;
            }
        }

        public bool actionDateAndTimeSpecified
        {
            get
            {
                return this.actionDateAndTimeFieldSpecified;
            }
            set
            {
                this.actionDateAndTimeFieldSpecified = value;
            }
        }

        /// <remarks/>
        public string documentationIndicator
        {
            get
            {
                return this.documentationIndicatorField;
            }
            set
            {
                this.documentationIndicatorField = value;
            }
        }

        /// <remarks/>
        public System.DateTime settlementDate
        {
            get
            {
                return this.settlementDateField;
            }
            set
            {
                this.settlementDateField = value;
            }
        }

        /// <remarks/>
        [System.Xml.Serialization.XmlIgnoreAttribute()]
        public bool settlementDateSpecified
        {
            get
            {
                return this.settlementDateFieldSpecified;
            }
            set
            {
                this.settlementDateFieldSpecified = value;
            }
        }

        /// <remarks/>
        public string feeCollectionControlNumber
        {
            get
            {
                return this.feeCollectionControlNumberField;
            }
            set
            {
                this.feeCollectionControlNumberField = value;
            }
        }

        /// <remarks/>
        public AmountType transactionAmount
        {
            get
            {
                return this.transactionAmountField;
            }
            set
            {
                this.transactionAmountField = value;
            }
        }

        /// <remarks/>
        public AmountType reconciliationAmount
        {
            get
            {
                return this.reconciliationAmountField;
            }
            set
            {
                this.reconciliationAmountField = value;
            }
        }

        /// <remarks/>
        public ExchangeRateType exchangeRate
        {
            get
            {
                return this.exchangeRateField;
            }
            set
            {
                this.exchangeRateField = value;
            }
        }

        /// <remarks/>
        public OriginalOperationType originalOperation
        {
            get
            {
                return this.originalOperationField;
            }
            set
            {
                this.originalOperationField = value;
            }
        }
    }

    public class VoucherImpactTypeObject
    {
        public VoucherImpactWithStatusType[] voucherImpact { get; set; }
    }


    public partial class Authorization : operationType
    {

        private string canalAcceptationValueField;

        private string posEntryModeField;

        private AmountType transactionAmountField;

        private AmountType cardholderAmountField;

        private ExchangeRateType cardholderConversionRateField;

        private string numAutField;

        private string idMarchandField;

        private string nomMarchandField;

        private string villeMarchandField;

        private string codepostalMarchandField;

        private string idTerminalField;

        private string idAcceptationField;

        private string codeMCCField;

        private string countryCodeField;

        private string traceNumberField;

        private System.DateTime dateTransactionField;

        //private VoucherImpactTypeObject voucherImpactsField;

        private EcommType ecommField;

        private string maskField;

        /// <remarks/>
        public string canalAcceptationValue
        {
            get
            {
                return this.canalAcceptationValueField;
            }
            set
            {
                this.canalAcceptationValueField = value;
            }
        }

        /// <remarks/>
        public string posEntryMode
        {
            get
            {
                return this.posEntryModeField;
            }
            set
            {
                this.posEntryModeField = value;
            }
        }

        /// <remarks/>
        public AmountType transactionAmount
        {
            get
            {
                return this.transactionAmountField;
            }
            set
            {
                this.transactionAmountField = value;
            }
        }

        /// <remarks/>
        public AmountType cardholderAmount
        {
            get
            {
                return this.cardholderAmountField;
            }
            set
            {
                this.cardholderAmountField = value;
            }
        }

        /// <remarks/>
        public ExchangeRateType cardholderConversionRate
        {
            get
            {
                return this.cardholderConversionRateField;
            }
            set
            {
                this.cardholderConversionRateField = value;
            }
        }

        /// <remarks/>
        public string numAut
        {
            get
            {
                return this.numAutField;
            }
            set
            {
                this.numAutField = value;
            }
        }

        /// <remarks/>
        public string idMarchand
        {
            get
            {
                return this.idMarchandField;
            }
            set
            {
                this.idMarchandField = value;
            }
        }

        /// <remarks/>
        public string nomMarchand
        {
            get
            {
                return this.nomMarchandField;
            }
            set
            {
                this.nomMarchandField = value;
            }
        }

        /// <remarks/>
        public string villeMarchand
        {
            get
            {
                return this.villeMarchandField;
            }
            set
            {
                this.villeMarchandField = value;
            }
        }

        /// <remarks/>
        public string codepostalMarchand
        {
            get
            {
                return this.codepostalMarchandField;
            }
            set
            {
                this.codepostalMarchandField = value;
            }
        }

        /// <remarks/>
        public string idTerminal
        {
            get
            {
                return this.idTerminalField;
            }
            set
            {
                this.idTerminalField = value;
            }
        }

        /// <remarks/>
        public string idAcceptation
        {
            get
            {
                return this.idAcceptationField;
            }
            set
            {
                this.idAcceptationField = value;
            }
        }

        /// <remarks/>
        public string codeMCC
        {
            get
            {
                return this.codeMCCField;
            }
            set
            {
                this.codeMCCField = value;
            }
        }

        /// <remarks/>
        public string countryCode
        {
            get
            {
                return this.countryCodeField;
            }
            set
            {
                this.countryCodeField = value;
            }
        }

        /// <remarks/>
        public string traceNumber
        {
            get
            {
                return this.traceNumberField;
            }
            set
            {
                this.traceNumberField = value;
            }
        }

        /// <remarks/>
        public DateTime dateTransaction
        {
            get
            {
                return this.dateTransactionField;
            }
            set
            {
                this.dateTransactionField = value;
            }
        }

        public VoucherImpactTypeObject voucherImpacts { get; set; }
       

        public EcommType ecomm
        {
            get
            {
                return this.ecommField;
            }
            set
            {
                this.ecommField = value;
            }
        }

        /// <remarks/>
        public string mask
        {
            get
            {
                return this.maskField;
            }
            set
            {
                this.maskField = value;
            }
        }
    }

    public partial class cardType
    {

        private string cardIdField;

        private string panField;

        private int psnField;

        private string expiryDateField;

        public string cardId
        {
            get
            {
                return this.cardIdField;
            }
            set
            {
                this.cardIdField = value;
            }
        }

        public string pan
        {
            get
            {
                return this.panField;
            }
            set
            {
                this.panField = value;
            }
        }

        public int psn
        {
            get
            {
                return this.psnField;
            }
            set
            {
                this.psnField = value;
            }
        }

        public string expiryDate
        {
            get
            {
                return this.expiryDateField;
            }
            set
            {
                this.expiryDateField = value;
            }
        }
    }

    public partial class HeaderType
    {

        private System.DateTime fileDateField;

        private string fileIdField;

        private string nbrItemsField;

        private string distributorRefField;

        private int interfaceVersionField;

        private bool interfaceVersionFieldSpecified;

        public System.DateTime fileDate
        {
            get
            {
                return this.fileDateField;
            }
            set
            {
                this.fileDateField = value;
            }
        }

        public string fileId
        {
            get
            {
                return this.fileIdField;
            }
            set
            {
                this.fileIdField = value;
            }
        }

        public string nbrItems
        {
            get
            {
                return this.nbrItemsField;
            }
            set
            {
                this.nbrItemsField = value;
            }
        }

        public string distributorRef
        {
            get
            {
                return this.distributorRefField;
            }
            set
            {
                this.distributorRefField = value;
            }
        }

        public int interfaceVersion
        {
            get
            {
                return this.interfaceVersionField;
            }
            set
            {
                this.interfaceVersionField = value;
            }
        }

        public bool interfaceVersionSpecified
        {
            get
            {
                return this.interfaceVersionFieldSpecified;
            }
            set
            {
                this.interfaceVersionFieldSpecified = value;
            }
        }
    }

    public partial class RetrievalRequestResponse : operationType
    {

        private string retrievalDocumentCodeField;

        private OriginalOperationType originalOperationField;

        /// <remarks/>
        public string retrievalDocumentCode
        {
            get
            {
                return this.retrievalDocumentCodeField;
            }
            set
            {
                this.retrievalDocumentCodeField = value;
            }
        }

        /// <remarks/>
        public OriginalOperationType originalOperation
        {
            get
            {
                return this.originalOperationField;
            }
            set
            {
                this.originalOperationField = value;
            }
        }
    }

}
