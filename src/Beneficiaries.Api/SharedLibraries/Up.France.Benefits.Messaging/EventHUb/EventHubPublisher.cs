using Azure.Messaging.EventHubs;
using Azure.Messaging.EventHubs.Producer;
using Newtonsoft.Json;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.Linq;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Up.France.Benefits.Configuration;

namespace Up.France.Benefits.Messaging
{
    [ExcludeFromCodeCoverage]
    public sealed class EventHubPublisher<TConfig> : IEventHubPublisher<TConfig>, IAsyncDisposable
           where TConfig : IEventHubConfiguration
    {
        #region Fields

        private readonly JsonSerializerSettings _serializerSetting;
        private readonly ConcurrentDictionary<string, EventHubProducerClient> _clients;

        #endregion Fields

        #region Constructor

        public EventHubPublisher(TConfig configuration)
        {
            Configuration = configuration;
            _serializerSetting = new JsonSerializerSettings
            {
                NullValueHandling = NullValueHandling.Ignore

            };
            this._clients = new ConcurrentDictionary<string, EventHubProducerClient>();
        }

        #endregion Constructor

        #region Publish Methods

        public Task PublishAsync<T>(T @event, string hubName, Dictionary<string, object> properties = null, CancellationToken cancellationToken = default(CancellationToken))
        {
            return CustomPublishAsync(@event, hubName, properties, cancellationToken);
        }

        public async Task CustomPublishAsync<T>(T @event, string hubName, Dictionary<string, object> properties = null, CancellationToken cancellationToken = default(CancellationToken))
        {
            EventData result = BuildEventData(@event, properties);

            var client = this._clients.GetOrAdd(hubName, CreateHubClient);

            var batch = await client.CreateBatchAsync(cancellationToken);
            var isEventAdded = batch.TryAdd(result);

            if (!isEventAdded)
            {
                throw new Exception($"Event not sended (too large). Event");
            }

            await client.SendAsync(batch, cancellationToken);
        }

        public async Task PublishBatchAsync<T>(IEnumerable<T> @events, string hubName, Dictionary<string, object> properties, CancellationToken cancellationToken = default(CancellationToken))
        {
            var client = this._clients.GetOrAdd(hubName, CreateHubClient);

            var batch = await client.CreateBatchAsync(cancellationToken);

            foreach (var @event in events)
            {
                EventData result = BuildEventData(@event, properties);
                var isEventAdded = batch.TryAdd(result);

                if (!isEventAdded)
                {
                    throw new Exception($"Event not sended (too large). Event");
                }
            }

            await client.SendAsync(batch, cancellationToken);
        }

        #endregion Publish Methods

        #region Build Message Methods

        private List<EventData> BuildEventDatas<T>(IEnumerable<T> @events, Dictionary<string, object> properties)
        {
            List<EventData> result = new();
            @events.ToList().ForEach(ev => result.Add(BuildEventData(ev, properties)));
            return result;
        }

        private EventData BuildEventData<T>(T @event, IDictionary<string, object> properties)
        {
            var rawEvent = JsonConvert.SerializeObject(@event, _serializerSetting);

            var result = new EventData(Encoding.UTF8.GetBytes(rawEvent));


            if (properties != null)
            {
                foreach (var property in properties)
                {
                    result.Properties.Add(property);
                }
            }

            return result;
        }

        private EventHubProducerClient CreateHubClient(string hubName)
        {
            return new EventHubProducerClient(Configuration.ConnectionString, hubName);
        }

        public async ValueTask DisposeAsync()
        {
            if (this._clients == null)
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
