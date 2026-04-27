using Gestion.Compte.MoveUp.Requests;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Gestion.Compte.MoveUp.Abstract
{
    public interface IBeneficiaryAccountDetailsRequestFactory
    {
        GetBalanceWsReuestDTO CreateBeneficiaryAccountDetailsRequest(string accountId, int product);
    }
}
