using Azure.Messaging.ServiceBus;
using System.Collections.Generic;
using System.Threading.Tasks;
using Up.France.Benefits.Configuration;

namespace Up.France.Benefits.Messaging
{
    public interface IServiceBusEventReceiver<TConfig>
        where TConfig : IServiceBusConfiguration
    {
        #region Receive Methods

        Task<ServiceBusReceiver> InitialiseDeadLetterAsync(string topicName, string subscriptionName);
        Task<IReadOnlyList<ServiceBusReceivedMessage>> ReceiveFromDeadLetterAsync(ServiceBusReceiver deadLetterReceiver, int maxMessages);
        Task CompleteMessageFromDeadLetterAsync(ServiceBusReceivedMessage serviceBusReceivedMessage, string topicName, string subscriptionName);
        Task CompleteMessagesFromDeadLetterAsync(ICollection<ServiceBusReceivedMessage> serviceBusReceivedMessages, ServiceBusReceiver deadLetterReceiver);

        #endregion Receive Methods

        #region Configuration

        TConfig Configuration { get; }

        #endregion Configuration
    }
}
