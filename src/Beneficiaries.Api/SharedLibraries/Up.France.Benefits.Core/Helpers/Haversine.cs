using System;
using System.Diagnostics.CodeAnalysis;

namespace Up.France.ODI.Loyalty.Core.Helpers
{
    [ExcludeFromCodeCoverage]
    public static class Haversine
    {
        public static double CalculateDistanceInKm(double lat1, double lon1, double lat2, double lon2)
        {
            double rad(double angle) => angle * 0.017453292519943295769236907684886127d; // = angle * Math.Pi / 180.0d
            double havf(double diff) => Math.Pow(Math.Sin(rad(diff) / 2d), 2); // = sin²(diff / 2)
            return 12745.6 * Math.Asin(Math.Sqrt(havf(lat2 - lat1) + Math.Cos(rad(lat1)) * Math.Cos(rad(lat2)) * havf(lon2 - lon1))); // earth radius 6.372,8‬km x 2 = 12745.6
        }
    }
}
