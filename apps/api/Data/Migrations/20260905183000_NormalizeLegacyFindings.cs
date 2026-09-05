using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace CodeInsights.Api.Data.Migrations;

[DbContext(typeof(AppDbContext))]
[Migration("20260905183000_NormalizeLegacyFindings")]
public sealed class NormalizeLegacyFindings : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
        INSERT INTO finding_occurrences (ingestion_id,analysis_id,report_id,tool,rule_id,severity,original_severity,category,message,path,line,excepted)
        SELECT '',a.analysis_id,'',COALESCE(issue->>'tool',''),COALESCE(issue->>'rule_id',issue->>'rule',''),
          COALESCE(issue->>'severity','unknown'),COALESCE(issue->>'severity','unknown'),COALESCE(issue->>'category','unknown'),
          COALESCE(issue->>'message',''),files.key,
          CASE WHEN issue->>'line' ~ '^[1-9][0-9]{0,8}$' THEN (issue->>'line')::integer ELSE NULL END,false
        FROM analysis_records a
        CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(a.affected_files::jsonb)='object' THEN a.affected_files::jsonb ELSE '{}'::jsonb END) files
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(files.value)='array' THEN files.value ELSE '[]'::jsonb END) issue
        WHERE jsonb_typeof(issue)='object'
          AND NOT EXISTS (SELECT 1 FROM finding_occurrences f WHERE f.analysis_id=a.analysis_id)
          AND NOT EXISTS (SELECT 1 FROM ingestions i WHERE i.analysis_id=a.analysis_id);
        CREATE INDEX IF NOT EXISTS ix_analysis_summary ON analysis_records (project_key, branch, created_at DESC, analysis_id DESC);
        """);
    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("DROP INDEX IF EXISTS ix_analysis_summary;");
}
