using Azure.Messaging.ServiceBus;
using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Up.France.Benefits.Configuration;

namespace Up.France.Benefits.Messaging
{
    [ExcludeFromCodeCoverage]
    public sealed class ServiceBusEventPublisher<TConfig> : IServiceBusEventPublisher<TConfig>, IAsyncDisposable
           where TConfig : IServiceBusConfiguration
    {
        #region Fields

        private readonly JsonSerializerSettings _serializerSetting;
        private readonly ConcurrentDictionary<string, ServiceBusSender> _clients;
        private readonly ILogger<ServiceBusEventPublisher<TConfig>> _logger;

        #endregion Fields

        #region Constructor

        public ServiceBusEventPublisher(TConfig configuration, ILogger<ServiceBusEventPublisher<TConfig>> logger)
        {
            Configuration = configuration;
            _serializerSetting = new JsonSerializerSettings
            {
                NullValueHandling = NullValueHandling.Ignore

            };
            _clients = new ConcurrentDictionary<string, ServiceBusSender>();
            _logger = logger;
        }

        #endregion Constructor

        #region Publish Methods

        public Task PublishAsync<T>(T @event, string topicName, Dictionary<string, object> properties, string sessionId = null, string partitionKey = null)
        {
            return CustomPublishAsync(@event, topicName, properties, sessionId, partitionKey);
        }

        public Task CustomPublishAsync<T>(T @event, string topicName, Dictionary<string, object> properties, string sessionId = null, string partitionKey = null)
        {
            var message = BuildMessage(@event, properties, sessionId, partitionKey);

            var client = _clients.GetOrAdd(topicName, CreateTopicClient);

            return client.SendMessageAsync(message);
        }

        public Task PublishBatchAsync<T>(IEnumerable<T> @events, string topicName, string sessionId = null, string partitionKey = null)
        {
            return PublishBatchAsync(@events, topicName, null, sessionId, partitionKey);
        }

        public Task PublishBatchAsync<T>(IEnumerable<T> @events, string topicName, Dictionary<string, object> properties, string sessionId = null, string partitionKey = null)
        {
            var messages = BuildMessages(@events, properties, sessionId, partitionKey);

            var client = _clients.GetOrAdd(topicName, CreateTopicClient);

            return client.SendMessagesAsync(messages);
        }

        #endregion Publish Methods

        #region Build Message Methods

        private List<ServiceBusMessage> BuildMessages<T>(IEnumerable<T> @events, Dictionary<string, object> properties, string sessionId, string partitionKey)
        {
            List<ServiceBusMessage> messages = new();
            @events.ToList().ForEach(ev => messages.Add(BuildMessage(ev, properties, sessionId, partitionKey)));
            return messages;
        }

        private ServiceBusMessage BuildMessage<T>(T @event, IDictionary<string, object> properties, string sessionId, string partitionKey)
        {
            var rawEvent = JsonConvert.SerializeObject(@event, _serializerSetting);

            var message = new ServiceBusMessage(Encoding.UTF8.GetBytes(rawEvent))
            {
                MessageId = Guid.NewGuid().ToString(),
                SessionId = sessionId,
                PartitionKey = partitionKey,
            };

            if (properties != null)
            {
                foreach (var property in properties)
                {
                    message.ApplicationProperties.Add(property);
                }
            }

            _logger.LogInformation(JsonConvert.SerializeObject(message, _serializerSetting));

            return message;
        }

        private ServiceBusSender CreateTopicClient(string topicName)
        {
            if (topicName == null)
                throw new ArgumentException("Topic cannot be null");
            return new ServiceBusClient(Configuration.ConnectionString).CreateSender(topicName);
        }

        public async ValueTask DisposeAsync()
        {
            if (_clients == null)
            {
                return;
            }

            foreach (var item in _clients)
            {
                await (item.Value).CloseAsync();
            }

            GC.SuppressFinalize(this);
        }

        #endregion Build Message Methods

        #region Configuration

        public TConfig Configuration { get; }

        #endregion Configuration
    }
}
