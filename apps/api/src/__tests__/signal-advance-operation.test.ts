import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SignalAdvanceOperationBusyError,
  SignalAdvanceOperationRegistry,
  SignalAdvanceOperationSupersededError,
  SignalAdvanceOperationTimeoutError,
} from "../signal-advance-operation.ts";

describe("Signal advance operation ownership", () => {
  it("preempts a never-resolving provider run and keeps cleanup run-scoped", async () => {
    const registry = new SignalAdvanceOperationRegistry();
    const first = registry.begin("user-1:episode-1", { preempt: false });
    const neverResolves = registry.run(
      first,
      async () => new Promise<string>(() => undefined),
      10_000,
    );

    const second = registry.begin("user-1:episode-1", { preempt: true });
    await assert.rejects(neverResolves, SignalAdvanceOperationSupersededError);
    registry.finish(first);
    assert.equal(registry.isCurrent(second), true);
    registry.finish(second);
    assert.equal(registry.isCurrent(second), false);
  });

  it("rejects duplicate ordinary runs and bounds non-cooperative work", async () => {
    const registry = new SignalAdvanceOperationRegistry();
    const first = registry.begin("user-1:episode-1", { preempt: false });
    assert.throws(
      () => registry.begin("user-1:episode-1", { preempt: false }),
      SignalAdvanceOperationBusyError,
    );
    registry.finish(first);

    const timed = registry.begin("user-1:episode-1", { preempt: false });
    await assert.rejects(
      registry.run(
        timed,
        async () => new Promise<string>(() => undefined),
        5,
      ),
      (error: unknown) => {
        assert.ok(error instanceof SignalAdvanceOperationTimeoutError);
        assert.equal(error.timeoutMs, 5);
        return true;
      },
    );
    registry.finish(timed);
  });
});
