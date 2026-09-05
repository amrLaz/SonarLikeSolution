using Gestion.Compte.MoveUp.Requests;
using Gestion.Compte.MoveUp.Responses;
using System.Threading;
using System.Threading.Tasks;
namespace Gestion.Compte.MoveUp
{
    public interface IGestionCompteMoveUpClient
    {
        Task<GetBalanceWsResponseDTO> BeneficiaryAccountDetails(GetBalanceWsReuestDTO getBalanceReuest);
        //Task<SuspendAccountClientResult> EnableAccountAsync(SuspendAccountArgs args, CancellationToken cancellationToken = default);
        //Task<SuspendAccountClientResult> DisableAccountAsync(SuspendAccountArgs args, CancellationToken cancellationToken = default);
        //Task<AccountClientResult> CloseAccountAsync(CloseAccountArgs args, CancellationToken cancellationToken = default);
        //Task<CumulativeAmountResult> GetUserCumulativeAmountAsync(string beneficiaryRef, CancellationToken cancellationToken = default);
        //Task<AccountDetailResult> GetAccountAsync(GetAccountArgs args, CancellationToken cancellationToken = default);

    }
}
