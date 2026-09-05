
namespace Up.France.Benefits.Model.Models.Entites
{
    public class Event
    {
        public int? sequence { get; set; }
        public string? processor { get; set; }
        public string? issuer_ref { get; set; }
        public string? product_ref { get; set; }
        public string? source { get; set; }
        public string? event_reference { get; set; }
        public string? operation_id { get; set; }
        public string? direction { get; set; }
        public string? event_date { get; set; }
        public DateTime? event_date_iso { get; set; }
        public string? event_processing_date { get; set; }
        public string? event_type { get; set; }
        public string? event_status { get; set; }
        public double? event_amount { get; set; }
        public string? currency_iso_code { get; set; }
        public string? currency { get; set; }
        public string? account_impact_flag { get; set; }
        public double? impact_amount { get; set; }
        public string? impact_currency_iso_code { get; set; }
        public string? impact_currency { get; set; }
        public string? response_code { get; set; }
        public string? response_message { get; set; }
        public string? additional_info { get; set; }
        public string? settlement_date { get; set; }
        public double? settlement_amount { get; set; }
        public string? settlement_currency_iso_code { get; set; }
        public string? settlement_currency { get; set; }
        public string? acquirer_reference_number { get; set; }
        public string? merchant_name { get; set; }
        public string? merchant_id { get; set; }
        public string? acquirer_id { get; set; }
        public string? terminal_id { get; set; }
        public string? country_code { get; set; }
        public string? country { get; set; }
        public string? zip_code { get; set; }
        public string? city { get; set; }
        public string? pan_entry_mode { get; set; }
        public string? d_secure_flag { get; set; }
        public string? terminal_attendance { get; set; }
        public string? card_holder_presence { get; set; }
        public string? card_presence { get; set; }
        public List<VoucherImpact> voucher_impacts { get; set; } = null!;
    }
}
