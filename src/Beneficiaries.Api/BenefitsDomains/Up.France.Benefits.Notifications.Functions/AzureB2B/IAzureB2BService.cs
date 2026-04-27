using System.Threading.Tasks;

namespace Up.France.Benefits.Notifications.Functions
{
    public interface IAzureB2BService
    {
        Task<string> AcquireTokenAsync();
    }
}
