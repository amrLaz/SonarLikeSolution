using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core
{
    [ExcludeFromCodeCoverage]
    public sealed class NotificationCampaignRequest
    {
        public NotificationTarget NotificationTarget { get; set; }

        // Title of a campaign
        public string NotificationTitle { get; set; }

        // Content of the campaign
        public string NotificationDataString { get; set; }

        public IEnumerable<string> List_user_reference_id { get; set; }

        public DateTime SendDate { get; set; }
    }
}
