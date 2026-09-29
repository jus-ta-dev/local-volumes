import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  rmSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const distribution = JSON.parse(
  readFileSync("release/distribution.json", "utf8"),
);
const packageVersion = JSON.parse(readFileSync("package.json", "utf8")).version;
const repository =
  process.argv[2] ?? process.env.GITHUB_REPOSITORY ?? distribution.repository;
const version = process.argv[3] ?? packageVersion;
if (
  process.argv.length > 4 ||
  !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
  !/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(version)
) {
  throw Error(
    "Usage: node scripts/package-release.mjs [owner/repository] [version]",
  );
}
if (version !== packageVersion)
  throw Error("Release version must match package.json.");
if (
  process.env.GITHUB_REF_TYPE === "tag" &&
  process.env.GITHUB_REF_NAME !== `v${version}`
) {
  throw Error("Release tag must match package.json.");
}
const base = `https://github.com/${repository}/releases/download/v${version}`;
const out = resolve("dist/release");
const payload = join(out, "payload");
rmSync(out, { recursive: true, force: true });
mkdirSync(payload, { recursive: true });
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const files = {};
for (const name of ["bootstrap.cjs", "renderer.js", "setup.cjs", "LICENSE"]) {
  const bytes = readFileSync(name === "LICENSE" ? name : join("dist", name));
  files[name] = sha(bytes);
  writeFileSync(join(payload, name), bytes);
}
writeFileSync(
  join(payload, "manifest.json"),
  JSON.stringify(
    {
      schema: 1,
      version,
      files,
    },
    null,
    2,
  ) + "\n",
);

// Explicit members and fixed timestamps keep private files out and builds reproducible.
execFileSync(process.platform === "win32" ? "python" : "python3", [
  "-c",
  `import pathlib,sys,zipfile
root=pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2],'w',zipfile.ZIP_DEFLATED) as archive:
 for name in ['bootstrap.cjs','renderer.js','setup.cjs','LICENSE','manifest.json']:
  info=zipfile.ZipInfo(name, (2026,1,1,0,0,0))
  info.compress_type=zipfile.ZIP_DEFLATED
  info.external_attr=0o100644<<16
  archive.writestr(info,(root/name).read_bytes())`,
  payload,
  join(out, "local-volumes.zip"),
]);

const runtime = JSON.parse(readFileSync("release/runtime.json", "utf8"));
const replacements = {
  BASE: base,
  VERSION: version,
  PAYLOAD_SHA: sha(readFileSync(join(out, "local-volumes.zip"))),
  NODE_VERSION: runtime.version,
  DARWIN_ARM64_SHA: runtime.checksums["darwin-arm64"],
  DARWIN_X64_SHA: runtime.checksums["darwin-x64"],
  WIN_ARM64_SHA: runtime.checksums["win32-arm64"],
  WIN_X64_SHA: runtime.checksums["win32-x64"],
};
for (const name of ["install.sh", "install.ps1", "INSTALL.md"]) {
  const template = readFileSync(join("scripts/templates", name), "utf8");
  const content = template.replace(/@@([A-Z0-9_]+)@@/g, (_, key) => {
    if (!replacements[key]) throw Error(`Missing template value: ${key}`);
    return replacements[key];
  });
  writeFileSync(join(out, name), content);
}
copyFileSync("LICENSE", join(out, "LICENSE"));
const assets = [
  "local-volumes.zip",
  "install.sh",
  "install.ps1",
  "INSTALL.md",
  "LICENSE",
];
writeFileSync(
  join(out, "SHA256SUMS.txt"),
  assets
    .map((name) => `${sha(readFileSync(join(out, name)))}  ${name}`)
    .join("\n") + "\n",
);
const upload = join(out, "upload");
mkdirSync(upload);
for (const name of [...assets, "SHA256SUMS.txt"])
  copyFileSync(join(out, name), join(upload, name));
console.log(
  `Release: ${version}\nDownloads: ${base}\nUpload assets: ${upload}`,
);
