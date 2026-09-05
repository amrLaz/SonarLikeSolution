using System.Net;
using System.Text;
using System.Text.Json;
using CodeInsights.Api.Data;
using CodeInsights.Api.Services;
using CodeInsights.Api.Endpoints;
using System.ComponentModel.DataAnnotations;

internal static class BoardsChecks
{
    public static async Task RunAsync()
    {
        var invalidConfig = new BoardsEndpoints.BoardsConfigRequest(null!, "Project", "Bug", true);
        Check(!Validator.TryValidateObject(invalidConfig, new ValidationContext(invalidConfig), [], true), "missing organization identifier rejected at request boundary");
        var invalidScope = new BoardsEndpoints.SubscriptionRequest("project", new string('a', 101), "Project");
        Check(!Validator.TryValidateObject(invalidScope, new ValidationContext(invalidScope), [], true), "oversized subscription scope rejected at request boundary");
        Check(BoardsDelivery.MatchesTarget("https://dev.azure.com/org/Project%20One/_git/repo", "https://dev.azure.com/org", "Project One"), "associated Azure project accepted");
        Check(!BoardsDelivery.MatchesTarget("https://dev.azure.com/org/Other/_git/repo", "https://dev.azure.com/org", "Project One"), "cross project denied");
        Check(!BoardsDelivery.MatchesTarget("https://evil.invalid/org/Project/_git/repo", "https://evil.invalid/org", "Project"), "untrusted hostname denied");
        Check(!BoardsDelivery.MatchesTarget("https://dev.azure.com/org/Project/_git/repo?redirect=evil", "https://dev.azure.com/org", "Project"), "query alias denied");
        var finding = new DurableFinding { Id = new string('a', 64), ProjectKey = "local", Branch = "main", RuleId = "rule", Message = "<script>bad</script>", State = "confirmed", Version = 1 };
        var link = new FindingWorkItem { FindingId = finding.Id, AdoProject = "Project", WorkItemType = "Bug" };
        var handler = new Handler(); using var client = new HttpClient(handler);
        Task<int?> Deliver(bool create) => BoardsDelivery.DeliverAsync(client, "https://ado.invalid/wit", link, finding, create, CancellationToken.None);
        Check(await Deliver(true) == 17 && handler.Creates == 1, "single initial create");
        Check(handler.Description.Contains("&lt;script&gt;") && !handler.Description.Contains("<script>"), "finding content HTML escaped");
        Check(await Deliver(false) == 17 && handler.Creates == 1 && handler.Patches == 0, "reconciles committed create without new write");
        link.WorkItemId = 17; finding.State = "resolved"; finding.Version = 2;
        Check(await Deliver(false) == 17 && handler.Patches == 1 && handler.Description.Contains("resolved"), "idempotent state summary sync");
        await Deliver(false); Check(handler.Patches == 1, "unchanged retry does not patch");
        handler.WrongProject = true;
        await Throws<InvalidDataException>(() => Deliver(false)); handler.WrongProject = false;
        handler.WrongMarker = true;
        await Throws<InvalidDataException>(() => Deliver(false)); handler.WrongMarker = false;
        link.WorkItemId = null; handler.Multiple = true;
        Check(await Deliver(false) is null && handler.Creates == 1, "ambiguous marker requires review"); handler.Multiple = false;
        handler.Exists = false;
        Check(await Deliver(false) is null && handler.Creates == 1, "absent marker after ambiguous outcome never repeats create");
        handler.LoseCreateResponse = true;
        await Throws<HttpRequestException>(() => Deliver(true));
        var attempts = handler.Creates;
        Check(await Deliver(false) == 17 && handler.Creates == attempts, "lost POST response reconciles without duplicate");
        handler.RateLimit = true;
        await Throws<HttpRequestException>(() => Deliver(false));
        Check(handler.Creates == attempts, "rate limit does not create");
        Console.WriteLine("Azure Boards checks passed (simulated HTTP; no external messages).");
    }

    private static void Check(bool condition, string message) { if (!condition) throw new InvalidOperationException("Boards: " + message); }
    private static async Task Throws<T>(Func<Task<int?>> action) where T : Exception
    {
        try { await action(); } catch (T) { return; }
        throw new InvalidOperationException("Expected " + typeof(T).Name);
    }

    private sealed class Handler : HttpMessageHandler
    {
        public bool Exists, WrongProject, WrongMarker, Multiple, LoseCreateResponse, RateLimit;
        public int Creates, Patches;
        public string Description = "", Marker = "";
        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            if (RateLimit) return new(HttpStatusCode.TooManyRequests);
            var path = request.RequestUri!.AbsolutePath;
            if (path.EndsWith("/wiql")) return Json(new { workItems = Multiple ? new[] { new { id = 17 }, new { id = 18 } } : Exists ? [new { id = 17 }] : [] });
            if (request.Method == HttpMethod.Get)
                return Json(new { id = 17, rev = 3, fields = new Dictionary<string, string> { ["System.Tags"] = WrongMarker ? "other" : Marker, ["System.TeamProject"] = WrongProject ? "Other" : "Project", ["System.Description"] = Description } });
            using var document = JsonDocument.Parse(await request.Content!.ReadAsStringAsync(ct));
            var operations = document.RootElement.EnumerateArray().ToArray();
            Check(request.Content.Headers.ContentType?.MediaType == "application/json-patch+json", "JSON patch content type");
            Check(!operations.Any(x => x.GetProperty("path").GetString() is "/fields/System.State" or "/fields/System.History" or "/fields/System.AssignedTo"), "does not overwrite workflow or append comments");
            Description = operations.Single(x => x.GetProperty("path").GetString() == "/fields/System.Description").GetProperty("value").GetString()!;
            if (request.Method == HttpMethod.Post)
            {
                Creates++; Exists = true; Marker = operations.Single(x => x.GetProperty("path").GetString() == "/fields/System.Tags").GetProperty("value").GetString()!;
                if (LoseCreateResponse) { LoseCreateResponse = false; throw new HttpRequestException("Simulated response loss"); }
            }
            else { Patches++; Check(operations[0].GetProperty("op").GetString() == "test", "revision guard"); }
            return Json(new { id = 17 });
        }
        private static HttpResponseMessage Json(object value) => new(HttpStatusCode.OK) { Content = new StringContent(JsonSerializer.Serialize(value), Encoding.UTF8, "application/json") };
    }
}
