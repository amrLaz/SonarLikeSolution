using Gestion.Compte.MoveUp.Responses;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Up.France.Benefits.Core.Queries;

namespace Up.France.Benefits.Abstraction.Services
{
    public interface ICashBackCalculator
    {
        decimal? CalculateCashBackAmountFromVoucherList(List<VoucherList> voucherList);

    }
}
