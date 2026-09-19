import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  realpathSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { hash } from "../src/install/transaction.ts";
import {
  dataRoot,
  discoverCandidates,
  readManifest,
  selectCompatible,
  installRelease,
  uninstallRelease,
  diagnose,
  installationStatus,
  type Manifest,
  type Candidate,
} from "../src/install/release.ts";
function fixture(platform = "darwin") {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "lv-release-"))),
    home = join(dir, "home"),
    local = join(home, "AppData/Local");
  const app =
    platform === "darwin"
      ? join(home, "Library/Application Support/discord/app-0.0.412")
      : join(local, "Discord/app-0.0.412");
  const applications = join(dir, "Applications");
  const host =
    platform === "darwin"
      ? join(applications, "Discord.app/Contents/Resources/app.asar")
      : join(app, "resources/app.asar");
  const core = join(
    app,
    "modules/discord_desktop_core-1/discord_desktop_core/core.asar",
  );
  const entry = join(
    app,
    "modules/discord_desktop_core-1/discord_desktop_core/index.js",
  );
  const original = "module.exports = require('./core.asar');\r\n";
  for (const [path, value] of [
    [host, "host fixture"],
    [core, "core fixture"],
    [entry, original],
  ]) {
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, value);
  }
  const packageDir = join(dir, "package");
  mkdirSync(packageDir);
  const files = {
    "bootstrap.cjs": hash("bootstrap"),
    "renderer.js": hash("renderer"),
    "setup.cjs": hash("setup"),
    LICENSE: hash("license fixture"),
  };
  for (const [name, value] of [
    ["bootstrap.cjs", "bootstrap"],
    ["renderer.js", "renderer"],
    ["setup.cjs", "setup"],
    ["LICENSE", "license fixture"],
  ])
    writeFileSync(join(packageDir, name), value);
  const manifest: Manifest = {
    schema: 1,
    version: "0.1.0-beta.1",
    files,
    builds: [
      {
        platform,
        channel: "stable",
        hostVersion: "0.0.412",
        hostSha256: hash("host fixture"),
        coreSha256: hash("core fixture"),
        entrySha256: hash(original),
      },
    ],
  };
  const saveManifest = () =>
    writeFileSync(join(packageDir, "manifest.json"), JSON.stringify(manifest));
  saveManifest();
  const runtime = join(dir, "node"),
    runtimeLicense = join(dir, "LICENSE");
  writeFileSync(runtime, "runtime fixture");
  writeFileSync(runtimeLicense, "license fixture");
  const root =
    platform === "darwin"
      ? dataRoot("darwin", home)
      : dataRoot("win32", home, local);
  const candidate: Candidate = { hostVersion: "0.0.412", host, core, entry };
  const options = {
    root,
    packageDir,
    platform,
    runtime,
    runtimeLicense,
    candidates: [candidate],
    assertClosed: () => {},
  };
  return {
    dir,
    home,
    local,
    root,
    app,
    applications,
    host,
    core,
    entry,
    original,
    packageDir,
    candidate,
    manifest,
    saveManifest,
    options,
    close: () => rmSync(dir, { recursive: true, force: true }),
  };
}
for (const platform of ["darwin", "win32"])
  test(`${platform}: detects fixture, installs permanently, updates without losing settings, and uninstalls exactly`, () => {
    const f = fixture(platform);
    try {
      assert.deepEqual(
        discoverCandidates(platform, f.home, f.local, f.applications),
        [f.candidate],
      );
      installRelease(f.options);
      const patched = readFileSync(f.entry, "utf8");
      assert.match(patched, /Local Volumes/);
      assert.ok(!patched.includes(f.packageDir));
      assert.match(installationStatus(f.root), /installed/);
      const groups = join(f.root, "state/groups.json");
      writeFileSync(groups, '{"keep":"exactly"}');
      installRelease(f.options);
      assert.equal(readFileSync(f.entry, "utf8"), patched);
      f.manifest.version = "0.1.0-beta.2";
      f.saveManifest();
      installRelease(f.options);
      assert.match(readFileSync(join(f.root, "active.json"), "utf8"), /beta.2/);
      assert.equal(readFileSync(groups, "utf8"), '{"keep":"exactly"}');
      assert.equal(readFileSync(f.entry, "utf8"), patched);
      uninstallRelease(f.root, () => {});
      assert.equal(readFileSync(f.entry, "utf8"), f.original);
      uninstallRelease(f.root, () => {});
      assert.equal(readFileSync(f.entry, "utf8"), f.original);
      assert.equal(readFileSync(groups, "utf8"), '{"keep":"exactly"}');
      installRelease(f.options);
      assert.equal(readFileSync(f.entry, "utf8"), patched);
    } finally {
      f.close();
    }
  });
test("unsupported builds, existing modifications, and running Discord do not get patched", () => {
  const f = fixture();
  try {
    writeFileSync(f.core, "new Discord build");
    assert.throws(() => installRelease(f.options), /No verified/);
    assert.equal(readFileSync(f.entry, "utf8"), f.original);
    writeFileSync(f.core, "core fixture");
    writeFileSync(f.entry, "another mod");
    assert.throws(() => installRelease(f.options), /existing mod/);
    assert.equal(readFileSync(f.entry, "utf8"), "another mod");
    writeFileSync(f.entry, f.original);
    assert.throws(
      () =>
        installRelease({
          ...f.options,
          assertClosed: () => {
            throw Error("running");
          },
        }),
      /running/,
    );
    assert.equal(readFileSync(f.entry, "utf8"), f.original);
    assert.throws(
      () =>
        selectCompatible([f.candidate], { ...f.manifest, builds: [] }, "win32"),
      /No verified Windows/,
    );
  } finally {
    f.close();
  }
});
test("tampered downloads and unsafe file manifests are rejected before installation", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.packageDir, "renderer.js"), "tampered");
    assert.throws(() => installRelease(f.options), /checksum mismatch/);
    assert.equal(existsSync(f.root), false);
    writeFileSync(join(f.packageDir, "renderer.js"), "renderer");
    f.manifest.files["../escape"] = hash("escape");
    f.saveManifest();
    assert.throws(() => readManifest(f.packageDir), /Invalid release/);
  } finally {
    f.close();
  }
});
test("changed installed entry, missing target and concurrent installer never cause a forced overwrite", () => {
  const f = fixture();
  try {
    installRelease(f.options);
    writeFileSync(f.entry, "Discord updater changed this");
    assert.throws(() => uninstallRelease(f.root, () => {}), /changed/);
    assert.equal(readFileSync(f.entry, "utf8"), "Discord updater changed this");
    rmSync(f.entry);
    assert.match(installationStatus(f.root), /moved or disappeared/);
    assert.throws(() => uninstallRelease(f.root, () => {}));
    mkdirSync(join(f.root, ".install-lock"));
    assert.throws(() => installRelease(f.options), /Another installer/);
  } finally {
    f.close();
  }
});
test("compatibility report contains no user paths or account data", () => {
  const f = fixture("win32");
  try {
    const report = JSON.stringify(diagnose([f.candidate], "win32"));
    assert.ok(!report.includes(f.home));
    assert.ok(!report.includes(f.root));
    assert.deepEqual(Object.keys(JSON.parse(report).candidates[0]).sort(), [
      "coreSha256",
      "entrySha256",
      "hostSha256",
      "hostVersion",
    ]);
  } finally {
    f.close();
  }
});
test(
  "symlinked installation roots are rejected",
  { skip: process.platform === "win32" },
  () => {
    const f = fixture();
    try {
      const real = join(f.dir, "real");
      mkdirSync(real);
      mkdirSync(join(f.root, ".."), { recursive: true });
      symlinkSync(real, f.root);
      assert.throws(() => installRelease(f.options), /symbolic-link/);
      assert.equal(readFileSync(f.entry, "utf8"), f.original);
    } finally {
      f.close();
    }
  },
);

test("experimental Windows installs an unlisted stock loader and restores it exactly", () => {
  const f = fixture("win32");
  try {
    f.manifest.builds = [];
    f.manifest.experimentalWindows = true;
    f.saveManifest();
    writeFileSync(
      join(f.entry, "..", "package.json"),
      JSON.stringify({ name: "discord_desktop_core", main: "index.js" }),
    );
    assert.match(installRelease(f.options), /Experimental Windows/);
    const patched = readFileSync(f.entry, "utf8");
    installRelease(f.options);
    assert.equal(readFileSync(f.entry, "utf8"), patched);
    uninstallRelease(f.root, () => {});
    assert.equal(readFileSync(f.entry, "utf8"), f.original);
  } finally {
    f.close();
  }
});
test("experimental Windows accepts stock quote/newline variants, but refuses extra code", () => {
  const f = fixture("win32");
  try {
    f.manifest.builds = [];
    f.manifest.experimentalWindows = true;
    writeFileSync(join(f.entry, "..", "package.json"), '{"main":"./index.js"}');
    for (const original of [
      f.original,
      'module.exports = require("./core.asar");\n',
      "\uFEFFmodule.exports=require('./core.asar');\r\n",
    ]) {
      writeFileSync(f.entry, original);
      assert.equal(
        selectCompatible([f.candidate], f.manifest, "win32").build.entrySha256,
        hash(original),
      );
    }
    for (const modified of [
      "require('./another-mod');\n" + f.original,
      f.original + "doSomething();",
      'module.exports=require("../core.asar");',
    ]) {
      writeFileSync(f.entry, modified);
      assert.throws(
        () => selectCompatible([f.candidate], f.manifest, "win32"),
        /modified or unrecognized/,
      );
      assert.equal(readFileSync(f.entry, "utf8"), modified);
    }
  } finally {
    f.close();
  }
});
test("experimental Windows chooses the latest numeric host version, never an older matching one", () => {
  const f = fixture("win32");
  try {
    f.manifest.builds = [];
    f.manifest.experimentalWindows = true;
    writeFileSync(join(f.entry, "..", "package.json"), '{"main":"index.js"}');
    const older = { ...f.candidate, hostVersion: "1.0.9" },
      latest = { ...f.candidate, hostVersion: "1.0.10" };
    assert.equal(
      selectCompatible([latest, older], f.manifest, "win32").candidate,
      latest,
    );
    assert.throws(
      () => selectCompatible([latest, { ...latest }], f.manifest, "win32"),
      /More than one/,
    );
  } finally {
    f.close();
  }
});
test("experimental Windows does not weaken Mac checks or accept a different package entry point", () => {
  const f = fixture("win32");
  try {
    f.manifest.builds = [];
    f.manifest.experimentalWindows = true;
    assert.throws(
      () => selectCompatible([f.candidate], f.manifest, "darwin"),
      /No verified macOS/,
    );
    assert.throws(
      () => selectCompatible([f.candidate], f.manifest, "win32"),
      /entry point/,
    );
    writeFileSync(join(f.entry, "..", "package.json"), '{"main":"other.js"}');
    assert.throws(
      () => selectCompatible([f.candidate], f.manifest, "win32"),
      /entry point/,
    );
    f.saveManifest();
    const raw = JSON.parse(
      readFileSync(join(f.packageDir, "manifest.json"), "utf8"),
    );
    raw.experimentalWindows = "true";
    writeFileSync(join(f.packageDir, "manifest.json"), JSON.stringify(raw));
    assert.throws(
      () => readManifest(f.packageDir),
      /Windows compatibility policy/,
    );
  } finally {
    f.close();
  }
});

test(
  "dangling active-release links are rejected before Discord is modified",
  { skip: process.platform === "win32" },
  () => {
    const f = fixture();
    try {
      mkdirSync(f.root, { recursive: true });
      const outside = join(f.dir, "outside.json");
      symlinkSync(outside, join(f.root, "active.json"));
      assert.throws(() => installRelease(f.options), /symbolic-link/);
      assert.equal(existsSync(outside), false);
      assert.equal(readFileSync(f.entry, "utf8"), f.original);
    } finally {
      f.close();
    }
  },
);

test("website beta users keep their loader and settings when upgrading to the licensed GitHub release", () => {
  const f = fixture();
  try {
    installRelease(f.options);
    const receiptPath = join(f.root, "state/install.json");
    const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
    const legacy = readFileSync(f.entry, "utf8").replace(
      "// Local Volumes\n",
      "// Local Volumes: reversible playback probe\n",
    );
    writeFileSync(f.entry, legacy);
    writeFileSync(
      receiptPath,
      JSON.stringify({ ...receipt, patchedHash: hash(legacy) }),
    );
    const settings = join(f.root, "state/groups.json");
    writeFileSync(settings, '{"saved":"groups"}');
    f.manifest.version = "0.1.0-beta.5";
    f.saveManifest();
    installRelease(f.options);
    assert.equal(readFileSync(f.entry, "utf8"), legacy);
    assert.equal(readFileSync(settings, "utf8"), '{"saved":"groups"}');
    const active = JSON.parse(
      readFileSync(join(f.root, "active.json"), "utf8"),
    );
    assert.equal(active.version, "0.1.0-beta.5");
    assert.equal(
      readFileSync(join(f.root, "releases", active.release, "LICENSE"), "utf8"),
      "license fixture",
    );
    uninstallRelease(f.root, () => {});
    assert.equal(readFileSync(f.entry, "utf8"), f.original);
  } finally {
    f.close();
  }
});
