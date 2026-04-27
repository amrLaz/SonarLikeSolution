
using Up.France.Benefits.Core.Models;
using Up.France.Benefits.Core.Queries;
using Up.France.Benefits.Model.Model.Entites;
using Up.France.Benefits.Model.Models.Entites;

namespace Up.France.Benefits.Abstraction.Repositories
{
    public interface IOperationRepository
    {
        Task<(List<Operation>, string, int)> GetOperationsByAccount(
            string accountId,
            PaginationParameters paginationParameters,
            OperationsFilters dateFilterByPeriod
            );

        Task<Operation> GetOneOperationByAccountAndOperationReference(
            string accountId,
            string operationId
            );
        Task<(List<Operation>, int, int)> GetOperationsByAccountClassicPagination(
        string accountId,
        PaginationParameters paginationParameters,
        OperationsFilters operationsFilters
        );

        Task<(List<Operation>, string, int)> GetOperationsByMultiAccounts(
            OperationsMultiAccountsIds accountsIds,
            PaginationParameters paginationParameters,
            OperationsFilters dateFilterByPeriod
            );

        public Task<int> GetTotalResultCount(
            List<string> operationsMultiAccountsIds,
            OperationsFilters operationsFilters
            );


        Task<List<AccountInfos>> CheckIfAccountsHasOperations(List<string> accountsIds, OperationsFilters filters);


    }
}
