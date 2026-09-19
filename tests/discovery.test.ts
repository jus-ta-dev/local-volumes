import { test } from "node:test";
import assert from "node:assert/strict";
import {
  selectRuntime,
  rawToDisplayedPercent,
  type Runtime,
} from "../src/discord/discovery.ts";

function appRuntime(): Runtime {
  return {
    m: {
      sample: function () {
        throw new Error("MediaEngineStore getLocalVolume: must never execute");
      },
    },
    c: {},
  };
}
test("selects the app runtime when multiple runtimes share a chunk registry", () => {
  const app = appRuntime();
  const unrelated: Runtime = {
    m: {
      sample: function () {
        throw new Error("must never execute");
      },
    },
    c: {},
  };
  assert.equal(selectRuntime([app, unrelated]), app);
  assert.equal(selectRuntime([unrelated, app, app]), app);
});
test("ambiguous or absent app runtimes fail closed", () => {
  assert.throws(() => selectRuntime([]), /0 candidates/);
  assert.throws(
    () => selectRuntime([appRuntime(), appRuntime()]),
    /2 candidates/,
  );
});
test("shows the observed nonlinear Discord volume percentages correctly", () => {
  assert.equal(rawToDisplayedPercent(0), 0);
  assert.equal(rawToDisplayedPercent(100), 100);
  assert.ok(
    Math.abs(rawToDisplayedPercent(100 * Math.pow(0.5, 2.8)) - 50) < 1e-8,
  );
  assert.ok(
    Math.abs(rawToDisplayedPercent(100 * Math.pow(10, 6 / 20)) - 200) < 1e-8,
  );
  assert.throws(() => rawToDisplayedPercent(NaN));
});
