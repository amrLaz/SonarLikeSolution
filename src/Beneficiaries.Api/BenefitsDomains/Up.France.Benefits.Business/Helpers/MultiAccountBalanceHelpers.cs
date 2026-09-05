using System;
using System.Collections.Generic;
using System.Linq;
using Gestion.Compte.MoveUp.Responses;
using Up.France.Benefits.Abstraction.Services;
using Up.France.Benefits.Model.Model.Entites;

namespace Up.France.Benefits.Business.Helpers
{
    public class MultiAccountBalanceHelpers
    {
        public static List<Account> GetAccounts(GetBalanceWsResponseDTO response)
        {
            return response?.requestBeneficiaryAccountDetailsResp?.donneesOutput?.account ?? new List<Account>();
        }

        public static List<Account> FilterAccountsByCategories(List<Account> accounts, List<string>? categories)
        {
            if (categories == null || categories.Count == 0)
            {
                return accounts;
            }

            var categorySet = new HashSet<string>(
                categories.Where(category => !string.IsNullOrWhiteSpace(category)),
                StringComparer.OrdinalIgnoreCase
            );

            return accounts
                .Where(account => !string.IsNullOrWhiteSpace(account.accountCategory) && categorySet.Contains(account.accountCategory!))
                .ToList();
        }

        public static bool HasCategoryFilter(List<string>? categories)
        {
            return categories != null && categories.Any(category => !string.IsNullOrWhiteSpace(category));
        }

        public static bool IsMultiCategory(List<Account> accounts)
        {
            return accounts.Count > 1;
        }

        public static CategoryBalance BuildCategoryBalance(
            Account account,
            int product,
            IAuthorizableBalanceService authorizableBalanceService,
            ICashBackCalculator? cashBackCalculator = null,
            IVintageBalanceService? vintageBalanceService = null,
            bool includeCashback = false,
            bool includeVintage = false)
        {
            var balanceAmount = account.accountBalance?.amount;
            var availableAmount = account.accountAvailableList?.FirstOrDefault()?.amount?.amount;
            var voucherList = account.voucherList ?? new List<VoucherList>();

            var categoryBalance = new CategoryBalance
            {
                balance = balanceAmount.HasValue ? balanceAmount.Value / 100m : (decimal?)null,
                availableBalance = availableAmount.HasValue ? availableAmount.Value / 100m : (decimal?)null,
                authorizableBalance = authorizableBalanceService.GetAuthorizableBalanceFromAmount(balanceAmount, product)
            };

            if (includeCashback && cashBackCalculator != null)
            {
                categoryBalance.cashbackAmount = cashBackCalculator.CalculateCashBackAmountFromVoucherList(voucherList);
            }

            if (includeVintage && vintageBalanceService != null && vintageBalanceService.IsVintagePeriod())
            {
                var vintageBalance = vintageBalanceService.CalculateVintageBalanceFromVoucherList(voucherList);
                categoryBalance.VintagePeriodBalance = new VintagePeriodBalance
                {
                    balance = vintageBalance,
                    year = vintageBalanceService.GetVintagePeriodYear()
                };
            }

            return categoryBalance;
        }

        public static decimal? SumNullable(IEnumerable<decimal?> values)
        {
            decimal total = 0;
            var hasValue = false;
            foreach (var value in values)
            {
                if (value.HasValue)
                {
                    total += value.Value;
                    hasValue = true;
                }
            }

            return hasValue ? total : (decimal?)null;
        }
    }
}
