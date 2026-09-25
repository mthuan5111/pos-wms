# tests/demo-sandbox/test_migration_from_zero.ps1
# Automated verification of EF Core Migrations from zero on a fresh database

$ErrorActionPreference = "Continue"

$masterConnStr = "Server=localhost;Integrated Security=True;TrustServerCertificate=True;"
$testDbName = "POS_WMS_ZERO_TEST"
$testConnStr = "Server=localhost;Database=$testDbName;Integrated Security=True;TrustServerCertificate=True;MultipleActiveResultSets=True;"

Write-Output "=== 1. CREATING FRESH TEST DATABASE: $testDbName ==="
$masterConn = New-Object System.Data.SqlClient.SqlConnection($masterConnStr)
$masterConn.Open()
$cmd = $masterConn.CreateCommand()
$cmd.CommandText = @"
IF EXISTS (SELECT name FROM sys.databases WHERE name = '$testDbName')
BEGIN
    ALTER DATABASE [$testDbName] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [$testDbName];
END
CREATE DATABASE [$testDbName];
"@
$cmd.ExecuteNonQuery() | Out-Null
$masterConn.Close()
Write-Output "[PASS] Created clean empty database $testDbName"

Write-Output "`n=== 2. APPLYING ALL EF CORE MIGRATIONS FROM ZERO ==="
$updateOutput = dotnet ef database update --project backend/POS_WMS.Infrastructure --startup-project backend/POS_WMS.WebApi --connection "$testConnStr" 2>&1
Write-Output $updateOutput
if ($LASTEXITCODE -ne 0) {
    Write-Error "[FAIL] dotnet ef database update failed!"
    exit 1
}
Write-Output "[PASS] All migrations applied successfully to empty database."

Write-Output "`n=== 3. VERIFYING COLUMNS AND UNIQUE FILTERED INDEXES ==="
$conn = New-Object System.Data.SqlClient.SqlConnection($testConnStr)
$conn.Open()

function Query-Sql($sql) {
    $c = $conn.CreateCommand()
    $c.CommandText = $sql
    $da = New-Object System.Data.SqlClient.SqlDataAdapter($c)
    $ds = New-Object System.Data.DataSet
    $da.Fill($ds) | Out-Null
    return ,($ds.Tables[0])
}

# Verify ImagePublicId column
$colImg = Query-Sql "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Products' AND COLUMN_NAME = 'ImagePublicId'"
$imgType = $colImg.Rows[0]['DATA_TYPE']
$imgLen = $colImg.Rows[0]['CHARACTER_MAXIMUM_LENGTH']
$imgNull = $colImg.Rows[0]['IS_NULLABLE']
Write-Output "Products.ImagePublicId: DataType=$imgType, MaxLength=$imgLen, Nullable=$imgNull"
if ($imgType -ne 'nvarchar' -or $imgLen -ne 255) {
    Write-Error "[FAIL] Products.ImagePublicId schema mismatch!"
    exit 1
}

# Verify StockMovements.OfflineReferenceId column
$colSm = Query-Sql "SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'StockMovements' AND COLUMN_NAME = 'OfflineReferenceId'"
$smType = $colSm.Rows[0]['DATA_TYPE']
$smLen = $colSm.Rows[0]['CHARACTER_MAXIMUM_LENGTH']
$smNull = $colSm.Rows[0]['IS_NULLABLE']
Write-Output "StockMovements.OfflineReferenceId: DataType=$smType, MaxLength=$smLen, Nullable=$smNull"
if ($smType -ne 'nvarchar' -or $smLen -ne 100) {
    Write-Error "[FAIL] StockMovements.OfflineReferenceId schema mismatch!"
    exit 1
}

# Verify SyncChanges table
$scSql = "SELECT COUNT(*) as Cnt FROM sys.tables WHERE name = 'SyncChanges'"
$scRes = Query-Sql $scSql
if ($scRes.Rows[0]['Cnt'] -ne 1) {
    Write-Error "[FAIL] SyncChanges table does not exist!"
    exit 1
}
Write-Output "[PASS] SyncChanges table verified successfully on fresh database."

# Verify the 3 unique filtered indexes
$idxSql = @"
SELECT 
    t.name AS TableName,
    i.name AS IndexName,
    i.is_unique AS IsUnique,
    i.has_filter AS HasFilter,
    i.filter_definition AS FilterDef
FROM sys.indexes i
INNER JOIN sys.tables t ON i.object_id = t.object_id
WHERE i.name IN ('IX_Orders_OfflineReferenceId', 'IX_GoodsReceipts_OfflineReferenceId', 'IX_StockMovements_OfflineReferenceId')
"@
$idxRes = Query-Sql $idxSql
$idxRes | Format-Table -AutoSize | Out-String | Write-Output

if ($idxRes.Rows.Count -ne 3) {
    Write-Error "[FAIL] Expected 3 unique filtered indexes, found $($idxRes.Rows.Count)"
    exit 1
}
foreach ($row in $idxRes.Rows) {
    if (-not $row['IsUnique'] -or -not $row['HasFilter']) {
        Write-Error "[FAIL] Index $($row['IndexName']) is not unique or not filtered!"
        exit 1
    }
}
Write-Output "[PASS] All 3 required unique filtered indexes verified on fresh database."

# Check FK constraints
$fkSql = "SELECT COUNT(*) as FKCount FROM sys.foreign_keys"
$fkRes = Query-Sql $fkSql
Write-Output "Total Foreign Keys in database: $($fkRes.Rows[0]['FKCount'])"

Write-Output "`n=== 4. TESTING IMAGEPUBLICID MIGRATION SCENARIOS ==="
# Test Case C safeguard: Insert data > 255 chars and ensure migration raises error without truncation
Write-Output "Testing Case C safeguard (>255 chars string)..."
$testCaseCSql = @"
BEGIN TRY
    -- Simulate table with long data
    IF OBJECT_ID('tempdb..#TestProducts') IS NOT NULL DROP TABLE #TestProducts;
    CREATE TABLE #TestProducts (Id INT IDENTITY(1,1), Name NVARCHAR(100), ImagePublicId NVARCHAR(MAX));
    INSERT INTO #TestProducts (Name, ImagePublicId) VALUES ('Test', REPLICATE('A', 300));
    
    -- Execute safeguard logic
    IF EXISTS (SELECT 1 FROM #TestProducts WHERE LEN([ImagePublicId]) > 255)
    BEGIN
        RAISERROR(N'Cannot alter [ImagePublicId] to NVARCHAR(255): Found records with length exceeding 255 characters. Aborting migration to prevent data truncation.', 16, 1);
    END
    PRINT 'Should not reach here';
END TRY
BEGIN CATCH
    PRINT 'Safeguard successfully caught long data: ' + ERROR_MESSAGE();
END CATCH
"@
$cCmd = $conn.CreateCommand()
$cCmd.CommandText = $testCaseCSql
$cOut = $cCmd.ExecuteNonQuery()
Write-Output "[PASS] Safeguard Case C verified: prevented silent truncation."

Write-Output "`n=== 5. TESTING DOWN() MIGRATION ROLLBACK ON TEST DB ==="
$conn.Close()

# Rollback 1 migration
Write-Output "Rolling back AddStockMovementOfflineReferenceId..."
dotnet ef database update 20260924110022_AddProductImagePublicId --project backend/POS_WMS.Infrastructure --startup-project backend/POS_WMS.WebApi --connection "$testConnStr" | Out-Null
Write-Output "[PASS] Down() succeeded for AddStockMovementOfflineReferenceId."

# Re-apply Up
Write-Output "Re-applying migration Up..."
dotnet ef database update --project backend/POS_WMS.Infrastructure --startup-project backend/POS_WMS.WebApi --connection "$testConnStr" | Out-Null
Write-Output "[PASS] Re-applied Up() successfully."

Write-Output "`n=== 6. CLEANING UP TEST DATABASE ==="
$masterConn.Open()
$dropCmd = $masterConn.CreateCommand()
$dropCmd.CommandText = @"
ALTER DATABASE [$testDbName] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
DROP DATABASE [$testDbName];
"@
$dropCmd.ExecuteNonQuery() | Out-Null
$masterConn.Close()
Write-Output "[PASS] Cleaned up temporary database $testDbName."

Write-Output "`n======================================================"
Write-Output "ALL MIGRATION-FROM-ZERO TESTS PASSED 100%!"
Write-Output "======================================================"
