using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public class ExternalStorageConfiguration
    {
        public string EndPoint { get; set; }
        public string ConnectionString { get; set; }
        public string Key { get; set; }
    }
}
