using Azure.Messaging.ServiceBus;
using Microsoft.Extensions.Logging;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Threading.Tasks;
using Up.France.Benefits.Configuration;

namespace Up.France.Benefits.Messaging
{
    [ExcludeFromCodeCoverage]
    public sealed class ServiceBusEventReceiver<TConfig> : IServiceBusEventReceiver<TConfig>
           where TConfig : IServiceBusConfiguration
    {
        #region Fields

        private readonly ILogger<ServiceBusEventReceiver<TConfig>> _logger;

        #endregion Fields

        #region Constructor

        public ServiceBusEventReceiver(TConfig configuration, ILogger<ServiceBusEventReceiver<TConfig>> logger)
        {
            Configuration = configuration;
            _logger = logger;
        }

        #endregion Constructor

        #region  Receive Methods

        public Task<ServiceBusReceiver> InitialiseDeadLetterAsync(string topicName, string subscriptionName)
        {
            var serviceBusClient = new ServiceBusClient(Configuration.ConnectionString);
            var deadLetterReceiver = serviceBusClient.CreateReceiver($"{topicName}/Subscriptions/{subscriptionName}/$DeadLetterQueue");
            return Task.FromResult(deadLetterReceiver);
        }

        public async Task<IReadOnlyList<ServiceBusReceivedMessage>> ReceiveFromDeadLetterAsync(ServiceBusReceiver deadLetterReceiver, int maxMessages)
        {
            var deadLetter = await deadLetterReceiver.ReceiveMessagesAsync(maxMessages);
            return deadLetter;
        }
        public async Task CompleteMessageFromDeadLetterAsync(ServiceBusReceivedMessage serviceBusReceivedMessage, string topicName, string subscriptionName)
        {
            var serviceBusClient = new ServiceBusClient(Configuration.ConnectionString);
            var deadLetterReceiver = serviceBusClient.CreateReceiver($"{topicName}/Subscriptions/{subscriptionName}/$DeadLetterQueue");
            await deadLetterReceiver.CompleteMessageAsync(serviceBusReceivedMessage);
        }
        public async Task CompleteMessagesFromDeadLetterAsync(ICollection<ServiceBusReceivedMessage> serviceBusReceivedMessages, ServiceBusReceiver deadLetterReceiver)
        {
            foreach (var message in serviceBusReceivedMessages)
            {
                await deadLetterReceiver.CompleteMessageAsync(message);
            }
        }

        #endregion Publish Methods


        #region Configuration

        public TConfig Configuration { get; }

        #endregion Configuration
    }
}
