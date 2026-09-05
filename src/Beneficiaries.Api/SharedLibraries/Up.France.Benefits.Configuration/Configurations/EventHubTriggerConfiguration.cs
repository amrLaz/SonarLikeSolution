namespace Up.France.Benefits.Configuration.Configurations
{
    public class EventHubTriggerConfiguration
    {
        public string Name { get; set; }
        public string ConnectionString { get; set; }
        public string ConsumerGroup { get; set; }
    }
}