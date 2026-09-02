import assert from "node:assert/strict";
import { EventEmitter, getEventListeners } from "node:events";
import { describe, it } from "node:test";
import type { RequestContext } from "../types.ts";
import {
  assertRefractionActive,
  cancellableRefractionRoute,
  connectRefractionAbort,
  currentRefractionSignal,
  onRefractionRollback,
  protectRefractionMutation,
  refractionSignal,
  runRefractionRequest,
} from "../refraction-cancellation.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function context(userId = "test-owner", url = "/api/test-refraction") {
  const req = Object.assign(new EventEmitter(), { url, aborted: false, headers: { "x-prism-refraction": "1" } });
  const res = Object.assign(new EventEmitter(), { writableFinished: false, destroyed: false });
  return { req, res, userId, params: { id: "test-session" }, body: {}, query: new URLSearchParams() } as unknown as RequestContext & { userId: string };
}

describe("foreground refraction request lifetime", () => {
  it("aborts a disconnected request and rejects a non-cooperative late commit", async () => {
    const ctx = context();
    const provider = deferred<void>();
    let committed = false;
    let signal!: AbortSignal;
    const work = runRefractionRequest(ctx, async () => {
      signal = currentRefractionSignal()!;
      await provider.promise;
      assertRefractionActive();
      committed = true;
    });
    ctx.res.emit("close");
    await assert.rejects(work, { name: "AbortError" });
    assert.equal(signal.aborted, true);
    provider.resolve();
    await Promise.resolve();
    assert.equal(committed, false);
    assert.equal(ctx.res.listenerCount("close"), 0);
    assert.equal(ctx.req.listenerCount("aborted"), 0);
  });

  it("a fully read POST is not cancellation, nor is a completed response", async () => {
    const ctx = context();
    await runRefractionRequest(ctx, async () => {
      ctx.req.emit("close");
      assertRefractionActive();
      Object.assign(ctx.res, { writableFinished: true });
      ctx.res.emit("close");
      assertRefractionActive();
    });
  });

  it("a replaced run cannot commit or remove its replacement's ownership", async () => {
    const firstCtx = context();
    const secondCtx = context();
    const thirdCtx = context();
    const firstProvider = deferred<void>();
    const secondProvider = deferred<void>();
    const first = runRefractionRequest(firstCtx, () => firstProvider.promise);
    const second = runRefractionRequest(secondCtx, () => secondProvider.promise);
    await assert.rejects(first, { name: "AbortError" });
    // The first finally has now run. Starting a third must still revoke second.
    await runRefractionRequest(thirdCtx, async () => undefined);
    await assert.rejects(second, { name: "AbortError" });
    firstProvider.resolve();
    secondProvider.resolve();
  });

  it("authenticates before registering ownership and isolates two accounts on the same URL", async () => {
    const first = context("alice");
    const second = context("bob");
    delete (first as RequestContext).userId;
    delete (second as RequestContext).userId;
    const identities = new Map([[first.req, "alice"], [second.req, "bob"]]);
    const providers = new Map([[first.req, deferred<void>()], [second.req, deferred<void>()]]);
    const signals = new Map<RequestContext["req"], AbortSignal>();
    const handler = cancellableRefractionRoute("/api/debates/synthesize", async (ctx) => {
      assert.ok(ctx.userId);
      signals.set(ctx.req, currentRefractionSignal()!);
      await providers.get(ctx.req)!.promise;
      assertRefractionActive();
    }, (ctx) => {
      ctx.userId = identities.get(ctx.req)!;
      return ctx.userId;
    });
    const a = handler(first);
    const b = handler(second);
    assert.equal(signals.get(first.req)?.aborted, false);
    second.res.emit("close");
    await assert.rejects(b, { name: "AbortError" });
    assert.equal(signals.get(first.req)?.aborted, false);
    providers.get(first.req)!.resolve();
    await a;
    providers.get(second.req)!.resolve();
  });

  it("rejects unauthenticated ownership without disturbing a valid request", async () => {
    const ctx = context();
    const pending = deferred<void>();
    const work = runRefractionRequest(ctx, () => pending.promise);
    await assert.rejects(runRefractionRequest(context(""), async () => undefined), /requires authentication/u);
    const guarded = cancellableRefractionRoute("/api/debates/synthesize", async () => {
      assert.fail("unauthenticated handler ran");
    }, () => { throw new Error("Authentication required"); });
    await assert.rejects(async () => guarded(context()), /Authentication required/u);
    pending.resolve();
    await work;
  });

  it("permits parallel fields from one run but revokes the whole older group for a new run", async () => {
    const a = context();
    const b = context();
    a.req.headers["x-prism-refraction-id"] = "shared-run-123";
    b.req.headers["x-prism-refraction-id"] = "shared-run-123";
    const paused = deferred<void>();
    let aSignal!: AbortSignal;
    let bSignal!: AbortSignal;
    const first = runRefractionRequest(a, async () => {
      aSignal = currentRefractionSignal()!;
      await paused.promise;
    });
    const sibling = runRefractionRequest(b, async () => {
      bSignal = currentRefractionSignal()!;
      await paused.promise;
    });
    assert.equal(aSignal.aborted, false);
    assert.equal(bSignal.aborted, false);
    await runRefractionRequest(context(), async () => undefined);
    await assert.rejects(first, { name: "AbortError" });
    await assert.rejects(sibling, { name: "AbortError" });
    paused.resolve();
  });

  it("does not roll back a newer independent save to the same asset", async () => {
    const resource = {};
    let asset = "saved";
    const ctx = context();
    const pending = deferred<void>();
    const work = runRefractionRequest(ctx, async () => {
      protectRefractionMutation(resource, "image", () => {
        const original = asset;
        return () => { asset = original; };
      });
      asset = "pending";
      await pending.promise;
    });
    // An unscoped explicit save takes ownership of this one resource.
    protectRefractionMutation(resource, "image", () => assert.fail("no snapshot needed outside refraction"));
    asset = "new user save";
    ctx.res.emit("close");
    await assert.rejects(work, { name: "AbortError" });
    assert.equal(asset, "new user save");
    pending.resolve();
  });

  it("restores only this request's temporary state, once, before replacement starts", async () => {
    const ctx = context();
    let asset = "saved asset";
    let unrelated = "other saved asset";
    let rollbacks = 0;
    const provider = deferred<void>();
    const work = runRefractionRequest(ctx, async () => {
      const before = asset;
      onRefractionRollback("asset", () => { asset = before; rollbacks += 1; });
      asset = "pending replacement";
      onRefractionRollback("asset", () => { asset = "wrong second snapshot"; });
      await provider.promise;
      assertRefractionActive();
      asset = "late replacement";
    });
    unrelated = "concurrent unrelated edit";
    await runRefractionRequest(context(), async () => {
      assert.equal(asset, "saved asset");
      asset = "newer successful asset";
    });
    await assert.rejects(work, { name: "AbortError" });
    provider.resolve();
    await Promise.resolve();
    assert.equal(asset, "newer successful asset");
    assert.equal(unrelated, "concurrent unrelated edit");
    assert.equal(rollbacks, 1);
  });

  it("keeps a successful result, but rolls back a failing request", async () => {
    let asset = "original";
    await runRefractionRequest(context(), async () => {
      onRefractionRollback("asset", () => { asset = "original"; });
      asset = "successful";
    });
    assert.equal(asset, "successful");
    await assert.rejects(runRefractionRequest(context(), async () => {
      onRefractionRollback("asset", () => { asset = "successful"; });
      asset = "partial";
      throw new Error("generation failed");
    }), /generation failed/u);
    assert.equal(asset, "successful");
  });

  it("forwards cancellation into provider timeout controllers and prevents new stages", async () => {
    const ctx = context();
    const own = new AbortController();
    const provider = new AbortController();
    let combined!: AbortSignal;
    let disconnect!: () => void;
    const waiting = runRefractionRequest(ctx, async () => {
      combined = refractionSignal(own.signal)!;
      disconnect = connectRefractionAbort(provider);
      await new Promise<void>(() => undefined);
    });
    ctx.req.emit("aborted");
    await assert.rejects(waiting, { name: "AbortError" });
    assert.equal(combined.aborted, true);
    assert.equal(provider.signal.aborted, true);
    disconnect();
    assert.equal(getEventListeners(provider.signal, "abort").length, 0);
  });

  it("leaves ordinary fields, durable jobs, and evidence soft synthesis outside the scope", async () => {
    for (const [path, body] of [
      ["/api/bots/generate-field", {}],
      ["/api/images/generate", {}],
      ["/api/slate/projects/:id/cover", {}],
      ["/api/debates/:id/mystery-room-art/upgrade", {}],
      ["/api/debates/:id/mystery-scene-repair", { action: "regenerate_evidence_asset" }],
    ] as const) {
      const ctx = context();
      ctx.body = body;
      delete ctx.req.headers["x-prism-refraction"];
      await cancellableRefractionRoute(path, async () => {
        assert.equal(currentRefractionSignal(), undefined, path);
      }, () => { assert.fail("soft request entered foreground ownership"); })(ctx);
    }
    const ctx = context();
    ctx.req.headers["x-prism-refraction"] = "1";
    await cancellableRefractionRoute("/api/bots/generate-field", async () => {
      assert.ok(currentRefractionSignal());
    }, () => ctx.userId)(ctx);
  });
});
