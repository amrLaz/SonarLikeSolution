using Gestion.Compte.MoveUp;
using Gestion.Compte.MoveUp.Factories;
using Gestion.Compte.MoveUp.Responses;
using Up.France.Benefits.Abstraction.Repositories;
using Up.France.Benefits.Core.Queries;
using Up.France.Benefits.Cosmos.SDK.Interfaces;
using Microsoft.Azure.Cosmos;
using Up.France.Benefits.Model.Model.Entites;
using Microsoft.Azure.Cosmos.Linq;
using Gestion.Compte.MoveUp.Abstract;

namespace Up.France.Benefits.Data.Repositories
{
    public class BalanceRepository : IBalanceRepository
    {
        private IGestionCompteMoveUpClient _gestionCompteMoveUpClient;
        private IBeneficiaryAccountDetailsRequestFactory _beneficiaryAccountDetailsRequestFactory;
        private readonly Container _balancesContainer;


        public BalanceRepository(
            IGestionCompteMoveUpClient gestionCompteMoveUpClient,
            IBeneficiaryAccountDetailsRequestFactory beneficiaryAccountDetailsRequestFactory,
            ICosmosDbContainerFactory cosmosDbContainerFactory
         )
        {
            _gestionCompteMoveUpClient = gestionCompteMoveUpClient;
            _beneficiaryAccountDetailsRequestFactory = beneficiaryAccountDetailsRequestFactory;
            _balancesContainer = cosmosDbContainerFactory.GetContainer("Balances")._container;
        }


        public async Task<GetBalanceWsResponseDTO> GetBalanceByAcountAndProduct(AccountBalanceQuery accountBalanceQuery)
        {

            var beneficiaryAccountDetailsRequest = _beneficiaryAccountDetailsRequestFactory.CreateBeneficiaryAccountDetailsRequest(
                accountBalanceQuery.accountId,
                accountBalanceQuery.product
              );

            return await _gestionCompteMoveUpClient.BeneficiaryAccountDetails(beneficiaryAccountDetailsRequest);
        }

        public async Task<decimal?> GetBalanceDevOps(string accountId)
        {
            IQueryable<Balance> query = null;
            Balance balance = null;

            query = _balancesContainer.GetItemLinqQueryable<Balance>(allowSynchronousQueryExecution:true).Where(d => d.account == accountId);

            FeedIterator<Balance> feedIterator = query.ToFeedIterator();
            while (feedIterator.HasMoreResults)
            {
                var response = await feedIterator.ReadNextAsync();
                balance = response.FirstOrDefault();
            }

            return balance.account_balance;
        }

        public async Task<List<Balance>> GetBalanceDevOpsForMultiAccounts(List<string> accountsIds)
        {
            IQueryable<Balance> query = null;
            List<Balance> balances = new List<Balance>();

            query = _balancesContainer.GetItemLinqQueryable<Balance>(allowSynchronousQueryExecution: true)
                .Where(d => accountsIds.Contains(d.account));

            FeedIterator<Balance> feedIterator = query.ToFeedIterator();
            while (feedIterator.HasMoreResults)
            {
                var response = await feedIterator.ReadNextAsync();
                balances.AddRange(response);
            }

            List<string> fetchedBalances = balances.Select(balance => balance.account).ToList();
            foreach (var accountId in accountsIds)
            {
                if (!fetchedBalances.Contains(accountId))
                {
                    balances.Add(new Balance { account = accountId, account_balance = null });
                }
            }


            return balances;
        }
    }
}
