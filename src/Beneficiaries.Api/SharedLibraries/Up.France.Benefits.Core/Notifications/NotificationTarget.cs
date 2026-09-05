using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core
{
    [ExcludeFromCodeCoverage]
    public sealed class NotificationTarget
    {
        public NotificationPush Push { get; set; }
        public NotificationEmail Email { get; set; }
        public NotificationSms Sms { get; set; }
    }
}
