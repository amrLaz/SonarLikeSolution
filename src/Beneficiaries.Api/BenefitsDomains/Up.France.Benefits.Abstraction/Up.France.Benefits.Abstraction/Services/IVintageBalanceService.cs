using Gestion.Compte.MoveUp.Responses;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Up.France.Benefits.Abstraction.Services
{
    public interface IVintageBalanceService
    {
        decimal? CalculateVintageBalanceFromVoucherList(List<VoucherList> voucherList);
        bool IsVintagePeriod();
        int? GetVintagePeriodYear();

    }
}
