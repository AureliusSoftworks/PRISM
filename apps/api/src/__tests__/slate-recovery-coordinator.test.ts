import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { DatabaseSync } from "node:sqlite";
import type {
  SlateRecoverySnapshotV1,
  SlateRecoveryWriteResult,
} from "../slate-author-safety.ts";
import {
  SlateRecoveryCoordinator,
  type SlateRecoveryClock,
  type SlateRecoveryFailureEvent,
  type SlateRecoveryGenerationWriter,
} from "../slate-recovery-coordinator.ts";
import { closeTestDatabase, createTestDatabase } from "../test-support.ts";

class FakeClock implements SlateRecoveryClock {
  private currentMs: number;
  private nextId = 1;
  private readonly timers = new Map<number, { at: number; callback: () => void }>();

  public constructor(start = "2026-07-16T12:00:00.000Z") {
    this.currentMs = Date.parse(start);
  }

  public now(): Date {
    return new Date(this.currentMs);
  }

  public setTimeout(callback: () => void, delayMs: number): unknown {
    const id = this.nextId++;
    this.timers.set(id, { at: this.currentMs + Math.max(0, delayMs), callback });
    return id;
  }

  public clearTimeout(handle: unknown): void {
    this.timers.delete(Number(handle));
  }

  public advanceBy(milliseconds: number): void {
    const target = this.currentMs + milliseconds;
    while (true) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      if (!due) break;
      this.currentMs = due[1].at;
      this.timers.delete(due[0]);
      due[1].callback();
    }
    this.currentMs = target;
  }
}

function fakeWriteResult(
  projectId: string,
  mirror: SlateRecoveryWriteResult["mirror"] = {
    status: "disabled",
    path: null,
    error: null,
  },
): SlateRecoveryWriteResult {
  return {
    created: true,
    path: `/recovery/${projectId}.json`,
    prunedPaths: [],
    mirror,
    snapshot: {
      projectId,
      seriesId: "series-1",
    } as SlateRecoverySnapshotV1,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function runDue(
  clock: FakeClock,
  coordinator: SlateRecoveryCoordinator,
  milliseconds: number,
): Promise<void> {
  clock.advanceBy(milliseconds);
  await coordinator.waitForIdle();
}

describe("Slate recovery coordinator", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => closeTestDatabase(db));

  it("coalesces rapid edits and observes the active five-minute-style cadence", async () => {
    const clock = new FakeClock();
    const calls: Array<{ userId: string; projectId: string; capturedAt: string }> = [];
    const coordinator = new SlateRecoveryCoordinator({
      db,
      rootDirectory: "/explicit/recovery/root",
      clock,
      coalesceMs: 100,
      cadenceMs: 1_000,
      writer: (_db, userId, projectId, _root, options) => {
        calls.push({ userId, projectId, capturedAt: options.capturedAt.toISOString() });
        return fakeWriteResult(projectId);
      },
    });
    const reference = { userId: "author-a", projectId: "project-a" };
    const saved = { revision: 4 };

    assert.equal(coordinator.afterSuccessfulMutation(saved, reference), saved);
    const second = coordinator.schedulePostMutation({ ...reference, reason: "Typed another line" });
    const third = coordinator.schedulePostMutation({ ...reference, reason: "Adjusted punctuation" });

    assert.equal(second.accepted, true);
    assert.equal(third.scheduledFor, "2026-07-16T12:00:00.100Z");
    clock.advanceBy(99);
    assert.equal(calls.length, 0);
    await runDue(clock, coordinator, 1);
    assert.equal(calls.length, 1);
    assert.equal(coordinator.status(reference)?.mutationSequence, 3);
    assert.equal(coordinator.status(reference)?.protectedSequence, 3);
    assert.equal(coordinator.status(reference)?.dirty, false);

    const next = coordinator.schedulePostMutation({ ...reference, reason: "Continued drafting" });
    assert.equal(next.scheduledFor, "2026-07-16T12:00:01.100Z");
    clock.advanceBy(999);
    assert.equal(calls.length, 1);
    await runDue(clock, coordinator, 1);
    assert.equal(calls.length, 2);
    await coordinator.dispose();
  });

  it("lets milestones bypass cadence and reruns a forced snapshot after an in-flight write", async () => {
    const clock = new FakeClock();
    const held = deferred<SlateRecoveryWriteResult>();
    let callCount = 0;
    const coordinator = new SlateRecoveryCoordinator({
      db,
      rootDirectory: "/explicit/recovery/root",
      clock,
      coalesceMs: 100,
      cadenceMs: 10_000,
      writer: (_db, _userId, projectId) => {
        callCount += 1;
        if (callCount === 3) return held.promise;
        return fakeWriteResult(projectId);
      },
    });
    const reference = { userId: "author-a", projectId: "project-a" };

    coordinator.schedulePostMutation(reference);
    await runDue(clock, coordinator, 100);
    coordinator.schedulePostMutation(reference);
    const milestone = coordinator.scheduleMilestone({ ...reference, reason: "Accepted rewrite" });
    assert.equal(milestone.scheduledFor, "2026-07-16T12:00:00.100Z");
    await runDue(clock, coordinator, 0);
    assert.equal(callCount, 2);

    coordinator.forceSnapshot({ ...reference, reason: "Before restore" });
    clock.advanceBy(0);
    await Promise.resolve();
    assert.equal(callCount, 3);
    assert.equal(coordinator.status(reference)?.inFlight, true);
    coordinator.forceSnapshot({ ...reference, reason: "A newer forced state" });
    held.resolve(fakeWriteResult(reference.projectId));
    await coordinator.waitForIdle();
    clock.advanceBy(0);
    await coordinator.waitForIdle();

    assert.equal(callCount, 4);
    assert.equal(coordinator.status(reference)?.dirty, false);
    assert.equal(coordinator.status(reference)?.protectedSequence, 5);
    await coordinator.dispose();
  });

  it("keeps successful mutations successful, isolates callbacks, and retries snapshot failure", async () => {
    const clock = new FakeClock();
    const failures: SlateRecoveryFailureEvent[] = [];
    let callCount = 0;
    const coordinator = new SlateRecoveryCoordinator({
      db,
      rootDirectory: "/explicit/recovery/root",
      clock,
      coalesceMs: 100,
      cadenceMs: 1_000,
      failureRetryMs: 500,
      writer: (_db, _userId, projectId) => {
        callCount += 1;
        if (callCount === 1) throw new Error("disk temporarily unavailable");
        return fakeWriteResult(projectId);
      },
      onFailure: (event) => {
        failures.push(event);
        throw new Error("broken observer must remain isolated");
      },
    });
    const reference = { userId: "author-a", projectId: "project-a" };

    const mutationResult = coordinator.afterSuccessfulMutation("saved-author-prose", reference);
    assert.equal(mutationResult, "saved-author-prose");
    await runDue(clock, coordinator, 100);

    assert.equal(callCount, 1);
    assert.equal(coordinator.status(reference)?.dirty, true);
    assert.equal(coordinator.status(reference)?.lastError, "disk temporarily unavailable");
    assert.equal(coordinator.status(reference)?.scheduledFor, "2026-07-16T12:00:00.600Z");
    assert.equal(failures[0]?.phase, "snapshot");
    assert.equal(failures[0]?.willRetry, true);

    clock.advanceBy(499);
    assert.equal(callCount, 1);
    await runDue(clock, coordinator, 1);
    assert.equal(callCount, 2);
    assert.equal(coordinator.status(reference)?.dirty, false);
    assert.equal(coordinator.status(reference)?.lastError, null);
    await coordinator.dispose();
  });

  it("continues protected local writes when mirror configuration fails", async () => {
    const clock = new FakeClock();
    const failures: SlateRecoveryFailureEvent[] = [];
    const mirrorInputs: Array<string | null> = [];
    const coordinator = new SlateRecoveryCoordinator({
      db,
      rootDirectory: "/explicit/recovery/root",
      clock,
      coalesceMs: 0,
      mirrorDirectoryForProject: () => {
        throw new Error("selected mirror is offline");
      },
      writer: (_db, _userId, projectId, _root, options) => {
        mirrorInputs.push(options.mirrorDirectory);
        return fakeWriteResult(projectId);
      },
      onFailure: (event) => failures.push(event),
      onProtected: () => {
        throw new Error("broken success observer must remain isolated");
      },
    });
    const reference = { userId: "author-a", projectId: "project-a" };

    coordinator.schedulePostMutation(reference);
    await runDue(clock, coordinator, 0);

    assert.deepEqual(mirrorInputs, [null]);
    assert.equal(failures[0]?.phase, "mirror");
    assert.equal(coordinator.status(reference)?.lastProtectedAt, "2026-07-16T12:00:00.000Z");
    assert.equal(coordinator.status(reference)?.lastMirrorError, "selected mirror is offline");
    assert.equal(coordinator.status(reference)?.lastError, null);
    await coordinator.dispose();
  });

  it("retires a project only after its in-flight writer settles and rejects later schedules", async () => {
    const clock = new FakeClock();
    const held = deferred<SlateRecoveryWriteResult>();
    let callCount = 0;
    const coordinator = new SlateRecoveryCoordinator({
      db,
      rootDirectory: "/explicit/recovery/root",
      clock,
      coalesceMs: 0,
      writer: (_db, _userId, projectId) => {
        callCount += 1;
        return callCount === 1 ? held.promise : fakeWriteResult(projectId);
      },
    });
    const reference = { userId: "author-a", projectId: "project-a" };

    coordinator.forceSnapshot(reference);
    clock.advanceBy(0);
    await Promise.resolve();
    assert.equal(callCount, 1);

    const retirement = coordinator.retireProject(reference);
    assert.equal(coordinator.schedulePostMutation(reference).accepted, false);
    held.resolve(fakeWriteResult(reference.projectId));
    await retirement;
    assert.equal(coordinator.status(reference), null);
    clock.advanceBy(60_000);
    await coordinator.waitForIdle();
    assert.equal(callCount, 1);

    coordinator.resumeProject(reference);
    assert.equal(coordinator.forceSnapshot(reference).accepted, true);
    await runDue(clock, coordinator, 0);
    assert.equal(callCount, 2);
    await coordinator.dispose();
  });

  it("serializes projects by default and can flush future cadence work explicitly", async () => {
    const clock = new FakeClock();
    const first = deferred<SlateRecoveryWriteResult>();
    const calls: string[] = [];
    const writer: SlateRecoveryGenerationWriter = (_db, _userId, projectId) => {
      calls.push(projectId);
      return projectId === "project-a" ? first.promise : fakeWriteResult(projectId);
    };
    const coordinator = new SlateRecoveryCoordinator({
      db,
      rootDirectory: "/explicit/recovery/root",
      clock,
      coalesceMs: 0,
      cadenceMs: 10_000,
      writer,
    });

    coordinator.forceSnapshot({ userId: "author-a", projectId: "project-a" });
    coordinator.forceSnapshot({ userId: "author-a", projectId: "project-b" });
    clock.advanceBy(0);
    await Promise.resolve();
    assert.deepEqual(calls, ["project-a"]);
    first.resolve(fakeWriteResult("project-a"));
    await coordinator.waitForIdle();
    assert.deepEqual(calls, ["project-a", "project-b"]);

    coordinator.schedulePostMutation({ userId: "author-a", projectId: "project-a" });
    assert.ok(coordinator.status({ userId: "author-a", projectId: "project-a" })?.scheduledFor);
    await coordinator.flushPending("API shutdown");
    assert.deepEqual(calls, ["project-a", "project-b", "project-a"]);
    await coordinator.dispose();
  });
});
