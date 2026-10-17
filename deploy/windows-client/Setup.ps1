param([ValidateSet('Install', 'Uninstall', 'Verify')][string]$Action = 'Install')
$ErrorActionPreference = 'Stop'
try {
    $manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'manifest.json') -Raw | ConvertFrom-Json
    if ($manifest.version -ne 1) { throw 'Unsupported package manifest.' }
    if ($manifest.buildId -notmatch '^[a-f0-9]{16}$') { throw 'Invalid build identifier.' }
    foreach ($required in @('dist/patcher.js', 'dist/preload.js', 'dist/renderer.js', 'dist/renderer.css', 'Vencord-source.zip', 'LICENSE', 'gifenc-LICENSE.txt', 'README.txt')) {
        if (@($manifest.files | Where-Object { $_.path -eq $required }).Count -ne 1) { throw 'Incomplete package manifest.' }
    }
    foreach ($entry in $manifest.files) {
        if ($entry.path -notmatch '^(dist/[A-Za-z0-9._-]+|Vencord-source.zip|LICENSE|gifenc-LICENSE.txt|README.txt)$') {
            throw 'Invalid package path.'
        }
        $sourceFile = Join-Path $PSScriptRoot $entry.path
        if ((Get-Item -LiteralPath $sourceFile).Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw 'Package links are not supported.'
        }
        if ((Get-FileHash -LiteralPath $sourceFile -Algorithm SHA256).Hash -ne $entry.sha256) {
            throw 'Package integrity check failed. Download a fresh copy from your operator.'
        }
    }
    Write-Host 'Package integrity verified.'
    if ($Action -eq 'Verify') { exit 0 }
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Run this installer normally, not as administrator.'
    }
    if (Get-Process -Name Discord -ErrorAction SilentlyContinue) {
        throw 'Fully quit Discord, including its system-tray icon, then run setup again.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'Discord'))) {
        throw 'Discord Stable was not found. Install the Windows desktop app first.'
    }
    $base = Join-Path $env:LOCALAPPDATA 'ProfileStudio'
    $client = Join-Path $base ('client-' + $manifest.buildId)
    foreach ($directory in @($base, $client, (Join-Path $client 'dist'))) {
        if ((Test-Path -LiteralPath $directory) -and ((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'Installation directories must not be links.'
        }
    }
    if ($Action -eq 'Install') {
        New-Item -ItemType Directory -Path (Join-Path $client 'dist') -Force | Out-Null
        foreach ($entry in $manifest.files) {
            $destinationFile = Join-Path $client $entry.path
            Copy-Item -LiteralPath (Join-Path $PSScriptRoot $entry.path) -Destination $destinationFile -Force
            if ((Get-FileHash -LiteralPath $destinationFile -Algorithm SHA256).Hash -ne $entry.sha256) {
                throw 'Installed file verification failed. Discord has not been patched.'
            }
        }
    } else {
        New-Item -ItemType Directory -Path $base -Force | Out-Null
    }
    # Fixed publisher URL and SHA-256: a manifest cannot redirect the download.
    $installer = Join-Path $base 'VencordInstallerCli-v1.4.2.exe'
    $expectedHash = '15268aba25625797bf562187dd87ddadf42882e079c7b6192880ad3e83353ef5'
    if (-not (Test-Path -LiteralPath $installer)) {
        Write-Host 'Downloading the official Vencord installer v1.4.2...'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/Vencord/Installer/releases/download/v1.4.2/VencordInstallerCli.exe' -OutFile $installer
    }
    if ((Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash -ne $expectedHash) {
        throw 'Official installer checksum mismatch. Installation stopped.'
    }
    $savedData = $env:VENCORD_USER_DATA_DIR
    $savedDev = $env:VENCORD_DEV_INSTALL
    try {
        $env:VENCORD_USER_DATA_DIR = $client
        $env:VENCORD_DEV_INSTALL = '1'
        $operation = if ($Action -eq 'Install') { '--install' } else { '--uninstall' }
        & $installer $operation --branch stable
        if ($LASTEXITCODE -ne 0) { throw 'Vencord installer failed. Read its output above.' }
    } finally {
        $env:VENCORD_USER_DATA_DIR = $savedData
        $env:VENCORD_DEV_INSTALL = $savedDev
    }
    if ($Action -eq 'Install') {
        Write-Host 'Installed. Open Discord, enable ProfileStudio and set the community API URL:'
        Write-Host 'https://profilestudio.taile85078.ts.net'
        Write-Host 'Join the community, obtain the beta role and pair with the bot.'
    } else {
        Write-Host 'Vencord unpatched from Discord Stable. Your settings and local files were retained.'
    }
} catch {
    Write-Host ('Setup failed: ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
