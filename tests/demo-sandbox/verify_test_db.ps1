param(
    [string]$Action = "snapshot", # "snapshot", "compare"
    [string]$OutputFile = "",
    [string]$PreFile = "",
    [string]$PostFile = ""
)

$ErrorActionPreference = "Stop"

if ($Action -eq "compare") {
    if (-not (Test-Path $PreFile) -or -not (Test-Path $PostFile)) {
        Write-Error "PreFile or PostFile does not exist."
    }

    $pre = Get-Content $PreFile -Raw | ConvertFrom-Json
    $post = Get-Content $PostFile -Raw | ConvertFrom-Json

    Write-Output "======================================================================"
    Write-Output "KET QUA DOI CHIEU DATABASE POS_WMS_TEST_ISOLATED (TRUOC VS SAU TEST)"
    Write-Output "======================================================================"
    Write-Output "Pre-test Timestamp:  $($pre.Timestamp)"
    Write-Output "Post-test Timestamp: $($post.Timestamp)"
    Write-Output ""

    $hasChanges = $false

    # Metrics comparison
    $revDiff = $post.Metrics.TotalRevenue - $pre.Metrics.TotalRevenue
    $stockDiff = $post.Metrics.TotalInventoryQuantity - $pre.Metrics.TotalInventoryQuantity

    Write-Output "--- 1. CAC TONG TAI CHINH & TON KHO ---"
    Write-Output "Total Revenue:    Pre=$($pre.Metrics.TotalRevenue) | Post=$($post.Metrics.TotalRevenue) | Diff=$revDiff"
    Write-Output "Total Stock Qty:  Pre=$($pre.Metrics.TotalInventoryQuantity) | Post=$($post.Metrics.TotalInventoryQuantity) | Diff=$stockDiff"

    if ($revDiff -ne 0 -or $stockDiff -ne 0) {
        $hasChanges = $true
        Write-Warning "CANH BAO: PHAT HIEN BIEN DONG TONG DOANH THU HOAC TONG TON KHO!"
    }

    Write-Output ""
    Write-Output "--- 2. DOI CHIEU 11 BANG NGHIEP VU (ROW COUNT & CHECKSUM SHA256) ---"

    $tableNames = $pre.Tables.PSObject.Properties.Name
    foreach ($tbl in $tableNames) {
        $preTbl = $pre.Tables.$tbl
        $postTbl = $post.Tables.$tbl

        $countDiff = $postTbl.RowCount - $preTbl.RowCount
        $checksumMatch = ($preTbl.Checksum -eq $postTbl.Checksum)

        if ($countDiff -eq 0 -and $checksumMatch) {
            Write-Output "[BAO TOAN] Bang $($tbl): $($preTbl.RowCount) dong | Checksum: $($preTbl.Checksum.Substring(0, 12))... KHOP"
        } else {
            $hasChanges = $true
            Write-Error "BIEN DONG PHAT HIEN O BANG $($tbl): RowCount Diff=$countDiff, Checksum Match=$checksumMatch"
            Write-Output "  Pre:  Count=$($preTbl.RowCount), Checksum=$($preTbl.Checksum)"
            Write-Output "  Post: Count=$($postTbl.RowCount), Checksum=$($postTbl.Checksum)"
        }
    }

    Write-Output ""
    Write-Output "======================================================================"
    if (-not $hasChanges) {
        Write-Output "KET LUAN: Khong phat hien thay doi trong cac bang, cot va metrics nam trong pham vi snapshot."
    } else {
        Write-Error "CANH BAO: DU LIEU DA BI THAY DOI TRONG QUA TRINH KIEM THU!"
        exit 2
    }
    Write-Output "======================================================================"
    exit 0
}

$connectionString = "Server=localhost;Database=POS_WMS_TEST_ISOLATED;Integrated Security=True;TrustServerCertificate=True;MultipleActiveResultSets=True;"

# Định nghĩa các câu truy vấn cố định thứ tự cột, định dạng ISO 8601 cho DateTime và digest cho Users
$tables = @(
    @{ Name = "Categories"; OrderBy = "Id"; Query = "SELECT Id, Name, Code, IsActive, IsSystem FROM Categories ORDER BY Id" },
    @{ Name = "Suppliers"; OrderBy = "Id"; Query = "SELECT Id, Name, Phone, Email, TaxCode, IsActive FROM Suppliers ORDER BY Id" },
    @{ Name = "Products"; OrderBy = "Id"; Query = "SELECT Id, Name, Barcode, Price, CostPrice, IsActive, ImageUrl, ImagePublicId, LowStockThreshold, IsSalePriceConfigured FROM Products ORDER BY Id" },
    @{ Name = "Inventories"; OrderBy = "Id"; Query = "SELECT Id, ProductId, StockQuantity FROM Inventories ORDER BY Id" },
    @{ Name = "Orders"; OrderBy = "Id"; Query = "SELECT Id, TotalAmount, CustomerId, PaymentMethod, Status, CONVERT(VARCHAR(33), OrderDate, 126) AS OrderDate, UserId, ShiftId FROM Orders ORDER BY Id" },
    @{ Name = "OrderDetails"; OrderBy = "Id"; Query = "SELECT Id, OrderId, ProductId, Quantity, UnitPrice FROM OrderDetails ORDER BY Id" },
    @{ Name = "Shifts"; OrderBy = "Id"; Query = "SELECT Id, UserId, Role, CONVERT(VARCHAR(33), StartedAt, 126) AS StartedAt, CONVERT(VARCHAR(33), EndedAt, 126) AS EndedAt, Status, FinalReportSnapshot, ClosingRemarks FROM Shifts ORDER BY Id" },
    @{ Name = "GoodsReceipts"; OrderBy = "Id"; Query = "SELECT Id, SupplierId, TotalAmount, CONVERT(VARCHAR(33), ReceiptDate, 126) AS ReceiptDate, Remarks, ShiftId FROM GoodsReceipts ORDER BY Id" },
    @{ Name = "GoodsReceiptDetails"; OrderBy = "Id"; Query = "SELECT Id, GoodsReceiptId, ProductId, Quantity, CostPrice FROM GoodsReceiptDetails ORDER BY Id" },
    @{ Name = "StockMovements"; OrderBy = "Id"; Query = "SELECT Id, ProductId, Quantity, MovementType, ReferenceType, ReferenceId, BalanceAfter, CONVERT(VARCHAR(33), CreatedAt, 126) AS CreatedAt FROM StockMovements ORDER BY Id" },
    @{ Name = "Users"; OrderBy = "Id"; Query = "SELECT Id, Username, Name, Role, IsActive, CONVERT(NVARCHAR(64), HASHBYTES('SHA2_256', ISNULL(PasswordHash, '')), 2) AS PasswordHashDigest FROM Users ORDER BY Id" }
)

function Get-Checksum([string]$inputString) {
    $sha = [System.Security.Cryptography.SHA256]::Create()
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($inputString)
    $hash = $sha.ComputeHash($bytes)
    return [BitConverter]::ToString($hash).Replace("-", "").ToLower()
}

$conn = New-Object System.Data.SqlClient.SqlConnection($connectionString)
$conn.Open()

$snapshot = [ordered]@{}
$metrics = [ordered]@{}

try {
    # 1. Total revenue
    $cmd = $conn.CreateCommand()
    $cmd.CommandText = "SELECT ISNULL(SUM(TotalAmount), 0) FROM Orders"
    $metrics["TotalRevenue"] = [double]$cmd.ExecuteScalar()

    # 2. Total inventory stock
    $cmd.CommandText = "SELECT ISNULL(SUM(StockQuantity), 0) FROM Inventories"
    $metrics["TotalInventoryQuantity"] = [int]$cmd.ExecuteScalar()

    # 3. Tables snapshot & checksum
    $tableData = [ordered]@{}
    foreach ($tbl in $tables) {
        $tableName = $tbl.Name
        $cmd.CommandText = $tbl.Query
        $adapter = New-Object System.Data.SqlClient.SqlDataAdapter($cmd)
        $dt = New-Object System.Data.DataTable
        $null = $adapter.Fill($dt)

        $rowCount = $dt.Rows.Count
        $rowsJson = ($dt | ConvertTo-Json -Compress)
        $checksum = Get-Checksum $rowsJson

        # Tóm tắt dòng đầu/cuối: che digest cho Users để tuyệt đối không lưu dữ liệu nhạy cảm
        $firstSummary = "EMPTY"
        $lastSummary = "EMPTY"
        if ($rowCount -gt 0) {
            if ($tableName -eq "Users") {
                $firstSummary = "$($dt.Rows[0]['Id']) | $($dt.Rows[0]['Username']) | $($dt.Rows[0]['Name']) | $($dt.Rows[0]['Role']) | $($dt.Rows[0]['IsActive']) | [REDACTED_DIGEST]"
                $lastSummary = "$($dt.Rows[$rowCount - 1]['Id']) | $($dt.Rows[$rowCount - 1]['Username']) | $($dt.Rows[$rowCount - 1]['Name']) | $($dt.Rows[$rowCount - 1]['Role']) | $($dt.Rows[$rowCount - 1]['IsActive']) | [REDACTED_DIGEST]"
            } else {
                $firstSummary = ($dt.Rows[0].ItemArray -join " | ")
                $lastSummary = ($dt.Rows[$rowCount - 1].ItemArray -join " | ")
            }
        }

        $tableData[$tableName] = [ordered]@{
            "RowCount" = $rowCount
            "Checksum" = $checksum
            "FirstRecordSummary" = $firstSummary
            "LastRecordSummary" = $lastSummary
        }
    }

    $snapshot["Timestamp"] = (Get-Date).ToString("o")
    $snapshot["Database"] = "POS_WMS_TEST_ISOLATED"
    $snapshot["Metrics"] = $metrics
    $snapshot["Tables"] = $tableData

    if ($OutputFile) {
        $snapshotJson = ($snapshot | ConvertTo-Json -Depth 5)
        [System.IO.File]::WriteAllText($OutputFile, $snapshotJson, [System.Text.Encoding]::UTF8)
        Write-Output "Snapshot saved to: $OutputFile"
    } else {
        $snapshot | ConvertTo-Json -Depth 5
    }
} finally {
    $conn.Close()
}
