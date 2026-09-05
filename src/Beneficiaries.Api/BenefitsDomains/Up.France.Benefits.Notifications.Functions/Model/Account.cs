using System.Xml.Serialization;

namespace Up.France.Benefits.Notifications.Functions.OperationManagement.Notifications.Model
{
    public class Account
    {
        [XmlElement("accountNumber")] public string AccountNumber { get; set; }

        [XmlElement("accountCategory")] public string AccountCategory { get; set; }

        [XmlElement("Amount")] public AmountType Amount { get; set; }

        [XmlElement("AccountBalanceImpact")] public AmountType AccountBalanceImpact { get; set; }

        [XmlElement("AccountBalanceAfter")] public AmountType AccountBalanceAfter { get; set; }
    }
}