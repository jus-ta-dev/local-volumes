# Local Volumes release installer. Invoke in normal, non-administrator PowerShell.
param([ValidateSet('install','uninstall','status','diagnose','check')][string]$Action = 'install', [string]$PackagePath = '')
$ErrorActionPreference = 'Stop'
$LvBase = '@@BASE@@'
$LvPayloadSha = '@@PAYLOAD_SHA@@'
$LvNodeVersion = '@@NODE_VERSION@@'
if (-not $env:LOCALAPPDATA) { throw 'This installer requires Windows.' }
$LvRoot = Join-Path $env:LOCALAPPDATA 'LocalVolumes'
if ($Action -eq 'uninstall' -and (Test-Path -LiteralPath (Join-Path $LvRoot 'active.json'))) {
    $LvActive = Get-Content -Raw -LiteralPath (Join-Path $LvRoot 'active.json') | ConvertFrom-Json
    & $LvActive.runtime (Join-Path $LvRoot 'manage.cjs') uninstall
    if ($LASTEXITCODE -ne 0) { throw 'Uninstall failed. No forced removal attempted.' }
    return
}
if ($Action -eq 'install' -and (Get-Process -Name Discord -ErrorAction SilentlyContinue)) { throw 'Fully quit Discord, including the tray icon, then run this command again.' }
$LvMachineArch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
switch ($LvMachineArch) {
    'ARM64' { $LvArch = 'arm64'; $LvNodeSha = '@@WIN_ARM64_SHA@@' }
    'AMD64' { $LvArch = 'x64'; $LvNodeSha = '@@WIN_X64_SHA@@' }
    default { throw 'Only 64-bit Windows (x64 or ARM64) is supported.' }
}
$LvWork = Join-Path ([IO.Path]::GetTempPath()) ('local-volumes-' + [Guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory -Path $LvWork
function Get-LvDownload([string]$Url, [string]$Path, [string]$Hash) {
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $Path
    if ((Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Hash) { throw 'Download checksum mismatch. Nothing installed.' }
}
$LvPreviousProgressPreference = $ProgressPreference
try {
    $ProgressPreference = 'SilentlyContinue'
    # TLS 1.2 is needed by GitHub on older Windows PowerShell; never relax certificate checks.
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    Write-Host 'Downloading verified Local Volumes files...'
    if ($PackagePath) {
        Copy-Item -LiteralPath $PackagePath -Destination (Join-Path $LvWork 'package.zip')
        if ((Get-FileHash -LiteralPath (Join-Path $LvWork 'package.zip') -Algorithm SHA256).Hash.ToLowerInvariant() -ne $LvPayloadSha) { throw 'Package checksum mismatch. Nothing installed.' }
    } else {
        Get-LvDownload "$LvBase/local-volumes.zip" (Join-Path $LvWork 'package.zip') $LvPayloadSha
    }
    Expand-Archive -LiteralPath (Join-Path $LvWork 'package.zip') -DestinationPath (Join-Path $LvWork 'package')
    $LvNodeName = "node-v$LvNodeVersion-win-$LvArch"
    Get-LvDownload "https://nodejs.org/dist/v$LvNodeVersion/$LvNodeName.zip" (Join-Path $LvWork 'node.zip') $LvNodeSha
    Expand-Archive -LiteralPath (Join-Path $LvWork 'node.zip') -DestinationPath $LvWork
    & (Join-Path $LvWork "$LvNodeName/node.exe") (Join-Path $LvWork 'package/setup.cjs') $Action
    if ($LASTEXITCODE -ne 0) { throw 'Local Volumes did not complete. See the compatibility or recovery message above.' }
    if ($Action -eq 'install') { Write-Host 'Installed. Restart Discord. Keep the LocalVolumes folder for uninstall and settings.' }
} finally {
    $ProgressPreference = $LvPreviousProgressPreference
    Remove-Item -LiteralPath $LvWork -Recurse -Force -ErrorAction SilentlyContinue
}
