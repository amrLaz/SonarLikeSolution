using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public class DataBaseConnectionConfiguration
    {
        public string EndPoint { get; set; }
        public string Key { get; set; }
    }
}
