await AuthChecks.RunAsync();

AnalysisChecks.Run();
ExecutableProfileChecks.Run();
await SecurityReviewChecks.RunAsync();
await CodeScopeChecks.RunAsync();
await CollaborationChecks.RunAsync();
await ReportImportChecks.RunAsync(); // Includes CodeQualityChecks once.
await IngestionAdoChecks.RunAsync();
IngestionComparisonChecks.Run();
NewCodeGateChecks.Run();
await IngestionChecks.RunAsync();
await AnalysisChecks.RunExternalAsync();
await NotificationChecks.RunAsync();

if (Environment.GetEnvironmentVariable("CODEINSIGHTS_TEST_URL") is { Length: > 0 } url)
    await HttpChecks.RunAsync(url);
Console.WriteLine("API checks passed.");


