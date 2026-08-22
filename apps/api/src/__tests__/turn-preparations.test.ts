import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PreparedTurnCursorV1 } from "@localai/shared";
import {
  MAX_PREPARED_TURNS_PER_USER,
  TurnPreparationError,
  TurnPreparationRegistry,
} from "../turn-preparations.ts";

const cursor: PreparedTurnCursorV1 = {
  revision: 1,
  lastMessageId: "message-1",
  lastEventId: "event-1",
  floorOwnerId: "bot-1",
  castHash: "cast-1",
  powersHash: "powers-1",
  promptStateHash: "prompt-1",
};

function createReady(registry: TurnPreparationRegistry, sessionId = "session-1") {
  return registry.create({
    userId: "user-1",
    surface: "debate",
    sessionId,
    stateCursor: cursor,
    run: async () => ({
      speakerBotId: "bot-2",
      provisionalUtterances: [{ id: "utterance-1", speakerBotId: "bot-2", text: "Prepared." }],
      payload: { nextRevision: 2 },
    }),
  });
}

describe("turn preparation registry", () => {
  it("keeps generation provisional until an idempotent commit", async () => {
    const registry = new TurnPreparationRegistry();
    const preparation = createReady(registry);
    let publicRevision = 1;
    let commits = 0;
    const commit = () =>
      registry.commit({
        userId: "user-1",
        preparationId: preparation.id,
        currentCursor: () => ({ ...cursor, revision: publicRevision }),
        commit: async () => {
          commits += 1;
          publicRevision = 2;
          return {
            value: { revision: publicRevision },
            result: { committedAt: new Date().toISOString(), revision: publicRevision },
          };
        },
      });

    assert.equal(publicRevision, 1);
    assert.equal(registry.get(preparation.id, "user-1").phase, "preparing");
    const first = await commit();
    const second = await commit();
    assert.equal(commits, 1);
    assert.deepEqual(first.value, { revision: 2 });
    assert.deepEqual(second.value, first.value);
    assert.equal(second.preparation.phase, "committed");
  });

  it("exposes only the authenticated provisional utterance metadata", async () => {
    const registry = new TurnPreparationRegistry();
    const preparation = createReady(registry, "signal-voice-prefetch");
    await new Promise((resolve) => setImmediate(resolve));

    const ready = registry.get(preparation.id, "user-1");
    assert.equal(ready.phase, "ready");
    assert.deepEqual(ready.provisionalUtterances, [
      { id: "utterance-1", speakerBotId: "bot-2", text: "Prepared." },
    ]);
    assert.throws(
      () => registry.get(preparation.id, "user-2"),
      (error: unknown) =>
        error instanceof TurnPreparationError && error.code === "not_found",
    );
  });

  it("holds one status request until speculative generation settles", async () => {
    const registry = new TurnPreparationRegistry();
    let releaseGeneration!: () => void;
    const preparation = registry.create({
      userId: "user-1",
      surface: "signal",
      sessionId: "long-poll",
      stateCursor: cursor,
      run: async () => {
        await new Promise<void>((resolve) => {
          releaseGeneration = resolve;
        });
        return {
          speakerBotId: "bot-2",
          provisionalUtterances: [
            { id: "utterance-2", speakerBotId: "bot-2", text: "Ready." },
          ],
          payload: null,
        };
      },
    });
    let settled = false;
    const waiting = registry
      .wait(preparation.id, "user-1", 5_000)
      .then((value) => {
        settled = true;
        return value;
      });

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false);
    releaseGeneration();
    const ready = await waiting;
    assert.equal(ready.phase, "ready");
    assert.equal(ready.provisionalUtterances[0]?.text, "Ready.");
  });

  it("coalesces simultaneous commits into one domain mutation", async () => {
    const registry = new TurnPreparationRegistry();
    const preparation = createReady(registry, "simultaneous");
    let commits = 0;
    const commit = () =>
      registry.commit({
        userId: "user-1",
        preparationId: preparation.id,
        currentCursor: () => cursor,
        commit: async () => {
          commits += 1;
          await new Promise((resolve) => setImmediate(resolve));
          return {
            value: { revision: 2 },
            result: { committedAt: "now", revision: 2 },
          };
        },
      });

    const [first, second] = await Promise.all([commit(), commit()]);
    assert.equal(commits, 1);
    assert.deepEqual(second.value, first.value);
    assert.equal(second.preparation.phase, "committed");
  });

  it("rejects a stale cursor without invoking domain commit", async () => {
    const registry = new TurnPreparationRegistry();
    const preparation = createReady(registry);
    let commits = 0;
    await assert.rejects(
      () =>
        registry.commit({
          userId: "user-1",
          preparationId: preparation.id,
          currentCursor: () => ({ ...cursor, revision: 2 }),
          commit: async () => {
            commits += 1;
            return { value: null, result: { committedAt: "now", revision: 2 } };
          },
        }),
      (error: unknown) => error instanceof TurnPreparationError && error.code === "stale",
    );
    assert.equal(commits, 0);
    assert.equal(registry.get(preparation.id, "user-1").phase, "discarded");
  });

  it("isolates a late provider result after discard", async () => {
    const registry = new TurnPreparationRegistry();
    let resolveGeneration: ((value: {
      speakerBotId: string;
      provisionalUtterances: { id: string; speakerBotId: string; text: string }[];
      payload: { unsafe: boolean };
    }) => void) | null = null;
    const preparation = registry.create({
      userId: "user-1",
      surface: "signal",
      sessionId: "episode-1",
      stateCursor: cursor,
      run: () =>
        new Promise((resolve) => {
          resolveGeneration = resolve;
        }),
    });
    registry.discard(preparation.id, "user-1");
    resolveGeneration?.({
      speakerBotId: "bot-2",
      provisionalUtterances: [{ id: "late", speakerBotId: "bot-2", text: "Late." }],
      payload: { unsafe: true },
    });
    await new Promise((resolve) => setImmediate(resolve));
    const discarded = registry.get(preparation.id, "user-1");
    assert.equal(discarded.phase, "discarded");
    assert.deepEqual(discarded.provisionalUtterances, []);
  });

  it("discards every uncommitted preparation for one account after an effort change", async () => {
    const registry = new TurnPreparationRegistry();
    const first = createReady(registry, "debate-effort");
    const second = registry.create({
      userId: "user-1",
      surface: "signal",
      sessionId: "signal-effort",
      stateCursor: cursor,
      run: async () => ({
        speakerBotId: "bot-2",
        provisionalUtterances: [],
        payload: null,
      }),
    });
    const otherUser = registry.create({
      userId: "user-2",
      surface: "coffee",
      sessionId: "coffee-other-user",
      stateCursor: cursor,
      run: async () => ({
        speakerBotId: null,
        provisionalUtterances: [],
        payload: null,
      }),
    });

    assert.equal(registry.discardUser("user-1", "Effort changed.").length, 2);
    assert.equal(registry.get(first.id, "user-1").phase, "discarded");
    assert.equal(registry.get(second.id, "user-1").phase, "discarded");
    assert.notEqual(registry.get(otherUser.id, "user-2").phase, "discarded");
  });

  it("expires without commit and bounds each user's registry", async () => {
    let now = 1_000;
    const registry = new TurnPreparationRegistry({ now: () => now });
    const expiring = registry.create({
      userId: "user-1",
      surface: "coffee",
      sessionId: "expiring",
      stateCursor: cursor,
      ttlMs: 10,
      run: async () => ({ speakerBotId: null, provisionalUtterances: [], payload: null }),
    });
    now += 11;
    assert.equal(registry.get(expiring.id, "user-1").phase, "expired");

    for (let index = 0; index < MAX_PREPARED_TURNS_PER_USER + 2; index += 1) {
      createReady(registry, `session-${index}`);
    }
    await new Promise((resolve) => setImmediate(resolve));
    assert.throws(
      () => registry.get(expiring.id, "user-1"),
      (error: unknown) => error instanceof TurnPreparationError && error.code === "not_found",
    );
  });
});
