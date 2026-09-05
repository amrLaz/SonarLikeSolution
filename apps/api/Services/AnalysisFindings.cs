using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using CodeInsights.Api.Data;

namespace CodeInsights.Api.Services;

public static partial class AnalysisFindings
{
    public static readonly string[] ScaPrefixes =
    [
        "trivy/",
        "dotnet-audit/",
        "composer-audit/",
        "npm-audit/",
        "pip-audit/",
    ];

    public static string Text(JsonElement element, string key, string fallback = "") =>
        element.ValueKind == JsonValueKind.Object
        && element.TryGetProperty(key, out var value)
        && value.ValueKind != JsonValueKind.Null
            ? value.ToString()
            : fallback;

    public static int? Line(JsonElement element, string key) =>
        element.TryGetProperty(key, out var value)
        && value.ValueKind == JsonValueKind.Number
        && value.TryGetInt32(out var number)
        && number != 0
            ? number
            : null;

    public static IEnumerable<(string Path, JsonElement Issue)> Enumerate(string? raw)
    {
        foreach (var (path, data) in GateEvaluation.Parse<Dictionary<string, JsonElement>>(raw, []))
            if (data.ValueKind == JsonValueKind.Array)
                foreach (var issue in data.EnumerateArray())
                    if (issue.ValueKind == JsonValueKind.Object)
                        yield return (path, issue);
    }

    public static object Build(
        AnalysisRecord record,
        ProjectIntegration? integration,
        HashSet<string> kevIds
    )
    {
        List<Dictionary<string, object?>> findings = [];
        Dictionary<string, int> counts = new()
        {
            ["CRITICAL"] = 0,
            ["HIGH"] = 0,
            ["MEDIUM"] = 0,
            ["LOW"] = 0,
        };
        var provider = integration?.RepoProvider ?? "";
        var repo = integration?.RepoUrl ?? "";
        foreach (var (path, issue) in Enumerate(record.AffectedFiles))
        {
            var rule = Text(issue, "rule_id", Text(issue, "rule"));
            if (rule.Length == 0)
                rule = Text(issue, "rule");
            var category = Text(issue, "category");
            var severity = Text(issue, "severity", "info").ToUpperInvariant();
            if (severity == "BLOCKER")
                severity = "CRITICAL";
            if (counts.ContainsKey(severity))
                counts[severity]++;
            var message = Text(issue, "message");
            var start = Line(issue, "line");
            var end = Line(issue, "end_line") ?? start;
            var sca =
                category is "dependency" or "dependency_vulnerability"
                || ScaPrefixes.Any(rule.StartsWith);
            var cve = rule;
            var pkg = path.Split('/').Last();
            var version = "unknown";
            var fixedVersion = "";
            var language = "unknown";
            double score = 5;
            var description =
                message.Length > 0
                    ? $"{message} (line {Text(issue, "line", "?")})"
                    : $"Issue in {path}";
            if (sca)
            {
                description = message;
                if (rule.StartsWith("trivy/"))
                {
                    cve = rule[6..];
                    var parts = message.Split(" | ").Select(x => x.Trim()).ToArray();
                    var first = parts[0];
                    var at = first.IndexOf('@');
                    var colon = at >= 0 ? first.IndexOf(':', at) : -1;
                    pkg = at >= 0 ? first[..at] : first;
                    version = at >= 0 && colon >= 0 ? first[(at + 1)..colon] : "unknown";
                    description = colon >= 0 ? first[(colon + 1)..].Trim() : first;
                    foreach (var part in parts.Skip(1))
                    {
                        if (part.StartsWith("fix: upgrade to "))
                            fixedVersion = part[16..];
                        else if (part.StartsWith("CVSS "))
                        {
                            if (
                                double.TryParse(
                                    part[5..],
                                    NumberStyles.Float,
                                    CultureInfo.InvariantCulture,
                                    out var parsed
                                )
                                && parsed != 0
                            )
                                score = parsed;
                        }
                        else if (!part.StartsWith("fix:") && !part.StartsWith("CVSS"))
                            description = part[..Math.Min(400, part.Length)];
                    }
                    language = Path.GetExtension(path).ToLowerInvariant() switch
                    {
                        ".json" or ".lock" => "npm",
                        ".csproj" or ".sln" => "dotnet",
                        ".txt" or ".toml" => "python",
                        ".mod" or ".sum" => "go",
                        _ => "unknown",
                    };
                    if (path.Contains("deps.json"))
                        language = "dotnet";
                }
                else if (rule.StartsWith("dotnet-audit/"))
                {
                    var at = message.IndexOf('@');
                    var colon = at >= 0 ? message.IndexOf(':', at) : -1;
                    pkg = at >= 0 ? message[..at].Trim() : "unknown";
                    version = at >= 0 && colon >= 0 ? message[(at + 1)..colon] : "unknown";
                    var urlIndex = message.IndexOf("https://", StringComparison.Ordinal);
                    var url =
                        urlIndex >= 0
                            ? message[urlIndex..]
                                .Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)[0]
                            : "";
                    cve =
                        url.Length > 0
                            ? url.Split('/').Last()
                            : rule[13..][..Math.Min(20, rule.Length - 13)];
                    language = "dotnet";
                }
                else
                {
                    pkg = message.Contains(':') ? message.Split(':')[0].Trim() : "unknown";
                    var advisory = rule.Contains('/') ? rule[(rule.IndexOf('/') + 1)..] : rule;
                    if (rule.StartsWith("composer-audit/"))
                    {
                        cve = advisory.StartsWith("CVE-", StringComparison.OrdinalIgnoreCase)
                            ? advisory
                            : "GHSA-" + advisory[..Math.Min(15, advisory.Length)];
                        language = "php";
                    }
                    else if (rule.StartsWith("npm-audit/"))
                    {
                        cve = "NPM-" + advisory;
                        language = "javascript";
                    }
                    else
                        cve = advisory.StartsWith("CVE-", StringComparison.OrdinalIgnoreCase)
                            ? advisory
                            : advisory[..Math.Min(30, advisory.Length)];
                }
            }
            var cveLabel =
                sca ? cve
                : rule.Length > 0 ? rule.Replace('/', '-')[..Math.Min(40, rule.Length)]
                : "SAST";
            findings.Add(
                new()
                {
                    ["id"] = sca ? $"{path}:{cve}" : $"{path}:{Text(issue, "line", "0")}:{rule}",
                    ["vulnerability_id"] = sca ? cve : rule,
                    ["language"] = language,
                    ["package_name"] = pkg,
                    ["current_version"] = version,
                    ["vulnerable_versions"] = "unknown",
                    ["fix_available"] = fixedVersion.Length > 0,
                    ["fixed_version"] = fixedVersion.Length > 0 ? fixedVersion : null,
                    ["created_at"] = record.CreatedAt,
                    ["severity"] = severity,
                    ["category"] =
                        sca ? "dependency"
                        : category is "secret" or "code" or "ioc" or "unknown" ? category
                        : "unknown",
                    ["tool"] = Text(issue, "tool", "unknown"),
                    ["cvss_score"] = score,
                    ["file_path"] = path,
                    ["line"] = start,
                    ["end_line"] = end,
                    ["source_url"] = RepoFileUrl(
                        provider,
                        repo,
                        record.CommitSha,
                        path,
                        start,
                        end
                    ),
                    ["vulnerability"] = new
                    {
                        cve_id = cveLabel,
                        cvss_v3_score = score,
                        cvss_v3_severity = severity,
                        description,
                    },
                    ["kev"] = kevIds.Contains(cveLabel.ToUpperInvariant()),
                }
            );
        }
        return new
        {
            analysis_id = record.AnalysisId,
            project_key = record.ProjectKey,
            commit_sha = record.CommitSha,
            branch = record.Branch,
            repo_provider = provider,
            repo_url = repo,
            total_vulnerabilities = record.Vulnerabilities,
            critical_count = counts["CRITICAL"],
            high_count = counts["HIGH"],
            medium_count = counts["MEDIUM"],
            low_count = counts["LOW"],
            kev_count = findings.Count(x => Equals(x["kev"], true)),
            vulnerabilities = findings,
            iocs = Array.Empty<object>(),
            last_scan_date = record.CreatedAt,
        };
    }

    [GeneratedRegex(@"^https://[^/@]+@")]
    private static partial Regex Credentials();

    [GeneratedRegex(@"/_git/([^/?#]+)")]
    private static partial Regex RepoName();

    [GeneratedRegex(@"^(?:/home/vsts/work|/mnt/vss/_work|/agent/_work)/\d+/[^/]+/")]
    private static partial Regex AgentPrefix();

    [GeneratedRegex(@"^\d+>")]
    private static partial Regex BuildPrefix();

    public static string? RepoFileUrl(
        string provider,
        string repo,
        string commit,
        string path,
        int? start,
        int? end
    )
    {
        if (repo.Length == 0 || provider != "azure-devops")
            return null;
        repo = Credentials().Replace(repo, "https://");
        if (repo.Contains("github.com") || repo.Contains("your-org") || repo.Contains("your-repo"))
            return null;
        var relative = path;
        var match = RepoName().Match(repo);
        var separator = match.Success
            ? Regex.Match(path, @"[\\/]" + Regex.Escape(match.Groups[1].Value) + @"[\\/]")
            : Match.Empty;
        relative = separator.Success
            ? path[(separator.Index + separator.Length)..]
            : AgentPrefix().Replace(path, "");
        relative = BuildPrefix().Replace(relative, "");
        var query = new Dictionary<string, string>
        {
            { "path", "/" + relative.TrimStart('/', '\\') },
        };
        if (commit.Length > 0)
            query["version"] = "GC" + commit;
        if (start is > 0)
        {
            query["line"] = start.ToString()!;
            query["lineEnd"] = ((end ?? start) + 1).ToString()!;
            query["lineStartColumn"] = "1";
            query["lineEndColumn"] = "1";
            query["lineStyle"] = "plain";
        }
        query["_a"] = "contents";
        return repo.TrimEnd('/')
            + "?"
            + string.Join(
                '&',
                query.Select(x =>
                    System.Net.WebUtility.UrlEncode(x.Key)
                    + "="
                    + System.Net.WebUtility.UrlEncode(x.Value)
                )
            );
    }
}
