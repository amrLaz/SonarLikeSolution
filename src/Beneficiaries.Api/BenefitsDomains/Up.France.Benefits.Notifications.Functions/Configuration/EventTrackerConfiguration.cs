using Up.France.Benefits.Configuration;

namespace Up.France.Benefits.Notifications.Functions
{
    public class EventTrackerConfiguration : IEventHubConfiguration
    {
        public string ConnectionString { get; set; }
        public string Key { get; set; }
        public string HubName { get; set; }
    }
}