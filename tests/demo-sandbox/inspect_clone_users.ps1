$connStr = "Server=localhost;Database=POS_WMS_TEST_CLONE;Integrated Security=True;TrustServerCertificate=True;MultipleActiveResultSets=True;"
$conn = New-Object System.Data.SqlClient.SqlConnection($connStr)
$conn.Open()
$cmd = $conn.CreateCommand()
$cmd.CommandText = "SELECT Username, PasswordHash FROM Users WHERE Username IN ('admin', 'test_sync_admin', 'test_sync_cashier')"
$reader = $cmd.ExecuteReader()
while ($reader.Read()) {
    Write-Output ("User={0} | Hash={1}" -f $reader[0], $reader[1])
}
$conn.Close()
