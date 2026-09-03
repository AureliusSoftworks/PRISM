import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  botcastActiveImageContextV1, botcastImageContextByIdV1, botcastImageContextForMessageV1,
  botcastImageHistoryV1, botcastPendingImageContextV1,
} from "@localai/shared";
import { initializeDatabase } from "../db.ts";
import { advanceBotcastEpisode, botcastEpisodeCanPrepareAdvance, cancelBotcastEpisode, cancelBotcastPendingImage, createBotcastEpisode, createBotcastShow, getBotcastEpisode, queueBotcastEpisodeImageContext, runSignalOnlineTurn } from "../botcast.ts";
import type { LlmProvider, ProviderMessage } from "../providers.ts";
import { describeSignalEpisodeImage, readSignalEpisodeImageProxy, SignalImageRegistrationQueue, signalEpisodeOlderPictureMemory } from "../signal-episode-images.ts";

function fixture() {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  db.exec(`INSERT INTO users (id, email, display_name, password_hash, password_salt, wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
    VALUES ('producer', 'image-test@example.test', 'Producer', 'hash', 'salt', 'key', 'iv', 'tag', '2026-01-01', '2026-01-01');
    INSERT INTO bots (id, user_id, name, system_prompt, chat_enabled, created_at, updated_at) VALUES
    ('host', 'producer', 'Mara Vale', 'A precise cultural critic who discusses paintings.', 1, '2026-01-01', '2026-01-01'),
    ('guest', 'producer', 'Ivo Stone', 'A guarded inventor with independent opinions about art.', 1, '2026-01-01', '2026-01-01');`);
  const show = createBotcastShow(db, "producer", { hostBotId: "host" });
  const episode = createBotcastEpisode(db, "producer", show.id, { guestBotId: "guest", topic: "Invention and appetite", preferredProvider: "local", responseMode: "local", model: "llava" });
  return { db, episode, show };
}
const input = (imageId: string, origin: "setup" | "live" = "live") => ({
  imageId, kind: "picture" as const, name: `painting ${imageId}`, mimeType: "image/png" as const,
  provider: "local" as const, model: "llava", replayEmoji: "🖼️", origin,
  groundedVisualDescription: `Grounded description of ${imageId}: a red wheel and gold sky.`,
  sourceSha256: `digest-${imageId}`, presentationReason: `PRIVATE-${imageId}`,
  replayProxy: { id: `proxy-${imageId}`, width: 128, height: 96, bytes: Buffer.from(`proxy-${imageId}`) },
});
const attachment = (imageId: string) => ({ imageId, input: { mimeType: "image/png" as const, data: `original-${imageId}` }, presentationReason: `PRIVATE-${imageId}` });
const recordPhase = (db: DatabaseSync, episodeId: string, imageId: string, phase: string) => {
  const episode = getBotcastEpisode(db, "producer", episodeId);
  const image = botcastImageContextByIdV1(episode.events, imageId)!;
  db.prepare("INSERT INTO botcast_events (id, user_id, episode_id, sequence, kind, payload_json, occurred_at) VALUES (?, 'producer', ?, ?, 'image_context', ?, ?)")
    .run(`phase-${episode.events.length}`, episodeId, episode.events.at(-1)!.sequence + 1,
      JSON.stringify({ ...image, phase, hostIntroductionMessageId: phase === "queued" ? null : `intro-${imageId}` }), new Date().toISOString());
};

describe("successive Signal picture API contracts", () => {
  it("cancels a pending reveal without dismissing the active picture and rejects its in-flight introduction", async () => {
    const { db, episode } = fixture();
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const start = new Promise<void>((resolve) => { started = resolve; });
    const provider: LlmProvider = { name: "local", embedText: async () => [], generateResponse: async () => {
      started(); await gate;
      return "Look at the red wheel beneath the gold horizon in this picture, Ivo. What does it change for you?";
    } };
    try {
      queueBotcastEpisodeImageContext(db, "producer", episode.id, input("a", "setup"));
      recordPhase(db, episode.id, "a", "discussing");
      queueBotcastEpisodeImageContext(db, "producer", episode.id, input("b"));
      assert.throws(() => cancelBotcastPendingImage(db, "intruder", episode.id, "b"), /not found/u);
      const advance = advanceBotcastEpisode(db, "producer", episode.id, { cue: { kind: "present_image", imageId: "b" } }, {
        preferredProvider: "local", providerFactory: () => provider, signalSocialSilenceChanceOverride: 0,
        signalEpisodeImage: attachment("b"), signalPreviousEpisodeImage: attachment("a"),
      });
      await start;
      const cancelled = cancelBotcastPendingImage(db, "producer", episode.id, "b");
      assert.equal(botcastPendingImageContextV1(cancelled.events), null);
      assert.equal(botcastActiveImageContextV1(cancelled.events)?.imageId, "a");
      assert.doesNotThrow(() => cancelBotcastPendingImage(db, "producer", episode.id, "b"));
      queueBotcastEpisodeImageContext(db, "producer", episode.id, input("c"));
      release();
      await assert.rejects(advance, /queued Signal picture changed/u);
      const saved = getBotcastEpisode(db, "producer", episode.id);
      assert.equal(botcastPendingImageContextV1(saved.events)?.imageId, "c");
      assert.equal(botcastImageContextByIdV1(saved.events, "b")?.hostIntroductionMessageId, null);
      assert.equal(saved.messages.length, 0);
    } finally { release?.(); db.close(); }
  });
  it("keeps one pending, idempotent identity, private notes, tenant lookup, multi-proxy ambiguity and cascades", () => {
    const { db, episode } = fixture();
    try {
      queueBotcastEpisodeImageContext(db, "producer", episode.id, input("a", "setup"));
      assert.doesNotThrow(() => queueBotcastEpisodeImageContext(db, "producer", episode.id, input("a", "setup")));
      assert.throws(() => queueBotcastEpisodeImageContext(db, "producer", episode.id, input("b")), /one image queued/u);
      assert.throws(() => queueBotcastEpisodeImageContext(db, "producer", episode.id, { ...input("a", "setup"), sourceSha256: "changed" }), /different content/u);
      assert.throws(() => queueBotcastEpisodeImageContext(db, "intruder", episode.id, input("b")), /not found/u);
      assert.equal(readSignalEpisodeImageProxy(db, "intruder", episode.id), null);
      assert.ok(readSignalEpisodeImageProxy(db, "producer", episode.id));
      recordPhase(db, episode.id, "a", "discussing");
      const queued = queueBotcastEpisodeImageContext(db, "producer", episode.id, input("b"));
      assert.equal(botcastEpisodeCanPrepareAdvance(queued), false, "original-dependent turns are never speculated without pixels");
      assert.equal(botcastActiveImageContextV1(queued.events)?.imageId, "a");
      assert.equal(botcastPendingImageContextV1(queued.events)?.imageId, "b");
      assert.equal(readSignalEpisodeImageProxy(db, "producer", episode.id), "ambiguous");
      const proxy = readSignalEpisodeImageProxy(db, "producer", episode.id, "a");
      assert.ok(proxy && proxy !== "ambiguous");
      assert.equal(Buffer.from(proxy.image_bytes).toString(), "proxy-a");
      assert.doesNotMatch(JSON.stringify(queued.events), /PRIVATE-|original-/u);
      const cancelled = cancelBotcastEpisode(db, "producer", episode.id);
      assert.equal(botcastPendingImageContextV1(cancelled.events), null);
      assert.equal(botcastActiveImageContextV1(cancelled.events), null);
      assert.throws(() => queueBotcastEpisodeImageContext(db, "producer", episode.id, input("c")), /ends/u);
      db.prepare("DELETE FROM botcast_episodes WHERE id = ?").run(episode.id);
      assert.equal((db.prepare("SELECT COUNT(*) AS n FROM botcast_episode_image_proxies").get() as { n: number }).n, 0);
    } finally { db.close(); }
  });

  it("migrates the single-image primary key verbatim and preserves ownership, private notes and cascade foreign keys", () => {
    const { db, episode } = fixture();
    try {
      db.exec(`DROP TABLE botcast_episode_image_proxies;
        CREATE TABLE botcast_episode_image_proxies (
          episode_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, image_id TEXT NOT NULL,
          content_type TEXT NOT NULL DEFAULT 'image/webp', width INTEGER NOT NULL, height INTEGER NOT NULL,
          image_bytes BLOB NOT NULL, presentation_reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL,
          FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY(episode_id) REFERENCES botcast_episodes(id) ON DELETE CASCADE);`);
      db.prepare("INSERT INTO botcast_episode_image_proxies VALUES (?, 'producer', 'legacy', 'image/webp', 8, 6, ?, 'PRIVATE-legacy', '2026-01-01')").run(episode.id, Buffer.from([0, 1, 254]));
      initializeDatabase(db);
      initializeDatabase(db); // Repeat-safe migration.
      const columns = db.prepare("PRAGMA table_info(botcast_episode_image_proxies)").all() as Array<{ name: string; pk: number }>;
      assert.deepEqual(columns.filter((column) => column.pk).map((column) => column.name), ["episode_id", "image_id"]);
      const row = db.prepare("SELECT * FROM botcast_episode_image_proxies").get() as { presentation_reason: string; image_bytes: Uint8Array; source_sha256: string };
      assert.equal(row.presentation_reason, "PRIVATE-legacy");
      assert.deepEqual(Buffer.from(row.image_bytes), Buffer.from([0, 1, 254]));
      assert.equal(row.source_sha256, "");
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
      queueBotcastEpisodeImageContext(db, "producer", episode.id, input("new"));
      assert.equal(readSignalEpisodeImageProxy(db, "producer", episode.id), "ambiguous");
      db.prepare("DELETE FROM users WHERE id = 'producer'").run();
      assert.equal((db.prepare("SELECT COUNT(*) AS n FROM botcast_episode_image_proxies").get() as { n: number }).n, 0);
    } finally { db.close(); }
  });

  it("keeps description preparation pixels-only and serializes concurrent preparations after failure", async () => {
    const captures: ProviderMessage[][] = [];
    const provider: LlmProvider = { name: "local", generateResponse: async (messages) => { captures.push(messages); return "A red wheel below a gold sky."; }, embedText: async () => [] };
    assert.equal(await describeSignalEpisodeImage({ provider, model: "llava", input: attachment("a").input }), "A red wheel below a gold sky.");
    assert.equal(captures[0]![1]!.images?.[0]?.data, "original-a");
    assert.doesNotMatch(JSON.stringify(captures), /PRIVATE|painting a/u);
    const queue = new SignalImageRegistrationQueue();
    const order: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const first = queue.run("episode", async () => { order.push(1); await gate; throw new Error("preparation failed"); });
    const second = queue.run("episode", async () => { order.push(2); return "recovered"; });
    await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(order, [1]);
    release();
    await assert.rejects(first, /preparation failed/u);
    assert.equal(await second, "recovered");
    assert.deepEqual(order, [1, 2]);
  });

  it("cancels running and queued description work without requiring a cooperative provider", async () => {
    const queue = new SignalImageRegistrationQueue();
    let started!: () => void;
    const began = new Promise<void>((resolve) => { started = resolve; });
    let providerSignal: AbortSignal | undefined;
    const provider: LlmProvider = { name: "local", embedText: async () => [], generateResponse: async (_messages, options) => {
      providerSignal = options?.signal;
      started();
      return new Promise<string>(() => undefined);
    } };
    const first = queue.run("episode", (signal) => describeSignalEpisodeImage({ provider, model: "llava", input: attachment("a").input, signal }));
    let secondRan = false;
    const second = queue.run("episode", async () => { secondRan = true; });
    const rejected = Promise.all([assert.rejects(first, /cancelled/u), assert.rejects(second, /cancelled/u)]);
    await began;
    queue.cancel("episode");
    await rejected;
    assert.equal(providerSignal?.aborted, true);
    assert.equal(secondRan, false);
    assert.equal(await queue.run("episode", async () => "fresh attempt"), "fresh attempt");
  });

  it("keeps grounded public memory after dismissal without disclosing pending pictures or producer notes", () => {
    const { db, episode } = fixture();
    try {
      queueBotcastEpisodeImageContext(db, "producer", episode.id, input("a", "setup"));
      recordPhase(db, episode.id, "a", "dismissed");
      const queued = queueBotcastEpisodeImageContext(db, "producer", episode.id, input("pending-secret"));
      const memory = signalEpisodeOlderPictureMemory(queued);
      assert.match(memory!, /Grounded description of a/u);
      assert.match(memory!, /callback does not re-show/u);
      assert.doesNotMatch(memory!, /pending-secret|PRIVATE|original-/u);
      assert.equal(signalEpisodeOlderPictureMemory(queued, ["a"]), null);
    } finally { db.close(); }
  });

  it("keeps a failed introduction pending and the previous picture active", async () => {
    const { db, episode } = fixture();
    try {
      queueBotcastEpisodeImageContext(db, "producer", episode.id, input("a"));
      recordPhase(db, episode.id, "a", "discussing");
      queueBotcastEpisodeImageContext(db, "producer", episode.id, input("b"));
      const provider: LlmProvider = { name: "local", generateResponse: async () => "", embedText: async () => [] };
      try {
        await advanceBotcastEpisode(db, "producer", episode.id, { cue: { kind: "present_image", imageId: "b" } }, {
          preferredProvider: "local", providerFactory: () => provider, signalSocialSilenceChanceOverride: 0,
          signalEpisodeImage: attachment("b"), signalPreviousEpisodeImage: attachment("a"),
        });
      } catch { /* Provider rejection or sanitizer recovery must leave the reveal queued. */ }
      const saved = getBotcastEpisode(db, "producer", episode.id);
      assert.equal(saved.messages.length, 0, "failed introduction creates neither a fake placement nor an utterance");
      assert.equal(botcastPendingImageContextV1(saved.events)?.imageId, "b");
      assert.equal(botcastActiveImageContextV1(saved.events)?.imageId, "a");
    } finally { db.close(); }
  });

  it("keeps a rejected introduction's retry grounded in the same current and previous originals", async () => {
    const { db, episode } = fixture();
    const captures: ProviderMessage[][] = [];
    const provider: LlmProvider = { name: "local", embedText: async () => [], generateResponse: async (messages) => {
      captures.push(messages);
      return captures.length === 1 ? "" : "This second painting puts the red wheel beneath a gold horizon, Ivo. Does that change your view of its danger?";
    } };
    try {
      queueBotcastEpisodeImageContext(db, "producer", episode.id, input("a", "setup"));
      recordPhase(db, episode.id, "a", "discussing");
      queueBotcastEpisodeImageContext(db, "producer", episode.id, input("b"));
      const result = await advanceBotcastEpisode(db, "producer", episode.id, { cue: { kind: "present_image", imageId: "b" } }, {
        preferredProvider: "local", providerFactory: () => provider, signalSocialSilenceChanceOverride: 0,
        signalEpisodeImage: attachment("b"), signalPreviousEpisodeImage: attachment("a"),
      });
      assert.ok(captures.length >= 2);
      assert.match(captures[1]!.map((message) => message.content).join("\n"), /new introduction to the CURRENT attached picture/u);
      assert.deepEqual(captures[1]!.flatMap((message) => message.images?.map((image) => image.data) ?? []), ["original-b", "original-a"]);
      assert.equal(botcastActiveImageContextV1(result.episode.events)?.imageId, "b");
    } finally { db.close(); }
  });

  it("recovers an empty ONLINE picture introduction on the same model with both originals and reasoning headroom", async () => {
    const { db, episode } = fixture();
    const captures: ProviderMessage[][] = [];
    const tokenLimits: Array<number | undefined> = [];
    const models: Array<string | undefined> = [];
    const provider: LlmProvider = { name: "anthropic", embedText: async () => [], generateResponse: async (messages, options) => {
      captures.push(messages);
      tokenLimits.push(options?.maxTokens);
      models.push(options?.model);
      assert.equal(options?.allowFinalLocalFallback, false);
      if (captures.length === 1) throw new Error("Anthropic returned an empty response.");
      return "This second painting puts the red wheel beneath a gold horizon, Ivo. Does that change your view of its danger? [[signal_image_context:continue]]";
    } };
    try {
      db.prepare("UPDATE botcast_episodes SET provider = 'anthropic', model = 'claude-sonnet-5', response_mode = 'online', segment = 'interview' WHERE id = ?").run(episode.id);
      queueBotcastEpisodeImageContext(db, "producer", episode.id, input("a", "setup"));
      recordPhase(db, episode.id, "a", "discussing");
      queueBotcastEpisodeImageContext(db, "producer", episode.id, input("b"));
      const result = await advanceBotcastEpisode(db, "producer", episode.id, { cue: { kind: "present_image", imageId: "b" } }, {
        preferredProvider: "anthropic", providerFactory: () => provider, signalSocialSilenceChanceOverride: 0,
        signalEpisodeImage: attachment("b"), signalPreviousEpisodeImage: attachment("a"),
      });
      assert.equal(captures.length, 2);
      assert.deepEqual(models, ["claude-sonnet-5", "claude-sonnet-5"]);
      assert.equal(tokenLimits[0], 384);
      assert.ok(tokenLimits[1]! > tokenLimits[0]!, "empty reasoning output gets a larger completion allowance on its bounded retry");
      assert.ok(tokenLimits[1]! <= 2048, "retry headroom remains bounded");
      for (const messages of captures) {
        assert.deepEqual(messages.flatMap((message) => message.images?.map((image) => image.data) ?? []), ["original-b", "original-a"]);
      }
      assert.match(captures[1]!.map((message) => message.content).join("\n"), /new introduction to the CURRENT attached picture/u);
      assert.match(result.message?.content ?? "", /red wheel beneath a gold horizon/u);
      assert.doesNotMatch(result.message?.content ?? "", /signal_image_context|PRIVATE-/u);
      assert.equal(botcastActiveImageContextV1(result.episode.events)?.imageId, "b");
      assert.equal(botcastPendingImageContextV1(result.episode.events), null);
      const event = result.episode.events.find((entry) => entry.kind === "provider_generation");
      assert.equal(event?.payload.outcome, "succeeded");
      const attempts = event?.payload.attempts as Array<{ outcome: string; reason?: string }>;
      assert.deepEqual(attempts.map(({ outcome, reason }) => ({ outcome, reason })), [
        { outcome: "rejected", reason: "empty" }, { outcome: "succeeded", reason: undefined },
      ]);
      assert.doesNotMatch(JSON.stringify(result.episode.events), /original-|PRIVATE-/u);
    } finally { db.close(); }
  });

  it("bounds empty ONLINE retries and keeps a failed replacement queued without airing a fallback", async () => {
    const { db, episode } = fixture();
    let calls = 0;
    const provider: LlmProvider = { name: "anthropic", embedText: async () => [], generateResponse: async () => {
      calls += 1;
      throw new Error("Anthropic returned an empty response.");
    } };
    try {
      db.prepare("UPDATE botcast_episodes SET provider = 'anthropic', model = 'claude-sonnet-5', response_mode = 'online', segment = 'interview' WHERE id = ?").run(episode.id);
      queueBotcastEpisodeImageContext(db, "producer", episode.id, input("a", "setup"));
      recordPhase(db, episode.id, "a", "discussing");
      queueBotcastEpisodeImageContext(db, "producer", episode.id, input("b"));
      await assert.rejects(advanceBotcastEpisode(db, "producer", episode.id, { cue: { kind: "present_image", imageId: "b" } }, {
        preferredProvider: "anthropic", providerFactory: () => provider, signalSocialSilenceChanceOverride: 0,
        signalEpisodeImage: attachment("b"), signalPreviousEpisodeImage: attachment("a"),
      }), /could not introduce this picture.*still queued/u);
      assert.equal(calls, 2);
      const saved = getBotcastEpisode(db, "producer", episode.id);
      assert.equal(saved.messages.length, 0);
      assert.equal(botcastPendingImageContextV1(saved.events)?.imageId, "b");
      assert.equal(botcastActiveImageContextV1(saved.events)?.imageId, "a");
      const event = saved.events.find((entry) => entry.kind === "provider_generation");
      assert.equal(event?.payload.outcome, "rejected");
      assert.deepEqual((event?.payload.attempts as Array<{ reason: string }>).map((attempt) => attempt.reason), ["empty", "empty"]);
    } finally { db.close(); }
  });

  it("treats thrown and returned empty ONLINE responses alike without a custom validator", async () => {
    for (const name of ["openai", "anthropic"] as const) {
      for (const thrown of [false, true]) {
        let calls = 0;
        const provider: LlmProvider = { name, embedText: async () => [], generateResponse: async () => {
          calls += 1;
          if (calls === 1) {
            if (thrown) throw new Error(`${name === "openai" ? "OpenAI" : "Anthropic"} returned an empty response.`);
            return "   ";
          }
          return "Look at the red wheel below the gold horizon.";
        } };
        const result = await runSignalOnlineTurn({ provider, providerName: name, model: "test-model", messages: [], options: {}, retryDelayMs: 0 });
        assert.equal(calls, 2);
        assert.match(result.value, /red wheel/u);
        assert.equal(result.attempts[0]?.reason, "empty");
      }
    }
  });

  it("keeps Watch single-image and rolls back proxy, note and description on event failure", () => {
    const { db, episode, show } = fixture();
    try {
      const watch = createBotcastEpisode(db, "producer", show.id, { guestBotId: "guest", topic: "Watch", playbackMode: "watch", preferredProvider: "local", responseMode: "local", model: "llava" });
      assert.throws(() => queueBotcastEpisodeImageContext(db, "producer", watch.id, input("watch")), /producing a live bot/u);
      queueBotcastEpisodeImageContext(db, "producer", watch.id, { ...input("watch", "setup"), allowWatchBake: true });
      recordPhase(db, watch.id, "watch", "dismissed");
      assert.throws(() => queueBotcastEpisodeImageContext(db, "producer", watch.id, { ...input("second"), allowWatchBake: true }), /Watch accepts one/u);
      db.exec(`CREATE TEMP TRIGGER reject_image_event BEFORE INSERT ON botcast_events WHEN NEW.kind = 'image_context' BEGIN SELECT RAISE(ABORT, 'event failed'); END;`);
      assert.throws(() => queueBotcastEpisodeImageContext(db, "producer", episode.id, input("atomic")), /event failed/u);
      assert.equal(readSignalEpisodeImageProxy(db, "producer", episode.id), null);
      assert.deepEqual(botcastImageHistoryV1(getBotcastEpisode(db, "producer", episode.id).events), []);
    } finally { db.close(); }
  });

  it("carries three pictures through normal host turns with current/previous pixels, older public positions, and an interleaved guest update", async () => {
    const { db, episode } = fixture();
    const captures: ProviderMessage[][] = [];
    const lines = [
      "Welcome to the show. I am Mara Vale, and Ivo Stone joins me to examine invention and appetite.",
      "Invention reveals the appetite that made it necessary.",
      "Which appetite is hardest for a maker to admit?",
      "The appetite to make danger beautiful enough to be welcomed.",
      "Look at this first painting, Ivo. What does the red wheel do to the crowded scene?",
      "The red wheel gives the crowd a beautiful excuse for its violence.",
      "This second painting replaces the crowd with a gold horizon. Does that change your claim about violence?",
      "The gold horizon changes the scale, but I disagree that it absolves the wheel of its threat.",
      "Now this third painting crowds that horizon with towers. How does it compare with the earlier wheel?",
      "Those towers turn the wheel into a monument rather than a threat, unlike the crowd we discussed earlier.",
    ];
    let holdGuest = false;
    let releaseGuest!: () => void;
    let guestStarted!: () => void;
    const guestGate = new Promise<void>((resolve) => { releaseGuest = resolve; });
    const guestStart = new Promise<void>((resolve) => { guestStarted = resolve; });
    const provider: LlmProvider = { name: "local", embedText: async () => [], generateResponse: async (messages, options) => {
      if (options?.usagePurpose === "psychic_planning") return "Stay concrete.";
      captures.push(messages);
      if (holdGuest) { holdGuest = false; guestStarted(); await guestGate; }
      return lines.shift() ?? "The blue shadows make the wheel's danger more legible.";
    } };
    const generation = { preferredProvider: "local" as const, providerFactory: () => provider, signalSocialSilenceChanceOverride: 0 };
    try {
      queueBotcastEpisodeImageContext(db, "producer", episode.id, input("a", "setup"));
      for (let index = 0; index < 4; index++) await advanceBotcastEpisode(db, "producer", episode.id, {}, generation);
      assert.equal(captures.slice(0, 4).every((prompt) => prompt.every((message) => !message.images)), true);
      assert.doesNotMatch(JSON.stringify(captures.slice(0, 4)), /Grounded description of a|PRIVATE-a/u);
      const introA = await advanceBotcastEpisode(db, "producer", episode.id, { cue: { kind: "present_image", imageId: "a" } }, { ...generation, signalEpisodeImage: attachment("a") });
      assert.equal(botcastActiveImageContextV1(introA.episode.events)?.imageId, "a");
      holdGuest = true;
      const guest = advanceBotcastEpisode(db, "producer", episode.id, {}, { ...generation, signalEpisodeImage: attachment("a") });
      await guestStart;
      queueBotcastEpisodeImageContext(db, "producer", episode.id, input("b"));
      releaseGuest();
      const guestA = await guest;
      assert.equal(botcastPendingImageContextV1(guestA.episode.events)?.imageId, "b");
      assert.equal(botcastActiveImageContextV1(guestA.episode.events)?.imageId, "a");
      for (const [id, previous] of [["b", "a"], ["c", "b"]] as const) {
        if (id === "c") queueBotcastEpisodeImageContext(db, "producer", episode.id, input(id));
        const imageGeneration = { ...generation, signalEpisodeImage: attachment(id), signalPreviousEpisodeImage: attachment(previous) };
        await advanceBotcastEpisode(db, "producer", episode.id, { cue: { kind: "present_image", imageId: id } }, imageGeneration);
        await advanceBotcastEpisode(db, "producer", episode.id, {}, imageGeneration);
      }
      const saved = getBotcastEpisode(db, "producer", episode.id);
      assert.deepEqual(botcastImageHistoryV1(saved.events).map((image) => [image.imageId, image.phase]), [["a", "dismissed"], ["b", "dismissed"], ["c", "discussing"]]);
      assert.equal(botcastImageContextForMessageV1(saved.events, introA.message?.id)?.imageId, "a");
      assert.equal(botcastImageContextForMessageV1(saved.events, guestA.message?.id)?.imageId, "a");
      for (let index = 4; index < 10; index++) {
        const prompt = captures[index]!;
        const ordinal = Math.floor((index - 4) / 2);
        const expected = ["a", "b", "c"][ordinal]!;
        assert.deepEqual(prompt.flatMap((message) => message.images?.map((image) => image.data) ?? []), ordinal ? [`original-${expected}`, `original-${["a", "b"][ordinal - 1]}`] : ["original-a"]);
        const text = prompt.map((message) => message.content).join("\n");
        assert.match(text, /CURRENT picture/u);
        assert.match(text, new RegExp(`Grounded description of ${expected}`, "u"));
        if (index % 2) assert.match(text, /revise, qualify, or defend/u);
        else assert.match(text, /Introduce the CURRENT picture now/u);
        if (index % 2) assert.doesNotMatch(text, /PRIVATE-/u);
        else assert.match(text, new RegExp(`PRIVATE-${expected}`, "u"));
        if (ordinal === 2) {
          assert.match(text, /Grounded description of a/u);
          assert.match(text, /beautiful excuse for its violence/u);
          assert.match(text, /speakerRole/u);
        }
      }
      assert.doesNotMatch(JSON.stringify(saved.events), /original-|PRIVATE-/u);
    } finally { releaseGuest?.(); db.close(); }
  });
});
