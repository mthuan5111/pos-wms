# tests/demo-sandbox/audit_clone_integrity.ps1
# Runs comprehensive integrity, constraint, duplicate, and reconciliation checks on POS_WMS_TEST_CLONE

$connStr = "Server=localhost;Database=POS_WMS_TEST_CLONE;Integrated Security=True;TrustServerCertificate=True;MultipleActiveResultSets=True;"
$conn = New-Object System.Data.SqlClient.SqlConnection($connStr)

try {
    $conn.Open()
    Write-Output "=== AUDITING POS_WMS_TEST_CLONE INTEGRITY ==="

    function Query-Sql($sql) {
        $cmd = $conn.CreateCommand()
        $cmd.CommandText = $sql
        $adapter = New-Object System.Data.SqlClient.SqlDataAdapter($cmd)
        $ds = New-Object System.Data.DataSet
        $adapter.Fill($ds) | Out-Null
        return $ds.Tables[0]
    }

    # 1. DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS
    Write-Output "`n--- 1. DBCC CHECKCONSTRAINTS ---"
    $checkRes = Query-Sql "DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS"
    if ($checkRes.Rows.Count -eq 0) {
        Write-Output "[PASS] All database constraints are valid (0 violations)."
    } else {
        Write-Warning "[FAIL] Constraint violations found:"
        $checkRes | Format-Table -AutoSize | Out-String | Write-Output
    }

    # 2. Check Duplicates for OfflineReferenceId
    Write-Output "`n--- 2. DUPLICATE OFFLINEREFERENCEID CHECKS ---"
    $ordersDup = Query-Sql "SELECT OfflineReferenceId, COUNT(*) as Cnt FROM Orders WHERE OfflineReferenceId IS NOT NULL GROUP BY OfflineReferenceId HAVING COUNT(*) > 1"
    $grDup = Query-Sql "SELECT OfflineReferenceId, COUNT(*) as Cnt FROM GoodsReceipts WHERE OfflineReferenceId IS NOT NULL GROUP BY OfflineReferenceId HAVING COUNT(*) > 1"
    $smDup = Query-Sql "SELECT OfflineReferenceId, COUNT(*) as Cnt FROM StockMovements WHERE OfflineReferenceId IS NOT NULL GROUP BY OfflineReferenceId HAVING COUNT(*) > 1"
    Write-Output "Orders Duplicates: $($ordersDup.Rows.Count) (Expect 0)"
    Write-Output "GoodsReceipts Duplicates: $($grDup.Rows.Count) (Expect 0)"
    Write-Output "StockMovements Duplicates: $($smDup.Rows.Count) (Expect 0)"

    # 3. Unique Indexes Status
    Write-Output "`n--- 3. UNIQUE INDEXES VERIFICATION ---"
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

    # 4. Identity Seed Check
    Write-Output "--- 4. IDENTITY SEEDS VS MAX(ID) ---"
    $seedSql = @"
    SELECT 
        t.name AS TableName,
        IDENT_CURRENT(t.name) AS CurrentIdentity,
        ISNULL(MAX(c.Id), 0) AS MaxId
    FROM sys.tables t
    INNER JOIN sys.identity_columns ic ON t.object_id = ic.object_id
    CROSS APPLY (
        SELECT Id = CASE 
            WHEN t.name = 'Categories' THEN (SELECT MAX(Id) FROM Categories)
            WHEN t.name = 'Suppliers' THEN (SELECT MAX(Id) FROM Suppliers)
            WHEN t.name = 'Customers' THEN (SELECT MAX(Id) FROM Customers)
            WHEN t.name = 'Products' THEN (SELECT MAX(Id) FROM Products)
            WHEN t.name = 'Inventories' THEN (SELECT MAX(Id) FROM Inventories)
            WHEN t.name = 'GoodsReceipts' THEN (SELECT MAX(Id) FROM GoodsReceipts)
            WHEN t.name = 'GoodsReceiptDetails' THEN (SELECT MAX(Id) FROM GoodsReceiptDetails)
            WHEN t.name = 'Orders' THEN (SELECT MAX(Id) FROM Orders)
            WHEN t.name = 'OrderDetails' THEN (SELECT MAX(Id) FROM OrderDetails)
            WHEN t.name = 'StockMovements' THEN (SELECT MAX(Id) FROM StockMovements)
            WHEN t.name = 'Shifts' THEN (SELECT MAX(Id) FROM Shifts)
            WHEN t.name = 'Users' THEN (SELECT MAX(Id) FROM Users)
            ELSE 0
        END
    ) c
    GROUP BY t.name
"@
    $seedRes = Query-Sql $seedSql
    $seedRes | Format-Table -AutoSize | Out-String | Write-Output

    # 5. Migration History
    Write-Output "--- 5. EF CORE MIGRATION HISTORY ---"
    $migSql = "SELECT MigrationId, ProductVersion FROM [__EFMigrationsHistory] ORDER BY MigrationId"
    $migRes = Query-Sql $migSql
    $migRes | Format-Table -AutoSize | Out-String | Write-Output

    # 6. Orphan Records Check
    Write-Output "--- 6. ORPHAN RECORDS CHECK ---"
    $orphanOD = Query-Sql "SELECT COUNT(*) as Cnt FROM OrderDetails od LEFT JOIN Orders o ON od.OrderId = o.Id WHERE o.Id IS NULL"
    $orphanGRD = Query-Sql "SELECT COUNT(*) as Cnt FROM GoodsReceiptDetails grd LEFT JOIN GoodsReceipts gr ON grd.GoodsReceiptId = gr.Id WHERE gr.Id IS NULL"
    $orphanInv = Query-Sql "SELECT COUNT(*) as Cnt FROM Inventories i LEFT JOIN Products p ON i.ProductId = p.Id WHERE p.Id IS NULL"
    Write-Output "Orphan OrderDetails: $(($orphanOD | Select-Object -ExpandProperty Cnt)) (Expect 0)"
    Write-Output "Orphan GoodsReceiptDetails: $(($orphanGRD | Select-Object -ExpandProperty Cnt)) (Expect 0)"
    Write-Output "Orphan Inventories: $(($orphanInv | Select-Object -ExpandProperty Cnt)) (Expect 0)"

    # 7. Financial & Inventory Reconciliation
    Write-Output "`n--- 7. RECONCILIATION SUMMARY ---"
    $revRes = Query-Sql "SELECT ISNULL(SUM(TotalAmount), 0) AS TotalRevenue, COUNT(*) AS OrderCount FROM Orders"
    $stockRes = Query-Sql "SELECT ISNULL(SUM(StockQuantity), 0) AS TotalStock, COUNT(*) AS InvCount FROM Inventories"
    Write-Output "Total Orders: $(($revRes | Select-Object -ExpandProperty OrderCount)) | Total Revenue: $(($revRes | Select-Object -ExpandProperty TotalRevenue)) VND"
    Write-Output "Total Inventories: $(($stockRes | Select-Object -ExpandProperty InvCount)) | Total Stock Quantity: $(($stockRes | Select-Object -ExpandProperty TotalStock))"

    Write-Output "`n[ALL CLONE AUDIT CHECKS COMPLETED]"
}
finally {
    $conn.Close()
}
