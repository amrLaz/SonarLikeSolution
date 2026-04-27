using Up.France.Benefits.Core.Models;
using Up.France.Benefits.Core.Queries;
using Up.France.Benefits.Model.Model.Entites;
using Up.France.Benefits.Model.Models.Entites;

namespace Up.France.Benefits.Abstraction.Queries
{
    public interface IGetOperationQuery
    {
        Task<(List<Operation>, string, int)> GetOperationsByAccount(string accountsId, PaginationParameters paginationParameters, OperationsFilters operationsFilters);
        Task<Operation> GetOneOperationByAccountAndOperationReference(string accountId, string operationId);
        Task<(List<Operation>, string, int)> GetOperationsByMultiAccounts(OperationsMultiAccountsIds accountsIds, PaginationParameters paginationParameters, OperationsFilters operationsFilters);
        Task<(List<Operation>, int, int)> GetOperationsByAccountClassicPagination(string accountsId,
            PaginationParameters paginationParameters,
            OperationsFilters operationsFilters);
        Task<List<AccountInfos>> CheckIfAnAccountHasConfirmedPaymentOperations(List<string> accountsIds);

    }
}