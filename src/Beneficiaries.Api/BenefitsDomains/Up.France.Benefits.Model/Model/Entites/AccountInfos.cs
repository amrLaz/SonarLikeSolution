using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Up.France.Benefits.Model.Models.Entites;

namespace Up.France.Benefits.Model.Model.Entites
{
    public class AccountInfos
    {
        public string serviceReference {  get; set; } = null!;
        public bool? hasTransaction { get; set; }
        public decimal? amount { get; set; }
    }
}
