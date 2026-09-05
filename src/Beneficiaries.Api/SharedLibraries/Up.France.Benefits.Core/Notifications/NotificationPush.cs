using System.Diagnostics.CodeAnalysis;
using static Up.France.Benefits.Core.NotificationEnums;

namespace Up.France.Benefits.Core
{
    [ExcludeFromCodeCoverage]
    public sealed class NotificationPush
    {
        // ?
        public string PushType { get; set; }
        // To use if you want to direct the user to any screen in the application
        public NotificationRedirection Redirection { get; set; }
        // Variable that can be used as a parameter to the screen where you direct the user. Campaign id, affiliate id, reward id etc
        public string RedirectionValue { get; set; }
    }
}
