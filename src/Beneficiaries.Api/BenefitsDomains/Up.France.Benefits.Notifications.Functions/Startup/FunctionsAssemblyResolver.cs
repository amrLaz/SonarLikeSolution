using System;
using System.Reflection;

namespace Up.France.Benefits.Notifications.Functions
{
    public static class FunctionsAssemblyResolver
    {
        public static void RedirectAssembly()
        {
            AppDomain.CurrentDomain.AssemblyResolve += CurrentDomain_AssemblyResolve;
        }

        private static Assembly CurrentDomain_AssemblyResolve(object sender, ResolveEventArgs args)
        {
            var requestedAssembly = new AssemblyName(args.Name);
            Assembly assembly = null;
            AppDomain.CurrentDomain.AssemblyResolve -= CurrentDomain_AssemblyResolve;
            try
            {
                if (requestedAssembly.Name == "System.ComponentModel.Annotations")
                {
                    assembly = Assembly.Load(requestedAssembly.Name);
                }

            }
            catch (Exception)
            {
            }
            AppDomain.CurrentDomain.AssemblyResolve += CurrentDomain_AssemblyResolve;
            return assembly;
        }

    }
}
