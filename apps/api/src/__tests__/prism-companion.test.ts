import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import {
  buildPrismCompanionAuthoritativeContext,
  chatWithPrismCompanion,
  parseCompanionUserNotesIntent,
  parsePrismCompanionModelOutput,
  prismCompanionDirectActionIntents,
  prismCompanionSystemPrompt,
  resolvePrismCompanionProvider,
} from "../prism-companion.ts";
import { defaultEphemeralChatProviderPreferences } from "@localai/shared";
import { ensureUserNotesSchema, listUserNotes } from "../user-notes.ts";

function fixture(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE bots (id TEXT PRIMARY KEY, user_id TEXT, name TEXT, visibility TEXT);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, conversation_mode TEXT, incognito INTEGER);
    CREATE TABLE botcast_shows (id TEXT PRIMARY KEY, user_id TEXT, name TEXT);
    CREATE TABLE botcast_episodes (id TEXT PRIMARY KEY, user_id TEXT, show_id TEXT, title TEXT, status TEXT);
    CREATE TABLE slate_projects (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, phase TEXT, manuscript TEXT);
    CREATE TABLE slate_sections (id TEXT PRIMARY KEY, user_id TEXT, project_id TEXT, title TEXT, prose TEXT);
    CREATE TABLE story_sessions (id TEXT PRIMARY KEY, user_id TEXT, title TEXT, status TEXT);
    CREATE TABLE images (id TEXT PRIMARY KEY, user_id TEXT, prompt TEXT);
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT,
      display_name TEXT,
      password_hash TEXT,
      password_salt TEXT,
      wrapped_user_key TEXT,
      wrapped_user_key_iv TEXT,
      wrapped_user_key_tag TEXT,
      created_at TEXT,
      last_active_at TEXT
    );
    INSERT INTO users VALUES ('u1', 'u1@example.test', 'Jared', 'h', 's', 'w', 'i', 't', 'now', 'now');
    INSERT INTO bots VALUES ('owned', 'u1', 'Lux', 'private');
    INSERT INTO bots VALUES ('public', 'u2', 'Umbra', 'public');
    INSERT INTO bots VALUES ('secret', 'u2', 'Secret', 'private');
    INSERT INTO conversations VALUES ('c1', 'u1', 'A quiet talk', 'zen', 1);
    INSERT INTO slate_projects VALUES ('p1', 'u1', 'The Glass Sea', 'draft', 'SECRET MANUSCRIPT');
    INSERT INTO slate_sections VALUES ('s1', 'u1', 'p1', 'Chapter One', 'SECRET PROSE');
    INSERT INTO story_sessions VALUES ('story-1', 'u1', 'Glass Archive', 'playing');
    INSERT INTO images VALUES ('image-1', 'u1', 'A pinecone under theatrical light');
  `);
  ensureUserNotesSchema(db);
  return db;
}

test("builds tenant-safe metadata context without source material", () => {
  const db = fixture();
  const context = buildPrismCompanionAuthoritativeContext(db, "u1", "Jared", {
    surfaceId: "slate",
    botIds: ["owned", "public", "secret"],
    conversationId: "c1",
    slateProjectId: "p1",
    slateSectionId: "s1",
  });
  assert.deepEqual(
    context.bots.map((bot) => bot.id),
    ["owned", "public"],
  );
  assert.equal(context.conversation?.incognito, true);
  assert.equal(context.slate?.sectionTitle, "Chapter One");
  const serialized = JSON.stringify(context);
  assert.doesNotMatch(serialized, /SECRET MANUSCRIPT|SECRET PROSE/u);
  assert.doesNotMatch(
    prismCompanionSystemPrompt(context),
    /SECRET MANUSCRIPT|SECRET PROSE/u,
  );
});

test("authorizes focused Story and Image metadata without exposing asset data", () => {
  const db = fixture();
  const story = buildPrismCompanionAuthoritativeContext(db, "u1", "Jared", {
    surfaceId: "story",
    storySessionId: "story-1",
  });
  assert.equal(story.story?.sessionTitle, "Glass Archive");
  assert.equal(story.story?.sessionStatus, "playing");
  const image = buildPrismCompanionAuthoritativeContext(db, "u1", "Jared", {
    surfaceId: "images",
    imageId: "image-1",
  });
  assert.equal(image.image?.promptExcerpt, "A pinecone under theatrical light");
  assert.doesNotMatch(JSON.stringify(image), /data:image|local_rel_path/u);
});

test("explains the current screen controls without needing pixels or DOM", () => {
  const db = fixture();
  const context = buildPrismCompanionAuthoritativeContext(db, "u1", "Jared", {
    surfaceId: "zen",
    botIds: ["owned"],
    conversationId: "c1",
  });
  const prompt = prismCompanionSystemPrompt(context);
  assert.match(
    prompt,
    /Screen: Lux Home, a one-to-one Zen conversation with Lux/u,
  );
  assert.match(prompt, /You are not Lux/u);
  assert.match(
    prompt,
    /floating "Ask Prism…" composer sends a private request to you/u,
  );
  assert.match(
    prompt,
    /"ACTION · What you do…" field is the player's optional physical or nonverbal stage direction for Lux/u,
  );
  assert.match(prompt, /not a command or request to Prism/u);
  assert.match(
    prompt,
    /"Say something…" field is what the player says directly to Lux/u,
  );
  assert.match(prompt, /not a screenshot or DOM capture/u);
});

test("grounds Debate setup help in a bounded unsaved draft and authorized cast", () => {
  const db = fixture();
  const context = buildPrismCompanionAuthoritativeContext(db, "u1", "Jared", {
    surfaceId: "debate",
    botIds: ["owned", "secret"],
    debateDraft: {
      studioPanel: "evidence",
      format: "turnabout",
      formality: "heated",
      playerRole: "judge",
      playerSideId: "for",
      juryEnabled: false,
      moderatorTitle: "The Forum",
      topic: "Museum ethics",
      motion: "Museums should return contested artifacts.",
      forLabel: "Return",
      forBrief: "Defend return.",
      againstLabel: "Retain",
      againstBrief: "Defend stewardship.",
      exhibitAdjective: "Dusty",
      exhibitObject: "ledger",
      exhibitObservation: "Several pages are visibly torn.",
      evidenceItemCount: 1,
    },
  });
  assert.deepEqual(
    context.bots.map((bot) => bot.name),
    ["Lux"],
  );
  const prompt = prismCompanionSystemPrompt(context);
  assert.match(prompt, /player is in the pre-proceeding Studio/u);
  assert.match(prompt, /unsaved, editable workbench draft/u);
  assert.match(prompt, /Draft motion: "Museums should return/u);
  assert.match(prompt, /Current object exhibit draft: "Dusty ledger"/u);
  assert.match(
    prompt,
    /without claiming any candidate was accepted, saved, or frozen/u,
  );
});

test("keeps ordinary requests answer-first instead of trapping them in the current surface", () => {
  const db = fixture();
  const prompt = prismCompanionSystemPrompt(
    buildPrismCompanionAuthoritativeContext(db, "u1", "Jared", {
      surfaceId: "zen",
      botIds: ["owned"],
      conversationId: "c1",
    }),
  );
  assert.match(prompt, /Answer the player's actual request first/u);
  assert.match(prompt, /general-knowledge questions/u);
  assert.match(prompt, /must not hijack or narrow an unrelated request/u);
  assert.match(prompt, /do not say you lack a related conversation/u);
  assert.match(prompt, /When you can answer directly, do so without ceremony/u);
  assert.match(prompt, /Do not imply live web access/u);
});

test("keeps full Prism and the orb one identity on Prism Home", () => {
  const db = fixture();
  const prompt = prismCompanionSystemPrompt(
    buildPrismCompanionAuthoritativeContext(db, "u1", "Jared", {
      surfaceId: "prism-home",
    }),
  );
  assert.match(
    prompt,
    /full-size Prism and the floating orb are one identity/u,
  );
  assert.match(prompt, /What you do….*active Zen conversation/u);
});

test("strips malformed and disallowed model actions", () => {
  assert.deepEqual(
    parsePrismCompanionModelOutput(
      'Let’s go.\n<PRISM_ACTIONS>[{"type":"navigate","destination":"slate"},{"type":"delete_bot","botId":"owned"}]</PRISM_ACTIONS>',
    ),
    {
      content: "Let’s go.",
      actions: [{ type: "navigate", destination: "slate" }],
    },
  );
});

test("recognizes explicit safe commands without executing them", () => {
  const db = fixture();
  const context = buildPrismCompanionAuthoritativeContext(db, "u1", "Jared", {
    surfaceId: "home",
    botIds: ["owned"],
  });
  assert.deepEqual(
    prismCompanionDirectActionIntents("Please open Slate now.", context),
    [{ type: "navigate", destination: "slate" }],
  );
  assert.deepEqual(
    prismCompanionDirectActionIntents("Export this bot.", context),
    [{ type: "export_bot", botId: "owned" }],
  );
  assert.deepEqual(
    prismCompanionDirectActionIntents("Delete this bot.", context),
    [],
  );
});

test("keeps every companion surface local when the account is in LOCAL mode", () => {
  const preferences = defaultEphemeralChatProviderPreferences();
  preferences.slate = "online";
  assert.equal(
    resolvePrismCompanionProvider({
      surfaceId: "slate",
      preferences,
      globalProvider: "local",
      onlineProvider: "openai",
    }),
    "local",
  );
});

test("authorizes export only for an owned bot and does not persist chat", async () => {
  const db = fixture();
  const prompts: unknown[] = [];
  const provider = {
    name: "local" as const,
    async generateResponse(messages: unknown): Promise<string> {
      prompts.push(messages);
      return 'Choose one. <PRISM_ACTIONS>[{"type":"export_bot","botId":"public"},{"type":"export_bot","botId":"owned"}]</PRISM_ACTIONS>';
    },
    async embedText(): Promise<number[]> {
      return [];
    },
  };
  const result = await chatWithPrismCompanion({
    db,
    userId: "u1",
    userKey: Buffer.alloc(32, 1),
    displayName: "Jared",
    surface: { surfaceId: "home", botIds: ["owned", "public"] },
    recoveryMessages: [],
    message: "Export one.",
    provider,
    providerName: "local",
    model: "local-model",
  });
  assert.deepEqual(result.actions, [{ type: "export_bot", botId: "owned" }]);
  assert.equal(prompts.length, 1);
  const persistenceTables = db
    .prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE name LIKE '%companion%'",
    )
    .get() as { count: number };
  assert.equal(persistenceTables.count, 0);
});

test("parses clear Ask Prism note shorthand without waiting on the model", () => {
  assert.deepEqual(parseCompanionUserNotesIntent("bug note: Slow startup performance"), {
    v: 1,
    name: "userNotes",
    action: "save",
    title: "Bug · Slow startup performance",
    body: "Slow startup performance",
  });
  assert.deepEqual(parseCompanionUserNotesIntent("note: buy oat milk"), {
    v: 1,
    name: "userNotes",
    action: "save",
    title: "buy oat milk",
    body: "buy oat milk",
  });
  assert.deepEqual(parseCompanionUserNotesIntent("list notes"), {
    v: 1,
    name: "userNotes",
    action: "list",
  });
  assert.equal(parseCompanionUserNotesIntent("what is a note?"), null);
});

test("saves a bug note from Ask Prism without calling the model", async () => {
  const db = fixture();
  const userKey = Buffer.alloc(32, 3);
  let called = 0;
  const provider = {
    name: "local" as const,
    async generateResponse(): Promise<string> {
      called += 1;
      return "Should not run.";
    },
    async embedText(): Promise<number[]> {
      return [];
    },
  };
  const result = await chatWithPrismCompanion({
    db,
    userId: "u1",
    userKey,
    displayName: "Jared",
    surface: { surfaceId: "home" },
    recoveryMessages: [],
    message: "bug note: Slow startup performance",
    provider,
    providerName: "local",
    model: "local-model",
  });
  assert.equal(called, 0);
  assert.equal(result.userNotes?.status, "saved");
  assert.equal(result.userNotes?.title, "Bug · Slow startup performance");
  assert.match(result.content, /Saved your note/u);
  const notes = listUserNotes(db, "u1", userKey);
  assert.equal(notes.length, 1);
  assert.equal(notes[0]?.body, "Slow startup performance");
});

test("blocks Ask Prism notes on Private (incognito) surfaces", async () => {
  const db = fixture();
  const result = await chatWithPrismCompanion({
    db,
    userId: "u1",
    userKey: Buffer.alloc(32, 3),
    displayName: "Jared",
    surface: { surfaceId: "zen", conversationId: "c1" },
    recoveryMessages: [],
    message: "bug note: secret thought",
    provider: {
      name: "local",
      async generateResponse(): Promise<string> {
        return "Should not run.";
      },
      async embedText(): Promise<number[]> {
        return [];
      },
    },
    providerName: "local",
    model: "local-model",
  });
  assert.equal(result.userNotes?.status, "error");
  assert.match(result.content, /Private/u);
  assert.equal(listUserNotes(db, "u1", Buffer.alloc(32, 3)).length, 0);
});

test("teaches userNotes in the companion system prompt", () => {
  const db = fixture();
  const context = buildPrismCompanionAuthoritativeContext(db, "u1", "Jared", {
    surfaceId: "home",
  });
  assert.match(prismCompanionSystemPrompt(context), /userNotes/u);
  assert.match(
    prismCompanionSystemPrompt(context),
    /personal notes via the optional userNotes/u,
  );
});
