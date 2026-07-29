#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { DEBATE_SCHEMA_VERSION } from "@localai/shared";
import { parsePrismBotArchive } from "../apps/web/src/app/botArchive.ts";
import { initializeDatabase } from "../apps/api/src/db.ts";
import {
  advanceDebateSession,
  checkDebateAdvocacyRoles,
  createDebateSession,
  debateSessionForPlayer,
} from "../apps/api/src/debate.ts";
import {
  LocalOllamaProvider,
  OPENAI_DEFAULT_MODEL,
  OpenAiProvider,
} from "../apps/api/src/providers.ts";

function flagValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

const providerName = flagValue("--provider")?.trim().toLowerCase() || "local";
const model =
  flagValue("--model")?.trim() ||
  (providerName === "openai" ? OPENAI_DEFAULT_MODEL : "llama3.2:latest");
if (!["local", "openai"].includes(providerName)) {
  throw new Error("Use --provider local or --provider openai.");
}
if (providerName === "openai" && !process.env.OPENAI_API_KEY?.trim()) {
  throw new Error(
    "OPENAI_API_KEY is required through the runtime secrets wrapper.",
  );
}

const marketplaceDirectory = resolve(
  "apps/web/public/bot-marketplace/bots",
);
const archiveFiles = Object.freeze({
  moderator: "bot-ryuk.bot",
  for: "bot-spongebob-squarepants.bot",
  against: "bot-patrick-star.bot",
});
const snapshots = Object.fromEntries(
  Object.entries(archiveFiles).map(([role, file]) => [
    role,
    parsePrismBotArchive(
      readFileSync(resolve(marketplaceDirectory, file)),
    ).botJson,
  ]),
);

const generatedAt = "2026-07-29T12:00:00.000Z";
const userId = "debate-perception-live-user";
const botIds = Object.freeze({
  moderator: "debate-live-ryuk",
  for: "debate-live-spongebob",
  against: "debate-live-patrick",
});
const db = initializeDatabase(new DatabaseSync(":memory:"));
db.prepare(
  `INSERT INTO users
    (id, email, display_name, password_hash, password_salt, wrapped_user_key,
     wrapped_user_key_iv, wrapped_user_key_tag, preferred_provider,
     preferred_local_model, preferred_online_model, created_at, last_active_at)
   VALUES (?, ?, 'Debate validator', 'hash', 'salt', 'cipher', 'iv', 'tag', ?, ?, ?, ?, ?)`,
).run(
  userId,
  "debate-perception-live@example.com",
  providerName,
  providerName === "local" ? model : "llama3.2:latest",
  providerName === "openai" ? model : OPENAI_DEFAULT_MODEL,
  generatedAt,
  generatedAt,
);

function seedBot(role) {
  const archive = snapshots[role];
  const bot = archive.bot;
  db.prepare(
    `INSERT INTO bots
      (id, user_id, name, system_prompt, color, glyph, avatar_details_json,
       authored_audio_voice_profile, chat_enabled, online_enabled, local_model,
       online_model, model, powers_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?, ?, ?)`,
  ).run(
    botIds[role],
    userId,
    bot.name,
    archive.systemPrompt,
    bot.color ?? null,
    bot.glyph ?? null,
    bot.avatarDetails ? JSON.stringify(bot.avatarDetails) : null,
    bot.authoredAudioVoiceProfile
      ? JSON.stringify(bot.authoredAudioVoiceProfile)
      : null,
    bot.localModel ?? model,
    bot.onlineModel ?? model,
    model,
    JSON.stringify(bot.powers ?? []),
    generatedAt,
    generatedAt,
  );
}

seedBot("moderator");
seedBot("for");
seedBot("against");

const baseProvider =
  providerName === "openai"
    ? new OpenAiProvider({ apiKey: process.env.OPENAI_API_KEY.trim() })
    : new LocalOllamaProvider();
const captures = [];
const provider = {
  name: baseProvider.name,
  diagnosticModel: model,
  async generateResponse(messages, options) {
    captures.push(structuredClone(messages));
    return baseProvider.generateResponse(messages, { ...options, model });
  },
  async embedText(text, options) {
    return baseProvider.embedText(text, options);
  },
};
const lane = { provider, providerName: provider.name, model };
const runtime = {
  local: lane,
  online: lane,
  lanes: [lane],
  responseMode: providerName === "openai" ? "online" : "local",
  preferredProvider: provider.name,
};
const motion = {
  version: DEBATE_SCHEMA_VERSION,
  id: "jellyfishing-weekend",
  motion:
    "This house should make jellyfishing the official weekend activity of Bikini Bottom.",
  forSide: {
    label: "Official Jellyfishing",
    brief:
      "Defend jellyfishing as a joyful, communal weekend tradition worth celebrating.",
  },
  againstSide: {
    label: "Keep Weekends Open",
    brief:
      "Oppose one official activity and defend room for rest and different interests.",
  },
};

try {
  const advocacyConsent = await checkDebateAdvocacyRoles(
    db,
    userId,
    {
      motion,
      forAdvocateBotId: botIds.for,
      againstAdvocateBotId: botIds.against,
    },
    runtime,
  );
  assert.ok(
    advocacyConsent.every((check) => check.status !== "decline"),
    "A Marketplace advocate declined the synthetic validation motion.",
  );
  let session = createDebateSession(
    db,
    userId,
    {
      motion,
      evidence: {
        version: DEBATE_SCHEMA_VERSION,
        notes: "",
        sources: [],
        frozenAt: null,
      },
      moderatorBotId: botIds.moderator,
      forAdvocateBotId: botIds.for,
      againstAdvocateBotId: botIds.against,
      playerRole: "spectator",
      advocacyConsent,
      responseMode: runtime.responseMode,
      provider: provider.name,
      model,
      idempotencyKey: "debate-live-create-0001",
    },
    runtime,
  );
  session = await advanceDebateSession(
    db,
    userId,
    session.id,
    {
      expectedRevision: session.revision,
      idempotencyKey: "debate-live-intro-0001",
    },
    runtime,
  );
  const durableOpening = session.events.find(
    (event) => event.speakerBotId === botIds.moderator,
  );
  assert.equal(durableOpening?.speakerKind, "moderator");
  assert.notEqual(durableOpening?.content, "...");
  const liveSession = debateSessionForPlayer(session);
  const liveOpening = liveSession.events.find(
    (event) => event.id === durableOpening?.id,
  );
  assert.equal(liveOpening?.speakerKind, "system");
  assert.match(liveOpening?.content ?? "", /empty and silent/iu);
  assert.notEqual(liveOpening?.content, durableOpening?.content);
  const devilNames = advocacyConsent
    .filter((check) => check.status === "devils_advocate")
    .map((check) =>
      check.botId === botIds.for
        ? snapshots.for.bot.name
        : snapshots.against.bot.name,
    );
  if (devilNames.length > 0) {
    const publicDocket = liveSession.events.find(
      (event) =>
        event.speakerKind === "system" &&
        event.content.includes("Docket notice:"),
    );
    assert.ok(publicDocket);
    for (const name of devilNames) {
      assert.match(publicDocket.content, new RegExp(name, "u"));
    }
  }

  session = await advanceDebateSession(
    db,
    userId,
    session.id,
    {
      expectedRevision: session.revision,
      idempotencyKey: "debate-live-opening-for-0001",
    },
    runtime,
  );
  const spongeBobOpening = [...session.events]
    .reverse()
    .find(
      (event) =>
        event.kind === "speech" && event.speakerBotId === botIds.for,
    );
  assert.ok(spongeBobOpening?.content);
  const spongeBobPrompt =
    captures
      .map((messages) => messages.map((message) => message.content).join("\n"))
      .reverse()
      .find((prompt) =>
        prompt.includes("Give the Official Jellyfishing opening address"),
      ) ?? "";
  assert.match(spongeBobPrompt, /podium appeared empty/iu);
  assert.ok(
    !spongeBobPrompt.includes(durableOpening.content),
    "The advocate prompt leaked the moderator's hidden opening.",
  );
  assert.doesNotMatch(
    spongeBobOpening.content,
    /\b(?:Ryuk|invisible|Power)\b/iu,
  );
  const openingReaction = spongeBobOpening.content.split(/[.!?]/u)[0] ?? "";
  assert.doesNotMatch(
    openingReaction,
    /\b(?:must have|forgot|left|maybe|probably)\b/iu,
  );
  assert.match(
    spongeBobOpening.content,
    /\b(?:jellyfish|weekend|Bikini Bottom|community|tradition|activity)\w*/iu,
  );

  console.log(
    JSON.stringify(
      {
        provider: provider.name,
        model,
        mode: "debate",
        cast: {
          moderator: snapshots.moderator.bot.name,
          for: snapshots.for.bot.name,
          against: snapshots.against.bot.name,
        },
        passCriteria: {
          hiddenModeratorTurnPersisted: true,
          livePlayerReceivedNeutralProcedure: true,
          advocatePromptExcludedHiddenWords: true,
          advocateReactedWithoutNamingHiddenCause: true,
          advocateDeliveredSubstantiveArgument: true,
        },
        durableModeratorOpening: durableOpening.content,
        liveModeratorProjection: liveOpening.content,
        spongeBobOpening: spongeBobOpening.content,
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}
