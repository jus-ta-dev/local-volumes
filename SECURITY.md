# Security

Local Volumes is an unofficial Discord desktop modification. It changes one external desktop-core entry and loads local JavaScript. It depends on private Discord interfaces, so compatibility may change without notice.

The installer requires Discord to be closed, checks the original loader, creates a verified backup, and refuses changed files during uninstall. macOS uses an explicit compatibility hash list; Windows accepts only the stock Stable forwarding loader under its experimental policy. The installer does not disable Electron security settings, change PowerShell execution policies, or request administrator access.

Release ZIPs and the private Node.js runtime are checksum-pinned in the installer scripts. These checks detect changed downloads, but the initial script must still be trusted. Review a release before running it. User-writable local files are not a security boundary against another process already running as the same user.

Settings are validated and written through exclusive temporary files. Installer and settings paths reject symbolic links. The renderer receives no general-purpose filesystem or command-execution API. Discord tokens and messages are not needed by the mod.

To report a vulnerability, use the repository's private vulnerability reporting feature when available. Otherwise open an issue asking for a private contact channel, without publishing exploit details, credentials, or personal settings.

Dependencies are build tools; the runtime bundle contains project code and uses Discord's existing Electron installation. Keep build dependencies, GitHub Actions pins, and downloaded runtime checksums under review.
