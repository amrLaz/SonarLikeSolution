using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core
{
    [ExcludeFromCodeCoverage]
    public static class SubscriptionServiceList
    {
        public const string INSCRIPTION = "Inscription";
        public const string HYBRID = "HybridDéjeuner";
        public const string _4COIN = "4CDéjeuner";
        public const string _3COIN = "3CDéjeuner";
        public const string CADHOC = "Cadhoc";
        public const string UP_PLUS = "Up+Déjeuner";
        public const string CDP = "CDP";

        public static HashSet<string> Services = new() { UP_PLUS, CDP, INSCRIPTION, HYBRID, _4COIN, _3COIN, CADHOC };
    }
}
