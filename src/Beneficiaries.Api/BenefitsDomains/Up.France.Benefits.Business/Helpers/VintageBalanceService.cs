using Gestion.Compte.MoveUp.Responses;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.JsonPatch.Internal;
using Microsoft.IdentityModel.Tokens;
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Up.France.Benefits.Abstraction.Services;

namespace Up.France.Benefits.Business.Helpers
{
    public class VintageBalanceService : IVintageBalanceService
    {

        public decimal? CalculateVintageBalanceFromVoucherList(List<VoucherList> voucherList)
        {

            var period = GetVintagePeriodDatesToOverwriteDefaultConfig();
            DateTime beginDate = period?.beginDate ?? new DateTime(DateTime.Now.Year - 2, 12, 1);
            DateTime endDate = period?.endDate ?? new DateTime(DateTime.Now.Year, 3, 1);

            var amount = voucherList
                .Where(item => {
                    if (item == null || item.beginDate == null || item.endDate == null)
                    {
                        return false;
                    }

                    return item.beginDate >= beginDate &&
                     item.endDate < endDate &&
                     item.status == "ACTIVE";
                })
                .Sum(item => item.remainingAmount.amount);

            amount = amount / 100;
            return amount;

        }

        public bool IsVintagePeriod()
        {
            var period = Environment.GetEnvironmentVariable("VINTAGE_PERIOD_BALANCE_DISPLAY_DATES");
            if (string.IsNullOrEmpty(period))
            {
                return false;
            }

            string[] dates = period.Split(',');

            // Parse first date (MM-DD)
            string[] startParts = dates[0].Split('-');
            int startMonth = int.Parse(startParts[1]);
            int startDay = int.Parse(startParts[2]);

            // Parse second date (MM-DD)
            string[] endParts = dates[1].Split('-');
            int endMonth = int.Parse(endParts[1]);
            int endDay = int.Parse(endParts[2]);


            DateTime today = DateTime.Today;
            DateTime start = new DateTime(DateTime.Now.Year, startMonth, startDay);
            DateTime end = new DateTime(DateTime.Now.Year, endMonth, endDay);
            return today >= start && today < end;
        }

        public (DateTime beginDate, DateTime endDate)? GetVintagePeriodDatesToOverwriteDefaultConfig()
        {
            var p = Environment.GetEnvironmentVariable("VINTAGE_PERIOD_VOUCHERS_SEARCH_DATES");
            if (string.IsNullOrEmpty(p) || !p.Contains(","))
            {
                return null;
            }

            var dates = p.Split(',');
            if (dates.Length == 2 &&
                DateTime.TryParseExact(dates[0], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedBegin) &&
                DateTime.TryParseExact(dates[1], "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsedEnd))
            {
                return (parsedBegin, parsedEnd);
            }

            return null;
        }

        public int? GetVintagePeriodYear()
        {
            var period = GetVintagePeriodDatesToOverwriteDefaultConfig();
            if (period.HasValue)
            {
                return period?.beginDate.Year;
            }
            return DateTime.Now.Year - 1;
           
        }


    }
}
