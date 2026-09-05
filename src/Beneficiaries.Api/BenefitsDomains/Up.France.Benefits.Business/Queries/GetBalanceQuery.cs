using Up.France.Benefits.Core.Queries;
using Up.France.Benefits.Abstraction.Repositories;
using Gestion.Compte.MoveUp.Responses;
using Up.France.Benefits.Abstraction.Queries;
using Up.France.Benefits.Model.Model.Entites;
using Up.France.Benefits.Abstraction.Services;
using Up.France.Benefits.Abstraction.Factories;

namespace Up.France.Benefits.Business.Queries
{
    public class GetBalanceQuery : IGetBalanceQuery
    {
        private IBalanceRepository _balanceRepository;
        private ICashBackCalculator _cashBackCalculator;
        private IAuthorizableBalanceService _authorizableBalanceService;
        private IProductBalanceServiceFactory _productBalanceServiceFactory;


        public GetBalanceQuery(
            IBalanceRepository balanceRepository,
            ICashBackCalculator cashBackCalculator,
            IAuthorizableBalanceService authorizableBalanceService,
            IProductBalanceServiceFactory productBalanceServiceFactory

        )
        {
            _balanceRepository = balanceRepository;
            _cashBackCalculator = cashBackCalculator;
            _authorizableBalanceService = authorizableBalanceService;
            _productBalanceServiceFactory = productBalanceServiceFactory;
        }
        public async Task<Model.Model.Entites.AccountBalance> GetOperationsByAccountAndProduct(AccountBalanceQuery accountBalanceQuery)
        {
            IProductsBalanceService productService = _productBalanceServiceFactory.GetService(accountBalanceQuery.product);
            return await productService.getBalance(accountBalanceQuery);


            //GetBalanceWsResponseDTO getBalanceWsResponseDTO = await _balanceRepository.GetBalanceByAcountAndProduct(accountBalanceQuery);
            //Model.Model.Entites.AccountBalance accountBalance = new Model.Model.Entites.AccountBalance();
            //List<VoucherList> voucherList = getBalanceWsResponseDTO.requestBeneficiaryAccountDetailsResp.donneesOutput.account.voucherList;
            //var soldCashBack = voucherList != null ?_cashBackCalculator.CalculateCashBackAmountFromVoucherList(voucherList) : 0;
            //accountBalance.balance = (getBalanceWsResponseDTO.requestBeneficiaryAccountDetailsResp.donneesOutput.account.accountBalance.amount / 100) - soldCashBack;
            //accountBalance.authorizableBalance = _authorizableBalanceService.GetAuthorizableBalanceService(getBalanceWsResponseDTO, accountBalanceQuery.product);
            //accountBalance.beneficiaryServiceRef = getBalanceWsResponseDTO.requestBeneficiaryAccountDetailsResp.donneesOutput.beneficiaryServiceRef;
            //accountBalance.availableBalance = getBalanceWsResponseDTO.requestBeneficiaryAccountDetailsResp.donneesOutput.account.accountAvailableList.amount.amount/100;
            //return accountBalance;

        }

        public async Task<List<Balance>> GetBalanceForMultiAccounts(List<string> accountsIds)
        {
            return await _balanceRepository.GetBalanceDevOpsForMultiAccounts(accountsIds);
        }
    }
}
