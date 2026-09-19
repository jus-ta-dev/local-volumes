import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";

const root = "dist/release";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const assets = [
  "INSTALL.md",
  "LICENSE",
  "SHA256SUMS.txt",
  "install.ps1",
  "install.sh",
  "local-volumes.zip",
];
assert.deepEqual(readdirSync(`${root}/upload`).sort(), assets);
for (const name of assets)
  assert.equal(
    sha(readFileSync(`${root}/upload/${name}`)),
    sha(readFileSync(`${root}/${name}`)),
  );
for (const line of readFileSync(`${root}/SHA256SUMS.txt`, "utf8")
  .trim()
  .split("\n")) {
  const [expected, name] = line.split("  ");
  assert.ok(assets.includes(name));
  assert.equal(sha(readFileSync(`${root}/${name}`)), expected);
}
const members = JSON.parse(
  execFileSync(
    process.platform === "win32" ? "python" : "python3",
    [
      "-c",
      `import zipfile,json,sys,hashlib
with zipfile.ZipFile(sys.argv[1]) as archive:
 print(json.dumps({name:hashlib.sha256(archive.read(name)).hexdigest() for name in archive.namelist()}))`,
      `${root}/local-volumes.zip`,
    ],
    { encoding: "utf8" },
  ),
);
assert.deepEqual(Object.keys(members).sort(), [
  "LICENSE",
  "bootstrap.cjs",
  "manifest.json",
  "renderer.js",
  "setup.cjs",
]);
const manifest = JSON.parse(
  readFileSync(`${root}/payload/manifest.json`, "utf8"),
);
assert.equal(
  manifest.version,
  JSON.parse(readFileSync("package.json", "utf8")).version,
);
assert.equal(manifest.experimentalWindows, true);
for (const [name, expected] of Object.entries(manifest.files))
  assert.equal(members[name], expected);
assert.equal(members.LICENSE, sha(readFileSync("LICENSE")));
assert.equal(
  members["manifest.json"],
  sha(readFileSync(`${root}/payload/manifest.json`)),
);
for (const name of ["install.sh", "install.ps1", "INSTALL.md"]) {
  const script = readFileSync(`${root}/${name}`, "utf8");
  assert.ok(!script.includes("@@"));
  assert.match(
    script,
    /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/releases\/download\/v/,
  );
  assert.ok(!script.includes("just-a.dev/downloads"));
  if (name !== "INSTALL.md")
    assert.ok(script.includes(sha(readFileSync(`${root}/local-volumes.zip`))));
  assert.ok(!/ExecutionPolicy\s+Bypass/i.test(script));
}
if (process.platform !== "win32")
  execFileSync("/bin/bash", ["-n", `${root}/install.sh`]);
else
  execFileSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "$e=$null; $t=$null; [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path 'dist/release/install.ps1'), [ref]$t, [ref]$e) > $null; if ($e.Count) { $e | Out-String | Write-Error; exit 1 }",
    ],
    { stdio: "inherit" },
  );
console.log(
  "Release assets, archive allowlist, license, checksums, GitHub URLs and installer syntax verified.",
);
