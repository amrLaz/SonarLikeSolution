using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CodeInsights.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class CollaborationAndPortfolio : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "finding_id",
                table: "finding_occurrences",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "details_purged",
                table: "analysis_records",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "boards_project_configs",
                columns: table => new
                {
                    project_key = table.Column<string>(type: "text", nullable: false),
                    organization_config_id = table.Column<string>(type: "text", nullable: false),
                    ado_project = table.Column<string>(type: "text", nullable: false),
                    work_item_type = table.Column<string>(type: "text", nullable: false),
                    enabled = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_boards_project_configs", x => x.project_key);
                });

            migrationBuilder.CreateTable(
                name: "boards_sync_events",
                columns: table => new
                {
                    decision_id = table.Column<string>(type: "text", nullable: false),
                    finding_id = table.Column<string>(type: "text", nullable: false),
                    state = table.Column<string>(type: "text", nullable: false),
                    error = table.Column<string>(type: "text", nullable: false),
                    completed_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_boards_sync_events", x => x.decision_id);
                });

            migrationBuilder.CreateTable(
                name: "collaboration_teams",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    project_key = table.Column<string>(type: "text", nullable: false),
                    name = table.Column<string>(type: "text", nullable: false),
                    owner_user_id = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_collaboration_teams", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "durable_findings",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    project_key = table.Column<string>(type: "text", nullable: false),
                    branch = table.Column<string>(type: "text", nullable: false),
                    tool = table.Column<string>(type: "text", nullable: false),
                    rule_id = table.Column<string>(type: "text", nullable: false),
                    category = table.Column<string>(type: "text", nullable: false),
                    message = table.Column<string>(type: "text", nullable: false),
                    path = table.Column<string>(type: "text", nullable: true),
                    line = table.Column<int>(type: "integer", nullable: true),
                    identity_kind = table.Column<string>(type: "text", nullable: false),
                    state = table.Column<string>(type: "text", nullable: false),
                    hotspot_review = table.Column<string>(type: "text", nullable: false),
                    assignee_user_id = table.Column<string>(type: "text", nullable: true),
                    team_id = table.Column<string>(type: "text", nullable: true),
                    exception_reason = table.Column<string>(type: "text", nullable: true),
                    exception_expires_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    last_analysis_id = table.Column<string>(type: "text", nullable: false),
                    last_seen_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_durable_findings", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "finding_decisions",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    finding_id = table.Column<string>(type: "text", nullable: false),
                    project_key = table.Column<string>(type: "text", nullable: false),
                    actor_user_id = table.Column<string>(type: "text", nullable: false),
                    actor_email = table.Column<string>(type: "text", nullable: false),
                    action = table.Column<string>(type: "text", nullable: false),
                    reason = table.Column<string>(type: "text", nullable: false),
                    snapshot = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_finding_decisions", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "finding_notifications",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    user_id = table.Column<string>(type: "text", nullable: false),
                    project_key = table.Column<string>(type: "text", nullable: false),
                    finding_id = table.Column<string>(type: "text", nullable: false),
                    decision_id = table.Column<string>(type: "text", nullable: false),
                    action = table.Column<string>(type: "text", nullable: false),
                    created_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    read_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_finding_notifications", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "finding_subscriptions",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    user_id = table.Column<string>(type: "text", nullable: false),
                    project_key = table.Column<string>(type: "text", nullable: false),
                    scope = table.Column<string>(type: "text", nullable: false),
                    scope_id = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_finding_subscriptions", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "finding_work_items",
                columns: table => new
                {
                    finding_id = table.Column<string>(type: "text", nullable: false),
                    project_key = table.Column<string>(type: "text", nullable: false),
                    organization_config_id = table.Column<string>(type: "text", nullable: false),
                    organization_url = table.Column<string>(type: "text", nullable: false),
                    ado_project = table.Column<string>(type: "text", nullable: false),
                    work_item_type = table.Column<string>(type: "text", nullable: false),
                    work_item_id = table.Column<int>(type: "integer", nullable: true),
                    state = table.Column<string>(type: "text", nullable: false),
                    error = table.Column<string>(type: "text", nullable: false),
                    last_decision_id = table.Column<string>(type: "text", nullable: false),
                    synced_version = table.Column<int>(type: "integer", nullable: false),
                    updated_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_finding_work_items", x => x.finding_id);
                });

            migrationBuilder.CreateTable(
                name: "portfolio_objectives",
                columns: table => new
                {
                    id = table.Column<string>(type: "text", nullable: false),
                    project_key = table.Column<string>(type: "text", nullable: false),
                    branch = table.Column<string>(type: "text", nullable: false),
                    dimension = table.Column<string>(type: "text", nullable: false),
                    target = table.Column<int>(type: "integer", nullable: false),
                    profile_id = table.Column<string>(type: "text", nullable: false),
                    profile_version = table.Column<string>(type: "text", nullable: false),
                    formula_version = table.Column<string>(type: "text", nullable: false),
                    due_at = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_portfolio_objectives", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "project_ownerships",
                columns: table => new
                {
                    project_key = table.Column<string>(type: "text", nullable: false),
                    team_id = table.Column<string>(type: "text", nullable: true),
                    owner_user_id = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_project_ownerships", x => x.project_key);
                });

            migrationBuilder.CreateIndex(
                name: "IX_boards_sync_events_finding_id",
                table: "boards_sync_events",
                column: "finding_id");

            migrationBuilder.CreateIndex(
                name: "IX_collaboration_teams_project_key_name",
                table: "collaboration_teams",
                columns: new[] { "project_key", "name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_durable_findings_assignee_user_id_team_id",
                table: "durable_findings",
                columns: new[] { "assignee_user_id", "team_id" });

            migrationBuilder.CreateIndex(
                name: "IX_durable_findings_project_key_branch_id",
                table: "durable_findings",
                columns: new[] { "project_key", "branch", "id" });

            migrationBuilder.CreateIndex(
                name: "IX_finding_decisions_finding_id_created_at_id",
                table: "finding_decisions",
                columns: new[] { "finding_id", "created_at", "id" });

            migrationBuilder.CreateIndex(
                name: "IX_finding_notifications_user_id_created_at_id",
                table: "finding_notifications",
                columns: new[] { "user_id", "created_at", "id" });

            migrationBuilder.CreateIndex(
                name: "IX_finding_subscriptions_project_key",
                table: "finding_subscriptions",
                column: "project_key");

            migrationBuilder.CreateIndex(
                name: "IX_finding_subscriptions_user_id_scope_scope_id",
                table: "finding_subscriptions",
                columns: new[] { "user_id", "scope", "scope_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_portfolio_objectives_project_key_branch_dimension",
                table: "portfolio_objectives",
                columns: new[] { "project_key", "branch", "dimension" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "boards_project_configs");

            migrationBuilder.DropTable(
                name: "boards_sync_events");

            migrationBuilder.DropTable(
                name: "collaboration_teams");

            migrationBuilder.DropTable(
                name: "durable_findings");

            migrationBuilder.DropTable(
                name: "finding_decisions");

            migrationBuilder.DropTable(
                name: "finding_notifications");

            migrationBuilder.DropTable(
                name: "finding_subscriptions");

            migrationBuilder.DropTable(
                name: "finding_work_items");

            migrationBuilder.DropTable(
                name: "portfolio_objectives");

            migrationBuilder.DropTable(
                name: "project_ownerships");

            migrationBuilder.DropColumn(
                name: "finding_id",
                table: "finding_occurrences");

            migrationBuilder.DropColumn(
                name: "details_purged",
                table: "analysis_records");
        }
    }
}
