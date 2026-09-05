namespace Up.France.Benefits.Configuration
{
    public interface IEventHubConfiguration
    {
        #region Properties

        string ConnectionString { get; set; }
        string Key { get; set; }

        #endregion Properties
    }
}
