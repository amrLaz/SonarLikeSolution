using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public class DataBaseConfiguration
    {
        public DataBaseConnectionConfiguration FallBackService { get; set; }
        public DataBaseNameConfiguration FallBackServiceDatabase { get; set; }

        public DataBaseConnectionConfiguration Benefits { get; set; }
        public DataBaseNameConfiguration BenefitsCadhoc { get; set; }

    }
}
