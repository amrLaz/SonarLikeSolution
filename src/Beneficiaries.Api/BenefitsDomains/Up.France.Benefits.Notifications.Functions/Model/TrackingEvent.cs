using System;
using System.Collections.Generic;
using System.Text.Json.Serialization;

namespace Up.France.Benefits.Notifications.Functions.OperationManagement.Notifications.Model
{
    public class TrackingEvent
    {
        private static string BENEFITS_ORIGIN = "BENEFITS";
        
        public required string Id { get; set; }
        
        public string Origin
        {
            get { return BENEFITS_ORIGIN;  }
        }

        public required string EventType { get; set; }
        public long Timestamp { get; set; }
        public DateTime CreatedAt { get; set; }
        public required string Target { get; set; }
        public required string Subject { get; set; }
       
        [JsonConverter(typeof(JsonStringEnumConverter))]
        public TrackingChannel Channel { get; set; }
    
        public required string CorrelationId { get; set; }
        public Dictionary<string, object> Content { get; set; } = new Dictionary<string, object>();
 
    }
    
    public enum TrackingChannel
    {
        NONE=0,
        EMAIL=1,
        SMS=2,
        PUSH_NOTIFICATION=3,
    }
}