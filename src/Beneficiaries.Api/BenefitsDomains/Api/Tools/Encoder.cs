using Microsoft.AspNetCore.WebUtilities;
using System.Text;

namespace Benefits.Api.Tools
{
    public static class Encoder
    {
        public static string? Encode(string? text)
        {
            if(text != null)
                text = WebEncoders.Base64UrlEncode(Encoding.UTF8.GetBytes(text));
            return text;
        }

        public static string? Decode(string? text)
        {
            if (text != null)
            {
                text = Encoding.UTF8.GetString(WebEncoders.Base64UrlDecode(text));
            }
            return text;
        }
    }
}
