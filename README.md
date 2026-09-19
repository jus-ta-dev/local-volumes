# Local Volumes

**Turn your squad up. Turn the rest of the call down.**

Local Volumes adds group volume controls to Discord desktop. Put people into groups, give each group a volume, and adjust individual members when you need to. Everyone stays in the same call. Only what you hear changes.

Free for noncommercial use. Windows and macOS beta.

[Download beta 6](https://github.com/AdstraliaDev1/local-volumes/releases/tag/v0.1.0-beta.6) · [Report a bug](https://github.com/AdstraliaDev1/local-volumes/issues) · [License](LICENSE)

## What it does

- Set group volumes from **0% to 200%**.
- Override one person's volume without changing the rest of their group.
- See server nicknames and profile pictures.
- Keep groups and shortcuts saved between sessions, separately for each Discord account.
- Automatically add new arrivals who do not already belong to a group. People keep their groups when they leave and rejoin.
- Mute a group, or pause the whole mix to restore your saved Discord levels.

**20% means 20%.** If someone's saved Discord volume is 50% and their group is set to 20%, you hear them at 20%, not 10%. If they belong to multiple groups, the lowest assigned level wins. A muted group silences its members for you.

Your saved Discord volume and mute settings are not overwritten. **Pause mix**, or remove a person from all groups, to restore their saved volume.

## Install

Fully quit Discord first, including its system-tray icon on Windows. Reopen it after installation.

### Windows

Open **PowerShell** as your normal user and run:

```powershell
& ([scriptblock]::Create([Text.Encoding]::UTF8.GetString((Invoke-WebRequest -UseBasicParsing 'https://github.com/AdstraliaDev1/local-volumes/releases/download/v0.1.0-beta.6/install.ps1').RawContentStream.ToArray()))) -Action install
```

### macOS

Open **Terminal** and run:

```sh
curl -fsSL 'https://github.com/AdstraliaDev1/local-volumes/releases/download/v0.1.0-beta.6/install.sh' | bash
```

No separate Node.js installation, administrator rights, or PowerShell execution-policy changes are needed. The installers download the release from GitHub and a private Node.js runtime from nodejs.org, then verify their checksums. You can inspect the scripts and download the ZIP yourself from [Releases](https://github.com/AdstraliaDev1/local-volumes/releases).

### Supported clients

| Platform                               | Support                                                            |
| -------------------------------------- | ------------------------------------------------------------------ |
| Windows x64 / ARM64                    | Experimental; requires Discord Stable's stock desktop-core loader  |
| macOS                                  | Only the inspected Discord Stable **0.0.412** host and core hashes |
| Linux, browser, mobile, PTB and Canary | Not supported                                                      |

The installer refuses unsupported or already modified loaders. Discord updates can break compatibility. This is an unofficial client modification, is not endorsed by Discord, and may violate [Discord's terms](https://discord.com/terms).

## Use it

1. Join a Discord voice channel.
2. Press **Ctrl+Shift+L** on Windows or **Command+Shift+L** on macOS. You can also choose **Output Options → Local Volumes** beside the headphones control.
3. Choose **New group**, name it, and select people.
4. Set the group volume. Use the percentage beside a member to give them a custom level; **Reset** makes them follow the group again.

Use **In voice → Groups** to change a person's memberships. **Edit members** lets you rename a group, manage its members, or enable **Auto-add joiners**. Close the mixer when you're done; your mix keeps running.

**Pause mix** restores your saved Discord levels. **Reset mix** sets all groups to 100% and clears mutes and member overrides. It keeps your groups.

You can change the shortcut at the bottom of the mixer. It works while Discord is focused. Wait for **Saved on this device** before quitting.

## Update or uninstall

Updates are manual. Fully quit Discord and run the install command from the new release. Existing installer-based groups and shortcuts are kept, including when updating from a website-hosted beta.

To uninstall, fully quit Discord, then run:

**Windows PowerShell**

```powershell
$lv = Join-Path $env:LOCALAPPDATA 'LocalVolumes'
$active = Get-Content -Raw -LiteralPath (Join-Path $lv 'active.json') | ConvertFrom-Json
& $active.runtime (Join-Path $lv 'manage.cjs') uninstall
```

**macOS Terminal**

```sh
bash "$HOME/Library/Application Support/Local Volumes/uninstall.sh"
```

Uninstall works offline and restores the original loader when it still matches the installed modification. Local settings and backups are kept.

## Privacy and troubleshooting

Local Volumes does not record voice, read messages, collect Discord tokens, or send telemetry. Names and avatar references come from Discord's cached profiles; pictures load from Discord's CDN. Saved settings contain group names, user IDs, volume levels, and your shortcut.

If the mixer reports a playback error, use **Retry** to restore levels. If restoration fails, fully quit Discord. If an install check fails, report the error instead of bypassing it. Please leave tokens, private settings, and personal data out of bug reports.

See [troubleshooting and local file locations](docs/troubleshooting.md) for more help.

## Build from source

Requires **Node.js 24**, npm, and Python 3 for release packaging.

```sh
npm ci --ignore-scripts
npm run release
```

This runs type checking, tests, builds the bundles, and verifies the release assets in `dist/release/upload/`. It does not install the mod or publish anything. See [release maintenance](docs/releasing.md) for the GitHub workflow.

## License

[PolyForm Noncommercial 1.0.0](LICENSE). You may use, modify, and share Local Volumes for permitted noncommercial purposes, subject to the license. Commercial use is not granted by this license.

Made by [AdstraliaDev1 / jus_ta_dev](https://github.com/AdstraliaDev1).
