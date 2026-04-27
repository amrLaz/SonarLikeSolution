using System.Diagnostics.CodeAnalysis;

namespace Up.France.Benefits.Core
{
    [ExcludeFromCodeCoverage]
    public sealed class NotificationEmail
    {
        // ?
        public string PushType { get; set; }
        // to use the template for only sending email. If you give us a template key, we will always return the same information to you.
        public string TemplateKey { get; set; }
        // To use subject for sending only for email. If you give us a subject, we will always return the same information to you.
        public string Subject { get; set; }
    }
}
