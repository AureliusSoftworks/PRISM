import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { describe, it } from "node:test";
import {
  currentPrismRefractionInvocationSignal,
  invokePrismRefractionAction,
  PrismRefractionRunOwner,
  RefractionDurationHistory,
  prismRefractionRequestInit,
  waitForRefraction,
} from "./prismRefractionRun.ts";
import {
  blockingLoaderCancelAction,
  blockingLoaderFocusIndex,
  refractionEtaLabel,
  REFRACTION_CANCEL_WARNING,
} from "./prismBlockingLoaderFormat.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("owned fullscreen refractions", () => {
  it("aborts work and never applies a non-cooperative late result", async () => {
    const pending = deferred<string>();
    const owner = new PrismRefractionRunOwner(() => undefined);
    const run = owner.begin();
    let applied = "saved asset";
    let requestSignal: AbortSignal | undefined;
    const work = (async () => {
      applied = await run.wait((signal) => {
        requestSignal = signal;
        return pending.promise;
      });
    })();
    await Promise.resolve();
    run.cancel();
    await assert.rejects(work, { name: "AbortError" });
    assert.equal(requestSignal?.aborted, true);
    pending.resolve("late replacement");
    await Promise.resolve();
    assert.equal(applied, "saved asset");
    assert.equal(run.finish(true), true);
  });

  it("cancels during warmup without starting generation", async () => {
    const warmup = deferred<void>();
    const owner = new PrismRefractionRunOwner(() => undefined);
    const run = owner.begin();
    let requests = 0;
    const work = (async () => {
      await run.wait(() => warmup.promise);
      await run.wait(async () => { requests += 1; });
    })();
    run.cancel();
    await assert.rejects(work, { name: "AbortError" });
    warmup.resolve();
    await Promise.resolve();
    assert.equal(requests, 0);
    run.finish();
  });

  it("an old cancellation or finally cannot clear the newer run", async () => {
    let shown: number | null = null;
    const owner = new PrismRefractionRunOwner((run) => { shown = run?.id ?? null; });
    const first = owner.begin();
    const second = owner.begin();
    assert.equal(first.signal.aborted, true);
    assert.equal(first.ownsSlot(), false);
    assert.equal(second.isCurrent(), true);
    assert.equal(first.finish(), false);
    first.cancel();
    assert.equal(shown, second.id);
    assert.throws(() => first.assertCurrent(), { name: "AbortError" });
    second.finish();
    assert.equal(shown, null);
  });

  it("revokes external cancellation and unmount ownership, including listeners", async () => {
    const external = new AbortController();
    const owner = new PrismRefractionRunOwner(() => undefined);
    const run = owner.begin({ signal: external.signal });
    const work = run.wait(() => new Promise<void>(() => undefined));
    owner.dispose();
    await assert.rejects(work, { name: "AbortError" });
    assert.equal(run.ownsSlot(), false);
    assert.equal(getEventListeners(external.signal, "abort").length, 0);
    assert.equal(getEventListeners(run.signal, "abort").length, 0);
  });

  it("revokes detached work on completion without clearing a replacement started by an abort listener", () => {
    let shown: number | null = null;
    const owner = new PrismRefractionRunOwner((run) => { shown = run?.id ?? null; });
    const first = owner.begin();
    let replacement: ReturnType<typeof owner.begin> | undefined;
    first.signal.addEventListener("abort", () => { replacement = owner.begin(); }, { once: true });
    assert.equal(first.finish(true), false);
    assert.equal(first.signal.aborted, true);
    assert.equal(shown, replacement!.id);
    replacement!.finish();
  });

  it("does not start a pre-aborted run or leave an abort listener behind", async () => {
    const external = new AbortController();
    external.abort();
    let invoked = false;
    const owner = new PrismRefractionRunOwner(() => undefined);
    const run = owner.begin({ signal: external.signal });
    await assert.rejects(run.wait(async () => { invoked = true; }), { name: "AbortError" });
    assert.equal(invoked, false);
    run.finish();
    assert.equal(getEventListeners(external.signal, "abort").length, 0);
  });

  it("rejects same-tick aborts even when work resolves and handles synchronous throws", async () => {
    const abort = new AbortController();
    await assert.rejects(waitForRefraction(abort.signal, async () => {
      abort.abort();
      return "already stale";
    }), { name: "AbortError" });
    const throwing = new AbortController();
    await assert.rejects(waitForRefraction(throwing.signal, () => {
      throwing.abort();
      throw new Error("adapter threw synchronously");
    }));
    assert.equal(getEventListeners(throwing.signal, "abort").length, 0);
  });

  it("marks only owned fullscreen HTTP requests and retains caller headers", () => {
    const owner = new PrismRefractionRunOwner(() => undefined);
    const run = owner.begin();
    const init = prismRefractionRequestInit({ signal: run.signal, headers: { authorization: "test-only" } });
    assert.equal(new Headers(init.headers).get("x-prism-refraction"), "1");
    assert.equal(new Headers(init.headers).get("authorization"), "test-only");
    const ordinary = { signal: new AbortController().signal };
    assert.equal(prismRefractionRequestInit(ordinary), ordinary);
    run.finish();
  });

  it("captures legacy synchronous prop chains without leaking across awaited work", async () => {
    const first = new AbortController().signal;
    const second = new AbortController().signal;
    const result = invokePrismRefractionAction(first, async () => {
      assert.equal(currentPrismRefractionInvocationSignal(), first);
      invokePrismRefractionAction(second, () => assert.equal(currentPrismRefractionInvocationSignal(), second));
      assert.equal(currentPrismRefractionInvocationSignal(), first);
      await Promise.resolve();
      assert.equal(currentPrismRefractionInvocationSignal(), undefined);
    });
    assert.equal(currentPrismRefractionInvocationSignal(), undefined);
    await result;
    assert.throws(() => invokePrismRefractionAction(first, () => { throw new Error("test"); }));
    assert.equal(currentPrismRefractionInvocationSignal(), undefined);
  });
});

describe("honest elapsed and estimated time", () => {
  it("learns only successful comparable runs and isolates routing keys", () => {
    let now = 0;
    const history = new RefractionDurationHistory();
    const owner = new PrismRefractionRunOwner(() => undefined, history, () => now);
    for (const duration of [12_000, 11_000]) {
      const run = owner.begin({ timingKey: "room:local:model-a" });
      now += duration;
      run.finish(true);
    }
    assert.equal(history.estimate("room:local:model-a"), null);
    const cancelled = owner.begin({ timingKey: "room:local:model-a" });
    now += 100_000;
    cancelled.cancel();
    cancelled.finish(true);
    assert.equal(history.estimate("room:local:model-a"), null);
    const success = owner.begin({ timingKey: "room:local:model-a" });
    now += 13_000;
    success.finish(true);
    assert.equal(history.estimate("room:local:model-a"), 12_000);
    assert.equal(history.estimate("room:local:model-b"), null);
    history.record("room:local:model-a", 100_000);
    assert.equal(history.estimate("room:local:model-a"), null);
  });

  it("never invents a remaining time when unknown, invalid, or exceeded", () => {
    assert.match(refractionEtaLabel(0, null, 1_000), /no reliable estimate/u);
    assert.match(refractionEtaLabel("invalid", 10_000, 1_000), /no reliable estimate/u);
    assert.match(refractionEtaLabel(0, Infinity, 1_000), /no reliable estimate/u);
    assert.equal(refractionEtaLabel(0, 12_000, 2_500), "Estimated remaining: 10s · based on similar runs");
    assert.match(refractionEtaLabel(0, 12_000, 12_000), /longer than estimated.*unknown/u);
    assert.match(refractionEtaLabel(0, 12_000, 90_000), /unknown/u);
  });
});

describe("confirmation and keyboard behavior", () => {
  it("X and Escape request confirmation; declining never aborts", () => {
    assert.deepEqual(blockingLoaderCancelAction(false, "request"), { confirming: true, cancel: false });
    assert.deepEqual(blockingLoaderCancelAction(false, "escape"), { confirming: true, cancel: false });
    assert.deepEqual(blockingLoaderCancelAction(true, "escape"), { confirming: false, cancel: false });
    assert.deepEqual(blockingLoaderCancelAction(true, "keep"), { confirming: false, cancel: false });
    assert.deepEqual(blockingLoaderCancelAction(false, "confirm"), { confirming: false, cancel: false });
    assert.deepEqual(blockingLoaderCancelAction(true, "confirm"), { confirming: false, cancel: true });
    assert.match(REFRACTION_CANCEL_WARNING, /have to regenerate the interrupted asset/u);
    assert.match(REFRACTION_CANCEL_WARNING, /Previously saved assets stay unchanged/u);
  });

  it("wraps keyboard focus inside the current dialog and handles removed controls", () => {
    assert.equal(blockingLoaderFocusIndex(1, 2, false), 0);
    assert.equal(blockingLoaderFocusIndex(0, 2, true), 1);
    assert.equal(blockingLoaderFocusIndex(-1, 2, false), 0);
    assert.equal(blockingLoaderFocusIndex(-1, 2, true), 1);
    assert.equal(blockingLoaderFocusIndex(-1, 0, false), -1);
  });
});
