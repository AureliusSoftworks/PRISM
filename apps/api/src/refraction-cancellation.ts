import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestContext, RouteDefinition } from "./types.ts";

interface RefractionScope {
  controller: AbortController;
  active: boolean;
  rollback: Map<string, () => void>;
  release: Set<() => void>;
}

const storage = new AsyncLocalStorage<RefractionScope | undefined>();
interface RefractionOwner {
  id: string | symbol;
  requests: Set<() => void>;
}
const owners = new Map<string, RefractionOwner>();
const mutationOwners = new WeakMap<object, Map<string, RefractionScope>>();

export function currentRefractionSignal(): AbortSignal | undefined {
  return storage.getStore()?.controller.signal;
}

export function assertRefractionActive(): void {
  const scope = storage.getStore();
  if (!scope) return;
  scope.controller.signal.throwIfAborted();
  if (!scope.active) throw new DOMException("Refraction no longer owns its result.", "AbortError");
}

/** Capture only a refraction's own temporary writes, once, before changing them. */
export function onRefractionRollback(key: string, restore: () => void): void {
  assertRefractionActive();
  const scope = storage.getStore();
  if (scope && !scope.rollback.has(key)) scope.rollback.set(key, restore);
}

/** A normal/newer write revokes rollback of this exact resource, not its neighbors. */
export function protectRefractionMutation(
  resource: object,
  key: string,
  snapshot: () => () => void,
): void {
  assertRefractionActive();
  const scope = storage.getStore();
  let claims = mutationOwners.get(resource);
  if (!scope) {
    claims?.delete(key);
    return;
  }
  if (!claims) mutationOwners.set(resource, claims = new Map());
  if (claims.get(key) === scope) return;
  const restore = snapshot();
  claims.set(key, scope);
  const owned = claims;
  onRefractionRollback(key, () => {
    if (owned.get(key) === scope) restore();
  });
  scope.release.add(() => {
    if (owned.get(key) === scope) owned.delete(key);
  });
}

/** Give existing provider/timeout helpers the owning foreground request signal. */
export function refractionSignal(signal?: AbortSignal): AbortSignal | undefined {
  assertRefractionActive();
  const requestSignal = currentRefractionSignal();
  return signal && requestSignal && signal !== requestSignal
    ? AbortSignal.any([signal, requestSignal])
    : signal ?? requestSignal;
}

export function connectRefractionAbort(controller: AbortController): () => void {
  const signal = currentRefractionSignal();
  const abort = (): void => controller.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener("abort", abort, { once: true });
  return () => signal?.removeEventListener("abort", abort);
}

/** Also releases a request whose provider ignores AbortSignal. Late work stays revoked. */
export async function runRefractionRequest<T>(
  ctx: Pick<RequestContext, "req" | "res"> & { userId: string },
  work: () => Promise<T>,
  resourceKey = ctx.req.url ?? "refraction",
): Promise<T> {
  // Ownership must be resolved before registering the request. Never put
  // requests from different accounts in a shared "unauthenticated" slot.
  if (!ctx.userId) throw new Error("Refraction ownership requires authentication.");
  const key = JSON.stringify([ctx.userId, resourceKey]);
  const headerId = ctx.req.headers["x-prism-refraction-id"];
  const ownerId = typeof headerId === "string" && /^[a-zA-Z0-9_-]{8,80}$/u.test(headerId)
    ? headerId : Symbol("request");
  let owner = owners.get(key);
  if (owner?.id !== ownerId) {
    for (const cancel of owner?.requests ?? []) cancel();
    owner = { id: ownerId, requests: new Set() };
    owners.set(key, owner);
  }
  const runOwner = owner;
  const scope: RefractionScope = { controller: new AbortController(), active: true, rollback: new Map(), release: new Set() };
  let rollbackError: unknown;
  const rollback = (): void => {
    const callbacks = [...scope.rollback.values()].reverse();
    scope.rollback.clear();
    storage.run(undefined, () => {
      for (const restore of callbacks) {
        try { restore(); } catch (error) { rollbackError ??= error; }
      }
    });
  };
  const cancel = (): void => {
    if (!scope.active) return;
    scope.active = false;
    scope.controller.abort(new DOMException("Refraction cancelled; regenerate the interrupted asset.", "AbortError"));
    rollback();
  };
  const clientClosed = (): void => { if (!ctx.res.writableFinished) cancel(); };
  // Parallel fields/stages from one fullscreen run share an owner; they must
  // not cancel one another merely because they use the same API endpoint.
  runOwner.requests.add(cancel);
  // IncomingMessage.close also fires after a fully read POST body. The response
  // close (plus aborted body) is the actual client-disconnect boundary.
  ctx.req.once("aborted", clientClosed);
  ctx.res.once("close", clientClosed);
  let rejectAbort!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAbort = () => reject(scope.controller.signal.reason);
    scope.controller.signal.addEventListener("abort", rejectAbort, { once: true });
  });
  void aborted.catch(() => undefined);
  try {
    if (ctx.req.aborted || ctx.res.destroyed) cancel();
    scope.controller.signal.throwIfAborted();
    const result = await storage.run(scope, () => Promise.race([work(), aborted]));
    scope.controller.signal.throwIfAborted();
    scope.rollback.clear();
    return result;
  } catch (error) {
    scope.active = false;
    scope.controller.abort(error);
    rollback();
    if (rollbackError) throw new Error("Refraction cancellation could not restore temporary state.", { cause: rollbackError });
    throw error;
  } finally {
    scope.active = false;
    ctx.req.off("aborted", clientClosed);
    ctx.res.off("close", clientClosed);
    scope.controller.signal.removeEventListener("abort", rejectAbort);
    for (const release of scope.release) release();
    scope.release.clear();
    runOwner.requests.delete(cancel);
    if (owners.get(key) === runOwner && runOwner.requests.size === 0) owners.delete(key);
  }
}

// Deliberately excludes durable jobs, ordinary field refraction, session bake,
// Coffee's table save, and venue-plan validation. No privacy routing changes.
export const FULLSCREEN_REFRACTION_ROUTES = new Set([
  "/api/slate/transcript-stories",
  "/api/debates/synthesize",
  "/api/debates/setup-suggestion",
  "/api/debates/role-checks",
  "/api/debates/evidence/generate",
  "/api/botcast/shows/:id/brand",
  "/api/botcast/shows/:id/blurbs",
  "/api/botcast/shows/:id/music-identity",
  "/api/botcast/shows/:id/booking-suggestion",
  "/api/botcast/shows/:id/intro-audio/generate",
  "/api/botcast/shows/:id/ident-audio/generate",
  "/api/debates/:id/mystery-assets/retry",
  "/api/debates/:id/mystery-room-art/upgrade",
  "/api/debates/:id/mystery-scene-repair",
  "/api/bots/generate-field",
  "/api/bots/generate-draft",
  "/api/bots/generate-avatar-details-ink",
  "/api/avatar/sfx/generate",
  "/api/voices/elevenlabs/shared/discover",
  "/api/images/generate",
  "/api/conversations/:id/zen-wallpaper",
  "/api/prism/refract",
  "/api/slate/projects/:id/cover",
  "/api/slate/projects/:id/visual-references",
]);

export function cancellableRefractionRoute(
  path: string,
  handler: RouteDefinition["handler"],
  authenticate: (ctx: RequestContext) => string,
): RouteDefinition["handler"] {
  return (ctx) => {
    // The same endpoint can also serve a docked job, inline field, or automatic
    // generation. A branded fullscreen signal opts in at the shared client.
    if (ctx.req.headers["x-prism-refraction"] !== "1") return handler(ctx);
    // A whole-venue upgrade is explicitly a durable background job; only the
    // selected-room request waits fullscreen and belongs to this connection.
    if ((path === "/api/debates/:id/mystery-room-art/upgrade" || path === "/api/debates/:id/mystery-assets/retry") &&
      !(ctx.body as { roomId?: unknown } | null)?.roomId) return handler(ctx);
    if (path === "/api/debates/:id/mystery-scene-repair" &&
      (ctx.body as { action?: unknown } | null)?.action === "regenerate_evidence_asset") return handler(ctx);
    const key = path.includes("/mystery-")
      ? `mystery-presentation:${ctx.params.id}`
      : ctx.req.url;
    const userId = authenticate(ctx);
    return runRefractionRequest({ ...ctx, userId }, () => handler(ctx), key);
  };
}
