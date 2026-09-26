# Release maintenance

Release downloads are hosted on GitHub at `jus-ta-dev/local-volumes`. The website can link to them without storing installer files.

## Prepare

1. Update `package.json` and the root package in `package-lock.json` to the same version.
2. Update the README's versioned release links and install commands.
3. Review compatibility and the runtime hashes in `release/`. Do not add untested compatibility hashes.
4. Run `npm ci --ignore-scripts` and `npm run release`.
5. Review the exact files in `dist/release/upload/`.

The packager produces six public assets: `local-volumes.zip`, `install.sh`, `install.ps1`, `INSTALL.md`, `LICENSE`, and `SHA256SUMS.txt`. The ZIP contains only the three bundles, manifest, and license. Local configuration, diagnostics, backups, source history, and Node.js are excluded. The runtime downloads separately and its license is retained by the installer.

Package and runtime checksums detect altered downloads; they are not publisher signatures. HTTPS and the repository owner's release access remain part of the trust boundary. Never replace assets under an existing version. Bump the version for a changed build.

## Publish

After reviewing and committing the source, push `main` and a matching `v` tag:

```sh
git push origin main
git tag v0.1.0-beta.6
git push origin v0.1.0-beta.6
```

The GitHub workflow runs tests and release checks on macOS and Windows. Both jobs must succeed before publishing. A tag containing a hyphen creates a prerelease; a stable version creates a regular release. The tag must match `package.json`.

CI permissions are read-only except for the publishing job, which can write releases. Third-party actions are pinned to official commit hashes, and checkout does not persist credentials. The release contains the tested macOS build artifact after the Windows checks also pass.

For forks, the workflow uses `GITHUB_REPOSITORY` for release URLs. Local packaging uses `release/distribution.json`, or an explicit `node scripts/package-release.mjs OWNER/REPO VERSION`. Update README links separately.

After publishing, download all assets anonymously, compare checksums, and check the install instructions. Test a live supported client before describing a platform as verified. Fixture tests and a successful CI build do not establish audible behavior.

## Migrating from website downloads

Publish and verify the GitHub release first. Then update the website's Mac and Windows commands, ZIP and checksum links, release metadata, and version notes. Remove the hosted installer assets and their download headers only after the GitHub links work.

Installer updates use the same per-user state directory and preserve groups and shortcuts. There is no automatic update service. Previous installed release directories and backups remain local for recovery.
