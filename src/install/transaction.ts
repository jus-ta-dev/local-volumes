import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
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
  if (previous) {
    if (previous.target !== target)
      throw new Error("Receipt belongs to a different Discord entry.");
    if (
      hash(current) === previous.patchedHash &&
      previous.status !== "uninstalled"
    )
      return previous;
    if (hash(current) !== previous.originalHash)
      throw new Error(
        "Discord entry changed. No automatic repair or overwrite.",
      );
  }
  if (hash(current) !== expected)
    throw new Error("Unrecognized Discord entry; refusing to modify it.");
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
  atomic(receiptPath, JSON.stringify(receipt, null, 2) + "\n", 0o600);
  if (hash(readFileSync(target)) !== receipt.originalHash)
    throw new Error("Entry changed while preparing installation.");
  atomic(target, patch, receipt.mode);
  receipt.status = "installed";
  atomic(receiptPath, JSON.stringify(receipt, null, 2) + "\n", 0o600);
  return receipt;
}
export function uninstall(receiptPath: string): string {
  const receipt = readReceipt(receiptPath);
  if (!receipt) return "No installation receipt.";
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
