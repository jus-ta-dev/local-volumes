import { test } from "node:test";
import assert from "node:assert/strict";
import {
  realpathSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hash, install, uninstall } from "../src/install/transaction.ts";

test("backs up, installs idempotently, and restores byte-for-byte", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "local-volumes-test-")));
  try {
    const target = join(root, "index.js"),
      receipt = join(root, "state/install.json"),
      original = "module.exports = require('./core.asar');\n\n";
    writeFileSync(target, original);
    const first = install(
      target,
      "/local/bootstrap.cjs",
      receipt,
      hash(original),
    );
    assert.equal(
      install(target, "/local/bootstrap.cjs", receipt, hash(original))
        .patchedHash,
      first.patchedHash,
    );
    assert.equal(
      readFileSync(
        join(root, `state/${hash(original)}.index.js.backup`),
        "utf8",
      ),
      original,
    );
    uninstall(receipt);
    assert.equal(readFileSync(target, "utf8"), original);
    uninstall(receipt);
    assert.equal(readFileSync(target, "utf8"), original);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("uninstall never overwrites a changed Discord entry", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "local-volumes-test-")));
  try {
    const target = join(root, "index.js"),
      receipt = join(root, "state/install.json");
    writeFileSync(target, "original");
    install(target, "/local/bootstrap.cjs", receipt, hash("original"));
    writeFileSync(target, "updated Discord");
    assert.throws(() => uninstall(receipt), /changed/);
    assert.equal(readFileSync(target, "utf8"), "updated Discord");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("invalid receipts cannot bypass validation in direct install or uninstall", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "lv-receipt-")));
  try {
    const target = join(root, "index.js"),
      receipt = join(root, "receipt.json");
    writeFileSync(target, "original");
    const installed = install(
      target,
      join(root, "bootstrap.cjs"),
      receipt,
      hash("original"),
    );
    const patched = readFileSync(target, "utf8");
    for (const bad of [
      null,
      { ...installed, mode: -1 },
      { ...installed, target: "relative.js" },
      { ...installed, original: "tampered" },
    ]) {
      writeFileSync(receipt, JSON.stringify(bad));
      assert.throws(
        () =>
          install(
            target,
            join(root, "bootstrap.cjs"),
            receipt,
            hash("original"),
          ),
        /Invalid installation receipt/,
      );
      assert.throws(() => uninstall(receipt), /Invalid installation receipt/);
      assert.equal(readFileSync(target, "utf8"), patched);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
