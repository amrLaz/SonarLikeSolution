namespace CodeInsights.Api.Services;

/// <summary>Analysis and AI settings bound from the Analysis configuration section.</summary>
public sealed class AnalysisOptions
{
    public string Enforcement { get; set; } = "informative";
    public string AzureOpenAiEndpoint { get; set; } = "";
    public string AzureOpenAiApiKey { get; set; } = "";
    public string AzureOpenAiDeployment { get; set; } = "gpt-4o-mini";
    public string AzureOpenAiApiVersion { get; set; } = "2024-02-15-preview";
    public string AnthropicApiKey { get; set; } = "";
}
