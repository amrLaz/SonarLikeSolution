using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Reflection;
using System.Resources;
using System.Text;

namespace Up.France.Benefits.Notifications.Functions
{
    public static class ResourceWrapper
    {
        private static readonly ResourceSet _resourceSet;
        static ResourceWrapper()
        {
            var asm = Assembly.GetExecutingAssembly();
            var ressources = asm.GetManifestResourceNames();
            _resourceSet = new ResourceSet(asm.GetManifestResourceStream(ressources[0]));
        }

        public static string GetString(string key)
        {
            return _resourceSet.GetString(key);
        }
    }
}
