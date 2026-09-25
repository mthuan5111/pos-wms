using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace POS_WMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSyncChangeTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "SyncChanges",
                columns: table => new
                {
                    ChangeId = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    EntityType = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    EntityId = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    Operation = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    ChangedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    DataJson = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SyncChanges", x => x.ChangeId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_SyncChanges_ChangeId",
                table: "SyncChanges",
                column: "ChangeId");

            migrationBuilder.CreateIndex(
                name: "IX_SyncChanges_EntityType_ChangedAt",
                table: "SyncChanges",
                columns: new[] { "EntityType", "ChangedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SyncChanges");
        }
    }
}
