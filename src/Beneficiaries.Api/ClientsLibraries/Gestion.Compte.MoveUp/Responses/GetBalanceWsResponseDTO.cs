using Newtonsoft.Json.Linq;
using Newtonsoft.Json;
using Up.France.Benefits.Model.Model.Entites;
namespace Gestion.Compte.MoveUp.Responses
{
    public class Error
    {
        public string code { get; set; } = null!;
        public string message { get; set; } = null!;
        public string type { get; set; } = null!;
        public string gravity { get; set; } = null!;
    }

    public class EnteteTechnique
    {
        public bool blockingError { get; set; }
        public Error error { get; set; } = null!;
    }

    public class Card
    {
        public string? cardId { get; set; }
        public string? expiryDate { get; set; }
        public string? pan { get; set; }
        public string? psn { get; set; }
    }

    public class CardList
    {
        public string? cardId { get; set; }
        public string? expiryDate { get; set; }
        public string? pan { get; set; }
        public string? psn { get; set; }
    }

    public class Amount
    {
        public decimal? amount { get; set; }
        public string? currency { get; set; }
        public string? exponent { get; set; }
    }

    public class VoucherList
    {
        public DateTime? beginDate { get; set; }
        public string? cancelledDate { get; set; }
        public string? creationDate { get; set; }
        public DateTime? endDate { get; set; }
        public string? externalReference { get; set; }
        public string? oriExternalReference { get; set; }
        public Amount? originalAmount { get; set; }
        public Amount? remainingAmount { get; set; }
        public string? status { get; set; }
        public string? statusReason { get; set; }
        public string? unloadDate { get; set; }
        public string? voucherReason { get; set; }
    }

    public class AccountBalance2
    {
        public string? amount { get; set; }
        public string? currency { get; set; }
        public string? exponent { get; set; }
    }

    public class AccountAvailableExceptionList
    {
        public Amount? amount { get; set; }
        public string? cardId { get; set; }
    }

    public class AccountAvailable
    {
        public int? amount { get; set; }
        public string? currency { get; set; }
        public string? exponent { get; set; }
    }

    public class AccountAvailableList
    {
        public Amount? amount { get; set; }
        public string? cardId { get; set; }

    }

    public class AccountBalance
    {
        public int? amount { get; set; }
        public string? currency { get; set; }
        public string? exponent { get; set; }
    }

    public class Account
    {
        public string? accountCategory { get; set; }
        public string? timeZone { get; set; }
        public AccountBalance? accountBalance { get; set; }

        [JsonConverter(typeof(VoucherListConverter))]
        public List<VoucherList>? voucherList { get; set; }
        public List<AccountAvailableExceptionList>? accountAvailableExceptionList { get; set; }
        public List<AccountAvailableList>? accountAvailableList { get; set; }
        public AccountAvailable? accountAvailable { get; set; }
    }

    public class DonneesOutput
    {
        public string? interfaceVersion { get; set; }
        public string? distributorRef { get; set; }
        public string? funderContractRef { get; set; }
        public Card? card { get; set; }
        public List<CardList>? cardList { get; set; }
        public AccountBalance2? accountBalance { get; set; }
        public VoucherList? voucherList { get; set; }
        public string? beneficiaryServiceRef { get; set; }
        public List<Account>? account { get; set; }
        public string? timeZone { get; set; }
    }

    public class RequestBeneficiaryAccountDetailsResp
    {
        public EnteteTechnique? enteteTechnique { get; set; }
        public DonneesOutput? donneesOutput { get; set; }
    }

    public class GetBalanceWsResponseDTO
    {
        public RequestBeneficiaryAccountDetailsResp? requestBeneficiaryAccountDetailsResp { get; set; }
    }

    public class VoucherListConverter : JsonConverter
    {
        public override bool CanConvert(Type objectType)
        {
            return objectType == typeof(List<VoucherList>);
        }

        public override object? ReadJson(JsonReader reader, Type objectType, object? existingValue, JsonSerializer serializer)
        {
            JToken token = JToken.Load(reader);

            if (token.Type == JTokenType.Array)
            {
                return token.ToObject<List<VoucherList>>();
            }
            else if (token.Type == JTokenType.Object)
            {
                var singleVoucher = token.ToObject<VoucherList>();
                return singleVoucher != null ? new List<VoucherList> { singleVoucher } : null;
            }

            throw new JsonSerializationException("Unexpected token type for voucherList");
        }

        public override void WriteJson(JsonWriter writer, object? value, JsonSerializer serializer)
        {
            var list = value as List<VoucherList>;
            if (list != null && list.Count == 1)
            {
                serializer.Serialize(writer, list[0]);
            }
            else
            {
                serializer.Serialize(writer, list);
            }
        }
    }
}
