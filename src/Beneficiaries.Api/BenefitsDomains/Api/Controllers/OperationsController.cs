using Microsoft.AspNetCore.Mvc;
using Benefits.Api.Models.DTO;
using Benefits.Api.Tools;
using Up.France.Benefits.Model.Models.Entites;
using Up.France.Benefits.Core.Models;
using Up.France.Benefits.Core.Queries;
using Up.France.Benefits.Abstraction.Queries;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Up.France.Benefits.Business.Queries;

namespace Up.France.Benefits.Api.Controllers
{
    [ApiController]
    [Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public class OperationsController : Controller
    {
        private IGetOperationQuery _getOperationQuery;
        private IGetEventsQuery _getEventsQuery;



        public OperationsController(IGetOperationQuery getOperationQuery, IGetEventsQuery getEventsQuery)
        {
            _getOperationQuery = getOperationQuery;
            _getEventsQuery = getEventsQuery;

        }

        /// <summary>
        /// Get Operations for given account
        /// </summary>
        /// <param name="accountId">Account id</param>
        /// <param name="paginationParameters">Paginations</param>
        /// <param name="OperationsFilters">Date filter</param>
        /// <returns> Accounts operations</returns>
        [HttpGet("accounts/{accountId}/operations")]
        public async Task<ResponseDto<Operation>> Get(
            string accountId,
            [FromQuery] PaginationParameters paginationParameters,
            [FromQuery] OperationsFilters operationsFilters
        )
        {
            if ((bool)operationsFilters.IsClassicPagination)
            {
                var (operationsClassicPagination, operationsCountClassicPagination, totalPageCount) = await _getOperationQuery.GetOperationsByAccountClassicPagination(
                    accountId, 
                    paginationParameters,
                    operationsFilters
                    );
                ResponseClassicPaginationDto<Operation> responseClassicPaginaion = new ResponseClassicPaginationDto<Operation>();
                responseClassicPaginaion.Result = operationsClassicPagination;
                responseClassicPaginaion.pagination = new PaginationClassicPaginationDto();
                responseClassicPaginaion.pagination.page = paginationParameters.Page;
                responseClassicPaginaion.pagination.totalResultCount = operationsCountClassicPagination;
                responseClassicPaginaion.pagination.totalPageCount = totalPageCount;
                responseClassicPaginaion.pagination.pageSize = paginationParameters.PageSize;
                return responseClassicPaginaion;
            }

            paginationParameters.ContinuationToken = Encoder.Decode(paginationParameters.ContinuationToken);
            var (operations, nextContinuationToken, operationsCount) = await _getOperationQuery.GetOperationsByAccount(
                accountId,
                paginationParameters,
                operationsFilters
                );
            ResponseContinuationTokenPaginationDto<Operation> response = new ResponseContinuationTokenPaginationDto<Operation>();
            response.Result = operations;
            response.pagination = new PaginationContinuationTokenDto();
            response.pagination.continuationToken = Encoder.Encode(nextContinuationToken);
            //response.pagination.totalResultCount = operationsCount;
            response.pagination.pageSize = paginationParameters.PageSize;
            return response;
        }


        /// <summary>
        /// Get Operations for multiple accounts
        /// </summary>
        /// <param name="accountsIds">List of account ids</param>
        /// <param name="paginationParameters">Paginations</param>
        /// <param name="OperationsFilters">Date filter</param>
        /// <returns> Accounts operations</returns>
        [HttpPost("/operations/multiple-accounts")]
        public async Task<ResponseDto<Operation>> Post(
            [FromBody] OperationsMultiAccountsIds accountsIds,
            [FromQuery] PaginationParameters paginationParameters,
            [FromQuery] OperationsFilters operationsFilters

        )
        {
            paginationParameters.ContinuationToken = Encoder.Decode(paginationParameters.ContinuationToken);
            var (operations, nextContinuationToken, operationsCount)  = await _getOperationQuery.GetOperationsByMultiAccounts(
                accountsIds,
                paginationParameters,
                operationsFilters
                );
            ResponseContinuationTokenPaginationDto<Operation> response = new ResponseContinuationTokenPaginationDto<Operation>();
            response.Result = operations;
            response.pagination = new PaginationContinuationTokenDto();
            response.pagination.continuationToken = Encoder.Encode(nextContinuationToken);
            //response.pagination.totalResultCount = operationsCount;
            response.pagination.pageSize = paginationParameters.PageSize;
            return response;
        }


        /// <summary>
        /// Get Events For Operations  
        /// </summary>
        /// <param name="operationId">List of account ids</param>
        /// <returns> Operqtion events</returns>
        [HttpGet("account/{accountId}/operation/{operationId}/events")]
        public async Task<ResponseDto<Operation>> Get(
            string accountId,
            string operationId,
            [FromQuery] PaginationParameters paginationParameters,
            [FromQuery] EventsFilters eventsFilters
        )
        {
            Operation operation = await _getOperationQuery.GetOneOperationByAccountAndOperationReference(accountId, operationId);
            ResponseClassicPaginationDto<Operation> response = new ResponseClassicPaginationDto<Operation>();
            var (events, eventscount, totalPageCount) = await _getEventsQuery.GetEventsByOperationAndAccount(accountId, operationId);
            if (operation == null)
            {
                throw new KeyNotFoundException($"Operation {operationId} not found for account {accountId}");
            }
            operation.events = events;
            response.pagination = new PaginationClassicPaginationDto();
            response.pagination.page = paginationParameters.Page;
            response.pagination.totalResultCount = eventscount;
            response.pagination.totalPageCount = totalPageCount;
            response.pagination.pageSize = paginationParameters.PageSize;
            response.Result = operation;
            return response;
        }
    }
}
