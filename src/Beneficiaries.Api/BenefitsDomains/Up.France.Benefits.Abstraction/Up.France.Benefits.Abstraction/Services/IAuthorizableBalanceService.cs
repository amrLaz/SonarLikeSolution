using Gestion.Compte.MoveUp.Responses;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Up.France.Benefits.Core.Queries;

namespace Up.France.Benefits.Abstraction.Services
{
    public interface IAuthorizableBalanceService
    {
        public decimal? GetAuthorizableBalanceService(GetBalanceWsResponseDTO BalanceWsResponse, int product);
        public decimal? GetAuthorizableBalanceFromAmount(int? accountBalanceAmount, int product);

    }
}
