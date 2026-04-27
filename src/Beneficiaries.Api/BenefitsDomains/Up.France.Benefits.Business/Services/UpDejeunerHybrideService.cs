using Gestion.Compte.MoveUp.Responses;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Up.France.Benefits.Abstraction.Repositories;
using Up.France.Benefits.Abstraction.Services;
using Up.France.Benefits.Business.Helpers;
using Up.France.Benefits.Core.Queries;

namespace Up.France.Benefits.Business.Services
{
    public class UpDejeunerHybrideService : IProductsBalanceService
    {
        private IBalanceRepository _balanceRepository;
        private ICashBackCalculator _cashBackCalculator;
        private IAuthorizableBalanceService _authorizableBalanceService;
        private IVintageBalanceService _vintageYearService;


        public UpDejeunerHybrideService(
            IBalanceRepository balanceRepository,
            ICashBackCalculator cashBackCalculator,
            IAuthorizableBalanceService authorizableBalanceService,
            IVintageBalanceService vintageYearService

        )
        {
            _balanceRepository = balanceRepository;
            _cashBackCalculator = cashBackCalculator;
            _authorizableBalanceService = authorizableBalanceService;
            _vintageYearService = vintageYearService;

        }

        public async Task<Model.Model.Entites.AccountBalance> getBalance(AccountBalanceQuery accountBalanceQuery)
        {
            GetBalanceWsResponseDTO getBalanceWsResponseDTO = await _balanceRepository.GetBalanceByAcountAndProduct(accountBalanceQuery);
            var accountBalance = new Model.Model.Entites.AccountBalance
            {
                beneficiaryServiceRef = getBalanceWsResponseDTO.requestBeneficiaryAccountDetailsResp.donneesOutput.beneficiaryServiceRef
            };

            var accounts = MultiAccountBalanceHelpers.GetAccounts(getBalanceWsResponseDTO);
            var filteredAccounts = MultiAccountBalanceHelpers.FilterAccountsByCategories(accounts, accountBalanceQuery.categories);

            if (MultiAccountBalanceHelpers.HasCategoryFilter(accountBalanceQuery.categories) && filteredAccounts.Count > 0)
            {
                var categories = new Dictionary<string, Model.Model.Entites.CategoryBalance>(StringComparer.OrdinalIgnoreCase);
                foreach (var account in filteredAccounts)
                {
                    if (string.IsNullOrWhiteSpace(account.accountCategory))
                    {
                        continue;
                    }

                    categories[account.accountCategory] = MultiAccountBalanceHelpers.BuildCategoryBalance(
                        account,
                        accountBalanceQuery.product,
                        _authorizableBalanceService,
                        _cashBackCalculator,
                        _vintageYearService,
                        includeCashback: true,
                        includeVintage: true
                    );
                }

                accountBalance.categories = categories;
                accountBalance.balance = MultiAccountBalanceHelpers.SumNullable(categories.Values.Select(category => category.balance));
                accountBalance.availableBalance = MultiAccountBalanceHelpers.SumNullable(categories.Values.Select(category => category.availableBalance));
                accountBalance.authorizableBalance = MultiAccountBalanceHelpers.SumNullable(categories.Values.Select(category => category.authorizableBalance));
                accountBalance.cashbackAmount = MultiAccountBalanceHelpers.SumNullable(categories.Values.Select(category => category.cashbackAmount));
                var vintageBalance = MultiAccountBalanceHelpers.SumNullable(
                    categories.Values.Select(category => category.VintagePeriodBalance?.balance)
                );
                if (vintageBalance.HasValue)
                {
                    accountBalance.VintagePeriodBalance = new Model.Model.Entites.VintagePeriodBalance
                    {
                        balance = vintageBalance,
                        year = _vintageYearService.GetVintagePeriodYear()
                    };
                }
                return accountBalance;
            }

            var selectedAccount = filteredAccounts.FirstOrDefault();
            if (selectedAccount == null)
            {
                accountBalance.balance = 0;
                accountBalance.availableBalance = 0;
                accountBalance.authorizableBalance = _authorizableBalanceService.GetAuthorizableBalanceFromAmount(null, accountBalanceQuery.product);
                accountBalance.cashbackAmount = 0;
                return accountBalance;
            }

            var singleBalance = MultiAccountBalanceHelpers.BuildCategoryBalance(
                selectedAccount,
                accountBalanceQuery.product,
                _authorizableBalanceService,
                _cashBackCalculator,
                _vintageYearService,
                includeCashback: true,
                includeVintage: true
            );

            accountBalance.balance = singleBalance.balance;
            accountBalance.availableBalance = singleBalance.availableBalance;
            accountBalance.authorizableBalance = singleBalance.authorizableBalance;
            accountBalance.cashbackAmount = singleBalance.cashbackAmount;
            accountBalance.VintagePeriodBalance = singleBalance.VintagePeriodBalance;
            return accountBalance;

        }
    }
}
