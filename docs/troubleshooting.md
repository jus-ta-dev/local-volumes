# Troubleshooting

## The mixer does not open

Fully quit and reopen Discord after installation or an update. A page reload does not reload the desktop bootstrap. Join voice and try Command+Shift+L on macOS or Ctrl+Shift+L on Windows. The shortcut works only while Discord is focused.

Discord's native menus can change. If the menu entry disappears, use the shortcut. If discovery fails, use Retry after joining voice. An unsupported client may need a new Local Volumes release.

## Installation stops

Close all Discord processes first. The installer will not terminate them for you. Unsupported client versions, another mod, changed files, and invalid checksums stop installation.

Download the matching install script from the release and use `bash ./install.sh diagnose` on macOS. On Windows, use the README command with `-Action diagnose` instead of `-Action install`. Diagnosis reads Discord versions and file hashes without patching. Never bypass a failed compatibility check.

An interrupted installer can leave an `.install-lock` directory. Confirm that no installer is running before removing that lock alone. Keep the receipt and backup files.

## Someone appears in Default and another group

Beta 4 and later keep assigned users out of auto-add groups when they rejoin. An unwanted membership saved by an older version must be removed once with Edit members. The app cannot distinguish that duplicate from an intentional overlap.

Multiple auto-add groups can receive a genuinely unassigned arrival. Overlapping groups use the lowest volume. Auto-add is not retroactive for people already in the call when you enable it.

## Volume sounds wrong

Group percentages are absolute Discord slider levels, not percentages of a person's saved volume. The volume curve is nonlinear. Pause mix restores saved settings; Reset mix sets the groups to 100%.

Member overrides and overlapping groups can lower the effective level. Muting any assigned group silences the person. Check those settings first.

If a native playback write fails, the mixer pauses and attempts restoration. Retry attempts restoration again. If it still fails, fully quit Discord.

## Local files

The release installer stores files here:

- macOS: `~/Library/Application Support/Local Volumes`
- Windows: `%LOCALAPPDATA%\LocalVolumes`

`state/groups.json` contains groups and the shortcut, separated by account. `state/install.json` and the original-entry backup support uninstall. `state/runtime.json` contains local diagnostic status. Names and image URLs are not persisted. There is no cloud sync.

Back up `state/groups.json` with Discord closed before editing it. Corrupt settings are left untouched and the mixer blocks editing. Do not delete installation receipts or the only original-entry backup before successful uninstall.

The early development installer stored state in the source checkout's `.local-volumes` directory. That installation must be removed using its original uninstaller before switching to a release installer. Keep the old checkout or its backup until removal succeeds. With Discord closed, you may then copy its `groups.json` into the release installation's `state` directory.
