import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import {
  assignCoffeeContextSparkCandidates,
  consumeCoffeeContextSpark,
  discoverCoffeeContextSparkCandidates,
  ensureCoffeeContextSparks,
  fallbackCoffeeContextSparkPrompt,
  normalizeCoffeeContextSparkPrompt,
  resolveCoffeeContextSparkForTurn,
  synthesizeCoffeeContextSparkPrompts,
  updateCoffeeContextSparkState,
  type CoffeeContextSparkCandidate,
} from "../coffee-context-sparks.ts";
import { initializeDatabase } from "../db.ts";
import type {
  GenerateOptions,
  LlmProvider,
  ProviderMessage,
} from "../providers.ts";

const NOW = "2026-08-15T16:00:00.000Z";
const coffeeSource = readFileSync(new URL("../coffee.ts", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("../server.ts", import.meta.url), "utf8");

class SparkProvider implements LlmProvider {
  public readonly name = "local" as const;
  public calls = 0;
  public messages: ProviderMessage[][] = [];
  public options: Array<GenerateOptions | undefined> = [];

  public async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    this.calls += 1;
    this.messages.push(messages);
    this.options.push(options);
    const payload = JSON.parse(
      messages.find((message) => message.role === "user")?.content ?? "{}",
    ) as {
      candidates?: Array<{
        candidateId: string;
        bot: string;
        title: string;
      }>;
    };
    return JSON.stringify({
      sparks: (payload.candidates ?? []).map((candidate) => ({
        candidateId: candidate.candidateId,
        prompt: `Ask ${candidate.bot.split(/\s+/u)[0]} what surprised them about ${candidate.title
          .split(/\s+/u)
          .slice(0, 3)
          .join(" ")}`,
      })),
    });
  }

  public async embedText(): Promise<number[]> {
    return [];
  }
}

function seedUser(db: DatabaseSync, id = "user-1"): void {
  db.prepare(
    `INSERT INTO users
      (id, email, display_name, password_hash, password_salt, wrapped_user_key,
       wrapped_user_key_iv, wrapped_user_key_tag, created_at, last_active_at)
     VALUES (?, ?, ?, 'hash', 'salt', 'cipher', 'iv', 'tag', ?, ?)`,
  ).run(id, `${id}@example.com`, id, NOW, NOW);
}

function seedBot(db: DatabaseSync, id: string, name: string, color: string): void {
  db.prepare(
    `INSERT INTO bots
      (id, user_id, name, system_prompt, color, glyph, created_at, updated_at)
     VALUES (?, 'user-1', ?, ?, ?, ?, ?, ?)`,
  ).run(id, name, `${name} is a precise conversational persona.`, color, "sparkles", NOW, NOW);
}

function seedGroup(db: DatabaseSync, id: string, name: string): void {
  db.prepare(
    `INSERT INTO coffee_groups
      (id, user_id, name, ethos, coffee_settings, created_at, updated_at)
     VALUES (?, 'user-1', ?, 'Curious, grounded conversation.', '{}', ?, ?)`,
  ).run(id, name, NOW, NOW);
}

function seedConversation(args: {
  db: DatabaseSync;
  id: string;
  groupId: string;
  botIds: string[];
  incognito?: boolean;
  title?: string;
}): void {
  args.db.prepare(
    `INSERT INTO conversations
      (id, user_id, title, conversation_mode, bot_group_ids, coffee_group_id,
       coffee_topic, incognito, created_at, updated_at)
     VALUES (?, 'user-1', ?, 'coffee', ?, ?, ?, ?, ?, ?)`,
  ).run(
    args.id,
    args.title ?? args.id,
    JSON.stringify(args.botIds),
    args.groupId,
    args.title ?? args.id,
    args.incognito ? 1 : 0,
    NOW,
    NOW,
  );
}

function seedSignalSources(db: DatabaseSync): void {
  db.prepare(
    `INSERT INTO botcast_shows
      (id, user_id, host_bot_id, name, premise, hosting_style, accent_color, created_at, updated_at)
     VALUES ('show-a', 'user-1', 'bot-a', 'Signal A', 'Notice hidden tensions.', 'direct', '#ff3355', ?, ?)`,
  ).run(NOW, NOW);
  db.prepare(
    `INSERT INTO botcast_episodes
      (id, user_id, show_id, host_bot_id, guest_bot_id, guest_kind, guest_name,
       title, topic, outcome, status, segment, started_at, completed_at, created_at, updated_at)
     VALUES ('signal-a', 'user-1', 'show-a', 'bot-a', 'bot-b', 'bot', 'Bex',
       'The bridge nobody trusted', 'Trust under pressure', 'A concrete disagreement about the bridge.',
       'completed', 'closing', ?, ?, ?, ?)`,
  ).run(NOW, NOW, NOW, NOW);

  db.prepare(
    `INSERT INTO botcast_shows
      (id, user_id, host_bot_id, name, premise, hosting_style, accent_color, created_at, updated_at)
     VALUES ('show-d', 'user-1', 'bot-d', 'Signal D', 'Follow the evidence.', 'measured', '#aa55ff', ?, ?)`,
  ).run(NOW, NOW);
  db.prepare(
    `INSERT INTO botcast_episodes
      (id, user_id, show_id, host_bot_id, guest_bot_id, guest_kind, guest_name,
       title, topic, outcome, status, segment, started_at, completed_at, created_at, updated_at)
     VALUES ('signal-producer', 'user-1', 'show-d', 'bot-d', 'bot-c', 'producer', 'Producer',
       'The map with a missing road', 'Evidence and omission', 'The host found an omitted route.',
       'completed', 'closing', ?, ?, ?, ?)`,
  ).run(NOW, NOW, NOW, NOW);
}

function seedDebateSource(db: DatabaseSync): void {
  db.prepare(
    `INSERT INTO debate_sessions
      (id, user_id, status, phase, step_key, player_role, create_idempotency_key,
       motion, session_json, created_at, updated_at, completed_at)
     VALUES ('debate-a', 'user-1', 'completed', 'verdict', 'complete', 'judge', 'debate-key',
       'Cities should replace parking with public gardens', ?, ?, ?, ?)`,
  ).run(
    JSON.stringify({
      moderator: { id: "bot-b" },
      forAdvocate: { id: "bot-c" },
      againstAdvocate: { id: "bot-d" },
      jury: [{ id: "bot-a" }],
      synopsis: { text: "The room split over access, maintenance, and shade." },
    }),
    NOW,
    NOW,
    NOW,
  );
}

function seedCoffeeSource(db: DatabaseSync): void {
  seedConversation({
    db,
    id: "coffee-old",
    groupId: "group-old",
    botIds: ["bot-c", "bot-d"],
    title: "What makes an apology believable?",
  });
  db.prepare(
    `INSERT INTO messages
      (id, conversation_id, user_id, role, content, bot_id, created_at)
     VALUES ('old-c', 'coffee-old', 'user-1', 'assistant', 'Specific repair matters more than ceremony.', 'bot-c', ?)`,
  ).run(NOW);
  db.prepare(
    `INSERT INTO messages
      (id, conversation_id, user_id, role, content, tool_payload, created_at)
     VALUES ('old-summary', 'coffee-old', 'user-1', 'system',
       'The table compared apology rituals with concrete restitution.', '{"coffeeSynopsis":true}', ?)`,
  ).run(NOW);
}

function fixture(options: { withHistory?: boolean } = {}): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  seedUser(db);
  seedUser(db, "user-2");
  seedBot(db, "bot-a", "Ari Vale", "#ff3355");
  seedBot(db, "bot-b", "Bex North", "#ff9933");
  seedBot(db, "bot-c", "Cleo Moss", "#33ccaa");
  seedBot(db, "bot-d", "Dax Blue", "#5577ff");
  seedGroup(db, "group-current", "Current Table");
  seedGroup(db, "group-old", "Old Table");
  seedConversation({
    db,
    id: "coffee-current",
    groupId: "group-current",
    botIds: ["bot-a", "bot-b", "bot-c", "bot-d"],
    title: "Current Table",
  });
  if (options.withHistory !== false) {
    seedSignalSources(db);
    seedDebateSource(db);
    seedCoffeeSource(db);
  }
  return db;
}

function candidate(overrides: Partial<CoffeeContextSparkCandidate>): CoffeeContextSparkCandidate {
  return {
    id: "signal:source:bot-a",
    sourceApplet: "signal",
    sourceSessionId: "source",
    sourceTitle: "The bridge nobody trusted",
    sourceDate: NOW,
    sourceRole: "host",
    sourceSynopsis: "A concrete dispute about trust.",
    sourceParticipantBotIds: ["bot-a"],
    inspiredBotId: "bot-a",
    inspiredBotName: "Ari Vale",
    score: 100,
    ...overrides,
  };
}

describe("Coffee Context Sparks", () => {
  it("wires GET, PATCH, directed turn validation, and success-only consumption", () => {
    assert.match(serverSource, /GET", "\/api\/coffee\/sessions\/:id\/context-sparks/u);
    assert.match(
      serverSource,
      /PATCH",\s*"\/api\/coffee\/sessions\/:id\/context-sparks\/:sparkId/u,
    );
    assert.match(serverSource, /resolveCoffeeContextSparkForTurn\(\{/u);
    assert.match(
      serverSource,
      /if \(contextSpark && result\.speakerBotId && !result\.stale\) \{\s*consumeCoffeeContextSpark/u,
    );
    assert.match(
      coffeeSource,
      /tableFocus: message,\s*directedSpeakerPrivateContext: input\.contextSparkPrivateContext/u,
    );
    assert.match(
      coffeeSource,
      /directedSpeakerPrivateContext && explicitDirectedSpeaker\?\.id === speaker\.id/u,
    );
    assert.doesNotMatch(
      coffeeSource,
      /tableFocus: input\.contextSparkPrivateContext\s*\?/u,
    );
  });

  it("discovers only completed, addressable participants and cross-group speakers", () => {
    const db = fixture();
    const candidates = discoverCoffeeContextSparkCandidates(
      db,
      "user-1",
      "coffee-current",
    );

    assert.ok(candidates.some((entry) => entry.id === "signal:signal-a:bot-a"));
    assert.ok(candidates.some((entry) => entry.id === "signal:signal-a:bot-b"));
    assert.ok(candidates.some((entry) => entry.id === "signal:signal-producer:bot-d"));
    assert.ok(!candidates.some((entry) => entry.id === "signal:signal-producer:bot-c"));
    assert.ok(candidates.some((entry) => entry.id === "debate:debate-a:bot-b"));
    assert.ok(candidates.some((entry) => entry.id === "debate:debate-a:bot-c"));
    assert.ok(candidates.some((entry) => entry.id === "debate:debate-a:bot-d"));
    assert.ok(!candidates.some((entry) => entry.id === "debate:debate-a:bot-a"));
    assert.deepEqual(
      candidates
        .filter((entry) => entry.sourceApplet === "coffee")
        .map((entry) => entry.inspiredBotId),
      ["bot-c"],
    );
    db.close();
  });

  it("maximizes applet coverage while keeping visible personas distinct", () => {
    const selected = assignCoffeeContextSparkCandidates([
      candidate({ id: "signal:s:bot-a", score: 500 }),
      candidate({ id: "signal:s:bot-b", inspiredBotId: "bot-b", score: 300 }),
      candidate({ id: "debate:d:bot-a", sourceApplet: "debate", score: 490 }),
      candidate({ id: "debate:d:bot-c", sourceApplet: "debate", inspiredBotId: "bot-c", score: 250 }),
      candidate({ id: "coffee:c:bot-a", sourceApplet: "coffee", score: 480 }),
      candidate({ id: "coffee:c:bot-d", sourceApplet: "coffee", inspiredBotId: "bot-d", score: 240 }),
    ]);

    assert.equal(selected.length, 3);
    assert.equal(new Set(selected.map((entry) => entry.inspiredBotId)).size, 3);
    assert.deepEqual(selected.map((entry) => entry.sourceApplet), ["signal", "debate", "coffee"]);
  });

  it("rejects vague model copy and retains a deterministic grounded fallback", async () => {
    const source = candidate({});
    assert.equal(normalizeCoffeeContextSparkPrompt("Ask Ari something", source), null);
    assert.match(fallbackCoffeeContextSparkPrompt(source), /^Ask Ari\b/u);

    const failingProvider: LlmProvider = {
      name: "local",
      generateResponse: async () => {
        throw new Error("Ollama is cold");
      },
      embedText: async () => [],
    };
    const prompts = await synthesizeCoffeeContextSparkPrompts({
      candidates: [source],
      provider: failingProvider,
    });
    assert.equal(prompts.get(source.id), fallbackCoffeeContextSparkPrompt(source));
  });

  it("generates once, persists stable sparks, and consumes only after an explicit success", async () => {
    const db = fixture();
    const provider = new SparkProvider();
    const first = await ensureCoffeeContextSparks({
      db,
      userId: "user-1",
      conversationId: "coffee-current",
      provider,
    });
    const second = await ensureCoffeeContextSparks({
      db,
      userId: "user-1",
      conversationId: "coffee-current",
      provider,
    });

    assert.equal(provider.calls, 1);
    assert.equal(first.length, 3);
    assert.deepEqual(second, first);
    assert.equal(new Set(first.map((spark) => spark.inspiredBotId)).size, 3);
    assert.equal(provider.options[0]?.usagePurpose, "coffee_router");
    assert.equal(provider.options[0]?.jsonMode, true);
    assert.ok(provider.options[0]?.jsonSchema);
    assert.doesNotMatch(
      provider.messages[0]?.find((message) => message.role === "user")?.content ?? "",
      /Specific repair matters more than ceremony/u,
    );

    const spark = first[0]!;
    const armed = updateCoffeeContextSparkState({
      db,
      userId: "user-1",
      conversationId: "coffee-current",
      sparkId: spark.id,
      state: "armed",
    });
    assert.equal(armed.find((entry) => entry.id === spark.id)?.state, "armed");
    const resolved = resolveCoffeeContextSparkForTurn({
      db,
      userId: "user-1",
      conversationId: "coffee-current",
      sparkId: spark.id,
    });
    assert.equal(resolved?.inspiredBotId, spark.inspiredBotId);
    assert.match(resolved?.privateContext ?? "", /actually participated/u);
    assert.equal(
      db.prepare("SELECT state FROM coffee_context_sparks WHERE id = ?").get(spark.id)?.state,
      "armed",
    );

    consumeCoffeeContextSpark({
      db,
      userId: "user-1",
      conversationId: "coffee-current",
      sparkId: spark.id,
    });
    assert.equal(
      db.prepare("SELECT state FROM coffee_context_sparks WHERE id = ?").get(spark.id)?.state,
      "used",
    );
    assert.ok(
      !(await ensureCoffeeContextSparks({
        db,
        userId: "user-1",
        conversationId: "coffee-current",
        provider,
      })).some((entry) => entry.id === spark.id),
    );
    db.close();
  });

  it("marks deleted sources stale and never replaces them inside the session", async () => {
    const db = fixture();
    const provider = new SparkProvider();
    const initial = await ensureCoffeeContextSparks({
      db,
      userId: "user-1",
      conversationId: "coffee-current",
      provider,
    });
    const debate = initial.find((spark) => spark.sourceApplet === "debate")!;
    db.prepare("DELETE FROM debate_sessions WHERE id = ?").run(debate.sourceSessionId);
    const afterDelete = await ensureCoffeeContextSparks({
      db,
      userId: "user-1",
      conversationId: "coffee-current",
      provider,
    });

    assert.ok(!afterDelete.some((spark) => spark.id === debate.id));
    assert.equal(
      db.prepare("SELECT state FROM coffee_context_sparks WHERE id = ?").get(debate.id)?.state,
      "stale",
    );
    assert.equal(provider.calls, 1);
    db.close();
  });

  it("records an empty generation so later history cannot change the current session", async () => {
    const db = fixture({ withHistory: false });
    const provider = new SparkProvider();
    assert.deepEqual(
      await ensureCoffeeContextSparks({
        db,
        userId: "user-1",
        conversationId: "coffee-current",
        provider,
      }),
      [],
    );
    seedSignalSources(db);
    assert.deepEqual(
      await ensureCoffeeContextSparks({
        db,
        userId: "user-1",
        conversationId: "coffee-current",
        provider,
      }),
      [],
    );
    assert.equal(provider.calls, 0);
    assert.equal(
      db.prepare(
        "SELECT COUNT(*) AS n FROM coffee_context_spark_runs WHERE conversation_id = 'coffee-current'",
      ).get()?.n,
      1,
    );
    db.close();
  });
});
