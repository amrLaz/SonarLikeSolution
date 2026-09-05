namespace Up.France.Benefits.Model.Models.Entites
{
    using System;
    using System.Collections.Generic;
    using System.Diagnostics.Tracing;
    using System.Security.Principal;
    using System.Text.Json.Serialization;

    public class Operation
    {
        public string? processor { get; set; }
        public string? issuer_ref { get; set; }
        public string? product_ref { get; set; }
        public DateTime operation_date { get; set; }
        public string? operation_type { get; set; }
        public string? operation_status { get; set; }
        public string? operation_message { get; set; }
        public decimal? original_amount { get; set; }
        public decimal? actual_amount { get; set; }
        public string? currency_iso_code { get; set; }
        public string? currency { get; set; }
        public string? operation_reference { get; set; }
        public string account {  get; set; } = null!;
        public string? response_code { get; set; }
        public string? response_message { get; set; }
        public string? card_scheme_code { get; set; }
        public string? pan { get; set; }
        public string? card_id { get; set; }
        public string? acceptation_channel { get; set; }
        public string? payment_method { get; set; }
        public string? operation_nature { get; set; }
        public bool? xpay_flag { get; set; }
        public int? wallet_id { get; set; } = null;
        public string? merchant_name { get; set; }
        public string? merchant_category_code { get; set; }
        public string? merchant_id { get; set; }
        public string? country_code { get; set; }
        public string? country { get; set; }
        public string? zip_code { get; set; }
        public string? city { get; set; }
        public bool? supplement_amount_flag { get; set; }
        public decimal? supplement_amount { get; set; }
        public decimal? actual_supplement_amount { get; set; }
        public decimal? base_amount { get; set; }
        public decimal? actual_base_amount { get; set; }
        public List<VoucherImpact>? voucher_impacts { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public List<Event>? events { get; set; }
    }
}
