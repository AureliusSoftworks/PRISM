import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PhosphorRasterSchedule } from "./phosphorRasterSchedule.ts";

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("phosphor raster scheduling", () => {
  it("reattaches a rapid same-markup rerender to unfinished raster work", async () => {
    const schedule = new PhosphorRasterSchedule();
    const pending = deferred<string | null>();
    const committed: string[] = [];
    let rasterizeCalls = 0;
    const request = {
      key: "same-svg:48x48",
      rasterize: () => {
        rasterizeCalls += 1;
        return pending.promise;
      },
      commit: (rasterUrl: string) => committed.push(rasterUrl),
    };

    const cancelFirstEffect = schedule.request(request);
    cancelFirstEffect();
    schedule.request(request);
    pending.resolve("data:image/png;base64,current");
    await pending.promise;
    await Promise.resolve();

    assert.equal(rasterizeCalls, 1);
    assert.deepEqual(committed, ["data:image/png;base64,current"]);
  });

  it("rejects a stale different-key result", async () => {
    const schedule = new PhosphorRasterSchedule();
    const first = deferred<string | null>();
    const second = deferred<string | null>();
    const committed: string[] = [];

    schedule.request({
      key: "first-svg:48x48",
      rasterize: () => first.promise,
      commit: (rasterUrl) => committed.push(rasterUrl),
    });
    schedule.request({
      key: "second-svg:48x48",
      rasterize: () => second.promise,
      commit: (rasterUrl) => committed.push(rasterUrl),
    });

    first.resolve("data:image/png;base64,stale");
    await first.promise;
    await Promise.resolve();
    assert.deepEqual(committed, []);

    second.resolve("data:image/png;base64,current");
    await second.promise;
    await Promise.resolve();
    assert.deepEqual(committed, ["data:image/png;base64,current"]);
  });
});
