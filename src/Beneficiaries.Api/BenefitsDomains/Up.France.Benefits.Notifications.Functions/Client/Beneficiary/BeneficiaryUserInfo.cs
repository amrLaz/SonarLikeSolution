using System;
using System.Collections.Generic;
using System.Text;

namespace Up.France.Benefits.Notifications.Functions
{
    public class BeneficiaryUserInfo
    {
        public BeneficiaryUserInfo(string cardId, string uuidUser)
        {
            CardId = cardId;
            UuidUser = uuidUser;
        }

        public string CardId { get; set; }

        public string UuidUser { get; set; }
    }
}
