using System;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;

namespace Up.France.Benefits.Notifications.Functions
{
    public interface IBeneficiaryServiceClient
    {
        Task<AccountResponse> GetAccountInformationAsync(string cardId);
        Task<AccountResponse> GetAccountInformationByBeneficiaryRefAsync(string beneficiaryRef);
    }
}
