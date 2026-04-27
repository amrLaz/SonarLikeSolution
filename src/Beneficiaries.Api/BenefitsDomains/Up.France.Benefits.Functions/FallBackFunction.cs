using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;

namespace Up.France.Benefits.Functions
{
    public class FallBackFunction
    {
        private readonly ILogger<FallBackFunction> _logger;
        private IConfiguration _config;

        public FallBackFunction(ILogger<FallBackFunction> logger, IConfiguration configuration)
        {
            _config = configuration;
            _logger = logger;
        }

        [Function("SwitchToMoveUpTrueFunction")]
        public IActionResult RunSwitchToMoveUpTrue([HttpTrigger(AuthorizationLevel.Function, "get", "post")] HttpRequest req)
        {
            //var currentFallBack = await _fallBackRepository.FindCurrentFallBackAsync();
            //if (!currentFallBack.ForceSwitch)
            //{
            //    currentFallBack.SwitchToMoveUp = true;
            //    var updatedFallBack = _fallBackRepository.Update(currentFallBack);
            //    return new OkObjectResult(updatedFallBack.Entity);
            //}
            return new OkObjectResult(new Dictionary<string, string> { { "string", "string" } });
        }

        public IActionResult RunSwitchToMoveUpFalse([HttpTrigger(AuthorizationLevel.Function, "get", "post")] HttpRequest req)
        {
            //var currentFallBack = await _fallBackRepository.FindCurrentFallBackAsync();
            //if (!currentFallBack.ForceSwitch)
            //{
            //    currentFallBack.SwitchToMoveUp = false;
            //    var updatedFallBack = _fallBackRepository.Update(currentFallBack);
            //    return new OkObjectResult(updatedFallBack.Entity);
            //}
            //return new OkObjectResult(currentFallBack);
            return new OkObjectResult(new Dictionary<string, string> { { "string", "string" } });

        }
        [Function("ForceSwitchFunction")]
        public IActionResult RunForceSwitchFunction([HttpTrigger(AuthorizationLevel.Function, "post")] HttpRequest req)
        {
            //string requestBody = await new StreamReader(req.Body).ReadToEndAsync();
            //var fallBackForceSwitch = JsonConvert.DeserializeObject<FallBackForceSwitch>(requestBody);
            //ArgumentNullException.ThrowIfNull(fallBackForceSwitch);
            //var currentFallBack = await _fallBackRepository.FindCurrentFallBackAsync();
            //currentFallBack.SwitchToMoveUp = fallBackForceSwitch.ForceSwitch;//fallBackForceSwitch.ForceSwitch ? !currentFallBack.SwitchToMoveUp : currentFallBack.SwitchToMoveUp;
            //currentFallBack.ForceSwitch = fallBackForceSwitch.ForceSwitch;
            //var updatedFallBack = _fallBackRepository.Update(currentFallBack);
            //return new OkObjectResult(updatedFallBack.Entity);
            return new OkObjectResult(new Dictionary<string, string> { { "string", "string" } });


        }
    }
}
