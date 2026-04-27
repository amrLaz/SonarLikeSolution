using Gestion.Compte.MoveUp;
using Microsoft.AspNetCore.Mvc;
using Up.France.Benefits.Core.Queries;
using Up.France.Benefits.Business.Queries;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Up.France.Benefits.Abstraction.Queries;
using Microsoft.ApplicationInsights;
using Microsoft.ApplicationInsights.Channel;
using Microsoft.Identity.Client;
//using static System.Runtime.InteropServices.JavaScript.JSType;

namespace Up.France.Benefits.Api.Controllers
{
    [ApiController]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]

    public class BalancesController : Controller
    {
        private IGetBalanceQuery _getBalanceQuery;
        private readonly TelemetryClient _telemetry;


        public BalancesController(IGetBalanceQuery getBalanceQuery, TelemetryClient telemetry)
        {
            _getBalanceQuery = getBalanceQuery;
            _telemetry = telemetry;

        }

        [HttpPost("accounts/balance")]
        public async Task<List<Dictionary<string, object>>> Post(List<AccountBalanceQuery> accountsBalanceQuery)
        {
            List<Dictionary<string, object>> accountsBalance = new List<Dictionary<string, object>> { };
            foreach (AccountBalanceQuery accountBalanceQuery in accountsBalanceQuery)
            {
                Model.Model.Entites.AccountBalance accountBalance = await _getBalanceQuery.GetOperationsByAccountAndProduct(accountBalanceQuery);

                var balanceInfo = new Dictionary<string, object>
                {
                            {"balance" , String.Format("{0:F2}", accountBalance.balance ?? 0m)},
                            {"authorizableBalance" , String.Format("{0:F2}", accountBalance.authorizableBalance ?? 0m)},
                            {"availableBalance" , String.Format("{0:F2}", accountBalance.availableBalance ?? 0m)}
                };

                // Conditionally add cashback_amount if it has a value
                if (accountBalance.cashbackAmount.HasValue)
                {
                    balanceInfo.Add("cashbackAmount", string.Format("{0:F2}", accountBalance.cashbackAmount.Value));
                }

                if (accountBalance.VintagePeriodBalance != null)
                {
                    balanceInfo.Add("vintagePeriodBalance", new Dictionary<string, object>
                    {
                        {"balance", String.Format("{0:F2}", accountBalance.VintagePeriodBalance.balance)},
                        {"year", accountBalance.VintagePeriodBalance.year.ToString()} 
                    });
                }

                if (accountBalance.categories != null && accountBalance.categories.Count > 0)
                {
                    var categoriesInfo = new Dictionary<string, object>();
                    foreach (var category in accountBalance.categories)
                    {
                        var categoryInfo = new Dictionary<string, object>
                        {
                            {"balance" , String.Format("{0:F2}", category.Value.balance ?? 0m)},
                            {"authorizableBalance" , String.Format("{0:F2}", category.Value.authorizableBalance ?? 0m)},
                            {"availableBalance" , String.Format("{0:F2}", category.Value.availableBalance ?? 0m)}
                        };

                        if (category.Value.cashbackAmount.HasValue)
                        {
                            categoryInfo.Add("cashbackAmount", string.Format("{0:F2}", category.Value.cashbackAmount.Value));
                        }

                        if (category.Value.VintagePeriodBalance != null)
                        {
                            categoryInfo.Add("vintagePeriodBalance", new Dictionary<string, object>
                            {
                                {"balance", String.Format("{0:F2}", category.Value.VintagePeriodBalance.balance ?? 0m)},
                                {"year", category.Value.VintagePeriodBalance.year.ToString()}
                            });
                        }

                        categoriesInfo.Add(category.Key, categoryInfo);
                    }

                    balanceInfo.Add("categories", categoriesInfo);
                }

                accountsBalance.Add(new Dictionary<string, object>
                {
                    {accountBalance.beneficiaryServiceRef, balanceInfo }
                });

                if (!string.IsNullOrEmpty(accountBalanceQuery.accountId))
                {
                    // Log each accountId as a custom property
                    _telemetry.TrackEvent("AccountIdCaptured", new Dictionary<string, string>
                    {
                    { "AccountId", accountBalanceQuery.accountId }
                });
                }
            }

            return accountsBalance;
        }

    }
}
