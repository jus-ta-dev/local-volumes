param([Parameter(Mandatory=$true)][string]$Base)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# Reproduce the reported failure without executing the downloaded installer.
$binary = Invoke-WebRequest -UseBasicParsing "$Base/binary"
if ($PSVersionTable.PSVersion.Major -eq 5) {
    if ($binary.Content -isnot [byte[]]) { throw 'The binary response fixture must return bytes on Windows PowerShell.' }
    $failed = $false
    try { $null = [scriptblock]::Create($binary.Content) } catch { $failed = $true }
    if (-not $failed) { throw 'The old download command did not reproduce the parser failure.' }
    Write-Host 'Confirmed old command fails when .Content is a byte array.'
}

# Run the actual documented command against a harmless local script, not Discord.
foreach ($path in @('README.md', 'dist/release/INSTALL.md')) {
    $document = [IO.File]::ReadAllText((Join-Path (Get-Location) $path))
    $command = [regex]::Match($document, '(?s)```powershell\r?\n(.*?)\r?\n```').Groups[1].Value.Trim()
    if (-not $command) { throw "No Windows install command found in $path" }
    $url = [regex]::Match($command, "https://github.com/[^']+/install.ps1").Value
    if (-not $url) { throw "No release URL found in $path" }
    foreach ($kind in @('binary', 'powershell', 'text')) {
        $localCommand = $command.Replace($url, "$Base/$kind")
        $actual = & ([scriptblock]::Create($localCommand))
        $expected = 'download-test:install:caf' + [char]0x00e9
        if ($actual -ne $expected) { throw "Download command failed for $path ($kind): $actual" }
    }
}
Write-Host "Documented download commands passed on PowerShell $($PSVersionTable.PSVersion)."
