import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import type { LlmProvider } from "../providers.ts";
import {
  chooseStorySessionChoice,
  createStorySession,
  deleteStorySession,
  generateStorySessionEpisode,
  getStorySessionDetail,
  listStorySessions,
  loadStoryBotProfiles,
  travelStorySession,
} from "../story.ts";

function createTestDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE story_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      theme_id TEXT NOT NULL DEFAULT 'prism_default',
      status TEXT NOT NULL DEFAULT 'generating',
      provider TEXT NOT NULL DEFAULT 'local',
      model TEXT,
      bot_ids TEXT NOT NULL DEFAULT '[]',
      premise TEXT,
      episode_json TEXT,
      progress_json TEXT,
      transcript_json TEXT NOT NULL DEFAULT '[]',
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE bots (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      system_prompt TEXT NOT NULL DEFAULT '',
      model TEXT,
      local_model TEXT,
      online_model TEXT,
      temperature REAL DEFAULT 0.7,
      max_tokens INTEGER DEFAULT 2048,
      color TEXT,
      glyph TEXT,
      chat_enabled INTEGER NOT NULL DEFAULT 1,
      online_enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL
    );
    CREATE TABLE images (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      prompt TEXT NOT NULL,
      url TEXT NOT NULL
    );
  `);
  return db;
}

function seedBot(db: DatabaseSync, id: string, name = id): void {
  db.prepare(
    `INSERT INTO bots
       (id, user_id, name, system_prompt, color, glyph, chat_enabled, online_enabled, created_at, updated_at)
     VALUES (?, 'user-1', ?, ?, '#7c6cff', 'spark', 1, 1, '2026-05-26T00:00:00.000Z', '2026-05-26T00:00:00.000Z')`
  ).run(id, name, `${name} is a test actor.`);
}

function episodeJson(): string {
  return JSON.stringify({
    id: "episode-test",
    title: "Glass Archive",
    summary: "A short Story Mode episode.",
    themeId: "prism_default",
    startSceneId: "scene-1",
    locations: [
      { id: "atrium", name: "Atrium", description: "Start room.", x: 0.2, y: 0.5, discovered: true },
      { id: "archive", name: "Archive", description: "A room of glass.", x: 0.5, y: 0.25, discovered: false },
      { id: "gate", name: "Gate", description: "The exit.", x: 0.8, y: 0.72, discovered: false },
    ],
    items: [
      { id: "glass-key", name: "Glass Key", category: "key", description: "A clear key.", glyph: "◇" },
    ],
    scenes: [
      {
        id: "scene-1",
        title: "Atrium",
        locationId: "atrium",
        narration: "The projection wakes.",
        speakerBotId: "bot-a",
        spritePose: "idle",
        choices: [
          { id: "to-archive", label: "Enter the archive.", targetSceneId: "scene-2", revealLocationIds: ["archive"] },
          { id: "listen", label: "Listen first.", targetSceneId: "scene-3" },
        ],
      },
      {
        id: "scene-2",
        title: "Archive",
        locationId: "archive",
        narration: "The shelves glow.",
        speakerBotId: "bot-b",
        spritePose: "speaking",
        choices: [
          { id: "take-key", label: "Take the key.", targetSceneId: "scene-4", grantItemIds: ["glass-key"] },
          { id: "read", label: "Read the glass.", targetSceneId: "scene-5" },
        ],
      },
      {
        id: "scene-3",
        title: "Signal",
        locationId: "atrium",
        narration: "A signal points onward.",
        choices: [
          { id: "follow", label: "Follow it.", targetSceneId: "scene-2", revealLocationIds: ["archive"] },
          { id: "ignore", label: "Ignore it.", targetSceneId: "scene-6" },
        ],
      },
      {
        id: "scene-4",
        title: "Key",
        locationId: "archive",
        narration: "The key sings.",
        choices: [
          { id: "open", label: "Open the gate.", targetSceneId: "scene-8", revealLocationIds: ["gate"], requireItemIds: ["glass-key"] },
          { id: "pocket", label: "Pocket it.", targetSceneId: "scene-6" },
        ],
      },
      {
        id: "scene-5",
        title: "Marks",
        locationId: "archive",
        narration: "Marks reveal the gate.",
        choices: [
          { id: "gate", label: "Go to the gate.", targetSceneId: "scene-7", revealLocationIds: ["gate"] },
          { id: "atrium", label: "Return.", targetSceneId: "scene-6" },
        ],
      },
      {
        id: "scene-6",
        title: "Return",
        locationId: "atrium",
        narration: "The atrium has changed.",
        choices: [
          { id: "again", label: "Try again.", targetSceneId: "scene-2", revealLocationIds: ["archive"] },
          { id: "gate-route", label: "Take the gate route.", targetSceneId: "scene-7", revealLocationIds: ["gate"] },
        ],
      },
      {
        id: "scene-7",
        title: "Before Gate",
        locationId: "gate",
        narration: "The gate is almost open.",
        choices: [
          { id: "finish", label: "Step through.", targetSceneId: "scene-8" },
          { id: "return2", label: "Return once.", targetSceneId: "scene-6" },
        ],
      },
      {
        id: "scene-8",
        title: "Ending",
        locationId: "gate",
        narration: "White rain closes the story.",
        ending: true,
        choices: [],
      },
    ],
  });
}

class FakeProvider implements LlmProvider {
  name: "local" = "local";

  async generateResponse(): Promise<string> {
    return episodeJson();
  }

  async embedText(): Promise<number[]> {
    return [0];
  }
}

describe("Story API helpers", () => {
  it("creates a generating session and promotes it after episode generation", async () => {
    const db = createTestDb();
    seedBot(db, "bot-a", "Ada");
    seedBot(db, "bot-b", "Bert");
    const bots = loadStoryBotProfiles(db, "user-1", ["bot-a", "bot-b"]);
    const created = createStorySession(db, "user-1", {
      botIds: ["bot-a", "bot-b"],
      premise: "A test premise",
      provider: "local",
      model: "test-model",
    });
    assert.equal(created.status, "generating");
    assert.equal(created.episode, null);

    const generated = await generateStorySessionEpisode(db, "user-1", created.id, {
      provider: new FakeProvider(),
      providerName: "local",
      model: "test-model",
      bots,
      premise: "A test premise",
    });
    assert.equal(generated.status, "playing");
    assert.equal(generated.title, "Glass Archive");
    assert.equal(generated.progress?.currentSceneId, "scene-1");
    assert.equal(generated.transcript.length, 1);
    assert.equal(listStorySessions(db, "user-1").length, 1);
  });

  it("persists choice and travel progress for the scoped user", async () => {
    const db = createTestDb();
    seedBot(db, "bot-a", "Ada");
    seedBot(db, "bot-b", "Bert");
    const created = createStorySession(db, "user-1", {
      botIds: ["bot-a", "bot-b"],
      provider: "local",
      model: "test-model",
    });
    await generateStorySessionEpisode(db, "user-1", created.id, {
      provider: new FakeProvider(),
      providerName: "local",
      model: "test-model",
      bots: loadStoryBotProfiles(db, "user-1", ["bot-a", "bot-b"]),
    });

    const afterChoice = chooseStorySessionChoice(db, "user-1", created.id, "to-archive");
    assert.equal(afterChoice.progress?.currentSceneId, "scene-2");
    assert.ok(afterChoice.progress?.discoveredLocationIds.includes("archive"));

    const afterSecondChoice = chooseStorySessionChoice(db, "user-1", created.id, "take-key");
    assert.deepEqual(afterSecondChoice.progress?.inventoryItemIds, ["glass-key"]);

    const afterTravel = travelStorySession(db, "user-1", created.id, "archive");
    assert.equal(afterTravel.progress?.currentSceneId, "scene-5");
    assert.throws(
      () => getStorySessionDetail(db, "other-user", created.id),
      /not found/i
    );
  });

  it("deletes only story rows and leaves conversations and images intact", () => {
    const db = createTestDb();
    seedBot(db, "bot-a", "Ada");
    const created = createStorySession(db, "user-1", {
      botIds: ["bot-a"],
      provider: "local",
      model: "test-model",
    });
    db.prepare("INSERT INTO conversations (id, user_id, title) VALUES ('conv-1', 'user-1', 'Chat')").run();
    db.prepare(
      "INSERT INTO images (id, user_id, conversation_id, prompt, url) VALUES ('img-1', 'user-1', 'conv-1', 'prompt', 'url')"
    ).run();

    assert.equal(deleteStorySession(db, "user-1", created.id), true);
    assert.equal(listStorySessions(db, "user-1").length, 0);
    assert.ok(db.prepare("SELECT id FROM conversations WHERE id = 'conv-1'").get());
    assert.ok(db.prepare("SELECT id FROM images WHERE id = 'img-1'").get());
  });
});

