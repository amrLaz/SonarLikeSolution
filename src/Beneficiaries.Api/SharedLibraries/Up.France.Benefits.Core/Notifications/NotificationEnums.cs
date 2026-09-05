using System.ComponentModel;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core
{
    [ExcludeFromCodeCoverage]
    public static class NotificationEnums
    {
        public enum NotificationStatus
        {
            [Description("Undefined")]
            Undefined = 0,
            [Description("Sent")]
            Sent = 1,
            [Description("Delivered")]
            Delivered = 2,
            [Description("Undelivered")]
            Undelivered = 3,
            [Description("Displayed")]
            Displayed = 4,
        }

        public enum NotificationRedirection
        {
            Main = 0,
            Campaign = 1,
            Affiliate = 2,
            Rewards = 3
        }
    }
}
