using System.Globalization;
using System.Text;
using CodeInsights.Api.Contracts;
using CodeInsights.Api.Data;
using MigraDoc.DocumentObjectModel;
using MigraDoc.DocumentObjectModel.Tables;
using MigraDoc.Rendering;

namespace CodeInsights.Api.Services;

public static class ExportService
{
    private static string CsvField(object? value)
    {
        var text = value switch
        {
            null => "",
            IFormattable formattable => formattable.ToString(null, CultureInfo.InvariantCulture),
            _ => value.ToString() ?? "",
        };
        return text.IndexOfAny([',', '"', '\r', '\n']) >= 0 ? '"' + text.Replace("\"", "\"\"") + '"' : text;
    }

    public static byte[] Csv(IEnumerable<AnalysisRecord> records)
    {
        var output = new StringBuilder();
        void Row(IEnumerable<object?> fields) =>
            output
                .Append(
                    string.Join(
                        ',',
                        fields.Select(x =>
                        {
                            return CsvField(x);
                        })
                    )
                )
                .Append("\r\n");
        Row([
            "analysis_id",
            "project_key",
            "branch",
            "commit_sha",
            "ci_provider",
            "quality_gate",
            "created_at",
            "security_score",
            "maintainability_score",
            "reliability_score",
            "vulnerabilities",
            "security_hotspots",
            "bugs",
            "code_smells",
            "coverage",
            "duplication",
            "dependency_vulnerabilities",
            "gate_failures",
            "completeness",
            "profile_id",
            "profile_version",
            "formula_version",
            "gate_snapshot",
        ]);
        foreach (var r in records)
            Row([
                r.AnalysisId,
                r.ProjectKey,
                r.Branch,
                r.CommitSha,
                r.CiProvider,
                r.QualityGate,
                r.CreatedAt,
                r.SecurityScore,
                r.MaintainabilityScore,
                r.ReliabilityScore,
                r.Vulnerabilities,
                r.SecurityHotspots,
                r.Bugs,
                r.CodeSmells,
                r.Coverage,
                r.Duplication,
                r.DependencyVulnerabilities,
                string.Join("; ", GateEvaluation.Parse<List<string>>(r.GateFailures, [])),
                r.Completeness,
                r.ProfileId,
                r.ProfileVersion,
                r.FormulaVersion,
                r.GateSnapshot,
            ]);
        return Encoding.UTF8.GetBytes(output.ToString());
    }

    public static byte[] FindingsCsv(IEnumerable<FindingOccurrence> findings, IngestionManifest? manifest)
    {
        var output = new StringBuilder("id,finding_id,tool,tool_version,rule_id,severity,original_severity,category,path,line,message,excepted\r\n");
        foreach (var finding in findings)
        {
            var version = manifest?.Reports.FirstOrDefault(report => report.ReportId == finding.ReportId)?.ToolVersion;
            output.AppendJoin(',', new object?[] { finding.Id, finding.FindingId, finding.Tool, version, finding.RuleId, finding.Severity,
                finding.OriginalSeverity, finding.Category, finding.Path, finding.Line, finding.Message, finding.Excepted }.Select(CsvField)).Append("\r\n");
        }
        return Encoding.UTF8.GetBytes(output.ToString());
    }

    public static byte[] FindingsPdf(AnalysisRecord analysis, IReadOnlyCollection<FindingOccurrence> findings, IngestionManifest? manifest)
    {
        ExportFontResolver.Initialize();
        var doc = new Document();
        doc.Info.Title = "CodeInsights filtered issues";
        doc.Styles["Normal"]!.Font.Name = "DejaVu Sans";
        doc.Styles["Normal"]!.Font.Size = 8;
        var section = doc.AddSection();
        section.PageSetup.Orientation = Orientation.Landscape;
        section.PageSetup.LeftMargin = Unit.FromMillimeter(10);
        section.PageSetup.RightMargin = Unit.FromMillimeter(10);
        var title = section.AddParagraph("Filtered issues");
        title.Format.Font.Size = 16;
        title.Format.Font.Bold = true;
        section.AddParagraph($"{analysis.ProjectKey} · {analysis.Branch} · {analysis.CommitSha} · {findings.Count} issue(s)");
        var table = section.AddTable();
        foreach (var width in new[] { 22, 24, 26, 22, 42, 18, 70 }) table.AddColumn(Unit.FromMillimeter(width));
        var header = table.AddRow();
        header.HeadingFormat = true;
        header.Format.Font.Bold = true;
        header.Shading.Color = Color.FromRgb(15, 118, 110);
        header.Format.Font.Color = Colors.White;
        foreach (var (cell, label) in header.Cells.Cast<Cell>().Zip(new[] { "Tool", "Version", "Rule", "Severity", "Location", "Category", "Message" })) cell.AddParagraph(label);
        foreach (var finding in findings)
        {
            var row = table.AddRow();
            var version = manifest?.Reports.FirstOrDefault(report => report.ReportId == finding.ReportId)?.ToolVersion ?? "";
            var values = new[] { finding.Tool, version, finding.RuleId, finding.Severity, finding.Path is null ? "" : $"{finding.Path}:{finding.Line}", finding.Category, finding.Message };
            foreach (var (cell, value) in row.Cells.Cast<Cell>().Zip(values)) cell.AddParagraph(value);
        }
        var renderer = new PdfDocumentRenderer { Document = doc };
        renderer.RenderDocument();
        using var stream = new MemoryStream();
        renderer.PdfDocument.Save(stream, false);
        return stream.ToArray();
    }

    public static byte[] Pdf(AnalysisRecord record)
    {
        ExportFontResolver.Initialize();
        var response = GateEvaluation.ToResponse(record);
        var generated = DateTime.UtcNow.ToString(
            "yyyy-MM-dd HH:mm 'UTC'",
            CultureInfo.InvariantCulture
        );
        var doc = new Document();
        doc.Info.Title = "Security Analysis Report";
        doc.Styles["Normal"]!.Font.Name = "DejaVu Sans";
        doc.Styles["Normal"]!.Font.Size = 10;
        var section = doc.AddSection();
        section.PageSetup.TopMargin = Unit.FromMillimeter(20);
        section.PageSetup.BottomMargin = Unit.FromMillimeter(20);
        section.PageSetup.LeftMargin = Unit.FromMillimeter(20);
        section.PageSetup.RightMargin = Unit.FromMillimeter(20);
        Color teal = Color.FromRgb(15, 118, 110),
            green = Color.FromRgb(46, 125, 50),
            red = Color.FromRgb(198, 40, 40),
            amber = Color.FromRgb(156, 103, 0);
        void Heading(string text, int size = 11)
        {
            var p = section.AddParagraph(text);
            p.Format.Font.Size = size;
            p.Format.Font.Bold = true;
            p.Format.SpaceBefore = Unit.FromMillimeter(4);
            p.Format.SpaceAfter = Unit.FromMillimeter(2);
        }
        var title = section.AddParagraph("CodeInsights");
        title.Format.Font.Size = 20;
        title.Format.Font.Bold = true;
        title.Format.Font.Color = teal;
        section.AddParagraph("Security Analysis Report");
        Heading("Analysis Details");
        var metadata = section.AddTable();
        metadata.AddColumn(Unit.FromMillimeter(55));
        metadata.AddColumn(Unit.FromMillimeter(115));
        (string, string)[] values =
        [
            ("Project", record.ProjectKey),
            ("Branch", record.Branch),
            (
                "Commit",
                record.CommitSha[..Math.Min(12, record.CommitSha.Length)]
                    + (record.CommitSha.Length > 12 ? "..." : "")
            ),
            ("CI Provider", record.CiProvider),
            ("Completeness", response.Completeness),
            ("Profile", $"{response.ProfileId}/{response.ProfileVersion}"),
            ("Formula", response.FormulaVersion),
            ("Analysis ID", record.AnalysisId),
            (
                "Analysed at",
                record.CreatedAt[..Math.Min(19, record.CreatedAt.Length)].Replace('T', ' ') + " UTC"
            ),
            ("Report generated", generated),
        ];
        foreach (var (label, value) in values)
        {
            var row = metadata.AddRow();
            row.Cells[0].AddParagraph(label + ":");
            row.Cells[1].AddParagraph(value);
            if (metadata.Rows.Count % 2 == 1)
                row.Shading.Color = Color.FromRgb(248, 248, 248);
        }
        Heading("Quality Gate");
        var gate = section.AddParagraph(
            record.QualityGate switch
            {
                "pass" => "PASSED",
                "fail" => "FAILED",
                _ => "UNKNOWN",
            }
        );
        gate.Format.Alignment = ParagraphAlignment.Center;
        gate.Format.Font.Bold = true;
        gate.Format.Font.Size = 16;
        gate.Format.Font.Color =
            record.QualityGate == "pass" ? green
            : record.QualityGate == "fail" ? red
            : amber;
        gate.Format.Shading.Color =
            record.QualityGate == "pass" ? Color.FromRgb(232, 245, 233)
            : record.QualityGate == "fail" ? Color.FromRgb(255, 235, 238)
            : Color.FromRgb(255, 248, 225);
        if (response.GateFailures.Count > 0)
        {
            Heading("Blocking conditions:", 10);
            foreach (var failure in response.GateFailures)
            {
                var p = section.AddParagraph("- " + failure);
                p.Format.Font.Color = red;
            }
        }
        Heading("Metrics");
        var table = section.AddTable();
        table.AddColumn(Unit.FromMillimeter(80));
        table.AddColumn(Unit.FromMillimeter(40));
        table.AddColumn(Unit.FromMillimeter(40));
        var header = table.AddRow();
        header.HeadingFormat = true;
        header.Shading.Color = teal;
        header.Format.Font.Color = Colors.White;
        header.Format.Font.Bold = true;
        header.Cells[0].AddParagraph("Metric");
        header.Cells[1].AddParagraph("Value");
        header.Cells[2].AddParagraph("Status");
        string[] labels =
        [
            "Security Score",
            "Maintainability Score",
            "Reliability Score",
            "Vulnerabilities",
            "Security Hotspots",
            "Bugs",
            "Code Smells",
        ];
        var conditions =
            response.GateSnapshot.TryGetValue("conditions", out var raw)
            && raw.ValueKind == System.Text.Json.JsonValueKind.Array
                ? raw.EnumerateArray().ToDictionary(x => AnalysisFindings.Text(x, "metric"))
                : [];
        string[] metricNames =
        [
            "security_score",
            "maintainability_score",
            "reliability_score",
            "vulnerabilities",
            "security_hotspots",
            "bugs",
            "code_smells",
        ];
        for (var i = 0; i < metricNames.Length; i++)
        {
            var name = metricNames[i];
            conditions.TryGetValue(name, out var condition);
            response.Measurements.TryGetValue(name, out var measurement);
            var state = AnalysisFindings.Text(
                condition,
                "state",
                measurement?.State ?? "not_measured"
            );
            var result = AnalysisFindings.Text(condition, "result", "unknown");
            var display =
                state == "measured"
                    ? AnalysisFindings.Text(condition, "value", state.Replace('_', ' '))
                    : state.Replace('_', ' ');
            var row = table.AddRow();
            row.Cells[0].AddParagraph(labels[i]);
            row.Cells[1].AddParagraph(display);
            row.Cells[2]
                .AddParagraph(
                    result == "pass" ? "OK"
                    : result == "fail" ? "Failed"
                    : "Unknown"
                );
            row.Cells[2].Format.Font.Color =
                result == "pass" ? green
                : result == "fail" ? red
                : amber;
            if (i % 2 == 0)
                row.Shading.Color = Color.FromRgb(248, 248, 248);
        }
        var footer = section.AddParagraph(
            $"Generated by CodeInsights on {generated}\nThis report is confidential. Do not distribute outside your organisation."
        );
        footer.Format.SpaceBefore = Unit.FromMillimeter(8);
        footer.Format.Alignment = ParagraphAlignment.Center;
        footer.Format.Font.Size = 8;
        footer.Format.Font.Italic = true;
        footer.Format.Font.Color = Color.FromRgb(150, 150, 150);
        var renderer = new PdfDocumentRenderer { Document = doc };
        renderer.RenderDocument();
        using var stream = new MemoryStream();
        renderer.PdfDocument.Save(stream, false);
        return stream.ToArray();
    }
}
