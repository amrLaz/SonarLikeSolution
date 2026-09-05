using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CodeInsights.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class CodeQualityScopesAndReviews : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "code_data",
                table: "ingestions",
                type: "text",
                nullable: false,
                defaultValue: "{}");

            migrationBuilder.AddColumn<string>(
                name: "code_scope_snapshot",
                table: "ingestions",
                type: "text",
                nullable: false,
                defaultValue: "{}");

            migrationBuilder.AddColumn<string>(
                name: "security_review_snapshot",
                table: "ingestions",
                type: "text",
                nullable: false,
                defaultValue: "[]");

            migrationBuilder.CreateTable(
                name: "archived_code_branches",
                columns: table => new
                {
                    project_key = table.Column<string>(type: "text", nullable: false),
                    branch = table.Column<string>(type: "text", nullable: false),
                    archived = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_archived_code_branches", x => new { x.project_key, x.branch });
                });

            migrationBuilder.CreateTable(
                name: "code_scope_assignments",
                columns: table => new
                {
                    project_key = table.Column<string>(type: "text", nullable: false),
                    version = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_code_scope_assignments", x => x.project_key);
                });

            migrationBuilder.CreateTable(
                name: "code_scope_versions",
                columns: table => new
                {
                    project_key = table.Column<string>(type: "text", nullable: false),
                    version = table.Column<string>(type: "text", nullable: false),
                    definition = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_code_scope_versions", x => new { x.project_key, x.version });
                });

            migrationBuilder.CreateTable(
                name: "finding_identity_matches",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    project_key = table.Column<string>(type: "text", nullable: false),
                    branch = table.Column<string>(type: "text", nullable: false),
                    analysis_id = table.Column<string>(type: "text", nullable: false),
                    ingestion_id = table.Column<string>(type: "text", nullable: false),
                    occurrence_identity = table.Column<string>(type: "text", nullable: false),
                    finding_id = table.Column<string>(type: "text", nullable: true),
                    method = table.Column<string>(type: "text", nullable: false),
                    base_sha = table.Column<string>(type: "text", nullable: false),
                    head_sha = table.Column<string>(type: "text", nullable: false),
                    old_path = table.Column<string>(type: "text", nullable: true),
                    old_line = table.Column<int>(type: "integer", nullable: true),
                    path = table.Column<string>(type: "text", nullable: true),
                    line = table.Column<int>(type: "integer", nullable: true),
                    evidence_hash = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_finding_identity_matches", x => x.id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_finding_identity_matches_finding_id_created_at",
                table: "finding_identity_matches",
                columns: new[] { "finding_id", "created_at" });

            migrationBuilder.CreateIndex(
                name: "IX_finding_identity_matches_project_key_branch_occurrence_iden~",
                table: "finding_identity_matches",
                columns: new[] { "project_key", "branch", "occurrence_identity", "created_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "archived_code_branches");

            migrationBuilder.DropTable(
                name: "code_scope_assignments");

            migrationBuilder.DropTable(
                name: "code_scope_versions");

            migrationBuilder.DropTable(
                name: "finding_identity_matches");

            migrationBuilder.DropColumn(
                name: "code_data",
                table: "ingestions");

            migrationBuilder.DropColumn(
                name: "code_scope_snapshot",
                table: "ingestions");

            migrationBuilder.DropColumn(
                name: "security_review_snapshot",
                table: "ingestions");
        }
    }
}
