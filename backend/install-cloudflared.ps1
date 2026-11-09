$ErrorActionPreference = 'Stop'

$wingetCommand = Get-Command winget -ErrorAction SilentlyContinue
if (-not $wingetCommand) {
    throw @"
winget was not found on this laptop.

Install cloudflared manually from Cloudflare's official docs:
https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/
"@
}

Write-Host ''
Write-Host 'Installing cloudflared with winget ...' -ForegroundColor Cyan
Write-Host ''

& $wingetCommand.Source install --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements
