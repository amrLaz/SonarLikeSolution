using System;
using System.Collections.Generic;
using System.Text;

namespace Up.France.Benefits.Notifications.Functions
{
    public class AzureB2BConfiguration
    {
        public string Domain { get; set; }
        public string TenantId { get; set; }
        public string ClientId { get; set; }
        public string ClientSecret { get; set; }
        public string[] Scopes { get; set; }
        public string[] ScopesMSC { get; set; }
    }
}
