import { test } from "node:test";
import assert from "node:assert/strict";
import { writePlaybackChecked } from "../src/discord/playback.ts";

function fixture(nativeWrite: (id: string, gain: number) => void) {
  const connection = {
    conn: { setLocalVolume: nativeWrite },
    cached: 100,
    setLocalVolume(id: string, raw: number) {
      this.cached = raw;
      try {
        this.conn.setLocalVolume(id, raw / 100);
      } catch {
        /* Discord swallows this */
      }
    },
  };
  return connection;
}

test("detects native failures even when Discord caches the value and swallows the error", () => {
  const original = () => {
    throw new Error("Native failure");
  };
  const c = fixture(original);
  assert.throws(
    () => writePlaybackChecked(c, "test-user", 0),
    /native playback write/,
  );
  assert.equal(c.cached, 0);
  assert.equal(c.conn.setLocalVolume, original);
});
test("observes native zero and restoration, preserving the native receiver and descriptor", () => {
  const writes: number[] = [];
  const c = fixture(function (this: unknown, id, gain) {
    assert.equal(this, c.conn);
    assert.equal(id, "test-user");
    writes.push(gain);
  });
  const descriptor = Object.getOwnPropertyDescriptor(c.conn, "setLocalVolume");
  writePlaybackChecked(c, "test-user", 0);
  writePlaybackChecked(c, "test-user", 150);
  assert.deepEqual(writes, [0, 1.5]);
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(c.conn, "setLocalVolume"),
    descriptor,
  );
});
test("rejects cached-only writes and wrong native arguments", () => {
  let writes = 0;
  const c = fixture(() => {
    writes++;
  });
  c.setLocalVolume = function (_id, raw) {
    this.cached = raw;
  };
  assert.throws(() => writePlaybackChecked(c, "test-user", 0));
  c.setLocalVolume = function () {
    try {
      this.conn.setLocalVolume("wrong-user", 0);
    } catch {}
  };
  assert.throws(() => writePlaybackChecked(c, "test-user", 0));
  assert.equal(writes, 0);
});
