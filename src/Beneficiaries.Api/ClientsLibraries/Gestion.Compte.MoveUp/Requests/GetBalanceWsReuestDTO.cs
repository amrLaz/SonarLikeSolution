using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Gestion.Compte.MoveUp.Requests
{    public class EnteteTechnique
    {
        public required string userId { get; set; }
        public required string applicationId { get; set; }
    }

    public class DonneesInput
    {
        public int interfaceVersion { get; set; } = 5;
        public required string distributorRef { get; set; }
        public required string beneficiaryServiceRef { get; set; }
        public bool voucherListFlag { get; set; }
    }

    public class RequestBeneficiaryAccountDetailsReq
    {
        public required EnteteTechnique enteteTechnique { get; set; }
        public required DonneesInput donneesInput { get; set; }
    }

    public class GetBalanceWsReuestDTO
    {
        public required RequestBeneficiaryAccountDetailsReq requestBeneficiaryAccountDetailsReq { get; set; }
    }
}
