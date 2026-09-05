await AuthChecks.RunAsync();

AnalysisChecks.Run();
await AnalysisChecks.RunExternalAsync();
await NotificationChecks.RunAsync();

if (Environment.GetEnvironmentVariable("CODEINSIGHTS_TEST_URL") is { Length: > 0 } url)
    await HttpChecks.RunAsync(url);
Console.WriteLine("API checks passed.");


