using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core
{
    [ExcludeFromCodeCoverage]
    public static class SubscriptionApplicationList
    {
        public const string MON_ESPACE_UP = "MonEspaceUp";

        public const string UP_COHESIA = "UpCohesia";

        public static HashSet<string> Applications = new() { MON_ESPACE_UP, UP_COHESIA };
    }
}
