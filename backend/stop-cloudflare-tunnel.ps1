$ErrorActionPreference = 'Stop'

$running = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
if (-not $running) {
    Write-Output 'No cloudflared process is currently running.'
    exit 0
}

$running | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Output 'Stopped cloudflared tunnel process(es).'
