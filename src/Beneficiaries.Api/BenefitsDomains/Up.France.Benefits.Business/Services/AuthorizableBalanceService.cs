using Gestion.Compte.MoveUp.Responses;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Up.France.Benefits.Abstraction.Services;
using Up.NCore.Messages;

namespace Up.France.Benefits.Business.Services
{
    public class AuthorizableBalanceService : IAuthorizableBalanceService
    {
        public decimal? GetAuthorizableBalanceService(GetBalanceWsResponseDTO BalanceWsResponse, int product)
        {
            //TODO Need to check if this multi account to fetch the authorizable balance for the right account
            int? balance = BalanceWsResponse.requestBeneficiaryAccountDetailsResp.donneesOutput.account[0].accountBalance.amount;
            return GetAuthorizableBalanceFromAmount(balance, product);
        }

        public decimal? GetAuthorizableBalanceFromAmount(int? accountBalanceAmount, int product)
        {
            switch (product)
            {
                case (12)://RepaHyb
                case (11)://Repa4c
                    return 25;
                case (20)://CadHyb
                case (24)://Cad
                    return accountBalanceAmount.HasValue ? accountBalanceAmount.Value / 100m : (decimal?)null;
                default:
                    return null;
            }
        }
    }
}
