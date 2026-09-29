using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace POS_WMS.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddProductImagePublicId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                IF NOT EXISTS (
                    SELECT 1 FROM sys.columns 
                    WHERE object_id = OBJECT_ID('Products') 
                      AND name = 'ImagePublicId'
                )
                BEGIN
                    EXEC(N'ALTER TABLE [Products] ADD [ImagePublicId] NVARCHAR(255) NULL;');
                END
                ELSE
                BEGIN
                    -- Trường hợp C: Dùng dynamic SQL để SQL Server compile an toàn tại runtime
                    EXEC(N'
                        IF EXISTS (SELECT 1 FROM [Products] WHERE LEN([ImagePublicId]) > 255)
                        BEGIN
                            RAISERROR(N''Cannot alter [ImagePublicId] to NVARCHAR(255): Found records with length exceeding 255 characters. Aborting migration to prevent data truncation.'', 16, 1);
                            RETURN;
                        END
                        ALTER TABLE [Products] ALTER COLUMN [ImagePublicId] NVARCHAR(255) NULL;
                    ');
                END
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // CANH BAO: Thao tac Down() se xoa bo hoan toan cot ImagePublicId va toan bo du lieu lien quan.
            // Tuyet doi khong tu y rollback tren moi truong Production.
            migrationBuilder.Sql(@"
                PRINT 'WARNING: Dropping column ImagePublicId will result in permanent loss of image identifiers.';
                IF EXISTS (
                    SELECT 1 FROM sys.columns 
                    WHERE object_id = OBJECT_ID('Products') 
                      AND name = 'ImagePublicId'
                )
                BEGIN
                    EXEC(N'ALTER TABLE [Products] DROP COLUMN [ImagePublicId];');
                END
            ");
        }
    }
}
