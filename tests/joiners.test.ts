import { test } from "node:test";
import assert from "node:assert/strict";
import {
  JoinTracker,
  autoAddJoiners,
  mergeEditedMembers,
} from "../src/core/joiners.ts";
import {
  validateConfig,
  effectiveVolume,
  type Group,
} from "../src/core/config.ts";
import { rawToDisplayedPercent as percent } from "../src/discord/volume.ts";
const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 1e-8);
const group = (autoJoin = true): Group => ({
  id: "group",
  name: "Friends",
  gain: 0.2,
  muted: false,
  members: ["101", "102"],
  autoJoin,
});

test("personal 30% replaces a 20% group contribution only for the selected member", () => {
  const groups = [{ ...group(), memberGains: { "101": 0.3 } }];
  near(percent(effectiveVolume(100, groups, "101")), 30);
  near(percent(effectiveVolume(100, groups, "102")), 20);
  near(percent(effectiveVolume(60, groups, "101")), 30);
  near(percent(effectiveVolume(100, [{ ...groups[0], gain: 0.8 }], "101")), 30);
  assert.equal(effectiveVolume(100, [{ ...groups[0], muted: true }], "101"), 0);
  assert.equal(
    effectiveVolume(100, [{ ...groups[0], memberGains: { "101": 0 } }], "101"),
    0,
  );
  near(
    percent(
      effectiveVolume(
        100,
        [...groups, { ...group(false), id: "second", gain: 0.5 }],
        "101",
      ),
    ),
    30,
  );
});
test("legacy config migrates without changing membership or gain; removed members lose overrides", () => {
  const c = validateConfig({
    version: 1,
    profiles: { "999": { groups: [group(false)] } },
  });
  assert.equal(c.version, 3);
  assert.equal(c.profiles["999"].groups[0].gain, 0.2);
  assert.deepEqual(c.profiles["999"].groups[0].members, ["101", "102"]);
  const g = {
    ...group(),
    members: ["102"],
    memberGains: { "101": 0.3, "102": 0 },
  };
  const migrated = validateConfig({
    version: 2,
    profiles: { "999": { groups: [g] } },
  });
  assert.deepEqual(migrated.profiles["999"].groups[0].memberGains, {
    "102": 0,
  });
  assert.deepEqual(validateConfig(migrated), migrated);
  for (const bad of [
    { autoJoin: "yes" },
    { memberGains: [] },
    { memberGains: null },
    { memberGains: { "101": NaN } },
    { memberGains: { "101": 2.1 } },
    { memberGains: { bad: 0.3 } },
  ]) {
    assert.throws(() =>
      validateConfig({
        version: 2,
        profiles: { "999": { groups: [{ ...group(), ...bad }] } },
      }),
    );
  }
});
test("tracks arrivals, departure/rejoin, channel switches, disconnects and account reset", () => {
  const t = new JoinTracker();
  assert.deepEqual(t.update("a", ["101"]), ["101"]);
  assert.deepEqual(t.update("a", ["101"]), []);
  assert.deepEqual(t.update("a", ["101", "102"]), ["102"]);
  assert.deepEqual(t.update("a", ["102"]), []);
  assert.deepEqual(t.update("a", ["101", "102"]), ["101"]);
  assert.deepEqual(t.update("b", ["101", "102"]), ["101", "102"]);
  assert.deepEqual(t.update(undefined, []), []);
  assert.deepEqual(t.update("b", ["101"]), ["101"]);
  t.reset();
  assert.deepEqual(t.update("b", ["101"]), ["101"]);
});
test("rejoining keeps an assigned user out of the Default auto-add group", () => {
  const tracker = new JoinTracker();
  const groups: Group[] = [
    { ...group(), id: "default", name: "Default group", members: [] },
    {
      ...group(false),
      gain: 0.8,
      members: ["101"],
      memberGains: { "101": 0.7 },
    },
  ];
  tracker.update("call", ["101"]);
  tracker.update("call", []);
  const result = autoAddJoiners(groups, tracker.update("call", ["101", "103"]));
  assert.deepEqual(result.groups[0].members, ["103"]);
  assert.equal(result.groups[1], groups[1]);
  near(percent(effectiveVolume(100, result.groups, "101")), 70);
  near(percent(effectiveVolume(100, result.groups, "103")), 20);
  assert.equal(result.full, false);
  assert.deepEqual(groups[0].members, []);
});
test("saved membership wins on startup, reconnect and channel changes regardless of group order", () => {
  const assigned = { ...group(), members: ["101"] };
  const fallback = { ...group(), id: "fallback", members: [] };
  for (const groups of [
    [assigned, fallback],
    [fallback, assigned],
  ]) {
    const tracker = new JoinTracker();
    for (const channel of ["a", undefined, "a", "b"]) {
      const result = autoAddJoiners(groups, tracker.update(channel, ["101"]));
      assert.equal(result.groups, groups);
      assert.equal(result.full, false);
    }
    tracker.reset();
    assert.equal(
      autoAddJoiners(groups, tracker.update("b", ["101"])).groups,
      groups,
    );
  }
});
test("assigned arrivals do not trigger a full-group warning or remove intentional overlaps", () => {
  const groups: Group[] = [
    {
      ...group(),
      members: Array.from({ length: 500 }, (_, i) => String(i + 1)),
    },
    { ...group(false), id: "manual", members: ["501", "101"] },
  ];
  const result = autoAddJoiners(groups, ["501", "101"]);
  assert.equal(result.groups, groups);
  assert.equal(result.full, false);
});
test("enabling auto-add is future-only; manual removal sticks until the next arrival", () => {
  const t = new JoinTracker();
  let groups = [group(false)];
  t.update("a", ["101", "102", "103"]);
  groups = [{ ...groups[0], autoJoin: true, members: ["102"] }];
  assert.equal(
    autoAddJoiners(groups, t.update("a", ["101", "102", "103"])).groups,
    groups,
  );
  t.update("a", ["102", "103"]);
  const added = autoAddJoiners(
    groups,
    t.update("a", ["101", "102", "103", "104"]),
  );
  assert.deepEqual(added.groups[0].members, ["102", "101", "104"]);
});
test("adds to opted-in groups only, deduplicates and caps membership", () => {
  const groups = [
    group(),
    { ...group(false), id: "off" },
    { ...group(), id: "also-on" },
  ];
  const added = autoAddJoiners(groups, ["103", "103", "101"]);
  assert.deepEqual(added.groups[0].members, ["101", "102", "103"]);
  assert.equal(added.groups[1], groups[1]);
  assert.deepEqual(added.groups[2].members, ["101", "102", "103"]);
  assert.deepEqual(groups[0].members, ["101", "102"]);
  const full = autoAddJoiners(
    [
      {
        ...group(),
        members: Array.from({ length: 500 }, (_, i) => String(i + 1)),
      },
    ],
    ["501"],
  );
  assert.equal(full.full, true);
  assert.equal(full.groups[0].members.length, 500);
});
test("saving an open editor preserves joiners while applying only explicit membership edits", () => {
  assert.deepEqual(
    mergeEditedMembers(["101", "102"], ["102", "104"], ["101", "102", "103"]),
    ["102", "103", "104"],
  );
  assert.deepEqual(mergeEditedMembers(["101"], ["101"], ["101", "102"]), [
    "101",
    "102",
  ]);
});
