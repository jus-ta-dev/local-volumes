import { test } from "node:test";
import assert from "node:assert/strict";
import {
  realpathSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  emptyConfig,
  validateConfig,
  effectiveVolume,
  MAX_RAW,
  type Group,
} from "../src/core/config.ts";
import { readConfig, writeConfig } from "../src/core/storage.ts";
import {
  displayedPercentToRaw as raw,
  rawToDisplayedPercent as percent,
} from "../src/discord/volume.ts";
import { Mixer } from "../src/core/mixer.ts";
import type { PlaybackTarget } from "../src/discord/playback.ts";
const group = (gain = 0.5): Group => ({
  id: "g1",
  name: "Gaming",
  gain,
  muted: false,
  members: ["123"],
});

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
test("group percentages are absolute regardless of the saved individual volume", () => {
  for (const baseline of [0, 10, 50, 100, 140, 200]) {
    near(percent(effectiveVolume(raw(baseline), [group(0.1)], "123")), 10);
    assert.equal(effectiveVolume(raw(baseline), [group(1)], "123"), 100);
    assert.equal(effectiveVolume(raw(baseline), [group(2)], "123"), MAX_RAW);
  }
  near(effectiveVolume(100, [group(0.5)], "123"), 14.358729437462939);
  assert.equal(effectiveVolume(140, [group(0)], "123"), 0);
  assert.equal(effectiveVolume(140, [{ ...group(), muted: true }], "123"), 0);
  assert.equal(effectiveVolume(140, [group()], "456"), 140);
  assert.equal(effectiveVolume(140, [], "123"), 140);
  assert.throws(() => effectiveVolume(NaN, [], "123"));
});
test("overlapping groups use the lowest assigned level independent of order; mute wins", () => {
  const groups = [group(0.5), { ...group(0.1), id: "g2" }];
  near(percent(effectiveVolume(raw(50), groups, "123")), 10);
  near(percent(effectiveVolume(raw(50), [...groups].reverse(), "123")), 10);
  near(percent(effectiveVolume(raw(50), [groups[0]], "123")), 50);
  assert.equal(
    effectiveVolume(100, [...groups, { ...group(2), muted: true }], "123"),
    0,
  );
});
test("volume curve round-trips and absolute levels remain monotonic across the full slider", () => {
  for (let p = 0; p <= 200; p++) {
    near(percent(raw(p)), p);
    let previous = -1;
    for (const level of [0, 0.02, 0.1, 0.2, 0.5, 1, 1.5, 2]) {
      const result = effectiveVolume(raw(p), [group(level)], "123");
      assert.ok(result >= previous && result <= MAX_RAW);
      near(percent(result), level * 100);
      previous = result;
    }
  }
  for (const invalid of [-1, 201, NaN, Infinity])
    assert.throws(() => raw(invalid));
});
test("validates and isolates account profiles; rejects malformed and prototype-shaped input", () => {
  const input = {
    version: 1,
    profiles: { "100": { groups: [group()] }, "200": { groups: [] } },
  };
  const c = validateConfig(input);
  c.profiles["100"].groups[0].members.push("456");
  assert.deepEqual(input.profiles["100"].groups[0].members, ["123"]);
  assert.equal(c.profiles["200"].groups.length, 0);
  for (const bad of [
    null,
    [],
    {},
    { version: 99, profiles: {} },
    { version: 1, profiles: [] },
    JSON.parse('{"version":1,"profiles":{"__proto__":{"groups":[]}}}'),
  ])
    assert.throws(() => validateConfig(bad));
  for (const patch of [
    { gain: -1 },
    { gain: 3 },
    { gain: NaN },
    { name: "" },
    { members: ["bad-id"] },
    { muted: "false" },
  ])
    assert.throws(() =>
      validateConfig({
        version: 1,
        profiles: { "100": { groups: [{ ...group(), ...patch }] } },
      }),
    );
});
test("missing configuration is empty, saves round-trip, corrupt config is preserved", () => {
  const dir = realpathSync(
    mkdtempSync(join(tmpdir(), "local-volumes-groups-")),
  );
  const path = join(dir, "groups.json");
  try {
    assert.deepEqual(readConfig(path), emptyConfig());
    const config = validateConfig({
      version: 1,
      profiles: { "100": { groups: [group()] } },
    });
    writeConfig(path, config);
    assert.deepEqual(readConfig(path), config);
    assert.throws(() => writeConfig(path, { version: 0 }));
    assert.deepEqual(readConfig(path), config);
    writeFileSync(path, "{broken");
    assert.throws(() => readConfig(path));
    assert.equal(readFileSync(path, "utf8"), "{broken");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
function fixture() {
  let baseline = 140,
    playback = baseline,
    current = true,
    present = true,
    fails = false;
  const writes: number[] = [];
  const target: PlaybackTarget = {
    userId: "123",
    readBaseline: () => baseline,
    readPlayback: () => playback,
    writePlayback: (value) => {
      if (fails) throw new Error("Native error");
      playback = value;
      writes.push(value);
    },
    isCurrent: () => current,
  };
  const adapter = {
    participants: () =>
      present ? [{ id: "123", name: "Player", raw: baseline }] : [],
    target: () => target,
  };
  return {
    adapter,
    writes,
    baseline: (n: number) => {
      baseline = n;
    },
    playback: () => playback,
    overwrite: (n: number) => {
      playback = n;
    },
    leave: () => {
      present = false;
    },
    stale: () => {
      current = false;
      present = false;
    },
    fail: () => {
      fails = true;
    },
    recover: () => {
      fails = false;
    },
  };
}
test("group changes restore exact individual values without compounding or redundant native writes", () => {
  const f = fixture();
  const mixer = new Mixer();
  mixer.reconcile(f.adapter, [group()]);
  mixer.reconcile(f.adapter, [group()]);
  assert.deepEqual(f.writes, [raw(50)]);
  mixer.reconcile(f.adapter, [group(0.25)]);
  near(f.playback(), raw(25));
  f.baseline(80);
  mixer.reconcile(f.adapter, [group(0.25)]);
  near(f.playback(), raw(25));
  mixer.reconcile(f.adapter, []);
  assert.equal(f.playback(), 80);
});
test("membership removal, pause and departure restore preferences", () => {
  for (const mode of ["remove", "pause", "leave"]) {
    const f = fixture();
    const mixer = new Mixer();
    mixer.reconcile(f.adapter, [group(0)]);
    assert.equal(f.playback(), 0);
    if (mode === "pause") mixer.paused = true;
    if (mode === "leave") f.leave();
    mixer.reconcile(
      f.adapter,
      mode === "remove" ? [{ ...group(), members: [] }] : [group(0)],
    );
    assert.equal(f.playback(), 140);
  }
});
test("reapplies after external reset but skips stale connections", () => {
  const f = fixture();
  const mixer = new Mixer();
  mixer.reconcile(f.adapter, [group()]);
  f.overwrite(140);
  mixer.reconcile(f.adapter, [group()]);
  near(f.playback(), raw(50));
  f.stale();
  mixer.reconcile(f.adapter, []);
  assert.deepEqual(f.writes, [raw(50), raw(50)]);
});
test("failure pauses, does not loop writes, and explicit retry restores before resume", () => {
  const f = fixture();
  const mixer = new Mixer();
  mixer.reconcile(f.adapter, [group()]);
  f.fail();
  mixer.reconcile(f.adapter, [group(0)]);
  assert.equal(mixer.paused, true);
  assert.match(mixer.error, /Restoration failed/);
  f.recover();
  mixer.reconcile(f.adapter, [group(0)]);
  near(f.playback(), raw(50));
  mixer.retry();
  assert.equal(f.playback(), 140);
  assert.equal(mixer.error, "");
  assert.equal(mixer.paused, true);
  mixer.paused = false;
  mixer.reconcile(f.adapter, [group(0)]);
  assert.equal(f.playback(), 0);
});
test("does not acquire an existing unrelated override", () => {
  const f = fixture();
  f.overwrite(42);
  const mixer = new Mixer();
  mixer.reconcile(f.adapter, [group()]);
  assert.equal(mixer.paused, true);
  assert.deepEqual(f.writes, []);
});

test("100% is an active absolute assignment; pause restores the latest saved preference", () => {
  const f = fixture();
  const mixer = new Mixer();
  f.baseline(raw(50));
  f.overwrite(raw(50));
  mixer.reconcile(f.adapter, [group(0.1)]);
  near(percent(f.playback()), 10);
  mixer.reconcile(f.adapter, [group(1)]);
  assert.equal(f.playback(), 100);
  f.baseline(raw(75));
  f.overwrite(raw(75));
  mixer.reconcile(f.adapter, [group(1)]);
  assert.equal(f.playback(), 100);
  mixer.paused = true;
  mixer.reconcile(f.adapter, [group(1)]);
  assert.equal(f.playback(), raw(75));
  mixer.paused = false;
  mixer.reconcile(f.adapter, [group(1)]);
  assert.equal(f.playback(), 100);
  mixer.reconcile(f.adapter, []);
  assert.equal(f.playback(), raw(75));
});
