using System.Collections.Generic;
using System.Threading.Tasks;
using Up.France.Benefits.Configuration;

namespace Up.France.Benefits.Messaging
{
    public interface IServiceBusEventPublisher<TConfig>
        where TConfig : IServiceBusConfiguration
    {
        #region Publish Methods

        Task PublishAsync<T>(T @event, string topicName, Dictionary<string, object> properties, string sessionId = null, string partitionKey = null);

        Task PublishBatchAsync<T>(IEnumerable<T> @events, string topicName, Dictionary<string, object> properties, string sessionId = null, string partitionKey = null);

        #endregion Publish Methods

        #region Configuration

        TConfig Configuration { get; }

        #endregion Configuration
    }
}
