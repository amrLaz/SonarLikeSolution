using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Configuration
{
    [ExcludeFromCodeCoverage]
    public sealed class InternalSettingsConfiguration
    {
        public bool IsUpplusMaintenance { get; set; }
        public bool IsCdpMaintenance { get; set; }
        public string QuestionCodeUserAsnwersDelete { get; set; }

    }
}