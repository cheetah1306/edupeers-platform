$ErrorActionPreference = 'Stop'

$serverScript = Join-Path $PSScriptRoot 'start-server-4000.ps1'
$tunnelScript = Join-Path $PSScriptRoot 'start-cloudflare-quick-tunnel.ps1'

if (-not (Test-Path $serverScript)) {
    throw "Missing server startup script: $serverScript"
}

if (-not (Test-Path $tunnelScript)) {
    throw "Missing tunnel startup script: $tunnelScript"
}

Write-Host ''
Write-Host 'Launching local app server on port 4000 ...' -ForegroundColor Cyan
& $serverScript | Out-Host

Write-Host ''
Write-Host 'Launching Cloudflare Quick Tunnel ...' -ForegroundColor Cyan
Write-Host 'When the public URL appears, anyone with that link can preview your live local app.' -ForegroundColor Green
Write-Host ''

& $tunnelScript
