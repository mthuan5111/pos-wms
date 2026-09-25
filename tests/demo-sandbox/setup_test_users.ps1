# setup_test_users.ps1
# Creates dedicated test users in POS_WMS_TEST_CLONE using Windows Integrated Security (NO PASSWORDS IN LOGS/ARGS)

Add-Type -AssemblyName System.Data
Add-Type -AssemblyName System.Security

function Generate-IdentityV3Hash([string]$password) {
    $salt = New-Object byte[] 16
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($salt)
    
    $pbkdf2 = New-Object System.Security.Cryptography.Rfc2898DeriveBytes(
        $password,
        $salt,
        100000,
        [System.Security.Cryptography.HashAlgorithmName]::SHA512
    )
    $subkey = $pbkdf2.GetBytes(32)
    
    $outputBytes = New-Object byte[] (13 + 16 + 32)
    $outputBytes[0] = 1 # format marker
    
    # PRF: 2 (HMACSHA512)
    $outputBytes[1] = 0; $outputBytes[2] = 0; $outputBytes[3] = 0; $outputBytes[4] = 2;
    # Iteration count: 100000 (0x000186A0)
    $outputBytes[5] = 0; $outputBytes[6] = 1; $outputBytes[7] = 0x86; $outputBytes[8] = 0xA0;
    # Salt size: 16 (0x00000010)
    $outputBytes[9] = 0; $outputBytes[10] = 0; $outputBytes[11] = 0; $outputBytes[12] = 0x10;
    
    [System.Buffer]::BlockCopy($salt, 0, $outputBytes, 13, 16)
    [System.Buffer]::BlockCopy($subkey, 0, $outputBytes, 29, 32)
    
    return [System.Convert]::ToBase64String($outputBytes)
}

$testPassword = if ($env:TEST_USER_PASSWORD) { $env:TEST_USER_PASSWORD } else { "TestUser@2026!" }
$passwordHash = Generate-IdentityV3Hash $testPassword

$connStr = "Server=localhost;Database=POS_WMS_TEST_CLONE;Integrated Security=True;TrustServerCertificate=True;MultipleActiveResultSets=True;"
$conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
$conn.Open()

# 1. Ensure test_sync_admin exists
$cmdCheck = $conn.CreateCommand()
$cmdCheck.CommandText = "SELECT COUNT(*) FROM Users WHERE Username = 'test_sync_admin'"
$adminExists = [int]$cmdCheck.ExecuteScalar()

if ($adminExists -eq 0) {
    $cmdInsert = $conn.CreateCommand()
    $cmdInsert.CommandText = "INSERT INTO Users (Username, NormalizedUsername, Name, Role, PasswordHash, Phone, IsActive, IsSystemAdmin, IsProtected) VALUES ('test_sync_admin', 'TEST_SYNC_ADMIN', N'Test Sync Admin', 'Admin', @pwdHash, '0901234567', 1, 0, 0)"
    $p = $cmdInsert.Parameters.Add("@pwdHash", [System.Data.SqlDbType]::NVarChar, -1)
    $p.Value = $passwordHash
    $cmdInsert.ExecuteNonQuery() | Out-Null
    Write-Output "[CREATED] test_sync_admin created in POS_WMS_TEST_CLONE"
} else {
    # Update password hash to match current test environment password
    $cmdUpd = $conn.CreateCommand()
    $cmdUpd.CommandText = "UPDATE Users SET PasswordHash = @pwdHash, IsActive = 1 WHERE Username = 'test_sync_admin'"
    $p = $cmdUpd.Parameters.Add("@pwdHash", [System.Data.SqlDbType]::NVarChar, -1)
    $p.Value = $passwordHash
    $cmdUpd.ExecuteNonQuery() | Out-Null
    Write-Output "[UPDATED] test_sync_admin password hash refreshed in POS_WMS_TEST_CLONE"
}

# 2. Ensure test_sync_cashier exists
$cmdCheck2 = $conn.CreateCommand()
$cmdCheck2.CommandText = "SELECT COUNT(*) FROM Users WHERE Username = 'test_sync_cashier'"
$cashierExists = [int]$cmdCheck2.ExecuteScalar()

if ($cashierExists -eq 0) {
    $cmdInsert2 = $conn.CreateCommand()
    $cmdInsert2.CommandText = "INSERT INTO Users (Username, NormalizedUsername, Name, Role, PasswordHash, Phone, IsActive, IsSystemAdmin, IsProtected) VALUES ('test_sync_cashier', 'TEST_SYNC_CASHIER', N'Test Sync Cashier', 'Cashier', @pwdHash, '0907654321', 1, 0, 0)"
    $p = $cmdInsert2.Parameters.Add("@pwdHash", [System.Data.SqlDbType]::NVarChar, -1)
    $p.Value = $passwordHash
    $cmdInsert2.ExecuteNonQuery() | Out-Null
    Write-Output "[CREATED] test_sync_cashier created in POS_WMS_TEST_CLONE"
} else {
    # Update password hash to match current test environment password
    $cmdUpd2 = $conn.CreateCommand()
    $cmdUpd2.CommandText = "UPDATE Users SET PasswordHash = @pwdHash, IsActive = 1 WHERE Username = 'test_sync_cashier'"
    $p = $cmdUpd2.Parameters.Add("@pwdHash", [System.Data.SqlDbType]::NVarChar, -1)
    $p.Value = $passwordHash
    $cmdUpd2.ExecuteNonQuery() | Out-Null
    Write-Output "[UPDATED] test_sync_cashier password hash refreshed in POS_WMS_TEST_CLONE"
}

$conn.Close()
Write-Output "[SUCCESS] Dedicated test users setup completed on clone database."
