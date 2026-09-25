# audit_powershell_history.ps1
try {
    $histPath = (Get-PSReadLineOption).HistorySavePath
    if (Test-Path $histPath) {
        Write-Output "History file located: $histPath"
        $lines = Get-Content $histPath
        Write-Output "Total lines in history: $($lines.Count)"
        $hasSqlCmd = $lines | Where-Object { $_ -match '-P\s+' -or $_ -match 'sqlserver;' }
        if ($hasSqlCmd) {
            Write-Output "Found credentials in history. Creating protected audit copy and redacting..."
            $backup = "$histPath.audit_backup"
            Copy-Item $histPath $backup -Force
            $sanitized = $lines | ForEach-Object {
                $_ -replace '(-P\s+)[^\s]+', '$1[REDACTED_BY_AUDIT]' -replace '(Password=)[^;]+', '$1[REDACTED_BY_AUDIT]'
            }
            $sanitized | Set-Content $histPath
            Write-Output "PowerShell history successfully sanitized. Protected audit copy: $backup"
        } else {
            Write-Output "No plaintext passwords found in current PowerShell history."
        }
    } else {
        Write-Output "No history file found."
    }
} catch {
    Write-Output "Note: PSReadLine history not active in current session."
}
