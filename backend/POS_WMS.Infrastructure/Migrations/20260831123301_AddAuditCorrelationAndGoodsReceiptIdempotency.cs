using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace POS_WMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddAuditCorrelationAndGoodsReceiptIdempotency : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "OfflineReferenceId",
                table: "GoodsReceipts",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "CorrelationId",
                table: "AuditLogs",
                type: "nvarchar(100)",
                maxLength: 100,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Result",
                table: "AuditLogs",
                type: "nvarchar(50)",
                maxLength: 50,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_GoodsReceipts_OfflineReferenceId",
                table: "GoodsReceipts",
                column: "OfflineReferenceId",
                unique: true,
                filter: "[OfflineReferenceId] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_GoodsReceipts_OfflineReferenceId",
                table: "GoodsReceipts");

            migrationBuilder.DropColumn(
                name: "OfflineReferenceId",
                table: "GoodsReceipts");

            migrationBuilder.DropColumn(
                name: "CorrelationId",
                table: "AuditLogs");

            migrationBuilder.DropColumn(
                name: "Result",
                table: "AuditLogs");
        }
    }
}
