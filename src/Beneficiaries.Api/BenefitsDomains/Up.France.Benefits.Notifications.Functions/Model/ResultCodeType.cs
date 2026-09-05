using System.Xml.Serialization;

namespace Up.France.Benefits.Notifications.Functions.OperationManagement.Notifications.Model
{
    public class ResultCodeType
    {
        [XmlElement("code")]
        public string Code { get; set; }

        [XmlElement("message")]
        public string Message { get; set; }
    }
}