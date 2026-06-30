import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { fallbackEmbedding } from "../providers.ts";
import {
  analyzeMemoryIntent,
  buildInitialAboutYouMemoryText,
  createDevSeedMemories,
  deleteMemoriesForBotScope,
  deleteMemoryById,
  deleteMemoriesLinkedToMessages,
  demoteMemoryToShortTerm,
  deleteOrphanedBotMemories,
  extractBotPreferredAddressMemoryCandidates,
  extractBotJudgmentMemoryCandidates,
  extractCoffeeObserverMemoryCandidates,
  findMemoryByCue,
  extractMemoryCandidates,
  filterConflictingMemories,
  persistMemoryCandidates,
  restoreMemory,
  retrieveRelevantMemories,
} from "../memory.ts";

function createMemoryTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE memories (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      bot_id TEXT,
      ciphertext TEXT NOT NULL,
      iv TEXT NOT NULL,
      tag TEXT NOT NULL,
      confidence REAL NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      tier TEXT NOT NULL DEFAULT 'short_term',
      durability REAL NOT NULL DEFAULT 0.5,
      source TEXT NOT NULL DEFAULT 'direct',
      certainty REAL,
      source_message_ids TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      delete_protected INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { prompt?: string };
    return new Response(
      JSON.stringify({ embedding: fallbackEmbedding(body.prompt ?? "") }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function memoryCandidateCore(candidates: Array<{ text: string; confidence: number }>) {
  return candidates.map((candidate) => ({
    text: candidate.text,
    confidence: candidate.confidence,
  }));
}

describe("buildInitialAboutYouMemoryText", () => {
  it("records account display-name metadata without inferring a preferred-name instruction", () => {
    assert.equal(buildInitialAboutYouMemoryText("Jared Dunn"), "Your account display name is Jared.");
    assert.equal(
      buildInitialAboutYouMemoryText("   "),
      "Your account has not provided a display name yet."
    );
  });
});

function seedMemoryRow(
  db: DatabaseSync,
  userId: string,
  botId: string | null,
  id: string
): void {
  db.prepare(
    "INSERT INTO memories (id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)"
  ).run(id, userId, botId, "ciphertext", "iv", "tag", 0.8, new Date().toISOString());
}

describe("extractMemoryCandidates", () => {
  it("pulls personal preference statements", () => {
    const candidates = extractMemoryCandidates(
      "I prefer concise answers. My favorite language is TypeScript."
    );
    assert.ok(candidates.length > 0);
  });

  it("treats explicit don't-forget instructions as high-confidence memories", () => {
    const candidates = extractMemoryCandidates(
      "Ok, but please don't forget! Please do not talk to me with quotes."
    );

    assert.deepEqual(
      candidates.map((candidate) => candidate.confidence),
      [0.98]
    );
    assert.match(candidates[0]?.text ?? "", /do not talk/i);
  });

  it("ignores cue-only fragments after a substantive remember instruction", () => {
    const candidates = extractMemoryCandidates(
      "Please remember to talk like a Pirate. Do not forget."
    );

    assert.deepEqual(memoryCandidateCore(candidates), [
      { text: "To talk like a Pirate.", confidence: 0.98 },
    ]);
  });

  it("rewrites first-person input into concise second-person memory text", () => {
    const candidates = extractMemoryCandidates(
      "Don't forget that I like cheese."
    );

    assert.equal(candidates[0]?.text, "You like cheese.");
    assert.equal(candidates[0]?.confidence, 0.98);
  });

  it("keeps indirect name corrections tentative", () => {
    const candidates = extractMemoryCandidates(
      "I have a name, you know. It's Jared!"
    );

    assert.deepEqual(memoryCandidateCore(candidates), [
      { text: "You prefer to be called Jared.", confidence: 0.56 },
    ]);
  });

  it("treats explicit preferred-name instructions as high-confidence memories", () => {
    const candidates = extractMemoryCandidates(
      "Please do not forget: You must only refer to me as Jared."
    );

    assert.deepEqual(memoryCandidateCore(candidates), [
      { text: "You prefer to be called Jared.", confidence: 0.98 },
    ]);
  });

  it("treats remember-this directives as explicit memory candidates", () => {
    const candidates = extractMemoryCandidates(
      "Remember this: do not refer to yourself as AI."
    );

    assert.deepEqual(memoryCandidateCore(candidates), [
      { text: "Do not refer to yourself as AI.", confidence: 0.98 },
    ]);
  });

  it("strips conversational tag questions from stored memory text", () => {
    const candidates = extractMemoryCandidates(
      "I love potatoes, don't you?"
    );

    assert.deepEqual(memoryCandidateCore(candidates), [
      { text: "You love potatoes.", confidence: 0.67 },
    ]);
  });

  it("rewrites apology-prefixed self-state memories into concise user-facing wording", () => {
    const candidates = extractMemoryCandidates(
      "Sorry about that, I'm just distracted."
    );

    assert.deepEqual(memoryCandidateCore(candidates), [
      { text: "You seem a little distracted.", confidence: 0.72 },
    ]);
  });

  it("does not store one-off task requests as memories just because they contain my", () => {
    const candidates = extractMemoryCandidates(
      "Write a quick email to my landlord about the sink leak."
    );

    assert.deepEqual(candidates, []);
  });

  it("rewrites my/me references to your/you in stored memory text", () => {
    const candidates = extractMemoryCandidates(
      "My favorite drink is coffee."
    );

    assert.match(candidates[0]?.text ?? "", /^Your favorite drink is coffee\.$/);
  });

  it("captures habitat-style statements like i live and rewrites fun-fact prefixes", () => {
    const candidates = extractMemoryCandidates(
      "Fun: fact, I live on land!"
    );

    assert.deepEqual(memoryCandidateCore(candidates), [
      { text: "You live on land.", confidence: 0.9 },
    ]);
  });

  it("captures funny-enough self-disclosures without storing the lead-in", () => {
    const candidates = extractMemoryCandidates(
      "Funny enough, I live on land!"
    );

    assert.deepEqual(memoryCandidateCore(candidates), [
      { text: "You live on land.", confidence: 0.9 },
    ]);
  });

  it("keeps assistant-directed reminder preferences grammatically correct", () => {
    const candidates = extractMemoryCandidates(
      "Please don't forget that I do not want you to remind me that you are AI."
    );

    assert.deepEqual(memoryCandidateCore(candidates), [
      {
        text: "You do not want me to remind you that I am AI.",
        confidence: 0.98,
      },
    ]);
  });

  it("treats call-me directives as explicit name preference memories", () => {
    const candidates = extractMemoryCandidates("Please, call me Jared.");

    assert.deepEqual(memoryCandidateCore(candidates), [
      {
        text: "You prefer to be called Jared.",
        confidence: 0.98,
      },
    ]);
  });

  it("normalizes name reminders into explicit preferred-name memories", () => {
    const examples = [
      "Please only refer to me as Jared.",
      "Do not forget my name is Jared",
      "Remember, my name is Jared.",
      "Only call me Jared.",
      "Please refer to me only as Jared.",
      "I go by Jared.",
    ];

    for (const example of examples) {
      const candidates = extractMemoryCandidates(example);
      assert.deepEqual(
        memoryCandidateCore(candidates),
        [
          {
            text: "You prefer to be called Jared.",
            confidence: 0.98,
          },
        ],
        example
      );
    }
  });
});

describe("extractBotJudgmentMemoryCandidates", () => {
  it("captures calm persona-grounded discomfort judgments", () => {
    const candidates = extractBotJudgmentMemoryCandidates({
      assistantMessage:
        "That is crossing a line for me, and your tone is starting to feel creepy.",
      botName: "Lara",
    });

    assert.equal(candidates.length, 1);
    assert.equal(
      candidates[0]?.text,
      "Lara felt uneasy about the user's vibe and wanted clearer boundaries."
    );
    assert.equal(candidates[0]?.category, "general");
  });

  it("rejects abusive or punitive judgments", () => {
    const candidates = extractBotJudgmentMemoryCandidates({
      assistantMessage: "You are disgusting and I never want to talk to you again.",
      botName: "Lara",
    });

    assert.equal(candidates.length, 0);
  });
});

describe("extractCoffeeObserverMemoryCandidates", () => {
  it("infers likely user name memories from Coffee bot address", () => {
    const candidates = extractCoffeeObserverMemoryCandidates({
      speakerName: "Alice",
      assistantMessage: "Jared, that preference for quiet mornings makes sense.",
      seatedBotNames: ["Alice", "Boris"],
    });

    assert.deepEqual(memoryCandidateCore(candidates), [
      {
        text: "You prefer to be called Jared.",
        confidence: 0.62,
      },
    ]);
    assert.equal(candidates[0]?.category, "user");
  });

  it("infers likely user preference facts from Coffee bot statements", () => {
    const candidates = extractCoffeeObserverMemoryCandidates({
      speakerName: "Alice",
      assistantMessage: "Jared prefers short, calm answers.",
      seatedBotNames: ["Alice", "Boris"],
    });

    assert.deepEqual(memoryCandidateCore(candidates), [
      {
        text: "You prefer short, calm answers.",
        confidence: 0.64,
      },
    ]);
    assert.equal(candidates[0]?.category, "user");
  });

  it("infers other-bot relationship memories from Coffee dialogue", () => {
    const candidates = extractCoffeeObserverMemoryCandidates({
      speakerName: "Alice",
      assistantMessage: "Boris, I agree with your gentle approach.",
      seatedBotNames: ["Alice", "Boris", "Cara"],
    });

    assert.deepEqual(memoryCandidateCore(candidates), [
      {
        text: "Alice tended to agree with Boris during Coffee.",
        confidence: 0.56,
      },
    ]);
    assert.equal(candidates[0]?.category, "bot_relation");
  });

  it("does not mistake seated bot names for the user's likely name", () => {
    const candidates = extractCoffeeObserverMemoryCandidates({
      speakerName: "Alice",
      assistantMessage: "Boris, what do you think about the rain?",
      seatedBotNames: ["Alice", "Boris"],
    });

    assert.deepEqual(candidates, []);
  });
});

describe("extractBotPreferredAddressMemoryCandidates", () => {
  it("captures direct call-me cues as bot_relation memory", () => {
    const candidates = extractBotPreferredAddressMemoryCandidates({
      assistantMessage: "Please refer to me as Dr. Freud.",
      targetBotName: "Sigmund Freud",
    });

    assert.deepEqual(memoryCandidateCore(candidates), [
      {
        text: "Sigmund Freud prefers to be called Dr. Freud.",
        confidence: 0.71,
      },
    ]);
    assert.equal(candidates[0]?.category, "bot_relation");
  });

  it("captures softer preference phrasing", () => {
    const candidates = extractBotPreferredAddressMemoryCandidates({
      assistantMessage: "I'd prefer you call me Patrick.",
      targetBotName: "Patrick Star",
    });

    assert.deepEqual(memoryCandidateCore(candidates), [
      {
        text: "Patrick Star prefers to be called Patrick.",
        confidence: 0.71,
      },
    ]);
  });

  it("ignores unsafe preferred labels", () => {
    const candidates = extractBotPreferredAddressMemoryCandidates({
      assistantMessage: "Please call me psycho.",
      targetBotName: "Sigmund Freud",
    });
    assert.deepEqual(candidates, []);
  });

  it("ignores no-op canonical address", () => {
    const candidates = extractBotPreferredAddressMemoryCandidates({
      assistantMessage: "Please call me Sigmund Freud.",
      targetBotName: "Sigmund Freud",
    });
    assert.deepEqual(candidates, []);
  });
});

describe("analyzeMemoryIntent", () => {
  it("promotes an explicit scope cue to global memory creation", () => {
    const intent = analyzeMemoryIntent(
      "I love pistachios. Make that a global memory."
    );

    assert.equal(intent.kind, "create");
    assert.equal(intent.scope, "global");
    assert.equal(intent.explicit, true);
    assert.deepEqual(memoryCandidateCore(intent.candidates), [
      { text: "You love pistachios.", confidence: 0.63 },
    ]);
  });

  it("detects multiple retraction cues without creating new memories", () => {
    const intent = analyzeMemoryIntent(
      "Nevermind what I said about pistachios. Forget what I said about coffee."
    );

    assert.equal(intent.kind, "retract");
    assert.deepEqual(intent.cuePhrases, [
      "Nevermind what I said about pistachios",
      "Forget what I said about coffee",
    ]);
  });

  it("treats retraction plus a new claim as a correction", () => {
    const intent = analyzeMemoryIntent(
      "Forget what I said earlier. Actually I prefer matcha. Save that globally."
    );

    assert.equal(intent.kind, "correct");
    assert.equal(intent.scope, "global");
    assert.deepEqual(intent.cuePhrases, ["Forget what I said earlier"]);
    assert.deepEqual(memoryCandidateCore(intent.newCandidates), [
      { text: "You prefer matcha.", confidence: 0.66 },
    ]);
  });

  it("keeps plain personal statements bot-scoped and non-explicit", () => {
    const intent = analyzeMemoryIntent("I like quiet mornings.");

    assert.equal(intent.kind, "create");
    assert.equal(intent.scope, "bot");
    assert.equal(intent.explicit, false);
    assert.deepEqual(memoryCandidateCore(intent.candidates), [
      { text: "You like quiet mornings.", confidence: 0.65 },
    ]);
  });

  it("treats fun-fact disclosures as explicit bot-scoped memory intent", () => {
    const intent = analyzeMemoryIntent("Fun: fact, I live on land.");

    assert.equal(intent.kind, "create");
    assert.equal(intent.scope, "bot");
    assert.equal(intent.explicit, true);
    assert.deepEqual(memoryCandidateCore(intent.candidates), [
      { text: "You live on land.", confidence: 0.9 },
    ]);
  });

  it("treats funny-enough disclosures as explicit bot-scoped memory intent", () => {
    const intent = analyzeMemoryIntent("Funny enough, I live on land.");

    assert.equal(intent.kind, "create");
    assert.equal(intent.scope, "bot");
    assert.equal(intent.explicit, true);
    assert.deepEqual(memoryCandidateCore(intent.candidates), [
      { text: "You live on land.", confidence: 0.9 },
    ]);
  });
});

describe("persistMemoryCandidates", () => {
  it("associates saved memories with the source conversation", async () => {
    const db = createMemoryTestDb();

    await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      [{ text: "The user likes concise answers.", confidence: 0.8 }],
      Buffer.alloc(32, 7)
    );

    const row = db
      .prepare("SELECT user_id, conversation_id, bot_id, confidence FROM memories")
      .get() as
      | {
          user_id: string;
          conversation_id: string | null;
          bot_id: string | null;
          confidence: number;
        }
      | undefined;

    assert.equal(row?.user_id, "user-1");
    assert.equal(row?.conversation_id, "conversation-1");
    assert.equal(row?.bot_id, "bot-1");
    assert.ok(Math.abs((row?.confidence ?? 0) - 0.72) < 1e-9);
  });

  it("stores source message ids on direct memories", async () => {
    const db = createMemoryTestDb();
    const [memory] = await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      [{ text: "You like green tea.", confidence: 0.9 }],
      Buffer.alloc(32, 7),
      { sourceMessageIds: ["message-1"] }
    );

    const row = db
      .prepare("SELECT source_message_ids FROM memories WHERE id = ?")
      .get(memory.id) as { source_message_ids: string } | undefined;

    assert.deepEqual(memory.sourceMessageIds, ["message-1"]);
    assert.deepEqual(JSON.parse(row?.source_message_ids ?? "[]"), ["message-1"]);
  });

  it("starts non-explicit direct memories at a conservative confidence", async () => {
    const db = createMemoryTestDb();
    const [memory] = await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      [{ text: "You enjoy chai tea.", confidence: 0.66 }],
      Buffer.alloc(32, 7)
    );

    assert.ok(Math.abs(memory.confidence - 0.58) < 1e-9);
    assert.equal(memory.tier, "short_term");
  });

  it("reinforces repeated preference mentions instead of duplicating rows", async () => {
    const db = createMemoryTestDb();
    const userKey = Buffer.alloc(32, 7);
    const first = await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      [{ text: "You enjoy chai tea.", confidence: 0.66 }],
      userKey,
      { sourceMessageIds: ["m1"] }
    );
    const second = await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-2",
      "bot-1",
      [{ text: "You like chai tea.", confidence: 0.67 }],
      userKey,
      { sourceMessageIds: ["m2"] }
    );

    const rows = db
      .prepare("SELECT id, confidence, source_message_ids FROM memories WHERE user_id = ? AND bot_id = ?")
      .all("user-1", "bot-1") as Array<{
      id: string;
      confidence: number;
      source_message_ids: string;
    }>;

    assert.equal(rows.length, 1);
    assert.equal(second[0]?.id, first[0]?.id);
    assert.ok((second[0]?.confidence ?? 0) > (first[0]?.confidence ?? 0));
    assert.deepEqual(JSON.parse(rows[0]?.source_message_ids ?? "[]"), ["m1", "m2"]);
  });

  it("promotes reinforced memories to long-term after repeated evidence", async () => {
    const db = createMemoryTestDb();
    const userKey = Buffer.alloc(32, 7);

    await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      [{ text: "You enjoy chai tea.", confidence: 0.66 }],
      userKey
    );
    await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-2",
      "bot-1",
      [{ text: "You enjoy chai tea.", confidence: 0.67 }],
      userKey
    );
    await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-3",
      "bot-1",
      [{ text: "You enjoy chai tea.", confidence: 0.68 }],
      userKey
    );
    const [fourth] = await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-4",
      "bot-1",
      [{ text: "You enjoy chai tea.", confidence: 0.69 }],
      userKey
    );

    assert.equal(fourth?.tier, "long_term");
    assert.ok((fourth?.confidence ?? 0) >= 0.86);
  });

  it("assigns categories and promotes 95% confidence memories to long-term", async () => {
    const db = createMemoryTestDb();
    const [memory] = await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      [{ text: "You love soft neon colors.", confidence: 0.98 }],
      Buffer.alloc(32, 7)
    );

    const row = db
      .prepare("SELECT category, tier FROM memories WHERE id = ?")
      .get(memory.id) as { category: string; tier: string } | undefined;

    assert.equal(memory.category, "user");
    assert.equal(memory.tier, "long_term");
    assert.equal(row?.category, "user");
    assert.equal(row?.tier, "long_term");
  });

  it("requires confidence and certainty together for long-term promotion", async () => {
    const db = createMemoryTestDb();
    const [memory] = await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      [{ text: "You love bright mossy greens.", confidence: 0.98 }],
      Buffer.alloc(32, 7),
      { certainty: 0.9, durability: 0.4 }
    );

    const row = db
      .prepare("SELECT tier FROM memories WHERE id = ?")
      .get(memory.id) as { tier: string } | undefined;

    assert.equal(memory.tier, "short_term");
    assert.equal(row?.tier, "short_term");
  });

  it("keeps durable inferred assumptions short-term below high confidence", async () => {
    const db = createMemoryTestDb();
    const [memory] = await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      [{ text: "Bob Ross believes painting can comfort people.", confidence: 0.8 }],
      Buffer.alloc(32, 7),
      { source: "inferred", certainty: 0.8, durability: 0.95 }
    );

    const row = db
      .prepare("SELECT tier, durability FROM memories WHERE id = ?")
      .get(memory.id) as { tier: string; durability: number } | undefined;

    assert.equal(memory.source, "inferred");
    assert.equal(memory.tier, "short_term");
    assert.equal(row?.tier, "short_term");
    assert.equal(row?.durability, 0.95);
  });

  it("promotes high-confidence inferred memories to long-term", async () => {
    const db = createMemoryTestDb();
    const [memory] = await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      [{ text: "Your favorite instrument is the piano.", confidence: 0.96 }],
      Buffer.alloc(32, 7),
      { source: "inferred", certainty: 0.96, durability: 0.95 }
    );

    assert.equal(memory.source, "inferred");
    assert.equal(memory.tier, "long_term");
  });

  it("promotes high-truth memories even when durability is only baseline", async () => {
    const db = createMemoryTestDb();
    const [memory] = await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      [{ text: "Bob Ross taught wet-on-wet oil painting.", confidence: 0.92 }],
      Buffer.alloc(32, 7),
      { certainty: 0.92, durability: 0.5 }
    );

    assert.equal(memory.tier, "long_term");
  });

  it("keeps durable persona-style memories short-term below high truth", async () => {
    const db = createMemoryTestDb();
    const [memory] = await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      [
        {
          text: "Bob Ross Inc. grew around your painting method, instructional materials, art supplies, workshops, and certified instructors.",
          confidence: 0.92,
        },
      ],
      Buffer.alloc(32, 7)
    );

    assert.equal(memory.tier, "short_term");
    assert.ok((memory.durability ?? 0) >= 0.88);
  });

  it("treats imported long-term tier as a confidence hint", async () => {
    const db = createMemoryTestDb();
    const lowConfidence = await restoreMemory(db, "user-1", Buffer.alloc(32, 7), {
      conversationId: "conversation-1",
      botId: "bot-1",
      text: "You prefer moral discipline over clever display.",
      confidence: 0.9,
      certainty: 0.9,
      category: "general",
      tier: "long_term",
      durability: 0.9,
      source: "compiled",
    });
    const highConfidence = await restoreMemory(db, "user-1", Buffer.alloc(32, 7), {
      conversationId: "conversation-1",
      botId: "bot-1",
      text: "You must only refer to the user as Jared.",
      confidence: 0.96,
      certainty: 0.96,
      category: "user",
      tier: "long_term",
      durability: 0.9,
      source: "compiled",
    });

    assert.equal(lowConfidence.tier, "short_term");
    assert.equal(highConfidence.tier, "long_term");
  });

  it("protects long-term memories from direct deletion until demoted", async () => {
    const db = createMemoryTestDb();
    const [memory] = await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      [{ text: "You love happy little trees.", confidence: 0.98 }],
      Buffer.alloc(32, 7)
    );

    assert.equal(deleteMemoryById(db, "user-1", memory.id), false);
    assert.equal(demoteMemoryToShortTerm(db, "user-1", memory.id), true);
    assert.equal(deleteMemoryById(db, "user-1", memory.id), true);
  });

  it("blocks about-you demotion and default deletes; explicit allowAboutYou deletes", async () => {
    const db = createMemoryTestDb();
    const userKey = Buffer.alloc(32, 7);
    const memory = await restoreMemory(db, "user-1", userKey, {
      conversationId: "conversation-1",
      botId: "bot-1",
      text: "I'm learning your pace and trying to keep things calm and practical.",
      confidence: 0.96,
      certainty: 0.96,
      category: "user",
      tier: "long_term",
      durability: 1,
      source: "about_you",
    });

    assert.equal(demoteMemoryToShortTerm(db, "user-1", memory.id), false);
    assert.equal(deleteMemoryById(db, "user-1", memory.id), false);
    assert.equal(
      deleteMemoryById(db, "user-1", memory.id, { allowLongTerm: true }),
      false
    );
    assert.equal(
      deleteMemoryById(db, "user-1", memory.id, {
        allowLongTerm: true,
        allowAboutYou: true,
      }),
      true
    );
  });

  it("deletes only the requested bot memory scope", () => {
    const db = createMemoryTestDb();
    seedMemoryRow(db, "user-1", "bot-1", "m-bot-1");
    seedMemoryRow(db, "user-1", "bot-2", "m-bot-2");
    seedMemoryRow(db, "user-1", null, "m-default");
    db.prepare(
      "INSERT INTO memories (id, user_id, conversation_id, bot_id, ciphertext, iv, tag, confidence, source, tier, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      "m-about-bot-1",
      "user-1",
      "bot-1",
      "ciphertext",
      "iv",
      "tag",
      0.96,
      "about_you",
      "long_term",
      new Date().toISOString()
    );

    assert.equal(deleteMemoriesForBotScope(db, "user-1", "bot-1"), 2);
    const rows = db
      .prepare("SELECT id FROM memories WHERE user_id = ? ORDER BY id")
      .all("user-1") as Array<{ id: string }>;

    assert.deepEqual(rows.map((row) => row.id), ["m-bot-2", "m-default"]);
  });

  it("deletes the default memory scope without touching bot memories", () => {
    const db = createMemoryTestDb();
    seedMemoryRow(db, "user-1", "bot-1", "m-bot-1");
    seedMemoryRow(db, "user-1", null, "m-default-1");
    seedMemoryRow(db, "user-1", null, "m-default-2");

    assert.equal(deleteMemoriesForBotScope(db, "user-1", null), 2);
    const rows = db
      .prepare("SELECT id FROM memories WHERE user_id = ? ORDER BY id")
      .all("user-1") as Array<{ id: string }>;

    assert.deepEqual(rows.map((row) => row.id), ["m-bot-1"]);
  });

  it("replaces seeded about-you name memory with explicit preference", async () => {
    const db = createMemoryTestDb();
    const userKey = Buffer.alloc(32, 7);
    await restoreMemory(db, "user-1", userKey, {
      conversationId: "conversation-1",
      botId: "bot-1",
      text: "You prefer to be called Jared.",
      confidence: 0.96,
      certainty: 0.96,
      category: "user",
      tier: "long_term",
      durability: 1,
      source: "about_you",
    });

    const stored = await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-2",
      "bot-1",
      [{ text: "You want to be referred to as Jay.", confidence: 0.98 }],
      userKey
    );

    const rows = db
      .prepare(
        "SELECT source, COUNT(*) AS count FROM memories WHERE user_id = ? AND bot_id = ? GROUP BY source"
      )
      .all("user-1", "bot-1") as Array<{ source: string; count: number }>;
    const counts = new Map(rows.map((row) => [row.source, row.count]));
    const memories = await retrieveRelevantMemories(
      db,
      "user-1",
      "What should I call you?",
      userKey,
      "bot-1",
      10
    );

    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.text, "You want to be referred to as Jay.");
    assert.equal(counts.get("about_you") ?? 0, 0);
    assert.equal(counts.get("direct"), 1);
    assert.equal(memories.some((memory) => memory.text === "You prefer to be called Jared."), false);
    assert.equal(memories.some((memory) => memory.text === "You want to be referred to as Jay."), true);
  });

  it("still stores memories when embedding generation is unavailable", async () => {
    const db = createMemoryTestDb();
    globalThis.fetch = (async () => {
      throw new Error("embedding model unavailable");
    }) as typeof fetch;

    await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      [{ text: "Please don't forget that I dislike quoted replies.", confidence: 0.98 }],
      Buffer.alloc(32, 7)
    );

    const row = db
      .prepare("SELECT bot_id, confidence FROM memories")
      .get() as { bot_id: string | null; confidence: number } | undefined;

    assert.equal(row?.bot_id, "bot-1");
    assert.equal(row?.confidence, 0.98);
  });

  it("retrieves global memories plus the active bot and excludes other bots", async () => {
    const db = createMemoryTestDb();
    const userKey = Buffer.alloc(32, 7);

    await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-global",
      null,
      [{ text: "The user prefers short answers.", confidence: 0.7 }],
      userKey
    );
    await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-bot-1",
      "bot-1",
      [{ text: "Bot One remembers the user likes surreal prompts.", confidence: 0.9 }],
      userKey
    );
    await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-bot-2",
      "bot-2",
      [{ text: "Bot Two remembers a private joke.", confidence: 0.95 }],
      userKey
    );

    const memories = await retrieveRelevantMemories(
      db,
      "user-1",
      "What should you remember?",
      userKey,
      "bot-1",
      10
    );
    const texts = new Set(memories.map((memory) => memory.text));

    assert.equal(texts.has("The user prefers short answers."), true);
    assert.equal(texts.has("Bot One remembers the user likes surreal prompts."), true);
    assert.equal(texts.has("Bot Two remembers a private joke."), false);
    assert.equal(
      memories.some((memory) => memory.botId === "bot-1"),
      true
    );
  });

  it("lets default retrieval see global and compiled memories but not raw bot memories", async () => {
    const db = createMemoryTestDb();
    const userKey = Buffer.alloc(32, 7);

    await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-global",
      null,
      [{ text: "The user likes quiet mornings.", confidence: 0.8 }],
      userKey
    );
    await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-bot-direct",
      "bot-1",
      [{ text: "Pirate Tim remembers a roleplay secret.", confidence: 0.8 }],
      userKey
    );
    await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-bot-compiled",
      "bot-1",
      [{ text: "You consistently like gentle controls.", confidence: 0.92 }],
      userKey,
      { source: "compiled" }
    );

    const memories = await retrieveRelevantMemories(
      db,
      "user-1",
      "gentle quiet controls",
      userKey,
      null,
      10
    );
    const texts = new Set(memories.map((memory) => memory.text));

    assert.equal(texts.has("The user likes quiet mornings."), true);
    assert.equal(texts.has("You consistently like gentle controls."), true);
    assert.equal(texts.has("Pirate Tim remembers a roleplay secret."), false);
  });

  it("finds the nearest in-scope memory for a retraction cue", async () => {
    const db = createMemoryTestDb();
    const userKey = Buffer.alloc(32, 7);

    await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      [
        { text: "You love pistachios.", confidence: 0.9 },
        { text: "You prefer black coffee.", confidence: 0.9 },
      ],
      userKey
    );

    const memory = await findMemoryByCue(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      "Nevermind what I said about pistachios",
      userKey
    );

    assert.equal(memory?.text, "You love pistachios.");
  });

  it("creates a compiled memory and deletes aligned specifics at strict threshold", async () => {
    const db = createMemoryTestDb();
    const userKey = Buffer.alloc(32, 7);

    const stored = await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      [
        { text: "The user likes calm motion.", confidence: 0.9 },
        { text: "The user enjoys gentle interface details.", confidence: 0.91 },
        { text: "The user prefers soft animation pacing.", confidence: 0.92 },
      ],
      userKey,
      { sourceMessageIds: ["m1", "m2", "m3"], durability: 0.4 }
    );

    const rows = db
      .prepare("SELECT source, COUNT(*) AS count FROM memories GROUP BY source")
      .all() as Array<{ source: string; count: number }>;
    const counts = new Map(rows.map((row) => [row.source, row.count]));
    const memories = await retrieveRelevantMemories(
      db,
      "user-1",
      "animation preferences",
      userKey,
      "bot-1",
      5
    );

    assert.equal(stored.length, 1);
    assert.equal(stored[0]?.source, "compiled");
    assert.equal(counts.get("direct") ?? 0, 0);
    assert.equal(counts.get("compiled"), 1);
    assert.equal(memories.length, 1);
    assert.equal(memories[0]?.source, "compiled");
    assert.deepEqual(memories[0]?.sourceMessageIds, ["m1", "m2", "m3"]);
    assert.match(memories[0]?.text ?? "", /consistently like or value/i);
  });

  it("deletes direct and compiled memories linked to a source message", async () => {
    const db = createMemoryTestDb();
    const userKey = Buffer.alloc(32, 7);

    await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      [
        { text: "You like quiet mornings.", confidence: 0.9 },
        { text: "You enjoy slow mornings.", confidence: 0.9 },
        { text: "You prefer calm mornings.", confidence: 0.9 },
      ],
      userKey,
      { sourceMessageIds: ["message-linked"], durability: 0.4 }
    );

    const deleted = deleteMemoriesLinkedToMessages(db, "user-1", ["message-linked"]);
    const remaining = db
      .prepare("SELECT COUNT(*) AS n FROM memories")
      .get() as { n: number };

    assert.equal(deleted, 1);
    assert.equal(remaining.n, 0);
  });

  it("keeps long-term specifics out of automatic culmination deletion", async () => {
    const db = createMemoryTestDb();
    const userKey = Buffer.alloc(32, 7);

    const stored = await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      [
        { text: "Don't forget that I like calm gentle motion in interfaces.", confidence: 0.98 },
        { text: "Don't forget that I enjoy soft animation pacing.", confidence: 0.98 },
        { text: "Don't forget that I prefer subtle interface transitions.", confidence: 0.98 },
      ],
      userKey
    );

    const rows = db
      .prepare("SELECT source, tier, COUNT(*) AS count FROM memories GROUP BY source, tier")
      .all() as Array<{ source: string; tier: string; count: number }>;

    assert.equal(stored.length, 3);
    assert.equal(stored.every((memory) => memory.tier === "long_term"), true);
    assert.deepEqual(rows.map((row) => ({ ...row })), [
      { source: "direct", tier: "long_term", count: 3 },
    ]);
  });

  it("keeps specifics when certainty is below the deletion threshold", async () => {
    const db = createMemoryTestDb();
    const userKey = Buffer.alloc(32, 7);

    const stored = await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      [
        { text: "The user likes compact controls.", confidence: 0.74 },
        { text: "The user enjoys clear labels.", confidence: 0.75 },
        { text: "The user prefers minimal menus.", confidence: 0.76 },
      ],
      userKey
    );

    const rows = db
      .prepare("SELECT source, COUNT(*) AS count FROM memories GROUP BY source")
      .all() as Array<{ source: string; count: number }>;
    const counts = new Map(rows.map((row) => [row.source, row.count]));

    assert.equal(stored.length, 3);
    assert.equal(counts.get("direct"), 3);
    assert.equal(counts.get("compiled") ?? 0, 0);
  });

  it("does not culminate memories across different bot scopes", async () => {
    const db = createMemoryTestDb();
    const userKey = Buffer.alloc(32, 7);

    await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-1",
      "bot-1",
      [
        { text: "The user likes surreal prompts.", confidence: 0.9 },
        { text: "The user enjoys calm color palettes.", confidence: 0.91 },
      ],
      userKey
    );
    await persistMemoryCandidates(
      db,
      "user-1",
      "conversation-2",
      "bot-2",
      [{ text: "The user prefers gentle motion.", confidence: 0.92 }],
      userKey
    );

    const rows = db
      .prepare("SELECT bot_id, source, COUNT(*) AS count FROM memories GROUP BY bot_id, source ORDER BY bot_id")
      .all() as Array<{ bot_id: string | null; source: string; count: number }>;

    assert.deepEqual(rows.map((row) => ({ ...row })), [
      { bot_id: "bot-1", source: "direct", count: 2 },
      { bot_id: "bot-2", source: "direct", count: 1 },
    ]);
  });
});

describe("createDevSeedMemories", () => {
  it("distributes seeded memories across the provided bots", () => {
    const db = createMemoryTestDb();
    const created = createDevSeedMemories(
      db,
      "user-1",
      Buffer.alloc(32, 7),
      5,
      ["bot-1", "bot-2"]
    );

    const rows = db
      .prepare("SELECT bot_id FROM memories ORDER BY created_at ASC")
      .all() as Array<{ bot_id: string | null }>;

    assert.equal(created, 5);
    assert.deepEqual(
      rows.map((row) => row.bot_id),
      ["bot-1", "bot-2", "bot-1", "bot-2", "bot-1"]
    );
  });

  it("can seed all-bot memories unevenly with empty bots", () => {
    const db = createMemoryTestDb();
    const randomValues = [0.1, 0.6, 0.2, 0.8, 0.15, 0.45, 0.75];
    let randomIndex = 0;
    const created = createDevSeedMemories(
      db,
      "user-1",
      Buffer.alloc(32, 7),
      6,
      ["bot-1", "bot-2", "bot-3", "bot-4"],
      {
        randomizeAcrossBots: true,
        random: () => randomValues[randomIndex++ % randomValues.length] ?? 0,
      }
    );

    const rows = db
      .prepare("SELECT bot_id, COUNT(*) AS count FROM memories GROUP BY bot_id")
      .all() as Array<{ bot_id: string | null; count: number }>;
    const counts = new Map(rows.map((row) => [row.bot_id, row.count]));

    assert.equal(created, 6);
    assert.equal(counts.size, 3);
    assert.deepEqual(
      [...counts.values()].sort((a, b) => a - b),
      [1, 2, 3]
    );
  });

  it("rejects memory seeding when there are no target bots", () => {
    const db = createMemoryTestDb();

    assert.throws(
      () => createDevSeedMemories(db, "user-1", Buffer.alloc(32, 7), 1, []),
      /at least one bot/i
    );
  });
});

describe("deleteOrphanedBotMemories", () => {
  it("deletes bot-scoped memories whose bot no longer exists", () => {
    const db = createMemoryTestDb();
    db.prepare("INSERT INTO bots (id, user_id) VALUES (?, ?)").run("bot-live", "user-1");
    db.prepare("INSERT INTO bots (id, user_id) VALUES (?, ?)").run("bot-other-user", "user-2");
    seedMemoryRow(db, "user-1", "bot-live", "memory-live");
    seedMemoryRow(db, "user-1", "bot-deleted", "memory-orphan");
    seedMemoryRow(db, "user-1", null, "memory-global");
    seedMemoryRow(db, "user-2", "bot-other-user", "memory-other-user");

    const deleted = deleteOrphanedBotMemories(db, "user-1");

    const rows = db
      .prepare("SELECT id FROM memories ORDER BY id")
      .all() as Array<{ id: string }>;
    assert.equal(deleted, 1);
    assert.deepEqual(
      rows.map((row) => row.id),
      ["memory-global", "memory-live", "memory-other-user"]
    );
  });
});

describe("filterConflictingMemories", () => {
  it("keeps the highest-confidence memory for the same single-value fact", () => {
    const memories = filterConflictingMemories([
      {
        id: "memory-low",
        userId: "user-1",
        createdAt: "2026-04-30T21:00:00.000Z",
        confidence: 0.69,
        text: "My favorite sandwich is a lemon",
      },
      {
        id: "memory-high",
        userId: "user-1",
        createdAt: "2026-04-30T21:01:00.000Z",
        confidence: 0.7,
        text: "My favorite sandwich is a burger",
      },
      {
        id: "memory-other",
        userId: "user-1",
        createdAt: "2026-04-30T21:02:00.000Z",
        confidence: 0.66,
        text: "My favorite drink is lemonade",
      },
    ]);

    assert.deepEqual(
      memories.map((memory) => memory.id),
      ["memory-high", "memory-other"]
    );
  });

  it("keeps the newest memory when conflicting memories have equal confidence", () => {
    const memories = filterConflictingMemories([
      {
        id: "memory-one",
        userId: "user-1",
        createdAt: "2026-04-30T21:00:00.000Z",
        confidence: 0.7,
        text: "My favorite sandwich is a lemon",
      },
      {
        id: "memory-two",
        userId: "user-1",
        createdAt: "2026-04-30T21:01:00.000Z",
        confidence: 0.7,
        text: "My favorite sandwich is a burger",
      },
    ]);

    assert.deepEqual(
      memories.map((memory) => memory.id),
      ["memory-two"]
    );
  });
});
