using Gestion.Compte.MoveUp.Responses;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Up.France.Benefits.Abstraction.Services;

namespace Up.France.Benefits.Business.Helpers
{
    public class CashBackCalculator : ICashBackCalculator
    {

        public decimal? CalculateCashBackAmountFromVoucherList(List<VoucherList> voucherList)
        {
            decimal? soldCashBack = 0;
            
            foreach (var voucher in voucherList)
            {
                bool contains = voucher.voucherReason != null ? voucher.voucherReason.Contains("CAGNO") : false;

                if (contains && voucher.status == "ACTIVE")
                {
                    soldCashBack += voucher.remainingAmount.amount / 100;
                }
            }

            return soldCashBack;

        }
    }
}
