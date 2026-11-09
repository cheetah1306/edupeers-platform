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

function Read-SharedText([string]$Path) {
    if (-not (Test-Path $Path)) {
        return ''
    }

    $fileStream = $null
    $reader = $null

    try {
        $fileStream = [System.IO.File]::Open($Path, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        $reader = New-Object System.IO.StreamReader($fileStream)
        return $reader.ReadToEnd()
    } catch {
        return ''
    } finally {
        if ($reader) {
            $reader.Dispose()
        }
        if ($fileStream) {
            $fileStream.Dispose()
        }
    }
}

$cloudflaredPath = Resolve-CloudflaredPath
if (-not $cloudflaredPath) {
    throw "cloudflared.exe was not found. Run backend\install-cloudflared.ps1 first."
}

$configPath = Join-Path $env:USERPROFILE '.cloudflared\config.yml'
if (Test-Path $configPath) {
    throw "Quick Tunnel mode is blocked because $configPath exists. Rename it temporarily and re-run."
}

$stdoutPath = Join-Path $PSScriptRoot 'cloudflared.out.log'
$stderrPath = Join-Path $PSScriptRoot 'cloudflared.err.log'
$logPath = Join-Path $PSScriptRoot 'cloudflared.log'
$pidPath = Join-Path $PSScriptRoot 'cloudflared.pid'

Remove-Item -LiteralPath $stdoutPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $logPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue

Get-Process -Name cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$process = Start-Process `
    -FilePath $cloudflaredPath `
    -ArgumentList @('tunnel', '--protocol', 'http2', '--loglevel', 'info', '--logfile', $logPath, '--pidfile', $pidPath, '--url', 'http://127.0.0.1:4000') `
    -WorkingDirectory $PSScriptRoot `
    -WindowStyle Hidden `
    -PassThru

$url = $null
$maxAttempts = 20

for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
    Start-Sleep -Seconds 1

    if ($process.HasExited) {
        break
    }

    $combined = (Read-SharedText $logPath) + "`n" + (Read-SharedText $stdoutPath) + "`n" + (Read-SharedText $stderrPath)

    $match = [regex]::Match($combined, 'https://[-a-z0-9]+\.trycloudflare\.com')
    if ($match.Success) {
        $url = $match.Value
        break
    }
}

if (-not $url) {
    $stderr = Read-SharedText $stderrPath
    $stdout = Read-SharedText $stdoutPath
    $log = Read-SharedText $logPath
    throw "Cloudflare tunnel did not publish a URL.`nLOG:`n$log`nSTDOUT:`n$stdout`nSTDERR:`n$stderr"
}

[pscustomobject]@{
    Url = $url
    Pid = $process.Id
    LogFile = $logPath
    StdOutLog = $stdoutPath
    StdErrLog = $stderrPath
}
