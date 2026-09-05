using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using CodeInsights.Api.Auth;
using CodeInsights.Api.Data;
using CodeInsights.Api.Endpoints;
using Microsoft.EntityFrameworkCore;

namespace CodeInsights.Api.Services;

/// <summary>Durable, explicitly requested Boards delivery and transactional targeted inbox.</summary>
public sealed class BoardsDelivery(AppDbContext db, IHttpClientFactory clients)
{
    /// <summary>Adds effects inside the decision transaction. The caller saves and commits them together.</summary>
    public static async Task EnqueueAsync(AppDbContext db, DurableFinding finding, FindingDecision decision, CancellationToken ct)
    {
        if (db.Database.CurrentTransaction is null) throw new InvalidOperationException("Finding effects require a transaction");
        var recipients = await db.Set<FindingSubscription>().Where(x => x.ProjectKey == finding.ProjectKey &&
            (x.Scope == "project" || x.Scope == "finding" && x.ScopeId == finding.Id || x.Scope == "team" && x.ScopeId == finding.TeamId))
            .Select(x => x.UserId).Distinct().ToListAsync(ct);
        foreach (var recipient in recipients)
        {
            var id = AuthService.Sha256(decision.Id + "\n" + recipient);
            if (!db.Set<FindingNotification>().Local.Any(x => x.Id == id) && !await db.Set<FindingNotification>().AnyAsync(x => x.Id == id, ct))
                db.Add(new FindingNotification { Id = id, UserId = recipient, ProjectKey = finding.ProjectKey, FindingId = finding.Id, DecisionId = decision.Id, Action = decision.Action });
        }
        if (await db.Set<FindingWorkItem>().AnyAsync(x => x.FindingId == finding.Id, ct) &&
            !db.Set<BoardsSyncEvent>().Local.Any(x => x.DecisionId == decision.Id) && !await db.Set<BoardsSyncEvent>().AnyAsync(x => x.DecisionId == decision.Id, ct))
        {
            db.Add(new BoardsSyncEvent { DecisionId = decision.Id, FindingId = finding.Id });
            db.Add(new DurableJob { Kind = "boards", ResourceId = decision.Id });
        }
    }

    /// <summary>Requires the Boards destination to be the Azure project of an associated repository.</summary>
    public static async Task ValidateTargetAsync(AppDbContext db, string projectKey, string organizationUrl, string adoProject, CancellationToken ct)
    {
        var urls = await db.Set<ProjectIntegration>().Where(x => x.ProjectKey == projectKey && x.RepoProvider == "azure-devops").Select(x => x.RepoUrl).ToListAsync(ct);
        if (!urls.Any(x => MatchesTarget(x, organizationUrl, adoProject))) throw new ApiException(422, "Boards target must match an associated Azure DevOps repository project");
    }

    public static bool MatchesTarget(string repositoryUrl, string organizationUrl, string adoProject)
    {
        if (!Uri.TryCreate(organizationUrl, UriKind.Absolute, out var org) || org.Scheme != "https" || org.UserInfo.Length != 0 || org.Query.Length != 0 || org.Fragment.Length != 0
            || !Uri.TryCreate(repositoryUrl, UriKind.Absolute, out var repo) || repo.Scheme != "https" || repo.UserInfo.Length != 0 || repo.Query.Length != 0 || repo.Fragment.Length != 0) return false;
        // ponytail: Azure DevOps Services URLs only; add an explicit trusted-host policy before supporting Server installations.
        if (!(org.Host.Equals("dev.azure.com", StringComparison.OrdinalIgnoreCase) && org.AbsolutePath.Trim('/').Split('/').Length == 1 && org.AbsolutePath.Trim('/').Length > 0
            || org.Host.EndsWith(".visualstudio.com", StringComparison.OrdinalIgnoreCase) && org.AbsolutePath.Trim('/').Length == 0) || !org.IsDefaultPort) return false;
        var prefix = new Uri(organizationUrl.TrimEnd('/') + "/" + Uri.EscapeDataString(adoProject) + "/_git/");
        return prefix.IsBaseOf(repo) && repo.AbsolutePath[prefix.AbsolutePath.Length..].Length > 0 && !repo.AbsolutePath[prefix.AbsolutePath.Length..].Contains('/');
    }

    public async Task SendAsync(string decisionId, CancellationToken ct)
    {
        var delivery = await db.Set<BoardsSyncEvent>().FindAsync([decisionId], ct);
        if (delivery is null || delivery.State == "synced") return;
        var link = await db.Set<FindingWorkItem>().FindAsync([delivery.FindingId], ct) ?? throw new InvalidDataException("Boards link unavailable");
        var config = await db.Set<BoardsProjectConfig>().FindAsync([link.ProjectKey], ct);
        if (config?.Enabled != true) throw new InvalidDataException("Boards integration disabled");
        var org = await db.Set<AzureDevOpsOrganizationConfig>().FindAsync([link.OrganizationConfigId], ct);
        if (org is null || org.OrganizationUrl != link.OrganizationUrl || string.IsNullOrWhiteSpace(org.Pat)) throw new InvalidDataException("Boards organization credential unavailable or changed");
        await ValidateTargetAsync(db, link.ProjectKey, link.OrganizationUrl, link.AdoProject, ct);
        // A committed CAS authorizes exactly one create attempt, including across crashes and lost worker leases.
        var allowCreate = await db.Set<FindingWorkItem>().Where(x => x.FindingId == link.FindingId && x.State == "pending" && x.WorkItemId == null)
            .ExecuteUpdateAsync(s => s.SetProperty(x => x.State, "creating"), ct) == 1;
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        // ponytail: serialize one finding's HTTP writes with a transaction lock; move to a dedicated lease if ADO latency becomes material.
        await IngestionEndpoints.LockAsync(db, "boards-delivery:" + link.FindingId, ct);
        await db.Entry(link).ReloadAsync(ct);
        var finding = await db.Set<DurableFinding>().AsNoTracking().SingleAsync(x => x.Id == link.FindingId, ct);
        using var client = clients.CreateClient("pr-decoration");
        client.Timeout = TimeSpan.FromSeconds(30);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", Convert.ToBase64String(Encoding.UTF8.GetBytes(":" + org.Pat)));
        client.DefaultRequestHeaders.Add("X-TFS-FedAuthRedirect", "Suppress");
        var baseUrl = link.OrganizationUrl.TrimEnd('/') + "/" + Uri.EscapeDataString(link.AdoProject) + "/_apis/wit";
        var itemId = await DeliverAsync(client, baseUrl, link, finding, allowCreate, ct);
        if (itemId is null)
        {
            link.State = "needs_review"; link.Error = "Create outcome uncertain or marker not unique; reconcile in Azure Boards before any new creation";
            delivery.State = "needs_review"; delivery.Error = link.Error;
        }
        else
        {
            link.WorkItemId = itemId; link.State = "synced"; link.Error = ""; link.LastDecisionId = decisionId; link.SyncedVersion = finding.Version;
            delivery.State = "synced"; delivery.Error = "";
        }
        delivery.CompletedAt = DateTime.UtcNow;
        await db.SaveChangesAsync(ct); await tx.CommitAsync(ct);
    }

    /// <summary>HTTP seam. Creation is permitted only after a durable compare-and-set; uncertain retries perform discovery only.</summary>
    public static async Task<int?> DeliverAsync(HttpClient client, string baseUrl, FindingWorkItem link, DurableFinding finding, bool allowCreate, CancellationToken ct)
    {
        var marker = "codeinsights:" + finding.Id;
        var id = link.WorkItemId;
        if (id is null)
        {
            var query = new { query = "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project AND [System.Tags] CONTAINS '" + marker.Replace("'", "''") + "'" };
            using var search = await SendJsonAsync(client, HttpMethod.Post, baseUrl + "/wiql?$top=2&api-version=7.1", query, "application/json", ct);
            var matches = search.RootElement.GetProperty("workItems").EnumerateArray().Select(x => x.GetProperty("id").GetInt32()).ToArray();
            if (matches.Length > 1) return null;
            if (matches.Length == 1) id = matches[0];
            else if (!allowCreate) return null;
        }
        var description = "<p>CodeInsights finding: " + WebUtility.HtmlEncode(finding.Id) + "</p><p>Project: " + WebUtility.HtmlEncode(finding.ProjectKey)
            + " / branch: " + WebUtility.HtmlEncode(finding.Branch) + "</p><p>" + WebUtility.HtmlEncode(finding.Tool + "/" + finding.RuleId)
            + "</p><p>State: " + WebUtility.HtmlEncode(finding.State) + "; version: " + finding.Version + "</p><p>"
            + WebUtility.HtmlEncode(finding.Message) + "</p><p>" + WebUtility.HtmlEncode(finding.Path) + ":" + finding.Line + "</p>";
        var title = "[CodeInsights] " + finding.RuleId;
        title = title[..Math.Min(200, title.Length)];
        if (id is not null)
        {
            using var item = await GetJsonAsync(client, baseUrl + "/workitems/" + id + "?api-version=7.1", ct);
            var fields = item.RootElement.GetProperty("fields");
            if (!fields.TryGetProperty("System.Tags", out var tags) || !(tags.GetString() ?? "").Split(';', StringSplitOptions.TrimEntries).Contains(marker)
                || !fields.TryGetProperty("System.TeamProject", out var project) || !string.Equals(project.GetString(), link.AdoProject, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException("Work item marker or Azure project does not match this finding");
            if (fields.TryGetProperty("System.Description", out var previous) && previous.GetString() == description) return id;
            // Update only the owned description; never change human workflow state, assignment, title, or append comments.
            using var patched = await SendJsonAsync(client, HttpMethod.Patch, baseUrl + "/workitems/" + id + "?api-version=7.1",
                new object[] { new { op = "test", path = "/rev", value = (object)item.RootElement.GetProperty("rev").GetInt32() }, new { op = "add", path = "/fields/System.Description", value = (object)description } }, "application/json-patch+json", ct);
            return id;
        }
        using var created = await SendJsonAsync(client, HttpMethod.Post, baseUrl + "/workitems/$" + Uri.EscapeDataString(link.WorkItemType) + "?api-version=7.1",
            new[] { new { op = "add", path = "/fields/System.Title", value = title }, new { op = "add", path = "/fields/System.Description", value = description },
                new { op = "add", path = "/fields/System.Tags", value = marker } }, "application/json-patch+json", ct);
        var createdId = created.RootElement.GetProperty("id").GetInt32();
        if (createdId <= 0) throw new InvalidDataException("Invalid created work item identifier");
        return createdId;
    }

    private static async Task<JsonDocument> GetJsonAsync(HttpClient client, string url, CancellationToken ct)
    {
        using var response = await client.GetAsync(url, ct); response.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
    }

    private static async Task<JsonDocument> SendJsonAsync(HttpClient client, HttpMethod method, string url, object body, string mediaType, CancellationToken ct)
    {
        using var request = new HttpRequestMessage(method, url) { Content = new StringContent(JsonSerializer.Serialize(body), Encoding.UTF8, mediaType) };
        using var response = await client.SendAsync(request, ct); response.EnsureSuccessStatusCode();
        return JsonDocument.Parse(await response.Content.ReadAsStringAsync(ct));
    }
}
