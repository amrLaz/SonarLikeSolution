using Up.France.Benefits.Abstraction.Queries;
using Up.France.Benefits.Abstraction.Repositories;
using Up.France.Benefits.Core.Models;
using Up.France.Benefits.Core.Queries;
using Up.France.Benefits.Model.Model.Entites;
using Up.France.Benefits.Model.Models.Entites;

namespace Up.France.Benefits.Business.Queries
{

    public sealed class GetOperationQuery : IGetOperationQuery
    {
        private IOperationRepository _operationRepositry;

        public GetOperationQuery(IOperationRepository operationRepository)
        {
            _operationRepositry = operationRepository;
        }

        public async Task<(List<Operation>, string, int)> GetOperationsByAccount(string accountsId,
            PaginationParameters paginationParameters,
            OperationsFilters operationsFilters)
        {
            return await _operationRepositry.GetOperationsByAccount(accountsId, paginationParameters, operationsFilters);
        }

        public async Task<(List<Operation>, int, int)> GetOperationsByAccountClassicPagination(string accountsId,
        PaginationParameters paginationParameters,
        OperationsFilters operationsFilters)
        {
            return await _operationRepositry.GetOperationsByAccountClassicPagination(accountsId, paginationParameters, operationsFilters);
        }


        public async Task<(List<Operation>, string, int)> GetOperationsByMultiAccounts(
            OperationsMultiAccountsIds accountsIds,
            PaginationParameters paginationParameters,
            OperationsFilters operationsFilters)
        {
            return await _operationRepositry.GetOperationsByMultiAccounts(accountsIds, paginationParameters, operationsFilters);
        }


        public async Task<List<AccountInfos>> CheckIfAnAccountHasConfirmedPaymentOperations(List<string> accountsIds)
        {
            OperationsFilters filters = new OperationsFilters();
            filters.OnlyAcceptedPurchaseOperations = true;

            return await _operationRepositry.CheckIfAccountsHasOperations(accountsIds, filters);

        }

        public async Task<Operation> GetOneOperationByAccountAndOperationReference(string accountId, string operationId)
        {
            return await _operationRepositry.GetOneOperationByAccountAndOperationReference(accountId, operationId);
        }
    }
}
