using Microsoft.AspNetCore.Mvc;
using Benefits.Api.Models.DTO;
using Benefits.Api.Tools;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Up.France.Benefits.Model.Models.Entites;
using Up.France.Benefits.Business.Queries;
using Up.France.Benefits.Core.Models;
using Up.France.Benefits.Core.Queries;
using Up.France.Benefits.Abstraction.Queries;
using Up.France.Benefits.Model.Model.Entites;
using System.Collections.Generic;

namespace Up.France.Benefits.Api.Controllers
{
    [ApiController]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public class AccountsController : Controller
    {
        private IGetBalanceQuery _getBalanceQuery;
        private IGetOperationQuery _getOperationQuery;


        public AccountsController(
            IGetBalanceQuery getBalanceQuery,
            IGetOperationQuery getOperationQuery
        )
        {
            _getBalanceQuery = getBalanceQuery;
            _getOperationQuery = getOperationQuery;
        }

        /// <summary>
        /// Get Accounts info (Has payment operations or not/balance) for multiple accounts
        /// </summary>
        /// <param name="accountsIds">List of account ids</param>
        /// <returns> Accounts Info</returns>
        [HttpPost("accounts/info")]
        public async Task<IEnumerable<AccountInfos>> Post([FromBody] List<string> accountsIds)
        {

            List<Balance> balances = await _getBalanceQuery.GetBalanceForMultiAccounts(accountsIds);
            List<AccountInfos> accountInfos = await _getOperationQuery.CheckIfAnAccountHasConfirmedPaymentOperations(accountsIds);

            IEnumerable<AccountInfos> joinedData = from balance in balances
                             join info in accountInfos on balance.account equals info.serviceReference
                             select new AccountInfos { serviceReference = info.serviceReference, hasTransaction = info.hasTransaction, amount = balance.account_balance  };

            return joinedData;


            //foreach (var accountId in accountsIds)
            //{
            //    AccountsInfo accountInfo = await _getAccountsInfoQuery.GetAcountInfo(accountId);
            //    accountsInfo.Add(accountInfo);
            //}
            //return accountsInfo;
        }
    }
}
