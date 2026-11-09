$ErrorActionPreference = 'Stop'

function Resolve-CloudflaredPath {
    $candidates = @()

    $command = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($command -and $command.Source) {
        $candidates += $command.Source
    }

    $candidates += @(
        (Join-Path $PSScriptRoot 'tools\cloudflared\cloudflared.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'cloudflared\cloudflared.exe'),
        (Join-Path $env:ProgramFiles 'cloudflared\cloudflared.exe'),
        (Join-Path $env:LOCALAPPDATA 'Cloudflare\cloudflared\cloudflared.exe'),
        (Join-Path $env:USERPROFILE 'cloudflared\cloudflared.exe')
    )

    foreach ($candidate in $candidates | Select-Object -Unique) {
        if ($candidate -and (Test-Path $candidate)) {
            return $candidate
        }
    }

    return $null
}

$cloudflaredPath = Resolve-CloudflaredPath
if (-not $cloudflaredPath) {
    throw @"
cloudflared was not found on this laptop.

Install it first with one of these options:
1. winget install --id Cloudflare.cloudflared
2. Download the Windows x64 executable from Cloudflare's official docs:
   https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/

After install, run this script again.
"@
}

$configPath = Join-Path $env:USERPROFILE '.cloudflared\config.yml'
if (Test-Path $configPath) {
    throw @"
Quick Tunnel mode is blocked because this file exists:
$configPath

Cloudflare documents that TryCloudflare Quick Tunnels are not supported when config.yml is present in .cloudflared.
Temporarily rename that file, then re-run this script.
"@
}

Write-Host ''
Write-Host 'Starting Cloudflare Quick Tunnel for http://127.0.0.1:4000 ...' -ForegroundColor Cyan
Write-Host 'Share the trycloudflare.com URL shown below.' -ForegroundColor Green
Write-Host 'Keep this window open while others use the preview.' -ForegroundColor Yellow
Write-Host ''

& $cloudflaredPath tunnel --protocol http2 --url http://127.0.0.1:4000
