using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Up.France.Benefits.Model.Models.Entites;

namespace Up.France.Benefits.Model.Model.Entites
{
    public class AccountBalance
    {
        public string beneficiaryServiceRef {  get; set; } = null!;
        public decimal? balance { get; set; }
        public decimal? availableBalance { get; set; }
        public decimal? cashbackAmount { get; set; }
        public decimal? authorizableBalance { get; set; } = 25;
        public VintagePeriodBalance? VintagePeriodBalance { get; set; }
        public Dictionary<string, CategoryBalance>? categories { get; set; }

    }

    public class VintagePeriodBalance
    {
        public decimal? balance { get; set; }
        public int? year { get; set; }
    }

    public class CategoryBalance
    {
        public decimal? balance { get; set; }
        public decimal? availableBalance { get; set; }
        public decimal? cashbackAmount { get; set; }
        public decimal? authorizableBalance { get; set; }
        public VintagePeriodBalance? VintagePeriodBalance { get; set; }
    }
}
