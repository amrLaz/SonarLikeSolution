using System.Xml.Serialization;

namespace Up.France.Benefits.Notifications.Functions.OperationManagement.Notifications.Model
{
    public class CardResultType
    {
        [XmlElement("cardNumber")]
        public string CardNumber { get; set; }

        [XmlElement("cardStatus")]
        public string CardStatus { get; set; }

        [XmlElement("expirationDate")]
        public string ExpirationDate { get; set; }
    }
}