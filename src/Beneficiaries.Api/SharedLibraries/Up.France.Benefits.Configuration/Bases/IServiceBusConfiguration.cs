namespace Up.France.Benefits.Configuration
{
    public interface IServiceBusConfiguration
    {
        #region Properties

        string ConnectionString { get; set; }
        string Key { get; set; }

        #endregion Properties
    }
}
