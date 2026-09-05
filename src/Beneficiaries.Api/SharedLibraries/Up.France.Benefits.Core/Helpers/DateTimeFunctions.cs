using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Up.France.Benefits.Core.Queries;

namespace Up.France.Benefits.Core.Helpers
{
    public static class DateTimeFunctions
    {
        public static long ConvertToUnixTime(DateTime dateTime)
        {

            TimeSpan timeSpan = dateTime.ToUniversalTime() - new DateTime(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);
            return (long)timeSpan.TotalMilliseconds * 1000; // Convert milliseconds to microseconds
        }
        public static bool IsValidDateTime(DateTime? dateTime)
        {
            try
            {
                // Attempt to perform some operation on the DateTime that would indicate it's valid
                // For example, parsing it again and seeing if it's still the same
                DateTime parsedDateTime = DateTime.Parse(dateTime.ToString());
                return true;
            }
            catch (Exception)
            {
                // Catch any exceptions that might occur during parsing
                return false;
            }
        }
    }
}
