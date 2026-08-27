import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { applyBotPowerMumbledResponseV1 } from "@localai/shared";
import {
  normalizeSpeechIntentRevealRequestV1,
  registerEphemeralSpeechIntentRevealV1,
  resolveSpeechIntentRevealV1,
} from "../speech-intent-reveal.ts";

function revealDatabase(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, conversation_mode TEXT
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, user_id TEXT NOT NULL,
      role TEXT NOT NULL, content TEXT NOT NULL, bot_id TEXT, tool_payload TEXT
    );
    CREATE TABLE botcast_messages (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, episode_id TEXT NOT NULL,
      speaker_role TEXT NOT NULL, bot_id TEXT NOT NULL, content TEXT NOT NULL
    );
    CREATE TABLE botcast_events (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, episode_id TEXT NOT NULL,
      kind TEXT NOT NULL, payload_json TEXT NOT NULL
    );
    CREATE TABLE debate_events (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, session_id TEXT NOT NULL,
      event_json TEXT NOT NULL
    );
    CREATE TABLE story_sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, episode_json TEXT
    );
  `);
  return db;
}

const clean = "I trust the map, but we should verify the northern passage.";
const gibberish = applyBotPowerMumbledResponseV1(clean);

describe("private speech intent reveal", () => {
  it("reveals only an owned, marked Chat primary utterance", () => {
    const db = revealDatabase();
    db.prepare("INSERT INTO conversations VALUES (?, ?, ?)")
      .run("chat-1", "owner", "chat");
    db.prepare("INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      "message-1",
      "chat-1",
      "owner",
      "assistant",
      gibberish,
      "bot-1",
      JSON.stringify({
        botPowerExactResponse: "speech_obfuscation",
        botPowerIntendedSpeech: clean,
      }),
    );

    assert.deepEqual(
      resolveSpeechIntentRevealV1(db, "owner", {
        mode: "chat",
        scopeId: "chat-1",
        recordId: "message-1",
      }),
      { ok: true, intendedSpeech: clean },
    );
    assert.equal(
      resolveSpeechIntentRevealV1(db, "other-tenant", {
        mode: "chat",
        scopeId: "chat-1",
        recordId: "message-1",
      }),
      null,
    );
    assert.equal(
      resolveSpeechIntentRevealV1(db, "owner", {
        mode: "zen",
        scopeId: "chat-1",
        recordId: "message-1",
      }),
      null,
    );
    db.close();
  });

  it("refuses legacy, clear, player, and non-primary records without an oracle", () => {
    const db = revealDatabase();
    db.prepare("INSERT INTO conversations VALUES (?, ?, ?)")
      .run("chat-1", "owner", "chat");
    db.prepare("INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      "legacy",
      "chat-1",
      "owner",
      "assistant",
      gibberish,
      "bot-1",
      JSON.stringify({ botPowerIntendedSpeech: clean }),
    );
    db.prepare("INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      "clear",
      "chat-1",
      "owner",
      "assistant",
      clean,
      "bot-1",
      JSON.stringify({
        botPowerExactResponse: "speech_obfuscation",
        botPowerIntendedSpeech: "A different clean draft.",
      }),
    );
    db.prepare("INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      "player",
      "chat-1",
      "owner",
      "user",
      gibberish,
      "bot-1",
      JSON.stringify({
        botPowerExactResponse: "speech_obfuscation",
        botPowerIntendedSpeech: clean,
      }),
    );
    for (const recordId of ["legacy", "clear", "player", "missing"]) {
      assert.equal(
        resolveSpeechIntentRevealV1(db, "owner", {
          mode: "chat",
          scopeId: "chat-1",
          recordId,
        }),
        null,
      );
    }
    db.close();
  });

  it("refuses asides, direct quotes, interruptions, and mute-only material", () => {
    const db = revealDatabase();
    db.prepare("INSERT INTO conversations VALUES (?, ?, ?)")
      .run("coffee-1", "owner", "coffee");
    db.prepare("INSERT INTO messages VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      "aside", "coffee-1", "owner", "assistant", gibberish, "bot-1",
      JSON.stringify({
        botPowerExactResponse: "speech_obfuscation",
        botPowerIntendedSpeech: clean,
        coffeeAside: { kind: "listener" },
      }),
    );
    db.prepare("INSERT INTO botcast_messages VALUES (?, ?, ?, ?, ?, ?)").run(
      "quote", "owner", "episode-1", "host", "bot-1", gibberish,
    );
    db.prepare("INSERT INTO botcast_events VALUES (?, ?, ?, ?, ?)").run(
      "quote-event", "owner", "episode-1", "utterance",
      JSON.stringify({
        messageId: "quote", publicSpeechEffect: "speech_obfuscation",
        powerIntendedSpeech: clean, producerDirectQuote: true,
      }),
    );
    db.prepare("INSERT INTO debate_events VALUES (?, ?, ?, ?)").run(
      "fragment", "owner", "debate-1",
      JSON.stringify({
        kind: "speech", speakerKind: "advocate", speakerBotId: "bot-1",
        content: gibberish, powerIntendedContent: clean, interrupted: true,
      }),
    );
    db.prepare("INSERT INTO story_sessions VALUES (?, ?, ?)").run(
      "story-1", "owner", JSON.stringify({
        scenes: [{
          id: "mute", speakerBotId: "bot-1", narration: gibberish,
          speechIntentRevealAvailable: true, mutePerformance: { durationMs: 1 },
        }],
        privatePowerIntendedNarrationBySceneId: { mute: clean },
      }),
    );

    for (const request of [
      { mode: "coffee", scopeId: "coffee-1", recordId: "aside" },
      { mode: "signal", scopeId: "episode-1", recordId: "quote" },
      { mode: "debate", scopeId: "debate-1", recordId: "fragment" },
      { mode: "story", scopeId: "story-1", recordId: "mute" },
    ] as const) {
      assert.equal(resolveSpeechIntentRevealV1(db, "owner", request), null);
    }
    db.close();
  });

  it("validates adapted Signal, Debate, and Story private persistence", () => {
    const db = revealDatabase();
    db.prepare("INSERT INTO botcast_messages VALUES (?, ?, ?, ?, ?, ?)").run(
      "signal-line", "owner", "episode-1", "host", "bot-1", gibberish,
    );
    db.prepare("INSERT INTO botcast_events VALUES (?, ?, ?, ?, ?)").run(
      "signal-event", "owner", "episode-1", "utterance",
      JSON.stringify({
        messageId: "signal-line",
        publicSpeechEffect: "speech_obfuscation",
        powerIntendedSpeech: clean,
      }),
    );
    db.prepare("INSERT INTO debate_events VALUES (?, ?, ?, ?)").run(
      "debate-line", "owner", "debate-1",
      JSON.stringify({
        id: "debate-line", kind: "speech", speakerKind: "advocate",
        speakerBotId: "bot-1", content: gibberish, powerIntendedContent: clean,
      }),
    );
    db.prepare("INSERT INTO story_sessions VALUES (?, ?, ?)").run(
      "story-1", "owner",
      JSON.stringify({
        scenes: [{
          id: "scene-1", speakerBotId: "bot-1", narration: gibberish,
          speechIntentRevealAvailable: true,
        }],
        privatePowerIntendedNarrationBySceneId: { "scene-1": clean },
      }),
    );

    for (const request of [
      { mode: "signal", scopeId: "episode-1", recordId: "signal-line" },
      { mode: "debate", scopeId: "debate-1", recordId: "debate-line" },
      { mode: "story", scopeId: "story-1", recordId: "scene-1" },
    ] as const) {
      assert.deepEqual(resolveSpeechIntentRevealV1(db, "owner", request), {
        ok: true,
        intendedSpeech: clean,
      });
      assert.equal(resolveSpeechIntentRevealV1(db, "other", request), null);
    }
    db.close();
  });

  it("keeps private Chat transient intent server-side and validates requests", () => {
    const db = revealDatabase();
    const request = { mode: "zen", scopeId: "private-1", recordId: "line-1" } as const;
    assert.equal(registerEphemeralSpeechIntentRevealV1({
      userId: "owner", request, intendedSpeech: clean, publicSpeech: gibberish,
    }), true);
    assert.deepEqual(resolveSpeechIntentRevealV1(db, "owner", request), {
      ok: true,
      intendedSpeech: clean,
    });
    assert.equal(resolveSpeechIntentRevealV1(db, "other", request), null);
    assert.equal(normalizeSpeechIntentRevealRequestV1({
      mode: "slate", scopeId: "x", recordId: "y",
    }), null);
    db.close();
  });

  it("uses authenticated no-store routing and a uniform unavailable response", () => {
    const source = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    assert.match(source, /route\("POST", "\/api\/speech-intent\/reveal"/u);
    assert.match(source, /const userId = requireAuth\(ctx\)/u);
    assert.match(source, /cache-control", "private, no-store"/u);
    assert.match(source, /Speech meaning is unavailable\./u);
  });
});
