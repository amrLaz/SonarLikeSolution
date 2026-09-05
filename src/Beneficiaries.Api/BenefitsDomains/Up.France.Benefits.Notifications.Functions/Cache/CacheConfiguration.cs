using System;
using System.Collections.Generic;
using System.Text;

namespace Up.France.Benefits.Notifications.Functions
{
    public sealed class CacheConfiguration
    {
        public int MaxTry { get; set; }
        public int ExpireTime { get; set; }
        public int BlockedTime { get; set; }
        public int AccountExpireTime { get; set; }
        public string BeneficiaryKey { get; set; }
    }
}
