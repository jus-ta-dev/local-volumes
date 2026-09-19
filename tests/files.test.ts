import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  realpathSync,
  writeFileSync,
  readFileSync,
  symlinkSync,
  rmSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertPlainPath, atomicWrite } from "../src/files.ts";
import { emptyConfig } from "../src/core/config.ts";
import { readConfig, writeConfig } from "../src/core/storage.ts";

const withoutWindows = { skip: process.platform === "win32" };
function fixture(run: (dir: string) => void) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "lv-files-")));
  try {
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test(
  "settings saves do not follow a pre-existing predictable temporary file",
  withoutWindows,
  () => {
    fixture((dir) => {
      const settings = join(dir, "groups.json"),
        other = join(dir, "other.txt");
      writeFileSync(other, "keep this");
      symlinkSync(other, settings + ".tmp");
      writeConfig(settings, emptyConfig());
      assert.deepEqual(readConfig(settings), emptyConfig());
      assert.equal(readFileSync(other, "utf8"), "keep this");
    });
  },
);
test(
  "settings refuse existing and dangling symbolic links",
  withoutWindows,
  () => {
    fixture((dir) => {
      const settings = join(dir, "groups.json"),
        other = join(dir, "other.txt");
      writeFileSync(other, "keep this");
      symlinkSync(other, settings);
      assert.throws(
        () => writeConfig(settings, emptyConfig()),
        /symbolic-link/,
      );
      assert.throws(() => readConfig(settings), /Could not read/);
      assert.equal(readFileSync(other, "utf8"), "keep this");
      rmSync(other);
      assert.throws(
        () => writeConfig(settings, emptyConfig()),
        /symbolic-link/,
      );
      assert.equal(existsSync(other), false);
    });
  },
);
test(
  "missing children beneath dangling directory links are rejected",
  withoutWindows,
  () => {
    fixture((dir) => {
      const link = join(dir, "linked");
      symlinkSync(join(dir, "missing"), link);
      assert.throws(
        () => assertPlainPath(join(link, "child")),
        /symbolic-link/,
      );
    });
  },
);
test("atomic writes replace content and clean up after rename failures", () => {
  fixture((dir) => {
    const path = join(dir, "settings");
    atomicWrite(path, "old");
    atomicWrite(path, "new");
    assert.equal(readFileSync(path, "utf8"), "new");
    assert.throws(() => atomicWrite(dir, "cannot replace a directory"));
    assert.deepEqual(readdirSync(dir), ["settings"]);
  });
});
