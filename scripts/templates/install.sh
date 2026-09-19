#!/bin/bash
# Local Volumes release installer. Does not require sudo or a system Node install.
set -euo pipefail
LV_COMMAND="${1:-install}"
LV_LOCAL_PACKAGE="${2:-}"
case "$LV_COMMAND" in install|uninstall|status|diagnose|check) ;; *) echo 'Usage: install.sh [install|uninstall|status|diagnose|check]' >&2; exit 1;; esac
if [ "$(uname -s)" != Darwin ]; then echo 'Use the PowerShell installer on Windows. Linux is not yet supported.' >&2; exit 1; fi
if [ "$(id -u)" = 0 ]; then echo 'Run this as your normal user, without sudo.' >&2; exit 1; fi
LV_ROOT="$HOME/Library/Application Support/Local Volumes"
if [ "$LV_COMMAND" = uninstall ] && [ -f "$LV_ROOT/uninstall.sh" ]; then exec /bin/bash "$LV_ROOT/uninstall.sh"; fi
if [ "$LV_COMMAND" = install ] && /usr/bin/pgrep -x Discord >/dev/null; then echo 'Fully quit Discord, then run the command again.' >&2; exit 1; fi
LV_BASE='@@BASE@@'
LV_PAYLOAD_SHA='@@PAYLOAD_SHA@@'
LV_NODE_VERSION='@@NODE_VERSION@@'
case "$(uname -m)" in
  arm64) LV_ARCH=arm64; LV_NODE_SHA='@@DARWIN_ARM64_SHA@@';;
  x86_64) LV_ARCH=x64; LV_NODE_SHA='@@DARWIN_X64_SHA@@';;
  *) echo 'Unsupported Mac architecture.' >&2; exit 1;;
esac
LV_WORK=$(mktemp -d "${TMPDIR:-/tmp}/local-volumes.XXXXXXXX")
trap 'rm -rf -- "$LV_WORK"' EXIT
fetch() { /usr/bin/curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --tlsv1.2 --retry 2 --connect-timeout 20 --max-time 300 "$1" -o "$2"; }
verify() { [ "$(/usr/bin/shasum -a 256 "$1" | /usr/bin/awk '{print $1}')" = "$2" ] || { echo 'Download checksum mismatch. Nothing installed.' >&2; exit 1; }; }
echo 'Downloading verified Local Volumes files…'
if [ -n "$LV_LOCAL_PACKAGE" ]; then
  /bin/cp "$LV_LOCAL_PACKAGE" "$LV_WORK/package.zip"
else
  fetch "$LV_BASE/local-volumes.zip" "$LV_WORK/package.zip"
fi
verify "$LV_WORK/package.zip" "$LV_PAYLOAD_SHA"
/usr/bin/ditto -x -k "$LV_WORK/package.zip" "$LV_WORK/package"
LV_NODE_NAME="node-v$LV_NODE_VERSION-darwin-$LV_ARCH"
fetch "https://nodejs.org/dist/v$LV_NODE_VERSION/$LV_NODE_NAME.tar.gz" "$LV_WORK/node.tar.gz"
verify "$LV_WORK/node.tar.gz" "$LV_NODE_SHA"
/usr/bin/tar -xzf "$LV_WORK/node.tar.gz" -C "$LV_WORK"
"$LV_WORK/$LV_NODE_NAME/bin/node" "$LV_WORK/package/setup.cjs" "$LV_COMMAND"
if [ "$LV_COMMAND" = install ]; then echo 'To uninstall later: bash "$HOME/Library/Application Support/Local Volumes/uninstall.sh"'; fi
