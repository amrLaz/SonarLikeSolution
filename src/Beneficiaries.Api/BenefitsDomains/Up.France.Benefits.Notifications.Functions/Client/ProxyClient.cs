using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Rest;
using Microsoft.Rest.Serialization;
using Newtonsoft.Json;

namespace Up.France.Benefits.Notifications.Functions
{
    public class ProxyClient : ServiceClient<ProxyClient>
    {
        private readonly string _apiBaseUrl;
        private readonly IDictionary<string, string> _httpHeaders;

        public ProxyClient(string apiBaseUrl, IDictionary<string, string> httpHeaders = null)
        {
            _apiBaseUrl = apiBaseUrl;
            _httpHeaders = httpHeaders;
        }

        public async Task<HttpOperationResponse<T>> HttpGetAsync<T>(string apiRelativeUrl, IDictionary<string, string> parameters = null, CancellationToken cancellationToken = default(CancellationToken))
        {
            var url = string.IsNullOrEmpty(apiRelativeUrl) ? _apiBaseUrl : _apiBaseUrl + apiRelativeUrl;
            if (parameters != null && parameters.Any())
            {
                url += "?" + string.Join("&", parameters.Select(d => d.Key + "=" + d.Value));
            }

            using var httpRequest = new HttpRequestMessage
            {
                Method = HttpMethod.Get,
                RequestUri = new Uri(url),
            };
            if (_httpHeaders != null)
            {
                foreach (var header in _httpHeaders)
                {
                    httpRequest.Headers.Add(header.Key, header.Value);
                }
            }

            using var httpResponse = await HttpClient.SendAsync(httpRequest, cancellationToken).ConfigureAwait(false);
            var statusCode = httpResponse.StatusCode;
            cancellationToken.ThrowIfCancellationRequested();
            string responseContent = null;

            if ((int)statusCode != 200)
            {
                var ex = new HttpOperationException(string.Format("Operation returned an invalid status code '{0}'", statusCode));
                if (httpResponse.Content != null)
                {
                    responseContent = await httpResponse.Content.ReadAsStringAsync().ConfigureAwait(false);
                }
                else
                {
                    responseContent = string.Empty;
                }
                ex.Request = new HttpRequestMessageWrapper(httpRequest, null);
                ex.Response = new HttpResponseMessageWrapper(httpResponse, responseContent);
                throw ex;
            }

            // Create Result
            var result = new HttpOperationResponse<T>();
            result.Request = httpRequest;
            result.Response = httpResponse;
            // Deserialize Response
            if ((int)statusCode == 200)
            {
                responseContent = await httpResponse.Content.ReadAsStringAsync().ConfigureAwait(false);
                if (responseContent == "[]")
                    return null;
                try
                {
                    result.Body = SafeJsonConvert.DeserializeObject<T>(responseContent, new JsonSerializerSettings()
                    {
                        DateFormatString = "dd/MM/yyyy"
                    });
                }
                catch (JsonException ex)
                {
                    throw new SerializationException("Unable to deserialize the response.", responseContent, ex);
                }
            }

            return result;
        }

        public async Task<HttpOperationResponse<T>> HttpPostFormUrlEncodedAsync<T>(string apiRelativeUrl, IDictionary<string, string> content, CancellationToken cancellationToken = default(CancellationToken))
        {
            var url = string.IsNullOrEmpty(apiRelativeUrl) ? _apiBaseUrl : _apiBaseUrl + apiRelativeUrl;

            using var httpRequest = new HttpRequestMessage
            {
                Method = HttpMethod.Post,
                RequestUri = new Uri(url),
            };

            httpRequest.Content = new FormUrlEncodedContent(content);
            httpRequest.Content.Headers.Clear();
            httpRequest.Content.Headers.Add("Content-Type", "application/x-www-form-urlencoded");

            if (_httpHeaders != null)
            {
                foreach (var header in _httpHeaders)
                {
                    if (header.Key != "Content-Type")
                        httpRequest.Headers.Add(header.Key, header.Value);
                }
            }

            using var httpResponse = await HttpClient.SendAsync(httpRequest, cancellationToken).ConfigureAwait(false);
            var statusCode = httpResponse.StatusCode;
            cancellationToken.ThrowIfCancellationRequested();
            string responseContent = null;

            if ((int)statusCode != 200)
            {
                var ex = new HttpOperationException(string.Format("Operation returned an invalid status code '{0}'", statusCode));
                if (httpResponse.Content != null)
                {
                    responseContent = await httpResponse.Content.ReadAsStringAsync().ConfigureAwait(false);
                }
                else
                {
                    responseContent = string.Empty;
                }
                ex.Request = new HttpRequestMessageWrapper(httpRequest, null);
                ex.Response = new HttpResponseMessageWrapper(httpResponse, responseContent);
                throw ex;
            }

            // Create Result
            var result = new HttpOperationResponse<T>();
            result.Request = httpRequest;
            result.Response = httpResponse;
            // Deserialize Response
            if ((int)statusCode == 200)
            {
                responseContent = await httpResponse.Content.ReadAsStringAsync().ConfigureAwait(false);
                try
                {
                    result.Body = SafeJsonConvert.DeserializeObject<T>(responseContent, new JsonSerializerSettings()
                    {
                        DateFormatString = "dd/MM/yyyy"
                    });
                }
                catch (JsonException ex)
                {
                    throw new SerializationException("Unable to deserialize the response.", responseContent, ex);
                }
            }

            return result;
        }
    }
}
