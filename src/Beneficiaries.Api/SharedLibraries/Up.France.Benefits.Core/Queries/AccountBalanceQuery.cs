using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Up.France.Benefits.Core.Queries
{
    public class AccountBalanceQuery
    {
        public string accountId { get; set; }
        public int product {  get; set; }
        public List<string>? categories { get; set; }
    }
}
