using System.Diagnostics.CodeAnalysis;
using Up.France.Benefits.Configuration.Configurations;
using static System.Collections.Specialized.BitVector32;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public class BenefitsConfiguration
    {
        public ApplicationConfiguration Application { get; set; }
        public DataBaseConfiguration Database { get; set; }
        public PlatformConfiguration Platform { get; set; }
        public GestionCompteMoveUp GestionCompteMoveUp { get; set; }
        public GestionCompteMoveUpSoap GestionCompteMoveUpSoap { get; set; }
        public VintagePeriodConfig VintagePeriodConfig { get; set; }
    }
}
