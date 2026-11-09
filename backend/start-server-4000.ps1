$ErrorActionPreference = 'Stop'

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    $nodePath = $nodeCmd.Source
} elseif (Test-Path 'C:\Users\akshay2007\AppData\Local\ms-playwright-go\1.50.1\node.exe') {
    $nodePath = 'C:\Users\akshay2007\AppData\Local\ms-playwright-go\1.50.1\node.exe'
} else {
    $nodePath = 'node'
}

$serverPath = Join-Path $PSScriptRoot 'server.js'

$existing = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique

foreach ($processId in $existing) {
    Write-Host "Killing old server PID $processId ..."
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

# Wait for port to be fully released before starting new server
if ($existing) {
    Write-Host 'Waiting for port 4000 to be released...'
    Start-Sleep -Seconds 2
}

$process = Start-Process -FilePath $nodePath -ArgumentList @($serverPath) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardError "$PSScriptRoot\server-error.log" -RedirectStandardOutput "$PSScriptRoot\server-output.log" -PassThru
$maxAttempts = 30
$listening = $null

for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    Start-Sleep -Seconds 1
    $listening = Get-NetTCPConnection -LocalPort 4000 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1 LocalAddress, LocalPort, State, OwningProcess

    if ($listening) {
        break
    }
}

if (-not $listening) {
    throw "Backend did not start on port 4000."
}

Write-Host "✅ Server listening on Port 4000 (PID: $($listening.OwningProcess))"
$listening
