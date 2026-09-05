using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using CodeInsights.Api.Contracts;
using CodeInsights.Api.Data;

namespace CodeInsights.Api.Services;

/// <summary>Versioned producer metadata and native configuration exports; never executes analyzers.</summary>
public static class ExecutableProfiles
{
    private static bool Identifier(string? value, int maximum = 200) => !string.IsNullOrWhiteSpace(value) && value.Length <= maximum && !value.Any(char.IsControl);
    private static bool Https(string? value) => Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.Scheme == "https" && uri.UserInfo.Length == 0;
    public static void Validate(ProfileDefinition profile)
    {
        if (profile.RuleCatalog is null || profile.AnalyzerConfigurations is null || profile.RuleCatalog.Length > 10000 || profile.AnalyzerConfigurations.Length > 100)
            throw new ApiException(422, "Invalid rule catalogue or analyzer configurations");
        foreach (var rule in profile.RuleCatalog)
            if (rule is null || !Identifier(rule.Tool, 100) || !Identifier(rule.ToolVersion, 100) || !Identifier(rule.RuleId) || !Identifier(rule.Language, 100)
                || rule.Category is not ("bug" or "code_smell" or "vulnerability" or "security_hotspot" or "secret" or "unknown")
                || rule.Parameters.ValueKind != JsonValueKind.Object || rule.Parameters.GetRawText().Length > 16000
                || rule.DocumentationUrl is not null && !Https(rule.DocumentationUrl)
                || rule.DocumentationVersion is not null && !Identifier(rule.DocumentationVersion)
                || rule.Remediation is { } remediation && (remediation.Model != "constant" || remediation.DurationSeconds is <= 0 or > 31536000 || !Https(remediation.DocumentationUrl)))
                throw new ApiException(422, "Rule catalogue requires producer/version, rule, language, parameters, category and safe producer documentation");
        if (profile.RuleCatalog.Select(x => (x.Tool, x.ToolVersion, x.RuleId)).Distinct().Count() != profile.RuleCatalog.Length)
            throw new ApiException(422, "Duplicate producer rule in catalogue");
        long size = 0;
        foreach (var config in profile.AnalyzerConfigurations)
        {
            if (config is null || !Identifier(config.Tool, 100) || !Identifier(config.ToolVersion, 100) || !IngestionValidation.SafePath(config.Path)
                || config.Content is null || (size += Encoding.UTF8.GetByteCount(config.Content)) > 1024 * 1024 || config.Content.Contains('\0'))
                throw new ApiException(422, "Invalid or oversized analyzer configuration");
            ValidateNative(config);
        }
        if (profile.AnalyzerConfigurations.Select(x => x.Path).Distinct(StringComparer.OrdinalIgnoreCase).Count() != profile.AnalyzerConfigurations.Length)
            throw new ApiException(422, "Configuration export paths must be unique on Windows and Linux");
    }

    private static void ValidateNative(AnalyzerConfiguration config)
    {
        if (config.Format == "editorconfig")
        {
            if (!config.Path.EndsWith(".editorconfig", StringComparison.Ordinal) || !config.Content.Split('\n').Any(line => line.TrimStart().StartsWith('[')))
                throw new ApiException(422, "EditorConfig requires an .editorconfig path and a file section");
            return;
        }
        try
        {
            using var document = JsonDocument.Parse(config.Content);
            var root = document.RootElement;
            if (config.Format == "semgrep-json" && config.Tool == "semgrep" && config.Path.EndsWith(".json", StringComparison.Ordinal)
                && root.ValueKind == JsonValueKind.Object && root.TryGetProperty("rules", out var rules) && rules.ValueKind == JsonValueKind.Array
                && rules.EnumerateArray().All(rule => rule.ValueKind == JsonValueKind.Object && rule.TryGetProperty("id", out var id) && id.ValueKind == JsonValueKind.String
                    && rule.TryGetProperty("languages", out var languages) && languages.ValueKind == JsonValueKind.Array
                    && rule.TryGetProperty("message", out var message) && message.ValueKind == JsonValueKind.String
                    && rule.TryGetProperty("severity", out var severity) && severity.ValueKind == JsonValueKind.String)) return;
            // ponytail: JSON-only flat ESLint core rules; plugins/parsers require native repository config, not executable code uploaded to this service.
            if (config.Format == "eslint-flat-json" && config.Tool == "eslint" && config.Path.EndsWith(".cjs", StringComparison.Ordinal)
                && root.ValueKind == JsonValueKind.Array && root.EnumerateArray().All(item => item.ValueKind == JsonValueKind.Object
                    && item.EnumerateObject().All(property => property.Name is "name" or "files" or "ignores" or "languageOptions" or "linterOptions" or "rules" or "settings"))) return;
        }
        catch (JsonException) { }
        throw new ApiException(422, "Supported native exports: editorconfig, semgrep-json and eslint-flat-json (core rules)");
    }

    public static ConfigurationExport Export(ProfileDefinition profile)
    {
        var files = profile.AnalyzerConfigurations.Select(config =>
        {
            var content = config.Format == "eslint-flat-json" ? "module.exports = " + config.Content + ";\n" : config.Content;
            return new ExportedConfiguration(config.Tool, config.ToolVersion, config.Format, config.Path, content, Hash(content));
        }).OrderBy(file => file.Path, StringComparer.Ordinal).ToArray();
        return new(profile.ProfileId, profile.Version, Fingerprint(files.Select(file => new EffectiveConfiguration(file.Tool, file.ToolVersion, file.Path, file.Sha256))), files);
    }

    public static void Validate(IngestionManifest manifest)
    {
        if (manifest.EffectiveConfigurations is null || manifest.EffectiveConfigurations.Length > 100 || manifest.EffectiveConfigurations.Any(file => file is null
            || !Identifier(file.Tool, 100) || !Identifier(file.ToolVersion, 100) || !IngestionValidation.SafePath(file.Path)
            || file.Sha256 is not { Length: 64 } || !file.Sha256.All(Uri.IsHexDigit))
            || manifest.EffectiveConfigurations.Select(file => file.Path).Distinct(StringComparer.OrdinalIgnoreCase).Count() != manifest.EffectiveConfigurations.Length)
            throw new ApiException(422, "Invalid effective analyzer configuration evidence");
    }

    public static ConfigurationEvaluation Evaluate(ProfileDefinition profile, IngestionManifest manifest)
    {
        var expected = Export(profile);
        var effectiveHash = Fingerprint(manifest.EffectiveConfigurations);
        if (expected.Files.Length == 0) return new("not_configured", expected.ConfigurationHash, effectiveHash, "no_executable_configuration");
        if (manifest.EffectiveConfigurations.Length == 0) return new("missing", expected.ConfigurationHash, effectiveHash, "effective_configuration_missing");
        if (expected.Files.Any(file => !manifest.Reports.Any(report => report.Tool == file.Tool && report.State == "measured")))
            return new("missing", expected.ConfigurationHash, effectiveHash, "configured_analyzer_report_missing");
        var versionDrift = expected.Files.Any(file => manifest.Reports.Any(report => report.Tool == file.Tool && report.State == "measured" && report.ToolVersion != file.ToolVersion));
        return expected.ConfigurationHash == effectiveHash && !versionDrift ? new("matched", expected.ConfigurationHash, effectiveHash, null)
            : new("drift", expected.ConfigurationHash, effectiveHash, versionDrift ? "analyzer_version_drift" : "configuration_hash_drift");
    }

    public static string Fingerprint(IEnumerable<EffectiveConfiguration> configurations) => Hash(string.Concat(configurations.OrderBy(x => x.Path, StringComparer.Ordinal)
        .Select(file => $"{file.Tool}\n{file.ToolVersion}\n{file.Path}\n{file.Sha256.ToLowerInvariant()}\n")));
    private static string Hash(string value) => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
    public static string RuleKey(CatalogueRule rule) => JsonSerializer.Serialize(new[] { rule.Tool, rule.ToolVersion, rule.RuleId });

    public static object EstimateRemediation(ProfileDefinition profile, IEnumerable<FindingOccurrence> findings, IngestionManifest manifest)
    {
        var rules = profile.RuleCatalog.ToDictionary(rule => (rule.Tool, rule.ToolVersion, rule.RuleId));
        var versions = manifest.Reports.ToDictionary(report => report.ReportId, report => report.ToolVersion);
        long seconds = 0; var modeled = 0; var unmodeled = 0;
        var sources = new HashSet<string>(StringComparer.Ordinal);
        foreach (var finding in findings)
        {
            if (rules.GetValueOrDefault((finding.Tool, versions.GetValueOrDefault(finding.ReportId, ""), finding.RuleId))?.Remediation is { } model)
            { seconds += model.DurationSeconds; modeled++; sources.Add(model.DocumentationUrl); }
            else unmodeled++;
        }
        return new { state = modeled == 0 ? "not_measured" : unmodeled > 0 ? "partial" : "estimated", estimated_seconds = modeled == 0 ? (long?)null : seconds,
            modeled_findings = modeled, unmodeled_findings = unmodeled, model = "producer_constant_seconds/v1", profile_id = profile.ProfileId, profile_version = profile.Version,
            documentation_sources = sources.OrderBy(source => source, StringComparer.Ordinal).ToArray(), scope = "global" };
    }

    public static object Diff(ProfileDefinition before, ProfileDefinition after)
    {
        var left = before.RuleCatalog.ToDictionary(RuleKey);
        var right = after.RuleCatalog.ToDictionary(RuleKey);
        return new { from_version = before.Version, to_version = after.Version, added_rules = right.Keys.Except(left.Keys).ToArray(), removed_rules = left.Keys.Except(right.Keys).ToArray(),
            changed_rules = right.Keys.Intersect(left.Keys).Where(key => JsonSerializer.Serialize(left[key], ApiJson.Options) != JsonSerializer.Serialize(right[key], ApiJson.Options)).ToArray(),
            before_configuration_hash = Export(before).ConfigurationHash, after_configuration_hash = Export(after).ConfigurationHash,
            before_conditions = before.Conditions, after_conditions = after.Conditions, before_required_tools = before.RequiredTools, after_required_tools = after.RequiredTools };
    }
}
