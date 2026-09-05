using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace CodeInsights.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class DurableIngestion : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "coverage_lines",
                columns: table => new
                {
                    ingestion_id = table.Column<string>(type: "text", nullable: false),
                    path = table.Column<string>(type: "text", nullable: false),
                    line = table.Column<int>(type: "integer", nullable: false),
                    covered = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_coverage_lines", x => new { x.ingestion_id, x.path, x.line });
                });

            migrationBuilder.CreateTable(
                name: "durable_jobs",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    kind = table.Column<string>(type: "text", nullable: false),
                    resource_id = table.Column<string>(type: "text", nullable: false),
                    state = table.Column<string>(type: "text", nullable: false),
                    attempts = table.Column<int>(type: "integer", nullable: false),
                    available_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    lease_until = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    lease_owner = table.Column<string>(type: "text", nullable: true),
                    error = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_durable_jobs", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "finding_occurrences",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ingestion_id = table.Column<string>(type: "text", nullable: false),
                    analysis_id = table.Column<string>(type: "text", nullable: false),
                    report_id = table.Column<string>(type: "text", nullable: false),
                    tool = table.Column<string>(type: "text", nullable: false),
                    rule_id = table.Column<string>(type: "text", nullable: false),
                    severity = table.Column<string>(type: "text", nullable: false),
                    original_severity = table.Column<string>(type: "text", nullable: false),
                    category = table.Column<string>(type: "text", nullable: false),
                    message = table.Column<string>(type: "text", nullable: false),
                    path = table.Column<string>(type: "text", nullable: true),
                    line = table.Column<int>(type: "integer", nullable: true),
                    fingerprint = table.Column<string>(type: "text", nullable: true),
                    excepted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_finding_occurrences", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "ingestion_project_policies",
                columns: table => new
                {
                    project_key = table.Column<string>(type: "text", nullable: false),
                    profile_id = table.Column<string>(type: "text", nullable: false),
                    profile_version = table.Column<string>(type: "text", nullable: false),
                    enforcement = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ingestion_project_policies", x => x.project_key);
                });

            migrationBuilder.CreateTable(
                name: "ingestions",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    analysis_id = table.Column<string>(type: "text", nullable: false),
                    project_key = table.Column<string>(type: "text", nullable: false),
                    build_key = table.Column<string>(type: "text", nullable: false),
                    manifest_hash = table.Column<string>(type: "text", nullable: false),
                    manifest = table.Column<string>(type: "text", nullable: false),
                    profile_snapshot = table.Column<string>(type: "text", nullable: false),
                    revision = table.Column<int>(type: "integer", nullable: false),
                    state = table.Column<string>(type: "text", nullable: false),
                    technical_state = table.Column<string>(type: "text", nullable: false),
                    quality_gate = table.Column<string>(type: "text", nullable: false),
                    error = table.Column<string>(type: "text", nullable: false),
                    gate_snapshot = table.Column<string>(type: "text", nullable: false),
                    comparison = table.Column<string>(type: "text", nullable: false),
                    details_purged = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    completed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ingestions", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "profile_exceptions",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    project_key = table.Column<string>(type: "text", nullable: false),
                    tool = table.Column<string>(type: "text", nullable: false),
                    rule_id = table.Column<string>(type: "text", nullable: false),
                    path = table.Column<string>(type: "text", nullable: true),
                    reason = table.Column<string>(type: "text", nullable: false),
                    expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_profile_exceptions", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "profile_versions",
                columns: table => new
                {
                    profile_id = table.Column<string>(type: "text", nullable: false),
                    version = table.Column<string>(type: "text", nullable: false),
                    definition = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_profile_versions", x => new { x.profile_id, x.version });
                });

            migrationBuilder.CreateTable(
                name: "sbom_components",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ingestion_id = table.Column<string>(type: "text", nullable: false),
                    analysis_id = table.Column<string>(type: "text", nullable: false),
                    report_id = table.Column<string>(type: "text", nullable: false),
                    reference = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    version = table.Column<string>(type: "text", nullable: true),
                    purl = table.Column<string>(type: "text", nullable: true),
                    ecosystem = table.Column<string>(type: "text", nullable: true),
                    licenses = table.Column<string>(type: "text", nullable: false),
                    relationship = table.Column<string>(type: "text", nullable: false),
                    license_decision = table.Column<string>(type: "text", nullable: false),
                    vulnerabilities = table.Column<string>(type: "text", nullable: false),
                    dependencies = table.Column<string>(type: "text", nullable: false),
                    source = table.Column<string>(type: "text", nullable: false),
                    observed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_sbom_components", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "ingestion_reports",
                columns: table => new
                {
                    ingestion_id = table.Column<string>(type: "text", nullable: false),
                    report_id = table.Column<string>(type: "text", nullable: false),
                    blob_name = table.Column<string>(type: "text", nullable: false),
                    sha256 = table.Column<string>(type: "text", nullable: false),
                    size_bytes = table.Column<long>(type: "bigint", nullable: false),
                    state = table.Column<string>(type: "text", nullable: false),
                    error = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ingestion_reports", x => new { x.ingestion_id, x.report_id });
                    table.ForeignKey(
                        name: "FK_ingestion_reports_ingestions_ingestion_id",
                        column: x => x.ingestion_id,
                        principalTable: "ingestions",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_durable_jobs_kind_resource_id",
                table: "durable_jobs",
                columns: new[] { "kind", "resource_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_durable_jobs_state_available_at",
                table: "durable_jobs",
                columns: new[] { "state", "available_at" });

            migrationBuilder.CreateIndex(
                name: "IX_finding_occurrences_analysis_id_tool_rule_id",
                table: "finding_occurrences",
                columns: new[] { "analysis_id", "tool", "rule_id" });

            migrationBuilder.CreateIndex(
                name: "IX_finding_occurrences_ingestion_id_id",
                table: "finding_occurrences",
                columns: new[] { "ingestion_id", "id" });

            migrationBuilder.CreateIndex(
                name: "IX_ingestions_analysis_id_revision",
                table: "ingestions",
                columns: new[] { "analysis_id", "revision" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ingestions_build_key_manifest_hash",
                table: "ingestions",
                columns: new[] { "build_key", "manifest_hash" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ingestions_project_key_created_at",
                table: "ingestions",
                columns: new[] { "project_key", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_profile_exceptions_project_key_expires_at",
                table: "profile_exceptions",
                columns: new[] { "project_key", "expires_at" });

            migrationBuilder.CreateIndex(
                name: "IX_sbom_components_ingestion_id_id",
                table: "sbom_components",
                columns: new[] { "ingestion_id", "id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "coverage_lines");

            migrationBuilder.DropTable(
                name: "durable_jobs");

            migrationBuilder.DropTable(
                name: "finding_occurrences");

            migrationBuilder.DropTable(
                name: "ingestion_project_policies");

            migrationBuilder.DropTable(
                name: "ingestion_reports");

            migrationBuilder.DropTable(
                name: "profile_exceptions");

            migrationBuilder.DropTable(
                name: "profile_versions");

            migrationBuilder.DropTable(
                name: "sbom_components");

            migrationBuilder.DropTable(
                name: "ingestions");
        }
    }
}
