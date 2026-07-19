import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { botPowerSourceHashV1 } from "@localai/shared";
import type { GenerateOptions, LlmProvider, ProviderMessage } from "../providers.ts";
import {
  chooseStorySessionChoice,
  createStorySession,
  deleteStorySession,
  generateStorySessionEpisode,
  getStorySessionDetail,
  listStorySessions,
  loadStoryBotProfiles,
  pickupStorySessionItem,
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
      powers_json TEXT NOT NULL DEFAULT '[]',
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
      {
        id: "atrium",
        name: "Atrium",
        description: "Start room.",
        x: 0.2,
        y: 0.5,
        discovered: true,
        backgroundAssetId: "background_reference_exterior",
        arrivalSceneId: "scene-1",
      },
      {
        id: "archive",
        name: "Archive",
        description: "A room of glass.",
        x: 0.5,
        y: 0.25,
        discovered: false,
        backgroundAssetId: "background_reference_interior",
        arrivalSceneId: "scene-5",
      },
      {
        id: "gate",
        name: "Gate",
        description: "The exit.",
        x: 0.8,
        y: 0.72,
        discovered: false,
        backgroundAssetId: "background_reference_liminal",
        arrivalSceneId: "scene-7",
      },
    ],
    items: [
      { id: "glass-key", name: "Glass Key", category: "key", description: "A clear key.", glyph: "◇" },
    ],
    scenes: [
      {
        id: "scene-1",
        title: "Atrium",
        locationId: "atrium",
        narration: "The projection wakes across the atrium, revealing a locked glass route and a low signal under the floor.",
        choices: [
          { id: "to-archive", label: "Enter the archive.", targetSceneId: "scene-2", revealLocationIds: ["archive"] },
          { id: "listen", label: "Listen first.", targetSceneId: "scene-3" },
        ],
      },
      {
        id: "scene-2",
        title: "Archive",
        locationId: "archive",
        narration: "Bert steps between the shelves and points to a clear key suspended inside a humming display case.",
        speakerBotId: "bot-b",
        spritePose: "speaking",
        itemIds: ["glass-key"],
        choices: [
          { id: "take-key", label: "Take the key.", targetSceneId: "scene-4", grantItemIds: ["glass-key"] },
          { id: "read", label: "Read the glass.", targetSceneId: "scene-5" },
        ],
      },
      {
        id: "scene-3",
        title: "Signal",
        locationId: "atrium",
        narration: "The signal sharpens into a line of light, then burns the archive symbol into the atrium floor.",
        choices: [
          { id: "follow", label: "Follow it.", targetSceneId: "scene-2", revealLocationIds: ["archive"] },
          { id: "ignore", label: "Ignore it.", targetSceneId: "scene-6" },
        ],
      },
      {
        id: "scene-4",
        title: "Key",
        locationId: "archive",
        narration: "The key sings in your hand, and every shelf in the archive turns toward the gate like a compass.",
        choices: [
          { id: "open", label: "Open the gate.", targetSceneId: "scene-8", revealLocationIds: ["gate"], requireItemIds: ["glass-key"] },
          { id: "pocket", label: "Pocket it.", targetSceneId: "scene-6" },
        ],
      },
      {
        id: "scene-5",
        title: "Marks",
        locationId: "archive",
        narration: "The wall marks rearrange into a route, showing that the gate will open only for a carried memory.",
        choices: [
          { id: "gate", label: "Go to the gate.", targetSceneId: "scene-7", revealLocationIds: ["gate"] },
          { id: "atrium", label: "Return.", targetSceneId: "scene-6" },
        ],
      },
      {
        id: "scene-6",
        title: "Return",
        locationId: "atrium",
        narration: "The atrium has changed behind you; the old entrance is gone, replaced by two reflected corridors.",
        choices: [
          { id: "again", label: "Try again.", targetSceneId: "scene-2", revealLocationIds: ["archive"] },
          { id: "gate-route", label: "Take the gate route.", targetSceneId: "scene-7", revealLocationIds: ["gate"] },
        ],
      },
      {
        id: "scene-7",
        title: "Before Gate",
        locationId: "gate",
        narration: "At the gate, the glass road hangs over a white rainstorm while the lock searches your pockets.",
        choices: [
          { id: "finish", label: "Step through.", targetSceneId: "scene-8" },
          { id: "return2", label: "Return once.", targetSceneId: "scene-6" },
        ],
      },
      {
        id: "scene-8",
        title: "Ending",
        locationId: "gate",
        narration: "White rain closes over the glass road, carrying the archive signal into the next quiet room.",
        ending: true,
        choices: [],
      },
    ],
  });
}

function compactEpisodeJson(): string {
  return JSON.stringify({
    title: "Signal Under Glass",
    summary: "A small projected mystery about a signal trapped under glass.",
    locations: [
      {
        name: "Lantern Walk",
        description: "A rain-bright passage where the first signal appears.",
      },
      {
        name: "Glass Market",
        description: "A covered market of silent stalls and mirrored signs.",
      },
      {
        name: "White Gate",
        description: "A pale threshold where the signal becomes a door.",
      },
    ],
    item: {
      name: "Prism Key",
      category: "key",
      description: "A small white key that hums when the signal gets close.",
      glyph: "◇",
    },
    scenes: [
      {
        title: "First Signal",
        locationIndex: 1,
        narration: "Rain lifts from the stones in straight lines, revealing a trapped signal under the lantern walk.",
        speakerBotId: null,
        speakerName: "",
        spritePose: "idle",
        visibleItem: false,
        ending: false,
        choices: [
          { label: "Follow the signal.", targetSceneNumber: 2, revealLocationNumber: 2, grantsItem: false, requiresItem: false },
          { label: "Inspect the stones.", targetSceneNumber: 3, revealLocationNumber: 2, grantsItem: false, requiresItem: false },
        ],
      },
      {
        title: "Market Whisper",
        locationIndex: 2,
        narration: "Ada hears her name from a shuttered stall, and the mirrored sign turns toward a locked white gate.",
        speakerBotId: "bot-a",
        speakerName: "Ada",
        spritePose: "speaking",
        visibleItem: false,
        ending: false,
        choices: [
          { label: "Answer the stall.", targetSceneNumber: 4, revealLocationNumber: null, grantsItem: false, requiresItem: false },
          { label: "Trace the sign.", targetSceneNumber: 5, revealLocationNumber: 3, grantsItem: false, requiresItem: false },
        ],
      },
      {
        title: "Key in the Chalk",
        locationIndex: 2,
        narration: "A chalk circle opens beside the market drain, exposing a white key wrapped in flickering static.",
        speakerBotId: null,
        speakerName: "",
        spritePose: "idle",
        visibleItem: true,
        ending: false,
        choices: [
          { label: "Take the key.", targetSceneNumber: 4, revealLocationNumber: null, grantsItem: true, requiresItem: false },
          { label: "Leave the circle open.", targetSceneNumber: 6, revealLocationNumber: 3, grantsItem: false, requiresItem: false },
        ],
      },
      {
        title: "Stall Opens",
        locationIndex: 2,
        narration: "The shutter folds upward by itself, showing a map scratched into the counter by someone escaping backward.",
        speakerBotId: null,
        speakerName: "",
        spritePose: "thinking",
        visibleItem: false,
        ending: false,
        choices: [
          { label: "Copy the route.", targetSceneNumber: 6, revealLocationNumber: 3, grantsItem: false, requiresItem: false },
          { label: "Test the counter.", targetSceneNumber: 5, revealLocationNumber: 3, grantsItem: false, requiresItem: false },
        ],
      },
      {
        title: "Gate Appears",
        locationIndex: 3,
        narration: "The white gate appears above the market roof, and every sign points to it with the wrong shadow.",
        speakerBotId: "bot-b",
        speakerName: "Bert",
        spritePose: "speaking",
        visibleItem: false,
        ending: false,
        choices: [
          { label: "Climb toward it.", targetSceneNumber: 6, revealLocationNumber: 3, grantsItem: false, requiresItem: false },
          { label: "Return to the key.", targetSceneNumber: 7, revealLocationNumber: 3, grantsItem: false, requiresItem: false },
        ],
      },
      {
        title: "Wrong Shadow",
        locationIndex: 3,
        narration: "The shadow detaches from the gate and blocks the route until the trapped signal rings from your pocket.",
        speakerBotId: null,
        speakerName: "",
        spritePose: "idle",
        visibleItem: false,
        ending: false,
        choices: [
          { label: "Raise the key.", targetSceneNumber: 7, revealLocationNumber: null, grantsItem: false, requiresItem: false },
          { label: "Study the shadow.", targetSceneNumber: 5, revealLocationNumber: null, grantsItem: false, requiresItem: false },
        ],
      },
      {
        title: "Open Signal",
        locationIndex: 3,
        narration: "The key turns without a lock, opening the signal into a narrow doorway full of quiet white rain.",
        speakerBotId: "bot-a",
        speakerName: "Ada",
        spritePose: "speaking",
        visibleItem: false,
        ending: false,
        choices: [
          { label: "Step through.", targetSceneNumber: 8, revealLocationNumber: null, grantsItem: false, requiresItem: false },
          { label: "Look back once.", targetSceneNumber: 6, revealLocationNumber: null, grantsItem: false, requiresItem: false },
        ],
      },
      {
        title: "After the Gate",
        locationIndex: 3,
        narration: "White rain closes the passage, leaving the signal free and the lantern walk visible from the other side.",
        speakerBotId: null,
        speakerName: "",
        spritePose: "idle",
        visibleItem: false,
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

class SequenceProvider implements LlmProvider {
  name: "local" = "local";
  public calls: Array<{ messages: ProviderMessage[]; options?: GenerateOptions }> = [];
  private readonly responses: string[];

  public constructor(responses: string[]) {
    this.responses = responses;
  }

  async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions
  ): Promise<string> {
    this.calls.push({ messages, options });
    return this.responses.shift() ?? episodeJson();
  }

  async embedText(): Promise<number[]> {
    return [0];
  }
}

describe("Story API helpers", () => {
  it("gives clone-family Story actors their asymmetric identity invariant", async () => {
    const db = createTestDb();
    seedBot(db, "bot-a", "Ada");
    seedBot(db, "bot-b", "Ada Copy");
    db.exec("ALTER TABLE bots ADD COLUMN clone_family_id TEXT;");
    db.prepare("UPDATE bots SET clone_family_id = ? WHERE id = ?").run(
      "bot-a",
      "bot-b",
    );
    const bots = loadStoryBotProfiles(db, "user-1", ["bot-a", "bot-b"]);
    const created = createStorySession(db, "user-1", {
      botIds: ["bot-a", "bot-b"],
      provider: "local",
      model: "test-model",
    });
    const provider = new SequenceProvider([episodeJson()]);
    await generateStorySessionEpisode(db, "user-1", created.id, {
      provider,
      providerName: "local",
      model: "test-model",
      bots,
    });
    const prompt = provider.calls[0]?.messages.map((message) => message.content).join("\n") ?? "";
    assert.match(prompt, /real, original "Ada Copy"/);
    assert.match(prompt, /"Ada" is your clone/);
  });

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

  it("bakes selected bot Powers into Story generation", async () => {
    const db = createTestDb();
    seedBot(db, "bot-a", "Ada");
    seedBot(db, "bot-b", "Bert");
    const name = "Echo Step";
    const intent = "Every arrival echoes twice.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'bot-a'").run(JSON.stringify([{
      version: 1,
      id: "echo-step",
      name,
      intent,
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(name, intent),
        selfCue: "Make every arrival echo twice.",
        observerCue: "Ada's arrivals echo twice for everyone nearby.",
        effects: [],
        ruleLabels: [],
      },
    }]));
    const bots = loadStoryBotProfiles(db, "user-1", ["bot-a", "bot-b"]);
    const created = createStorySession(db, "user-1", {
      botIds: ["bot-a", "bot-b"],
      provider: "local",
      model: "test-model",
    });
    const provider = new SequenceProvider([episodeJson()]);

    await generateStorySessionEpisode(db, "user-1", created.id, {
      provider,
      providerName: "local",
      model: "test-model",
      bots,
    });

    const prompt = provider.calls[0]?.messages.map((message) => message.content).join("\n") ?? "";
    assert.match(prompt, /Active Powers:/u);
    assert.match(prompt, /Echo Step: Make every arrival echo twice/u);
    assert.match(prompt, /Ada — Echo Step: Ada's arrivals echo twice/u);
  });

  it("adapts the strongest targeted candor Power into one response scene", async () => {
    const db = createTestDb();
    seedBot(db, "bot-a", "Ada");
    seedBot(db, "bot-b", "Bert");
    const name = "Open Door";
    const intent = "Ada's direct questions make other bots unusually candid.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'bot-a'").run(JSON.stringify([{
      version: 1,
      id: "open-door",
      name,
      intent,
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(name, intent),
        selfCue: "Ask with charismatic, trustworthy warmth.",
        observerCue: "Ada's direct questions feel safe to answer candidly.",
        effects: [
          { type: "candor", strength: "small", targets: [{ kind: "bot", name: "Bert" }] },
          { type: "candor", strength: "large", targets: [{ kind: "bot", name: "Bert" }] },
        ],
        ruleLabels: ["Draws out candid answers"],
      },
    }]));
    const bots = loadStoryBotProfiles(db, "user-1", ["bot-a", "bot-b"]);
    const created = createStorySession(db, "user-1", {
      botIds: ["bot-a", "bot-b"],
      provider: "local",
      model: "test-model",
    });
    const provider = new SequenceProvider([episodeJson()]);

    await generateStorySessionEpisode(db, "user-1", created.id, {
      provider,
      providerName: "local",
      model: "test-model",
      bots,
    });

    const prompt = provider.calls[0]?.messages.map((message) => message.content).join("\n") ?? "";
    assert.match(prompt, /Story adaptation for Ada → Bert/u);
    assert.match(prompt, /only to Bert's next response scene/u);
    assert.match(prompt, /Candor \(strong\): Ada asks directly/u);
    assert.match(prompt, /Never invent certainty/u);
    assert.doesNotMatch(prompt, /Story adaptation for Bert → Ada/u);
  });

  it("hard-mutes powered Story speakers while keeping the episode playable", async () => {
    const db = createTestDb();
    seedBot(db, "bot-a", "Ada");
    seedBot(db, "bot-b", "Bert");
    const name = "Muted";
    const intent = "Bert can never speak and only responds in ...";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'bot-b'").run(JSON.stringify([{
      version: 1,
      id: "mute",
      name,
      intent,
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(name, intent),
        selfCue: "Never speak.",
        observerCue: "Bert cannot speak.",
        effects: [{ type: "mute" }],
        ruleLabels: ["Muted"],
      },
    }]));
    const bots = loadStoryBotProfiles(db, "user-1", ["bot-a", "bot-b"]);
    const created = createStorySession(db, "user-1", {
      botIds: ["bot-a", "bot-b"],
      provider: "local",
      model: "test-model",
    });

    const generated = await generateStorySessionEpisode(db, "user-1", created.id, {
      provider: new SequenceProvider([episodeJson()]),
      providerName: "local",
      model: "test-model",
      bots,
    });
    const mutedScene = generated.episode?.scenes.find(
      (scene) => scene.speakerBotId === "bot-b",
    );

    assert.equal(generated.status, "playing");
    assert.equal(mutedScene?.narration, "...");
    assert.equal(mutedScene?.spritePose, "idle");
  });

  it("hard-echoes the prior visible Story scene for powered speakers", async () => {
    const db = createTestDb();
    seedBot(db, "bot-a", "Ada");
    seedBot(db, "bot-b", "Bert");
    const name = "Echo";
    const intent = "Echo whatever is addressed to this bot and say nothing else.";
    db.prepare("UPDATE bots SET powers_json = ? WHERE id = 'bot-b'").run(JSON.stringify([{
      version: 1,
      id: "echo",
      name,
      intent,
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(name, intent),
        selfCue: "Repeat addressed speech exactly.",
        observerCue: "The sender may react with confusion.",
        effects: [{ type: "echo_addressed" }],
        ruleLabels: ["Echoes addressed speech"],
      },
    }]));
    const bots = loadStoryBotProfiles(db, "user-1", ["bot-a", "bot-b"]);
    const created = createStorySession(db, "user-1", {
      botIds: ["bot-a", "bot-b"],
      provider: "local",
      model: "test-model",
    });

    const generated = await generateStorySessionEpisode(db, "user-1", created.id, {
      provider: new SequenceProvider([episodeJson()]),
      providerName: "local",
      model: "test-model",
      bots,
    });
    const scenes = generated.episode?.scenes ?? [];
    const echoSceneIndex = scenes.findIndex((scene) => scene.speakerBotId === "bot-b");

    assert.ok(echoSceneIndex > 0);
    assert.equal(
      scenes[echoSceneIndex]?.narration,
      scenes[echoSceneIndex - 1]?.narration,
    );
    assert.equal(scenes[echoSceneIndex]?.spritePose, "speaking");
  });

  it("compiles llama3.2 compact Story outlines into playable manifests", async () => {
    const db = createTestDb();
    seedBot(db, "bot-a", "Ada");
    seedBot(db, "bot-b", "Bert");
    const bots = loadStoryBotProfiles(db, "user-1", ["bot-a", "bot-b"]);
    const created = createStorySession(db, "user-1", {
      botIds: ["bot-a", "bot-b"],
      provider: "local",
      model: "llama3.2",
    });
    const provider = new SequenceProvider([compactEpisodeJson()]);

    const generated = await generateStorySessionEpisode(db, "user-1", created.id, {
      provider,
      providerName: "local",
      model: "llama3.2",
      bots,
    });

    assert.equal(generated.status, "playing");
    assert.equal(generated.title, "Signal Under Glass");
    assert.equal(generated.episode?.scenes.length, 8);
    assert.equal(generated.episode?.locations.length, 3);
    assert.equal(generated.episode?.items[0]?.name, "Prism Key");
    assert.equal(generated.episode?.scenes[2]?.itemIds?.[0], "item-1");
    assert.equal(provider.calls[0]?.options?.jsonSchemaName, "prism_story_outline");
    assert.match(provider.calls[0]?.messages.at(-1)?.content ?? "", /compact PRISM Story Mode outline/i);
  });

  it("repairs invalid JSON output before failing the generated episode", async () => {
    const db = createTestDb();
    seedBot(db, "bot-a", "Ada");
    seedBot(db, "bot-b", "Bert");
    const bots = loadStoryBotProfiles(db, "user-1", ["bot-a", "bot-b"]);
    const created = createStorySession(db, "user-1", {
      botIds: ["bot-a", "bot-b"],
      provider: "local",
      model: "llama3.2",
    });
    const provider = new SequenceProvider([
      '{ id: "episode-test", title: "Broken object keys" }',
      episodeJson(),
    ]);

    const generated = await generateStorySessionEpisode(db, "user-1", created.id, {
      provider,
      providerName: "local",
      model: "llama3.2",
      bots,
    });

    assert.equal(generated.status, "playing");
    assert.equal(generated.title, "Glass Archive");
    assert.equal(provider.calls.length, 2);
    assert.equal(provider.calls[0]?.options?.jsonMode, true);
    assert.equal(provider.calls[1]?.options?.jsonMode, true);
    assert.match(
      provider.calls[1]?.messages.at(-1)?.content ?? "",
      /previous Story Mode outline could not be parsed/i
    );
  });

  it("accepts common wrapped Story manifest output", async () => {
    const db = createTestDb();
    seedBot(db, "bot-a", "Ada");
    seedBot(db, "bot-b", "Bert");
    const bots = loadStoryBotProfiles(db, "user-1", ["bot-a", "bot-b"]);
    const created = createStorySession(db, "user-1", {
      botIds: ["bot-a", "bot-b"],
      provider: "local",
      model: "gpt-oss:latest",
    });
    const provider = new SequenceProvider([
      JSON.stringify({ story: JSON.parse(episodeJson()) }),
    ]);

    const generated = await generateStorySessionEpisode(db, "user-1", created.id, {
      provider,
      providerName: "local",
      model: "gpt-oss:latest",
      bots,
    });

    assert.equal(generated.status, "playing");
    assert.equal(generated.title, "Glass Archive");
    assert.equal(provider.calls.length, 1);
  });

  it("accepts a valid Story manifest after extra JSON scratch output", async () => {
    const db = createTestDb();
    seedBot(db, "bot-a", "Ada");
    seedBot(db, "bot-b", "Bert");
    const bots = loadStoryBotProfiles(db, "user-1", ["bot-a", "bot-b"]);
    const created = createStorySession(db, "user-1", {
      botIds: ["bot-a", "bot-b"],
      provider: "local",
      model: "gpt-oss:latest",
    });
    const provider = new SequenceProvider([
      `{"note":"scratch"}\n${episodeJson()}`,
    ]);

    const generated = await generateStorySessionEpisode(db, "user-1", created.id, {
      provider,
      providerName: "local",
      model: "gpt-oss:latest",
      bots,
    });

    assert.equal(generated.status, "playing");
    assert.equal(generated.title, "Glass Archive");
    assert.equal(provider.calls.length, 1);
  });

  it("redistributes unusable generated map coordinates", async () => {
    const db = createTestDb();
    seedBot(db, "bot-a", "Ada");
    seedBot(db, "bot-b", "Bert");
    const bots = loadStoryBotProfiles(db, "user-1", ["bot-a", "bot-b"]);
    const created = createStorySession(db, "user-1", {
      botIds: ["bot-a", "bot-b"],
      provider: "local",
      model: "llama3.2",
    });
    const flatMapEpisode = JSON.parse(episodeJson()) as {
      locations: Array<{ x: number; y: number }>;
      items: Array<{ category: string }>;
    };
    flatMapEpisode.locations = flatMapEpisode.locations.map((location) => ({
      ...location,
      x: 0,
      y: 0,
    }));
    flatMapEpisode.items = flatMapEpisode.items.map((item) => ({ ...item, category: "Key" }));

    const generated = await generateStorySessionEpisode(db, "user-1", created.id, {
      provider: new SequenceProvider([JSON.stringify(flatMapEpisode)]),
      providerName: "local",
      model: "llama3.2",
      bots,
    });

    assert.equal(generated.status, "playing");
    const coordinates = generated.episode?.locations.map((location) => `${location.x}:${location.y}`);
    assert.equal(new Set(coordinates).size, 3);
    assert.ok(generated.episode?.locations.every((location) => location.x > 0 && location.y > 0));
    assert.equal(generated.episode?.items[0]?.category, "key");
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

    const afterPickup = pickupStorySessionItem(db, "user-1", created.id, "glass-key");
    assert.equal(afterPickup.progress?.currentSceneId, "scene-2");
    assert.deepEqual(afterPickup.progress?.inventoryItemIds, ["glass-key"]);

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
