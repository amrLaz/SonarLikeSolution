using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using CodeInsights.Api.Contracts;

namespace CodeInsights.Api.Services;

public sealed record CodeBranch(string Path, int Line, string Kind, string Identity, int Covered, int Total);
public sealed record CodeFileMetric(string Path, string Metric, double Value, string Identity);
public sealed record DuplicateLocation(string Path, int Start, int End);
public sealed record CodeDuplicate(DuplicateLocation First, DuplicateLocation Second, string Language, int Lines, int? Tokens);
public sealed record CodeQualityReport
{
    public string ReportId { get; init; } = "";
    public string Tool { get; init; } = "";
    public string ToolVersion { get; init; } = "";
    public string Format { get; init; } = "";
    public string? ProducerVersion { get; set; }
    public bool SizeMeasured { get; set; }
    public bool DuplicationMeasured { get; set; }
    public bool BranchesMeasured { get; set; }
    public bool ConditionsMeasured { get; set; }
    public List<CodeBranch> Branches { get; init; } = [];
    public List<CodeFileMetric> Metrics { get; init; } = [];
    public List<CodeDuplicate> Duplicates { get; init; } = [];
    public List<string> SourceFiles { get; init; } = [];
}
public sealed class CodeQualitySnapshot
{
    public string Version { get; init; } = "1";
    public List<CodeQualityReport> Reports { get; init; } = [];
    [JsonIgnore]
    public long NormalizedBytes { get; set; }
}
public sealed record CodeRatio(string State, long? Numerator, long? Denominator, double? Percentage);
public sealed record CodeQualityTotals(CodeRatio Lines, CodeRatio Branches, CodeRatio Conditions, double? CodeLines,
    double? ClassComplexity, string DuplicationState, int? DuplicateBlocks, string FormulaVersion = "counts-v1");

/// <summary>Native producer metrics, bounded persistence and count-based aggregation.</summary>
public static class CodeQualityData
{
    /// <summary>Preserves each report's provenance; ambiguous aggregate condition identities are never silently merged.</summary>
    public static void AddReport(CodeQualitySnapshot target, ImportedReport imported, ReportDescriptor descriptor)
    {
        if (descriptor.Format is "jscpd" or "cloc" && string.IsNullOrWhiteSpace(descriptor.ToolVersion))
            throw new InvalidDataException("Code quality reports require a detector version.");
        if (imported.CodeData.ProducerVersion is { } version && version != descriptor.ToolVersion)
            throw new InvalidDataException("Code quality producer version does not match the manifest.");
        var data = imported.CodeData with { ReportId = descriptor.ReportId, Tool = descriptor.Tool, ToolVersion = descriptor.ToolVersion, Format = descriptor.Format };
        if (data.Branches.Count + data.Metrics.Count + data.Duplicates.Count + data.SourceFiles.Count == 0 && !data.DuplicationMeasured && !data.BranchesMeasured && !data.ConditionsMeasured && !data.SizeMeasured) return;
        if (target.Reports.Sum(x => (long)x.Branches.Count + x.Metrics.Count + x.Duplicates.Count + x.SourceFiles.Count) + data.Branches.Count + data.Metrics.Count + data.Duplicates.Count + data.SourceFiles.Count > 250_000)
            throw new InvalidDataException("Code quality metadata exceeds 250000 entries.");
        var bytes = Encoding.UTF8.GetByteCount(JsonSerializer.Serialize(data, ApiJson.Options));
        if (bytes > 50 * 1024 * 1024 - target.NormalizedBytes - 1024)
            throw new InvalidDataException("Code quality metadata exceeds 50 MiB.");
        target.NormalizedBytes += bytes + 1;
        target.Reports.Add(data);
    }

    /// <summary>Limits the normalized payload independently of the raw reports.</summary>
    public static string Serialize(CodeQualitySnapshot snapshot)
    {
        var value = JsonSerializer.Serialize(snapshot, ApiJson.Options);
        if (Encoding.UTF8.GetByteCount(value) > 50 * 1024 * 1024) throw new InvalidDataException("Code quality metadata exceeds 50 MiB.");
        return value;
    }

    /// <summary>Computes a file, directory or global scope from integer counts and immutable added lines.</summary>
    public static CodeQualityTotals Summarize(CodeQualitySnapshot data, IEnumerable<ImportedCoverage> coverage,
        string path = "", bool newCode = false, GitDiff? diff = null, bool coverageMeasured = true)
    {
        bool InPath(string candidate) => path.Length == 0 || candidate == path || candidate.StartsWith(path.TrimEnd('/') + "/", StringComparison.Ordinal);
        var added = (diff?.Files ?? []).ToDictionary(x => x.Path, x => x.AddedLines.ToHashSet(), StringComparer.Ordinal);
        bool InScope(string candidate, int line) => InPath(candidate) && (!newCode || added.TryGetValue(candidate, out var lines) && lines.Contains(line));
        var unavailable = newCode && diff?.State != "available";
        var coverageFiles = data.Reports.Where(r => r.Format is "lcov" or "cobertura").SelectMany(r => r.SourceFiles).ToHashSet(StringComparer.Ordinal);
        var missingChangedCoverage = newCode && added.Any(x => x.Value.Count > 0 && InPath(x.Key) && !coverageFiles.Contains(x.Key));
        var lineRows = coverage.Where(x => InScope(x.Path, x.Line)).GroupBy(x => (x.Path, x.Line)).Select(g => g.Any(x => x.Covered)).ToArray();
        var rows = data.Reports.SelectMany(r => r.Branches.Where(x => InScope(x.Path, x.Line)).Select(x => (Report: r, Branch: x))).ToArray();
        CodeRatio Branches(string kind)
        {
            var values = rows.Where(x => x.Branch.Kind == kind).ToArray();
            if (unavailable || !coverageMeasured) return new("unavailable", null, null, null);
            var measuredFiles = data.Reports.Where(x => kind == "branches" ? x.BranchesMeasured : x.ConditionsMeasured).SelectMany(x => x.SourceFiles).ToHashSet(StringComparer.Ordinal);
            if (newCode && added.Any(x => x.Value.Count > 0 && InPath(x.Key) && !measuredFiles.Contains(x.Key))) return new("unavailable", null, null, null);
            if (values.Length == 0) return data.Reports.Any(x => kind == "branches" ? x.BranchesMeasured : x.ConditionsMeasured)
                ? Ratio(0, 0) : new("not_measured", null, null, null);
            // ponytail: Cobertura gives counts without outcome identities; overlapping reports stay ambiguous instead of inventing a union.
            var groups = values.GroupBy(x => (x.Branch.Path, x.Branch.Line, x.Branch.Identity)).ToArray();
            if (values.GroupBy(x => (x.Branch.Path, x.Branch.Line)).Any(g => g.Select(x => (x.Report.Tool, x.Report.ToolVersion)).Distinct().Count() > 1)
                || groups.Any(g => g.Select(x => (x.Report.Tool, x.Report.ToolVersion)).Distinct().Count() > 1
                || kind == "conditions" && (g.Select(x => x.Report.ReportId).Distinct().Count() > 1 || g.Select(x => (x.Branch.Covered, x.Branch.Total)).Distinct().Count() > 1)))
                return new("ambiguous", null, null, null);
            return Ratio(groups.Sum(g => (long)g.Max(x => x.Branch.Covered)), groups.Sum(g => (long)g.Max(x => x.Branch.Total)));
        }
        double? Metric(string metric)
        {
            if (newCode) return null; // File/class metrics have no line-level allocation in their native reports.
            var values = data.Reports.SelectMany(r => r.Metrics.Where(m => m.Metric == metric && InPath(m.Path)).Select(m => (r.Tool, r.ToolVersion, Metric: m)))
                .GroupBy(x => (x.Metric.Path, x.Metric.Identity)).ToArray();
            if (values.Length == 0) return metric == "code_lines" && path.Length == 0 && data.Reports.Any(x => x.SizeMeasured) ? 0 : null;
            if (values.Any(g => g.Select(x => (x.Tool, x.ToolVersion, x.Metric.Value)).Distinct().Count() > 1)) return null;
            return values.Sum(g => g.First().Metric.Value);
        }
        var duplication = data.Reports.Where(x => x.DuplicationMeasured).ToArray();
        var duplicationAmbiguous = duplication.Select(r => (r.Tool, r.ToolVersion)).Distinct().Count() > 1;
        var duplicates = duplication.SelectMany(r => r.Duplicates).Where(d => InPath(d.First.Path) || InPath(d.Second.Path))
            .Where(d => !newCode || Intersects(d.First) || Intersects(d.Second)).Distinct().Count();
        bool Intersects(DuplicateLocation location) => InPath(location.Path) && added.TryGetValue(location.Path, out var lines) && lines.Any(l => l >= location.Start && l <= location.End);
        return new(unavailable || missingChangedCoverage || !coverageMeasured || path.Length > 0 && !coverageFiles.Any(InPath)
                ? new("unavailable", null, null, null) : Ratio(lineRows.LongCount(x => x), lineRows.LongLength),
            Branches("branches"), Branches("conditions"), Metric("code_lines"), Metric("class_complexity"),
            unavailable ? "unavailable" : duplicationAmbiguous ? "ambiguous" : duplication.Length == 0 ? "not_measured" : "measured", unavailable || duplicationAmbiguous || duplication.Length == 0 ? null : duplicates);
    }

    private static CodeRatio Ratio(long covered, long total) => total == 0 ? new("not_applicable", 0, 0, null) : new("measured", covered, total, 100d * covered / total);

    /// <summary>Imports native jscpd JSON and cloc --by-file --json; source fragments are discarded.</summary>
    public static void ImportJson(JsonElement root, string format, CodeQualityReport report, CancellationToken ct)
    {
        if (format.Equals("jscpd", StringComparison.OrdinalIgnoreCase))
        {
            if (!root.TryGetProperty("duplicates", out var duplicates) || duplicates.ValueKind != JsonValueKind.Array || duplicates.GetArrayLength() > 250_000)
                throw new InvalidDataException("Missing or oversized jscpd duplicates.");
            report.DuplicationMeasured = true;
            foreach (var item in duplicates.EnumerateArray())
            {
                ct.ThrowIfCancellationRequested();
                DuplicateLocation Location(string name)
                {
                    var location = item.GetProperty(name); var start = location.GetProperty("start").GetInt32(); var end = location.GetProperty("end").GetInt32();
                    if (start <= 0 || end < start) throw new InvalidDataException("Invalid duplicate range.");
                    return new(Path(location.GetProperty("name").GetString()!), start, end);
                }
                var lines = item.GetProperty("lines").GetInt32();
                int? tokens = item.TryGetProperty("tokens", out var token) ? token.GetInt32() : null;
                if (lines <= 0 || tokens is < 0) throw new InvalidDataException("Invalid duplicate dimensions.");
                var language = item.GetProperty("format").GetString();
                if (language is not { Length: > 0 and <= 100 }) throw new InvalidDataException("Invalid duplicate language.");
                var first = Location("firstFile"); var second = Location("secondFile");
                if (string.CompareOrdinal(first.Path, second.Path) > 0 || first.Path == second.Path && first.Start > second.Start) (first, second) = (second, first);
                report.Duplicates.Add(new(first, second, language, lines, tokens));
            }
        }
        else
        {
            if (!root.TryGetProperty("header", out var header) || !header.TryGetProperty("cloc_version", out _)) throw new InvalidDataException("Missing cloc header.");
            var version = header.GetProperty("cloc_version");
            report.ProducerVersion = version.ValueKind == JsonValueKind.String ? version.GetString() : version.GetRawText();
            if (report.ProducerVersion is not { Length: > 0 and <= 100 }) throw new InvalidDataException("Invalid cloc version.");
            report.SizeMeasured = true;
            foreach (var file in root.EnumerateObject().Where(x => x.Name is not ("header" or "SUM")))
            {
                ct.ThrowIfCancellationRequested();
                if (report.Metrics.Count >= 250_000) throw new InvalidDataException("Too many cloc files.");
                if (!file.Value.TryGetProperty("language", out _)) throw new InvalidDataException("cloc requires --by-file output.");
                var count = file.Value.GetProperty("code").GetInt64();
                if (count < 0) throw new InvalidDataException("Invalid cloc code count.");
                var path = Path(file.Name);
                report.Metrics.Add(new(path, "code_lines", count, "file"));
            }
        }
    }

    private static string Path(string value)
    {
        var path = value.Replace('\\', '/');
        while (path.StartsWith("./", StringComparison.Ordinal)) path = path[2..];
        if (path.Length is 0 or > 4096 || path.StartsWith('/') || path.Contains(':') || path.Any(char.IsControl) || path.Split('/').Any(p => p is ".." or ""))
            throw new InvalidDataException("Expected repository-relative code quality path.");
        return path;
    }
}
