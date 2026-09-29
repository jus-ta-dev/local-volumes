# Local Volumes @@VERSION@@

A local group volume mixer for Discord desktop. Free for noncommercial use under the included PolyForm Noncommercial license.

Fully quit Discord before installing or updating. On Windows, quit it from the system tray too. Use a normal terminal without administrator privileges.

## macOS

```sh
curl -fsSL '@@BASE@@/install.sh' | bash
```

## Windows

Run in PowerShell:

```powershell
& ([scriptblock]::Create([Text.Encoding]::UTF8.GetString((Invoke-WebRequest -UseBasicParsing '@@BASE@@/install.ps1').RawContentStream.ToArray()))) -Action install
```

The installers download a private Node.js runtime from nodejs.org and check its checksum, along with the release ZIP. You do not need to install Node.js separately. Review the scripts before running them if you prefer.

## Open the mixer

Reopen Discord and join voice. Press **Ctrl+Shift+L** on Windows or **Command+Shift+L** on macOS. You can also open **Output Options → Local Volumes** beside the headphones control. Choose **New group**, select people, and set a volume.

Group percentages set absolute Discord volume levels. A person normally at 50% plays at 20% in a 20% group. Overlapping groups use the lowest level. **Pause mix** restores saved Discord levels.

## Update

Fully quit Discord and run the install command from the new release. If a Discord update removes Local Volumes, rerun the same installer. The installer selects the current Discord installation, retires the previous hook when it is still present, and keeps your groups, shortcuts and backups. Updates are manual.

## Uninstall

Fully quit Discord first. macOS:

```sh
bash "$HOME/Library/Application Support/Local Volumes/uninstall.sh"
```

Windows PowerShell (works offline):

```powershell
$lv = Join-Path $env:LOCALAPPDATA 'LocalVolumes'
$active = Get-Content -Raw -LiteralPath (Join-Path $lv 'active.json') | ConvertFrom-Json
& $active.runtime (Join-Path $lv 'manage.cjs') uninstall
```

This restores the original loader when it still matches the installed modification. Settings and backups stay on your device.

## Compatibility and troubleshooting

- macOS and Windows x64/ARM64 use Discord Stable's stock desktop-core loader.
- Discord versions and build hashes do not restrict installation. The mixer may need an update if Discord changes its voice controls.
- Linux, browser, mobile, PTB/Canary and other client mods are not supported.
- Other mods and unrecognized loaders are preserved. Report the loader error instead of overwriting changed files.
- Replace `-Action install` with `-Action diagnose` on Windows, or pipe the Mac script to `bash -s -- diagnose`, for a read-only version and file-hash report.

Checksums detect changed downloads; they are not publisher signatures. This is an unofficial Discord client modification. Discord updates may break it, and client modifications may violate Discord's terms.
