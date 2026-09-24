using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace POS_WMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddStockMovementOfflineReferenceId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                IF NOT EXISTS (
                    SELECT 1 FROM sys.columns 
                    WHERE object_id = OBJECT_ID('StockMovements') 
                      AND name = 'OfflineReferenceId'
                )
                BEGIN
                    ALTER TABLE [StockMovements] ADD [OfflineReferenceId] NVARCHAR(100) NULL;
                END
            ");

            migrationBuilder.Sql(@"
                IF NOT EXISTS (
                    SELECT 1 FROM sys.indexes 
                    WHERE name = 'IX_StockMovements_OfflineReferenceId' 
                      AND object_id = OBJECT_ID('StockMovements')
                )
                BEGIN
                    EXEC(N'CREATE UNIQUE NONCLUSTERED INDEX [IX_StockMovements_OfflineReferenceId] 
                    ON [StockMovements]([OfflineReferenceId]) 
                    WHERE [OfflineReferenceId] IS NOT NULL');
                END
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                IF EXISTS (
                    SELECT 1 FROM sys.indexes 
                    WHERE name = 'IX_StockMovements_OfflineReferenceId' 
                      AND object_id = OBJECT_ID('StockMovements')
                )
                BEGIN
                    DROP INDEX [IX_StockMovements_OfflineReferenceId] ON [StockMovements];
                END

                IF EXISTS (
                    SELECT 1 FROM sys.columns 
                    WHERE object_id = OBJECT_ID('StockMovements') 
                      AND name = 'OfflineReferenceId'
                )
                BEGIN
                    ALTER TABLE [StockMovements] DROP COLUMN [OfflineReferenceId];
                END
            ");
        }
    }
}
