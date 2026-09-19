import { test } from "node:test";
import assert from "node:assert/strict";
import { realpathSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  defaultShortcut,
  matchesShortcut,
  recordShortcut,
  shortcutLabel,
  validateShortcut,
} from "../src/core/shortcut.ts";
import { validateConfig } from "../src/core/config.ts";
import { readConfig, writeConfig } from "../src/core/storage.ts";

const key = (patch = {}) => ({
  code: "KeyL",
  ctrlKey: true,
  metaKey: false,
  altKey: false,
  shiftKey: true,
  ...patch,
});
test("default and recorded shortcuts map Command on Mac to Ctrl on Windows/Linux", () => {
  const shortcut = defaultShortcut();
  assert.equal(matchesShortcut(key(), shortcut, false), true);
  assert.equal(
    matchesShortcut(key({ ctrlKey: false, metaKey: true }), shortcut, true),
    true,
  );
  assert.equal(shortcutLabel(shortcut, false), "Ctrl+Shift+L");
  assert.equal(shortcutLabel(shortcut, true), "⌘⇧L");
  const custom = recordShortcut(
    key({ code: "KeyK", ctrlKey: false, metaKey: true, altKey: true }),
    true,
  )!;
  assert.equal(shortcutLabel(custom, false), "Ctrl+Alt+Shift+K");
  assert.equal(
    matchesShortcut(key({ code: "KeyK", altKey: true }), custom, false),
    true,
  );
  assert.equal(matchesShortcut(key(), custom, false), false);
});
test("typing, extra modifiers, repeat, composition and AltGr do not activate the shortcut", () => {
  for (const patch of [
    { ctrlKey: false },
    { metaKey: true },
    { altKey: true },
    { shiftKey: false },
    { code: "KeyK" },
    { repeat: true },
    { isComposing: true },
    { getModifierState: () => true },
  ]) {
    assert.equal(matchesShortcut(key(patch), defaultShortcut(), false), false);
  }
  for (const code of ["Escape", "ControlLeft", "Delete", "Space", "F13"])
    assert.equal(recordShortcut(key({ code }), false), undefined);
  for (const value of [
    null,
    {},
    { ...defaultShortcut(), primary: false },
    { ...defaultShortcut(), alt: 1 },
  ])
    assert.throws(() => validateShortcut(value));
});
test("legacy groups migrate and custom shortcuts survive validated disk saves", () => {
  const groups = [
    {
      id: "g",
      name: "Gaming",
      gain: 0.2,
      muted: false,
      members: ["123"],
      memberGains: { "123": 0.3 },
      autoJoin: true,
    },
  ];
  const config = validateConfig({
    version: 2,
    profiles: { "999": { groups } },
  });
  assert.equal(config.version, 3);
  assert.deepEqual(config.profiles["999"].groups, groups);
  assert.equal(config.shortcut, undefined);
  config.shortcut = recordShortcut(
    key({ code: "Digit7", shiftKey: false }),
    false,
  )!;
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "lv-shortcut-")));
  try {
    const path = join(dir, "groups.json");
    writeConfig(path, config);
    assert.deepEqual(readConfig(path), config);
    writeConfig(path, { ...config, shortcut: undefined });
    assert.equal(readConfig(path).shortcut, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
