import {
  existsSync,
  readFileSync,
  mkdirSync,
  renameSync,
  rmSync,
  readdirSync,
  copyFileSync,
  chmodSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import {
  hash,
  install,
  uninstall,
  readReceipt,
  type Receipt,
} from "./transaction.ts";

import { assertPlainPath, atomicWrite as atomic } from "../files.ts";
export { assertPlainPath } from "../files.ts";

export interface Build {
  platform: string;
  channel: string;
  hostVersion: string;
  hostSha256: string;
  coreSha256: string;
  entrySha256: string;
}
export interface Candidate {
  hostVersion: string;
  host: string;
  core: string;
  entry: string;
}
export interface Manifest {
  schema: 1;
  version: string;
  files: Record<string, string>;
  builds: Build[];
  experimentalWindows?: boolean;
}
export const payloadFiles = [
  "bootstrap.cjs",
  "renderer.js",
  "setup.cjs",
  "LICENSE",
] as const;
const sha = (path: string) => hash(readFileSync(path));
const isHash = (s: unknown): s is string =>
  typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
export function dataRoot(
  platform = process.platform,
  home = homedir(),
  local = process.env.LOCALAPPDATA,
): string {
  if (platform === "darwin")
    return join(home, "Library/Application Support/Local Volumes");
  if (platform === "win32" && local) return join(local, "LocalVolumes");
  throw new Error("Only macOS and Windows are supported by this installer.");
}
function directories(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true })
    .filter((x) => x.isDirectory() && !x.isSymbolicLink())
    .map((x) => x.name);
}
export function discoverCandidates(
  platform: string,
  home: string,
  local?: string,
  applications = "/Applications",
): Candidate[] {
  const roots =
    platform === "darwin"
      ? [join(home, "Library/Application Support/discord")]
      : platform === "win32" && local
        ? [join(local, "Discord")]
        : [];
  const found: Candidate[] = [];
  for (const root of roots)
    for (const app of directories(root).filter((x) =>
      /^app-\d+(\.\d+)+$/.test(x),
    )) {
      const hostVersion = app.slice(4),
        appRoot = join(root, app);
      const hosts =
        platform === "darwin"
          ? [
              join(applications, "Discord.app/Contents/Resources/app.asar"),
              join(
                home,
                "Applications/Discord.app/Contents/Resources/app.asar",
              ),
            ]
          : [join(appRoot, "resources/app.asar")];
      const host = hosts.find(existsSync);
      if (!host) continue;
      const modules = join(appRoot, "modules");
      const coreModules = directories(modules)
        .filter((x) => /^discord_desktop_core-\d+$/.test(x))
        .sort(
          (a, b) => Number(b.split("-").at(-1)) - Number(a.split("-").at(-1)),
        );
      for (const module of platform === "win32"
        ? coreModules.slice(0, 1)
        : coreModules) {
        const coreRoot = join(modules, module, "discord_desktop_core");
        const candidate = {
          hostVersion,
          host,
          core: join(coreRoot, "core.asar"),
          entry: join(coreRoot, "index.js"),
        };
        if (existsSync(candidate.core) && existsSync(candidate.entry))
          found.push(candidate);
      }
    }
  return found;
}
export function readManifest(packageDir: string): Manifest {
  assertPlainPath(packageDir);
  assertPlainPath(join(packageDir, "manifest.json"));
  const manifest = JSON.parse(
    readFileSync(join(packageDir, "manifest.json"), "utf8"),
  ) as Manifest;
  if (
    !manifest ||
    manifest.schema !== 1 ||
    !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(manifest.version) ||
    !Array.isArray(manifest.builds) ||
    !manifest.files ||
    Object.keys(manifest.files).sort().join(",") !==
      [...payloadFiles].sort().join(",")
  )
    throw new Error("Invalid release manifest.");
  if (
    manifest.experimentalWindows !== undefined &&
    typeof manifest.experimentalWindows !== "boolean"
  )
    throw new Error("Invalid Windows compatibility policy.");
  for (const file of payloadFiles) {
    assertPlainPath(join(packageDir, file));
    if (
      !isHash(manifest.files[file]) ||
      sha(join(packageDir, file)) !== manifest.files[file]
    )
      throw new Error(`Release checksum mismatch: ${file}`);
  }
  for (const b of manifest.builds) {
    if (
      !["darwin", "win32"].includes(b.platform) ||
      b.channel !== "stable" ||
      !/^\d+(\.\d+)+$/.test(b.hostVersion) ||
      ![b.hostSha256, b.coreSha256, b.entrySha256].every(isHash)
    )
      throw new Error("Invalid compatibility entry.");
  }
  return manifest;
}
function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number),
    right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const delta = (left[i] ?? 0) - (right[i] ?? 0);
    if (delta) return delta;
  }
  return 0;
}
export function selectCompatible(
  candidates: Candidate[],
  manifest: Manifest,
  platform: string,
  receipt?: Receipt,
): { candidate: Candidate; build: Build; experimental?: boolean } {
  const matches: {
    candidate: Candidate;
    build: Build;
    experimental?: boolean;
  }[] = [];
  const latest =
    platform === "win32"
      ? candidates
          .map((c) => c.hostVersion)
          .sort(compareVersions)
          .at(-1)
      : undefined;
  for (const c of candidates.filter(
    (c) => !latest || compareVersions(c.hostVersion, latest) === 0,
  )) {
    for (const path of [c.host, c.core, c.entry]) assertPlainPath(path);
    let build = manifest.builds.find(
      (b) =>
        b.platform === platform &&
        b.hostVersion === c.hostVersion &&
        b.hostSha256 === sha(c.host) &&
        b.coreSha256 === sha(c.core),
    );
    let experimental = false;
    if (!build && platform === "win32" && manifest.experimentalWindows) {
      const packagePath = join(dirname(c.entry), "package.json");
      assertPlainPath(packagePath);
      const pkg = existsSync(packagePath)
        ? JSON.parse(readFileSync(packagePath, "utf8"))
        : undefined;
      if (
        !pkg ||
        (pkg.main !== undefined &&
          !["index.js", "./index.js"].includes(pkg.main))
      )
        throw new Error(
          "Unrecognized Windows desktop-core entry point. No files were patched.",
        );
      const current = sha(c.entry);
      const original =
        receipt?.target === c.entry && current === receipt.patchedHash
          ? receipt.original
          : readFileSync(c.entry, "utf8");
      // Accept only the stock forwarding loader, never arbitrary existing mods.
      if (
        original.length > 4096 ||
        !/^\uFEFF?\s*module\.exports\s*=\s*require\((['"])\.\/core\.asar\1\)\s*;?\s*$/.test(
          original,
        )
      )
        throw new Error(
          "Discord already has a modified or unrecognized entry. Remove the existing mod with its own uninstaller first.",
        );
      build = {
        platform: "win32",
        channel: "stable",
        hostVersion: c.hostVersion,
        hostSha256: sha(c.host),
        coreSha256: sha(c.core),
        entrySha256: hash(original),
      };
      experimental = true;
    }
    if (!build) continue;
    const current = sha(c.entry);
    if (
      current !== build.entrySha256 &&
      !(
        receipt &&
        receipt.target === c.entry &&
        receipt.originalHash === build.entrySha256 &&
        current === receipt.patchedHash
      )
    )
      throw new Error(
        "Discord already has a modified entry. Remove the existing mod with its own uninstaller first.",
      );
    matches.push({
      candidate: c,
      build,
      ...(experimental ? { experimental: true } : {}),
    });
  }
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? "More than one compatible Discord installation found; refusing to choose."
        : `No verified ${platform === "win32" ? "Windows" : "macOS"} Discord build matches this release. Nothing was patched. Run diagnose to report version and file hashes.`,
    );
  return matches[0];
}
export function assertDiscordClosed(platform: string) {
  if (platform === "darwin") {
    try {
      execFileSync("/usr/bin/pgrep", ["-x", "Discord"], { stdio: "pipe" });
    } catch (e) {
      if ((e as { status?: number }).status === 1) return;
      throw new Error("Could not check whether Discord is running.");
    }
  } else if (platform === "win32") {
    const result = execFileSync(
      "tasklist.exe",
      ["/FI", "IMAGENAME eq Discord.exe", "/FO", "CSV", "/NH"],
      { encoding: "utf8", windowsHide: true },
    );
    if (!/^"Discord\.exe"/im.test(result)) return;
  } else throw new Error("Unsupported operating system.");
  throw new Error(
    "Fully quit Discord first (including its tray/menu-bar process), then run this command again.",
  );
}
function withLock<T>(root: string, action: () => T): T {
  assertPlainPath(root);
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const lock = join(root, ".install-lock");
  try {
    mkdirSync(lock);
  } catch {
    throw new Error(
      `Another installer is running or was interrupted. Check ${lock} before retrying.`,
    );
  }
  try {
    return action();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
const quoteShell = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
export interface SetupOptions {
  root: string;
  packageDir: string;
  candidates: Candidate[];
  platform: string;
  runtime: string;
  runtimeLicense: string;
  assertClosed: () => void;
}
export function installRelease(options: SetupOptions): string {
  const {
    root,
    packageDir,
    candidates,
    platform,
    runtime,
    runtimeLicense,
    assertClosed,
  } = options;
  const manifest = readManifest(packageDir);
  assertClosed();
  return withLock(root, () => {
    const receiptPath = join(root, "state/install.json");
    assertPlainPath(
      join(root, platform === "darwin" ? "uninstall.sh" : "uninstall.ps1"),
    );
    const receipt = readReceipt(receiptPath);
    const { candidate, build, experimental } = selectCompatible(
      candidates,
      manifest,
      platform,
      receipt,
    );
    if (receipt && receipt.target !== candidate.entry)
      throw new Error(
        "Discord moved since the previous install. Uninstall that entry before installing into a new one.",
      );
    const releaseId = `${manifest.version}-${sha(join(packageDir, "manifest.json")).slice(0, 16)}`;
    const releaseDir = join(root, "releases", releaseId);
    assertPlainPath(releaseDir);
    if (existsSync(releaseDir)) {
      for (const file of payloadFiles) {
        assertPlainPath(join(releaseDir, file));
        if (sha(join(releaseDir, file)) !== manifest.files[file])
          throw new Error(
            "Installed release files changed; refusing to reuse them.",
          );
      }
    } else {
      mkdirSync(dirname(releaseDir), { recursive: true, mode: 0o700 });
      const stage = `${releaseDir}.staging-${process.pid}`;
      mkdirSync(stage);
      try {
        for (const file of [...payloadFiles, "manifest.json"])
          copyFileSync(join(packageDir, file), join(stage, file));
        renameSync(stage, releaseDir);
      } finally {
        rmSync(stage, { recursive: true, force: true });
      }
    }
    // Keep a private runtime only for management commands; Discord runs its own Electron.
    assertPlainPath(runtime);
    assertPlainPath(runtimeLicense);
    const runtimeDir = join(root, "runtime", sha(runtime).slice(0, 16));
    assertPlainPath(runtimeDir);
    mkdirSync(runtimeDir, { recursive: true, mode: 0o700 });
    const node = join(runtimeDir, platform === "win32" ? "node.exe" : "node");
    assertPlainPath(node);
    assertPlainPath(join(runtimeDir, "LICENSE"));
    if (!existsSync(node)) {
      copyFileSync(runtime, node);
      if (platform !== "win32") chmodSync(node, 0o700);
    } else if (sha(node) !== sha(runtime))
      throw new Error("Private runtime checksum mismatch.");
    copyFileSync(runtimeLicense, join(runtimeDir, "LICENSE"));
    const loadActive = `const fs=require('node:fs'),path=require('node:path');const root=__dirname;const a=JSON.parse(fs.readFileSync(path.join(root,'active.json'),'utf8'));if(!/^[0-9]+\\.[0-9]+\\.[0-9]+(?:-[a-z0-9.-]+)?-[a-f0-9]{16}$/.test(a.release))throw Error('Invalid release');`;
    const loader = `${loadActive}\nglobalThis.__LOCAL_VOLUMES_STATE_DIR__=path.join(root,'state');require(path.join(root,'releases',a.release,'bootstrap.cjs'));\n`;
    const manager = `${loadActive}\nrequire(path.join(root,'releases',a.release,'setup.cjs'));\n`;
    for (const [name, content] of [
      ["loader.cjs", loader],
      ["manage.cjs", manager],
    ]) {
      const path = join(root, name);
      assertPlainPath(path);
      if (existsSync(path) && readFileSync(path, "utf8") !== content)
        throw new Error(
          `Management file changed: ${name}. Refusing to overwrite it.`,
        );
      if (!existsSync(path)) atomic(path, content);
    }
    const activePath = join(root, "active.json");
    assertPlainPath(activePath);
    const previous = existsSync(activePath)
      ? readFileSync(activePath)
      : undefined;
    assertClosed(); // Close the check/copy window before changing Discord.
    atomic(
      activePath,
      JSON.stringify({
        release: releaseId,
        version: manifest.version,
        runtime: node,
      }) + "\n",
    );
    try {
      install(
        candidate.entry,
        join(root, "loader.cjs"),
        receiptPath,
        build.entrySha256,
      );
    } catch (error) {
      if (previous) atomic(activePath, previous);
      else rmSync(activePath, { force: true });
      throw error;
    }
    if (platform === "darwin") {
      atomic(
        join(root, "uninstall.sh"),
        `#!/bin/bash\nset -euo pipefail\nexec ${quoteShell(node)} ${quoteShell(join(root, "manage.cjs"))} uninstall\n`,
        0o700,
      );
    } else {
      const psQuote = (s: string) => "'" + s.replace(/'/g, "''") + "'";
      atomic(
        join(root, "uninstall.ps1"),
        `& ${psQuote(node)} ${psQuote(join(root, "manage.cjs"))} uninstall\nexit $LASTEXITCODE\n`,
      );
    }
    return `Local Volumes ${manifest.version} installed.${experimental ? " Experimental Windows build: live voice testing is pending." : ""} Start Discord, then open Output Options → Local Volumes. Settings: ${join(root, "state")}`;
  });
}
export function uninstallRelease(
  root: string,
  assertClosed: () => void,
): string {
  assertClosed();
  if (!existsSync(join(root, "state/install.json")))
    return "Local Volumes is not installed here.";
  return withLock(root, () => {
    const receiptPath = join(root, "state/install.json");
    readReceipt(receiptPath);
    uninstall(receiptPath);
    return "Local Volumes removed from Discord. Restart Discord. Settings and verified backups have been kept.";
  });
}
export function diagnose(candidates: Candidate[], platform: string) {
  return {
    platform,
    candidates: candidates.map((c) => ({
      hostVersion: c.hostVersion,
      hostSha256: sha(c.host),
      coreSha256: sha(c.core),
      entrySha256: sha(c.entry),
    })),
  };
}
export function installationStatus(root: string) {
  const r = readReceipt(join(root, "state/install.json"));
  if (!r) return "Not installed.";
  if (!existsSync(r.target))
    return "Discord entry moved or disappeared. No automatic repair was attempted.";
  const h = sha(r.target);
  return h === r.patchedHash
    ? "Local Volumes entry installed."
    : h === r.originalHash
      ? "Original Discord entry restored."
      : "Discord entry changed. No automatic repair was attempted.";
}
