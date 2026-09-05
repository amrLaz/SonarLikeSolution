using System.Xml.Serialization;

namespace Up.France.Benefits.Notifications.Functions.OperationManagement.Notifications.Model
{
    public class ReferenceType
    {
        [XmlAttribute("id")]
        public string Id { get; set; }

        [XmlAttribute("externalId")]
        public string ExternalId { get; set; }
    }
}