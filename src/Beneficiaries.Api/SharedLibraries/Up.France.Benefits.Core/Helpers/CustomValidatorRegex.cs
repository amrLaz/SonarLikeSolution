using System.Text.RegularExpressions;
using Up.France.Benefits.Core.Models;
using Up.France.Benefits.Hosting;

namespace Up.France.Benefits.Core.Helpers
{
    public static class CustomValidatorRegex
    {
        private static readonly string SubscriberId = EnvironmentVariable.RegexSubscriberIdPattern(); 

        public static bool IsValidSubscriberId(string input)
        {
            //return Regex.IsMatch(input, SubscriberId);
            return false;
        }
    }
}