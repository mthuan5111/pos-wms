using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace POS_WMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddNavigationProperties : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CustomerId1",
                table: "Orders",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "UserId1",
                table: "Orders",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ProductId1",
                table: "OrderDetails",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ProductId1",
                table: "Inventories",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Remarks",
                table: "GoodsReceipts",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SupplierId1",
                table: "GoodsReceipts",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "UserId1",
                table: "GoodsReceipts",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "GoodsReceiptId1",
                table: "GoodsReceiptDetails",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ProductId1",
                table: "GoodsReceiptDetails",
                type: "int",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_Orders_CustomerId1",
                table: "Orders",
                column: "CustomerId1");

            migrationBuilder.CreateIndex(
                name: "IX_Orders_UserId1",
                table: "Orders",
                column: "UserId1");

            migrationBuilder.CreateIndex(
                name: "IX_OrderDetails_ProductId1",
                table: "OrderDetails",
                column: "ProductId1");

            migrationBuilder.CreateIndex(
                name: "IX_Inventories_ProductId1",
                table: "Inventories",
                column: "ProductId1");

            migrationBuilder.CreateIndex(
                name: "IX_GoodsReceipts_SupplierId1",
                table: "GoodsReceipts",
                column: "SupplierId1");

            migrationBuilder.CreateIndex(
                name: "IX_GoodsReceipts_UserId1",
                table: "GoodsReceipts",
                column: "UserId1");

            migrationBuilder.CreateIndex(
                name: "IX_GoodsReceiptDetails_GoodsReceiptId1",
                table: "GoodsReceiptDetails",
                column: "GoodsReceiptId1");

            migrationBuilder.CreateIndex(
                name: "IX_GoodsReceiptDetails_ProductId1",
                table: "GoodsReceiptDetails",
                column: "ProductId1");

            migrationBuilder.AddForeignKey(
                name: "FK_GoodsReceiptDetails_GoodsReceipts_GoodsReceiptId1",
                table: "GoodsReceiptDetails",
                column: "GoodsReceiptId1",
                principalTable: "GoodsReceipts",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_GoodsReceiptDetails_Products_ProductId1",
                table: "GoodsReceiptDetails",
                column: "ProductId1",
                principalTable: "Products",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_GoodsReceipts_Suppliers_SupplierId1",
                table: "GoodsReceipts",
                column: "SupplierId1",
                principalTable: "Suppliers",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_GoodsReceipts_Users_UserId1",
                table: "GoodsReceipts",
                column: "UserId1",
                principalTable: "Users",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Inventories_Products_ProductId1",
                table: "Inventories",
                column: "ProductId1",
                principalTable: "Products",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_OrderDetails_Products_ProductId1",
                table: "OrderDetails",
                column: "ProductId1",
                principalTable: "Products",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Orders_Customers_CustomerId1",
                table: "Orders",
                column: "CustomerId1",
                principalTable: "Customers",
                principalColumn: "Id");

            migrationBuilder.AddForeignKey(
                name: "FK_Orders_Users_UserId1",
                table: "Orders",
                column: "UserId1",
                principalTable: "Users",
                principalColumn: "Id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_GoodsReceiptDetails_GoodsReceipts_GoodsReceiptId1",
                table: "GoodsReceiptDetails");

            migrationBuilder.DropForeignKey(
                name: "FK_GoodsReceiptDetails_Products_ProductId1",
                table: "GoodsReceiptDetails");

            migrationBuilder.DropForeignKey(
                name: "FK_GoodsReceipts_Suppliers_SupplierId1",
                table: "GoodsReceipts");

            migrationBuilder.DropForeignKey(
                name: "FK_GoodsReceipts_Users_UserId1",
                table: "GoodsReceipts");

            migrationBuilder.DropForeignKey(
                name: "FK_Inventories_Products_ProductId1",
                table: "Inventories");

            migrationBuilder.DropForeignKey(
                name: "FK_OrderDetails_Products_ProductId1",
                table: "OrderDetails");

            migrationBuilder.DropForeignKey(
                name: "FK_Orders_Customers_CustomerId1",
                table: "Orders");

            migrationBuilder.DropForeignKey(
                name: "FK_Orders_Users_UserId1",
                table: "Orders");

            migrationBuilder.DropIndex(
                name: "IX_Orders_CustomerId1",
                table: "Orders");

            migrationBuilder.DropIndex(
                name: "IX_Orders_UserId1",
                table: "Orders");

            migrationBuilder.DropIndex(
                name: "IX_OrderDetails_ProductId1",
                table: "OrderDetails");

            migrationBuilder.DropIndex(
                name: "IX_Inventories_ProductId1",
                table: "Inventories");

            migrationBuilder.DropIndex(
                name: "IX_GoodsReceipts_SupplierId1",
                table: "GoodsReceipts");

            migrationBuilder.DropIndex(
                name: "IX_GoodsReceipts_UserId1",
                table: "GoodsReceipts");

            migrationBuilder.DropIndex(
                name: "IX_GoodsReceiptDetails_GoodsReceiptId1",
                table: "GoodsReceiptDetails");

            migrationBuilder.DropIndex(
                name: "IX_GoodsReceiptDetails_ProductId1",
                table: "GoodsReceiptDetails");

            migrationBuilder.DropColumn(
                name: "CustomerId1",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "UserId1",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ProductId1",
                table: "OrderDetails");

            migrationBuilder.DropColumn(
                name: "ProductId1",
                table: "Inventories");

            migrationBuilder.DropColumn(
                name: "Remarks",
                table: "GoodsReceipts");

            migrationBuilder.DropColumn(
                name: "SupplierId1",
                table: "GoodsReceipts");

            migrationBuilder.DropColumn(
                name: "UserId1",
                table: "GoodsReceipts");

            migrationBuilder.DropColumn(
                name: "GoodsReceiptId1",
                table: "GoodsReceiptDetails");

            migrationBuilder.DropColumn(
                name: "ProductId1",
                table: "GoodsReceiptDetails");
        }
    }
}
