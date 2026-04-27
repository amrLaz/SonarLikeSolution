using Gestion.Compte.MoveUp.Exceptions;
using Gestion.Compte.MoveUp.Requests;
using Gestion.Compte.MoveUp.Responses;
using Microsoft.Extensions.Logging;
using System.Diagnostics.CodeAnalysis;
using System.Net;
using Up.NCommon.HttpClientWrappers;

namespace Gestion.Compte.MoveUp
{
    [ExcludeFromCodeCoverage]
    internal sealed class GestionCompteMoveUpClient : IGestionCompteMoveUpClient
    {

        public GestionCompteMoveUpClient(IRestHttpClient restHttpClient, ILogger<GestionCompteMoveUpClient> logger, string baseUrl)
        {
            _restHttpClient = restHttpClient;
            _logger = logger;
            _baseUrl  = baseUrl;
        }

        readonly IRestHttpClient _restHttpClient;
        readonly ILogger<GestionCompteMoveUpClient> _logger;
        readonly string _baseUrl;

        public async Task<GetBalanceWsResponseDTO> BeneficiaryAccountDetails(GetBalanceWsReuestDTO getBalanceRequest)
        {

            var data = await _restHttpClient.PostJsonRequest<GetBalanceWsReuestDTO, GetBalanceWsResponseDTO>(
            _baseUrl+"/Service/v8/GestionCompteMoveUp.serviceagent/requestBeneficiaryAccountDetails",
            getBalanceRequest).ConfigureAwait(false);
            return HandleResponse(data);
        }

        //public async Task<AccountClientResult> CloseAccountAsync(CloseAccountArgs args, CancellationToken cancellationToken = default)
        //{
        //    try
        //    {
        //        var data = await _restHttpClient.DeleteJsonRequestAsync<SuspendAccountArgs, SuspendAccountClientResult>(
        //            $"/api/CloseAccount", args, null, null, cancellationToken).ConfigureAwait(false);

        //        _logger.LogWarning($"Payment Wordline CloseAccountAsync, Status : {data?.StatusCode.ToString()?.Replace('\n', '_')?.Replace('\r', '_')}, Result : {(data?.Result == null ? "null" : JsonConvert.SerializeObject(data?.Result)?.ToString()?.Replace('\n', '_')?.Replace('\r', '_'))}, Exception : {data?.Exception?.ToString()?.Replace('\n', '_')?.Replace('\r', '_')}, AccountRefNo: {args.AccountRefNo?.Replace('\n', '_')?.Replace('\r', '_')}, CardId: {args.CardId?.Replace('\n', '_')?.Replace('\r', '_')}");

        //        return HandleResponse(data);
        //    }
        //    catch (PaymentAccountDeletedException ex)
        //    {
        //        _logger.LogError($"Payment Wordline CloseAccountAsync PaymentAccountDeletedException, Message: {ex.Message?.Replace('\n', '_')?.Replace('\r', '_')}, StackTrace: {ex.StackTrace?.Replace('\n', '_')?.Replace('\r', '_')}, AccountRefNo: {args.AccountRefNo?.Replace('\n', '_')?.Replace('\r', '_')}, CardId: {args.CardId?.Replace('\n', '_')?.Replace('\r', '_')}");
        //        return new AccountClientResult { ResponseCode = WorldlineResponseCode.RESPONSE_CODE_ACCOUNT_DELETED };
        //    }
        //    catch (Exception ex)
        //    {
        //        _logger.LogError($"Payment Wordline CloseAccountAsync Exception, Message: {ex.Message?.Replace('\n', '_')?.Replace('\r', '_')}, StackTrace: {ex.StackTrace?.Replace('\n', '_')?.Replace('\r', '_')}, AccountRefNo: {args.AccountRefNo?.Replace('\n', '_')?.Replace('\r', '_')}, CardId: {args.CardId?.Replace('\n', '_')?.Replace('\r', '_')}");
        //        throw;
        //    }

        //}

        //public async Task<SuspendAccountClientResult> DisableAccountAsync(SuspendAccountArgs args, CancellationToken cancellationToken = default)
        //{
        //    try
        //    {
        //        var data = await _restHttpClient.PutJsonRequestAsync<SuspendAccountArgs, SuspendAccountClientResult>(
        //            $"/api/DisableAccount", args, null, null, cancellationToken).ConfigureAwait(false);

        //        _logger.LogWarning($"Payment Wordline DisableAccountAsync, Status : {data?.StatusCode.ToString()?.Replace('\n', '_')?.Replace('\r', '_')}, Result : {(data?.Result == null ? "null" : JsonConvert.SerializeObject(data?.Result)?.ToString()?.Replace('\n', '_')?.Replace('\r', '_'))}, Exception : {data?.Exception?.ToString()?.Replace('\n', '_')?.Replace('\r', '_')}, AccountRefNo: {args.AccountRefNo?.Replace('\n', '_')?.Replace('\r', '_')}, CardId: {args.CardId?.Replace('\n', '_')?.Replace('\r', '_')} ");

        //        return HandleResponse(data);
        //    }
        //    catch (Exception ex)
        //    {
        //        _logger.LogError($"Payment Wordline DisableAccountAsync Exception, Message: {ex.Message?.Replace('\n', '_')?.Replace('\r', '_')}, StackTrace: {ex.StackTrace?.Replace('\n', '_')?.Replace('\r', '_')}, AccountRefNo: {args.AccountRefNo?.Replace('\n', '_')?.Replace('\r', '_')}, CardId: {args.CardId?.Replace('\n', '_')?.Replace('\r', '_')}");
        //        throw;
        //    }

        //}

        //public async Task<SuspendAccountClientResult> EnableAccountAsync(SuspendAccountArgs args, CancellationToken cancellationToken = default)
        //{
        //    try
        //    {
        //        var data = await _restHttpClient.PutJsonRequestAsync<SuspendAccountArgs, SuspendAccountClientResult>(
        //            $"/api/EnableAccount", args, null, null, cancellationToken).ConfigureAwait(false);

        //        _logger.LogWarning($"Payment Wordline EnableAccountAsync, Status : {data?.StatusCode.ToString()?.Replace('\n', '_')?.Replace('\r', '_')}, Result : {(data?.Result == null ? "null" : JsonConvert.SerializeObject(data?.Result)?.ToString()?.Replace('\n', '_')?.Replace('\r', '_'))}, Exception : {data?.Exception?.ToString()?.Replace('\n', '_')?.Replace('\r', '_')}, AccountRefNo: {args.AccountRefNo?.Replace('\n', '_')?.Replace('\r', '_')}, CardId: {args.CardId?.Replace('\n', '_')?.Replace('\r', '_')} ");

        //        return HandleResponse(data);
        //    }
        //    catch (Exception ex)
        //    {
        //        _logger.LogError($"Payment Wordline EnableAccountAsync Exception, Message: {ex.Message?.Replace('\n', '_')?.Replace('\r', '_')}, StackTrace: {ex.StackTrace?.Replace('\n', '_')?.Replace('\r', '_')}, AccountRefNo: {args.AccountRefNo?.Replace('\n', '_')?.Replace('\r', '_')}, CardId: {args.CardId?.Replace('\n', '_')?.Replace('\r', '_')}");
        //        throw;
        //    }

        //}

        //public async Task<CumulativeAmountResult> GetUserCumulativeAmountAsync(string beneficiaryRef, CancellationToken cancellationToken = default)
        //{
        //    try
        //    {
        //        var data = await _restHttpClient.GetJsonRequestAsync<CumulativeAmountResult>($"/api/GetCumulativeAmount/{beneficiaryRef}", null, cancellationToken).ConfigureAwait(false);

        //        _logger.LogWarning($"Payment Wordline GetUserCumulativeAmountAsync, Status : {data?.StatusCode.ToString()?.Replace('\n', '_')?.Replace('\r', '_')}, Result : {(data?.Result == null ? "null" : JsonConvert.SerializeObject(data?.Result)?.ToString()?.Replace('\n', '_')?.Replace('\r', '_'))}, Exception : {data?.Exception?.ToString()?.Replace('\n', '_')?.Replace('\r', '_')}, beneficiaryRef: {beneficiaryRef?.Replace('\n', '_')?.Replace('\r', '_')}");

        //        return HandleResponse(data);
        //    }
        //    catch (Exception ex)
        //    {
        //        _logger.LogError($"Payment Wordline GetUserCumulativeAmountAsync Exception, Message: {ex?.Message?.Replace('\n', '_')?.Replace('\r', '_')}, StackTrace: {ex?.StackTrace?.Replace('\n', '_')?.Replace('\r', '_')}, beneficiaryRef: {beneficiaryRef?.Replace('\n', '_')?.Replace('\r', '_')}");
        //        throw;
        //    }
        //}

        //public async Task<AccountDetailResult> GetAccountAsync(GetAccountArgs args, CancellationToken cancellationToken = default)
        //{
        //    try
        //    {
        //        var data = await _restHttpClient.GetJsonRequestAsync<AccountDetailResult>($"/api/GetAccount/{args.AccountRefNo}/{args.CardId}", null, cancellationToken).ConfigureAwait(false);

        //        _logger.LogWarning($"Payment Wordline GetAccountAsync, Status : {data?.StatusCode.ToString()?.Replace('\n', '_')?.Replace('\r', '_')}, Result : {(data?.Result == null ? "null" : JsonConvert.SerializeObject(data?.Result)?.ToString()?.Replace('\n', '_')?.Replace('\r', '_'))}, Exception : {data?.Exception?.ToString()?.Replace('\n', '_')?.Replace('\r', '_')}, AccountRefNo: {args.AccountRefNo?.Replace('\n', '_')?.Replace('\r', '_')}, CardId: {args.CardId?.Replace('\n', '_')?.Replace('\r', '_')} ");

        //        return HandleResponse(data);
        //    }
        //    catch (Exception ex)
        //    {
        //        _logger.LogError($"Payment Wordline GetAccountAsync Exception, Message: {ex.Message?.Replace('\n', '_')?.Replace('\r', '_')}, StackTrace: {ex.StackTrace?.Replace('\n', '_')?.Replace('\r', '_')}, AccountRefNo: {args.AccountRefNo?.Replace('\n', '_')?.Replace('\r', '_')}, CardId: {args.CardId?.Replace('\n', '_')?.Replace('\r', '_')}");
        //        throw;
        //    }

        //}

        private static T HandleResponse<T>(HttpClientResult<T> response)
            where T : GetBalanceWsResponseDTO
        {

            if ((int)response.StatusCode < (int)HttpStatusCode.BadRequest)
            {
                var res = response.Result as GetBalanceWsResponseDTO;
                if (res.requestBeneficiaryAccountDetailsResp.enteteTechnique.blockingError.Equals(true))
                {
                    var errorMessage = $"Invalid response with error code {res.requestBeneficiaryAccountDetailsResp.enteteTechnique.error.message}";
                    throw new GetBalanceRequestException(errorMessage);
                }

                return response.Result;
            }

            throw new GetBalanceRequestException(response.ResultErrorMessage);

        }
    }
}
