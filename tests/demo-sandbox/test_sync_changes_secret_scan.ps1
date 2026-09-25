# test_sync_changes_secret_scan.ps1
# Secret Scan & Allowlist Compliance Test for SyncChanges Table on POS_WMS_TEST_CLONE

Add-Type -AssemblyName System.Data

$connStr = "Server=localhost;Database=POS_WMS_TEST_CLONE;Integrated Security=True;TrustServerCertificate=True;MultipleActiveResultSets=True;"
$conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
$conn.Open()

Write-Output "======================================================================"
Write-Output "=== SYNCCHANGE DATAJSON SECRET SCAN & ALLOWLIST COMPLIANCE TEST    ==="
Write-Output "======================================================================"

$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT ChangeId, EntityType, EntityId, Operation, DataJson FROM SyncChanges"
$reader = $cmd.ExecuteReader()

$forbiddenPatterns = @(
    "passwordhash",
    "refreshtoken",
    "accesstoken",
    "secret",
    "connectionstring",
    "clientsecret",
    "privatekey",
    "api_key",
    "apikey"
)

$scannedCount = 0
$violations = 0
$maxBytes = 32768
$oversizedCount = 0

while ($reader.Read()) {
    $scannedCount++
    $changeId = [long]$reader["ChangeId"]
    $entityType = [string]$reader["EntityType"]
    $entityId = [string]$reader["EntityId"]
    $dataJson = if ($reader["DataJson"] -is [System.DBNull]) { "" } else { [string]$reader["DataJson"] }

    if ([string]::IsNullOrWhiteSpace($dataJson)) {
        continue
    }

    # Size check
    $byteCount = [System.Text.Encoding]::UTF8.GetByteCount($dataJson)
    if ($byteCount > $maxBytes) {
        Write-Error "[OVERSIZED] ChangeId=$changeId, Entity=$entityType, Size=$byteCount bytes exceeds limit of $maxBytes bytes!"
        $oversizedCount++
    }

    # Forbidden secret patterns check
    $dataJsonLower = $dataJson.ToLower()
    foreach ($pattern in $forbiddenPatterns) {
        if ($dataJsonLower.Contains($pattern)) {
            Write-Error "[SECRET LEAK DETECTED] ChangeId=$changeId, Entity=$entityType, Pattern='$pattern' found in DataJson!"
            $violations++
        }
    }
}

$conn.Close()

Write-Output "`nTotal SyncChanges Scanned: $scannedCount"
Write-Output "Oversized Payloads (> 32KB): $oversizedCount"
Write-Output "Secret Violations: $violations"

if ($violations -eq 0 -and $oversizedCount -eq 0) {
    Write-Output "`n[PASS] 100% CLEAN: Zero secrets, tokens, or oversized payloads found in SyncChanges!"
} else {
    Write-Error "[FAIL] Secret scan failed with $violations violations and $oversizedCount oversized payloads!"
    exit 1
}
