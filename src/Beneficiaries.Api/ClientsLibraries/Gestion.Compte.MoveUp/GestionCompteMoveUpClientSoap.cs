using Gestion.Compte.MoveUp.Converters;
using Gestion.Compte.MoveUp.Exceptions;
using Gestion.Compte.MoveUp.Requests;
using Gestion.Compte.MoveUp.Responses;
using Microsoft.Extensions.Logging;
using Microsoft.VisualBasic;
using System.Diagnostics.CodeAnalysis;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using Up.NCommon.HttpClientWrappers;
using static System.Net.WebRequestMethods;
using static System.Runtime.InteropServices.JavaScript.JSType;

namespace Gestion.Compte.MoveUp
{
    [ExcludeFromCodeCoverage]
    internal sealed class GestionCompteMoveUpClientSoap : IGestionCompteMoveUpClient
    {

        public GestionCompteMoveUpClientSoap(IRestHttpClient restHttpClient, ILogger<GestionCompteMoveUpClientSoap> logger, string baseUrl)
        {
            _restHttpClient = restHttpClient;
            _logger = logger;
            _baseUrl  = baseUrl;
        }

        readonly IRestHttpClient _restHttpClient;
        readonly ILogger<GestionCompteMoveUpClientSoap> _logger;
        readonly string _baseUrl;



        public async Task<GetBalanceWsResponseDTO> BeneficiaryAccountDetails(GetBalanceWsReuestDTO getBalanceRequest)
        {
            // 1) Build SOAP envelope from your DTO
            string soapXml = BeneficiaryAccountDetailsRequestConverter.ToSoapEnvelope(getBalanceRequest);

            // 2) Prepare HTTP request (SOAP 1.2 => application/soap+xml)
            var endpoint = _baseUrl+ "Service/v8/GestionCompteMoveUp.serviceagent/GestionCompteMoveUpServiceEndpoint";

            var soapAction = "/Service/v8/GestionCompteMoveUp.serviceagent/requestBeneficiaryAccountDetails";

            using var http = new HttpClient();

            // Basic Auth
            var basic = Convert.ToBase64String(Encoding.ASCII.GetBytes("fo:fo"));
            using var req = new HttpRequestMessage(HttpMethod.Post, endpoint);
            req.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);

            // SOAPAction (required by some stacks even in SOAP 1.2)
            req.Headers.TryAddWithoutValidation("SOAPAction", soapAction);

            // Content-Type must be set on HttpContent, not as a request header
            req.Content = new StringContent(soapXml, Encoding.UTF8);
            req.Content.Headers.ContentType = new MediaTypeHeaderValue("application/soap+xml") { CharSet = "utf-8" };

            // 3) Send
            using var resp = await http.SendAsync(req).ConfigureAwait(false);
            var respXml = await resp.Content.ReadAsStringAsync().ConfigureAwait(false);

            return BeneficiaryAccountDetailsResponseConverter.FromSoapXml(respXml);

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
