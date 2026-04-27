using Newtonsoft.Json;

namespace Up.France.Benefits.Notifications.Functions
{
    public class AccountResponse
    {
        [JsonProperty("BeneficiaryInformation")]
        public BeneficiaryInformation BeneficiaryInformation { get; set; }
    }

    public class BeneficiaryInformation
    {
        [JsonProperty("uuid_user")]
        public string UuidUser { get; set; }

        [JsonProperty("title")]
        public string Title { get; set; }

        [JsonProperty("gender")]
        public string Gender { get; set; }

        [JsonProperty("nationality")]
        public string Nationality { get; set; }

        [JsonProperty("first_name")]
        public string FirstName { get; set; }

        [JsonProperty("last_name")]
        public string LastName { get; set; }

        [JsonProperty("full_name")]
        public string FullName { get; set; }

        [JsonProperty("email")]
        public string Email { get; set; }

        [JsonProperty("card_detail")]
        public CardDetail CardDetail { get; set; }
    }

    public class CardDetail
    {
        [JsonProperty("issue_number_id")]
        public string IssueNumberId { get; set; }

        [JsonProperty("pan_truncated")]
        public string PanTruncated { get; set; }

        [JsonProperty("expiry_date")]
        public string ExpiryDate { get; set; }
    }
}
