using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using Up.France.Benefits.Configuration;

namespace Up.France.Benefits.Messaging
{
    public interface IEventHubPublisher<TConfig>
        where TConfig : IEventHubConfiguration
    {
        #region Publish Methods

        Task PublishAsync<T>(T @event, string hubName, Dictionary<string, object> properties = null, CancellationToken cancellationToken = default(CancellationToken));

        Task PublishBatchAsync<T>(IEnumerable<T> @events, string hubName, Dictionary<string, object> properties = null, CancellationToken cancellationToken = default(CancellationToken));

        #endregion Publish Methods

        #region Configuration

        TConfig Configuration { get; }

        #endregion Configuration
    }
}
