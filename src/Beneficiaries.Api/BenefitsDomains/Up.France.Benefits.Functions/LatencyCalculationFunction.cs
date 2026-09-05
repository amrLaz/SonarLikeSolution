using System;
using System.Text;
using Azure.Messaging.EventHubs;
using Microsoft.ApplicationInsights;
using Microsoft.ApplicationInsights.Extensibility;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;


namespace Up.France.Benefits.Functions
{
    public class LatencyCalculationFunction
    {
        private readonly ILogger<LatencyCalculationFunction> _logger;
        private readonly TelemetryClient _telemetryClient;

        public LatencyCalculationFunction(ILogger<LatencyCalculationFunction> logger,
           IConfiguration configuration)
        {
            _logger = logger;
            TelemetryConfiguration telemetryConfiguration = TelemetryConfiguration.CreateDefault();
            telemetryConfiguration.ConnectionString = configuration["TelemetryLatency_ConnectionString"];
            _telemetryClient = new TelemetryClient(telemetryConfiguration);
        }

        [Function(nameof(LatencyCalculationFunction))]
        public void Run([EventHubTrigger("fr-ef1t", Connection = "EF1T_EventHub_NamespaceConnectionString", ConsumerGroup = "%OperationMangementConsumerGroup%")] EventData[] events)
        {
            //foreach (EventData @event in events)
            //{
            //    var message = Encoding.UTF8.GetString(@event.Body.ToArray());
            //    var result = JsonConvert.DeserializeObject<Ef1tNotification>(message);

            //    if (result?.Notification?.Message == null) { return; }

            //    var notif = result?.Notification;
                
            //    if (notif?.Message.ContextData?.OperationDateTime == null)
            //    {
            //        _logger.LogWarning($"Unable to deduce a transaction date. {notif?.Message.MessageId}");
            //        return;
            //    }

            //    var transactionDate = notif?.Message.MessageDate.ToUniversalTime();//notif.Message.ContextData.OperationDateTime.ToUniversalTime();
            //    if (!transactionDate.HasValue)
            //        throw new Exception();
            //    var totalLag = @event.EnqueuedTime - transactionDate;
            //    _logger.LogInformation($"Duration MoveUp => Event Hub EF1T : {totalLag:c}");
            //    _telemetryClient.TrackMetric("arrivalLag", totalLag.Value.TotalSeconds);
            //}
        }
       

    }
}
