import { createHash } from "node:crypto";
import {
  lstatSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { dirname, join, isAbsolute } from "node:path";
import { assertPlainPath, atomicWrite as atomic } from "../files.ts";

export const hash = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
export interface Receipt {
  version: 1;
  target: string;
  originalHash: string;
  patchedHash: string;
  original: string;
  mode: number;
  installedAt: string;
  status: "prepared" | "installed" | "uninstalled";
}
export function readReceipt(path: string): Receipt | undefined {
  assertPlainPath(path);
  if (!existsSync(path)) return;
  const r = JSON.parse(readFileSync(path, "utf8")) as Receipt;
  const validHash = (value: unknown) =>
    typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
  if (
    !r ||
    r.version !== 1 ||
    !validHash(r.originalHash) ||
    !validHash(r.patchedHash) ||
    typeof r.original !== "string" ||
    hash(r.original) !== r.originalHash ||
    !Number.isInteger(r.mode) ||
    r.mode < 0 ||
    r.mode > 0o777 ||
    typeof r.target !== "string" ||
    !isAbsolute(r.target) ||
    !["prepared", "installed", "uninstalled"].includes(r.status)
  ) {
    throw new Error("Invalid installation receipt. No files were changed.");
  }
  assertPlainPath(r.target);
  return r;
}
export function install(
  target: string,
  bootstrap: string,
  receiptPath: string,
  expected: string,
): Receipt {
  assertPlainPath(target);
  assertPlainPath(bootstrap);
  assertPlainPath(receiptPath);
  const current = readFileSync(target, "utf8");
  const previous = readReceipt(receiptPath);
  if (
    previous?.target === target &&
    hash(current) === previous.patchedHash &&
    previous.status !== "uninstalled"
  )
    return previous;
  if (hash(current) !== expected)
    throw new Error("Unrecognized Discord entry; refusing to modify it.");
  const moved = previous && previous.target !== target;
  if (moved && existsSync(previous.target)) {
    const oldHash = hash(readFileSync(previous.target));
    if (![previous.originalHash, previous.patchedHash].includes(oldHash))
      throw new Error(
        "Previous Discord entry changed; refusing to overwrite it during reinstall.",
      );
  }
  const patch = `// Local Volumes\ntry { require(${JSON.stringify(bootstrap)}); } catch { console.warn('[Local Volumes] Could not load; starting Discord normally.'); }\n${current}`;
  const receipt: Receipt = {
    version: 1,
    target,
    originalHash: hash(current),
    patchedHash: hash(patch),
    original: current,
    mode: lstatSync(target).mode & 0o777,
    installedAt: new Date().toISOString(),
    status: "prepared",
  };
  mkdirSync(dirname(receiptPath), { recursive: true, mode: 0o700 });
  const backup = join(
    dirname(receiptPath),
    `${receipt.originalHash}.index.js.backup`,
  );
  assertPlainPath(backup);
  if (!existsSync(backup))
    writeFileSync(backup, current, { mode: 0o600, flag: "wx" });
  if (hash(readFileSync(backup)) !== receipt.originalHash)
    throw new Error("Backup verification failed.");
  if (hash(readFileSync(target)) !== receipt.originalHash)
    throw new Error("Entry changed while preparing installation.");
  if (previous && (moved || previous.originalHash !== receipt.originalHash)) {
    // Retain the old receipt as well as its original-loader backup after updates.
    const history = readFileSync(receiptPath);
    const archived = join(
      dirname(receiptPath),
      `${hash(history)}.install.json.backup`,
    );
    assertPlainPath(archived);
    if (!existsSync(archived))
      writeFileSync(archived, history, { mode: 0o600, flag: "wx" });
    if (hash(readFileSync(archived)) !== hash(history))
      throw new Error("Previous installation receipt backup verification failed.");
    if (moved) uninstall(receiptPath);
  }
  if (hash(readFileSync(target)) !== receipt.originalHash)
    throw new Error("Entry changed while preparing installation.");
  atomic(receiptPath, JSON.stringify(receipt, null, 2) + "\n", 0o600);
  atomic(target, patch, receipt.mode);
  receipt.status = "installed";
  atomic(receiptPath, JSON.stringify(receipt, null, 2) + "\n", 0o600);
  return receipt;
}
export function uninstall(receiptPath: string): string {
  const receipt = readReceipt(receiptPath);
  if (!receipt) return "No installation receipt.";
  if (!existsSync(receipt.target)) {
    receipt.status = "uninstalled";
    atomic(receiptPath, JSON.stringify(receipt, null, 2) + "\n", 0o600);
    return "Discord entry was removed by an update. Settings and backups have been kept.";
  }
  const currentHash = hash(readFileSync(receipt.target));
  if (currentHash !== receipt.originalHash) {
    if (currentHash !== receipt.patchedHash)
      throw new Error(
        "Discord entry changed since installation; refusing to overwrite it.",
      );
    atomic(receipt.target, receipt.original, receipt.mode);
  }
  receipt.status = "uninstalled";
  atomic(receiptPath, JSON.stringify(receipt, null, 2) + "\n", 0o600);
  return "Original Discord entry restored. Fully restart Discord to unload Local Volumes.";
}
