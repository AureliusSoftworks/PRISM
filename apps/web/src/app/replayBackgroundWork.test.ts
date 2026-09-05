import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ReplayBackgroundWork, mapReplayWorkInOrder } from "./replayBackgroundWork.ts";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test("background admission prevents simultaneous masters and releases after failure", async () => {
  const gate = new ReplayBackgroundWork();
  const wait = deferred();
  let starts = 0;
  const first = gate.run(async () => { starts++; await wait.promise; });
  for (let index = 0; index < 50; index++) {
    assert.equal(await gate.run(async () => { starts++; }), false);
  }
  assert.equal(starts, 1);
  wait.resolve();
  assert.equal(await first, true);
  await assert.rejects(gate.run(() => { throw new Error("sync failure"); }), /sync failure/u);
  await assert.rejects(gate.run(async () => { throw new Error("async failure"); }), /async failure/u);
  assert.equal(await gate.run(async () => { starts++; }), true);
  assert.equal(starts, 2);
});

test("bounded audio decoding preserves segment order with out-of-order completion", async () => {
  let active = 0;
  let maximum = 0;
  const waiting = [deferred(), deferred(), deferred(), deferred()];
  const started: number[] = [];
  const result = mapReplayWorkInOrder([0, 1, 2, 3], 2, async (item) => {
    started.push(item);
    maximum = Math.max(maximum, ++active);
    await waiting[item]!.promise;
    active--;
    return `segment-${item}`;
  });
  assert.deepEqual(started, [0, 1]);
  waiting[1]!.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(started, [0, 1, 2]);
  waiting[0]!.resolve();
  waiting[2]!.resolve();
  waiting[3]!.resolve();
  assert.deepEqual(await result, ["segment-0", "segment-1", "segment-2", "segment-3"]);
  assert.equal(maximum, 2);
  assert.deepEqual(await mapReplayWorkInOrder([], 2, async () => 1), []);
});

test("a failed decode stops admission and drains in-flight work before rejecting", async () => {
  const wait = deferred();
  let finished = false;
  const started: number[] = [];
  const result = mapReplayWorkInOrder([0, 1, 2, 3], 2, async (item) => {
    started.push(item);
    if (item === 0) throw new Error("decode failed");
    await wait.promise;
    finished = true;
    return item;
  });
  const rejection = assert.rejects(result, /decode failed/u);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(started, [0, 1]);
  assert.equal(finished, false);
  wait.resolve();
  await rejection;
  assert.equal(finished, true);
});

test("the navigation-safe coordinator and decoder use the bounded path", () => {
  const source = (name: string) => readFileSync(new URL(name, import.meta.url), "utf8");
  const coordinator = source("./ReplayRenderCoordinator.tsx");
  assert.ok(coordinator.indexOf("const backgroundMaster =") < coordinator.indexOf("export function ReplayRenderCoordinator"));
  assert.match(coordinator, /backgroundMaster\.run\(\(\) => mixStudioCut\(recording\.id\)\)/u);
  assert.match(source("./signalStudioCutAudio.ts"), /mapReplayWorkInOrder\(\s*sortedSegments,\s*2,/u);
});
