import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type AddressInfo } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getAppConfig } from "@localai/config";
import { normalizeBotAudioVoiceProfileV1 } from "@localai/shared";
import {
  createDeterministicProvider,
  createFetchRecorder,
  createTestDatabase,
} from "../test-support.ts";

const tempDir = mkdtempSync(join(tmpdir(), "prism-api-integration-"));
process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.DB_PATH = join(tempDir, "module.db");
process.env.ENCRYPTION_MASTER_KEY = "integration-test-master-key";

const { createPrismRequestHandler } = await import("../server.ts");
const db = createTestDatabase();
const fetchRecorder = createFetchRecorder();
const deterministicProvider = createDeterministicProvider(["Deterministic API reply."]);
function deterministicVoiceWave(): Buffer {
  const sampleRate = 24_000;
  const sampleCount = 240;
  const dataLength = sampleCount * 2;
  const wave = Buffer.alloc(44 + dataLength);
  wave.write("RIFF", 0, "ascii");
  wave.writeUInt32LE(36 + dataLength, 4);
  wave.write("WAVE", 8, "ascii");
  wave.write("fmt ", 12, "ascii");
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(sampleRate, 24);
  wave.writeUInt32LE(sampleRate * 2, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write("data", 36, "ascii");
  wave.writeUInt32LE(dataLength, 40);
  return wave;
}
const config = {
  ...getAppConfig(),
  apiPort: 0,
  sessionCookieName: "prism_test_session",
  lanAccessEnabled: false,
  discoveryEnabled: false,
  openAiApiKey: "",
  anthropicApiKey: "",
  elevenLabsApiKey: "",
};
const server = createServer(
  createPrismRequestHandler({
    db,
    config,
    fetchImpl: fetchRecorder,
    providerFactory: () => deterministicProvider,
    auxiliaryProviderFactory: () => deterministicProvider,
    builtinVoiceWaveGenerator: async ({ profile }) => {
      if (normalizeBotAudioVoiceProfileV1(profile).systemVoiceName === "Unavailable Test") {
        throw new Error("System voice is still loading.");
      }
      return deterministicVoiceWave();
    },
  })
);
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => resolve());
});
const address = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${address.port}`;

interface Client {
  request(path: string, init?: RequestInit): Promise<Response>;
}

function createClient(): Client {
  let cookie = "";
  return {
    async request(path, init = {}) {
      const headers = new Headers(init.headers);
      if (cookie) headers.set("cookie", cookie);
      const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";", 1)[0] ?? "";
      return response;
    },
  };
}

async function json(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

function jsonInit(body: Record<string, unknown>): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

after(() => {
  server.close();
  db.close();
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.DB_PATH;
  delete process.env.ENCRYPTION_MASTER_KEY;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("API request integration", () => {
  it("uses account-wide voice defaults and ignores retired Coffee player voice fields", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "player-voice@example.com", password: "player-voice-password", displayName: "Jared" })
    );
    assert.equal(register.status, 201);
    const saved = await client.request("/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        playerAudioVoiceProfile: {
          ...normalizeBotAudioVoiceProfileV1(undefined),
          baseVoiceId: "voice-3",
        },
        playerNamePronunciation: "Jair-id",
        defaultSystemVoiceName: "Alex",
        defaultElevenLabsVoiceId: "eleven-global",
      }),
    });
    assert.equal(saved.status, 200);
    const loaded = await client.request("/api/settings");
    assert.equal(loaded.status, 200);
    const settings = (await json(loaded)).settings;
    assert.equal("playerAudioVoiceProfile" in settings, false);
    assert.equal("playerNamePronunciation" in settings, false);
    assert.equal(settings.defaultSystemVoiceName, "Alex");
    assert.equal(settings.defaultElevenLabsVoiceId, "eleven-global");

    const preview = await client.request(
      "/api/voices/preview-line",
      jsonInit({ botName: "Plankton", systemPrompt: "A theatrical tiny villain." })
    );
    assert.equal(preview.status, 200);
    assert.equal((await json(preview)).line, "Deterministic API reply.");
  });

  it("records Coffee departure idempotently and completes one bounded local epilogue", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({
        username: "coffee-departure@example.com",
        password: "coffee-departure-password",
        displayName: "Player",
      })
    );
    assert.equal(register.status, 201);
    const userId = String((await json(register)).user.id);
    const botIds = ["departure-bot-1", "departure-bot-2"];
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO bots (id, user_id, name, system_prompt, online_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)"
    ).run(botIds[0], userId, "First Bot", "You are First Bot.", now, now);
    db.prepare(
      "INSERT INTO bots (id, user_id, name, system_prompt, online_enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)"
    ).run(botIds[1], userId, "Second Bot", "You are Second Bot.", now, now);
    const sessionId = "departure-session";
    db.prepare(
      "INSERT INTO conversations (id, user_id, title, conversation_mode, bot_group_ids, coffee_topic, created_at, updated_at) VALUES (?, ?, ?, 'coffee', ?, ?, ?, ?)"
    ).run(
      sessionId,
      userId,
      "Coffee departure",
      JSON.stringify(botIds),
      "What makes a good goodbye?",
      now,
      now
    );
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, bot_id, created_at) VALUES (?, ?, ?, 'user', ?, NULL, ?)"
    ).run("departure-user-line", sessionId, userId, "I have to head out early.", now);

    const first = await client.request(
      `/api/coffee/sessions/${encodeURIComponent(sessionId)}/depart`,
      jsonInit({ preferredProvider: "local" })
    );
    assert.equal(first.status, 202);
    const firstPayload = await json(first);
    assert.equal(firstPayload.departureRecorded, true);
    assert.equal(firstPayload.epilogueStarted, true);
    assert.ok(firstPayload.epilogueTurnTarget >= 2 && firstPayload.epilogueTurnTarget <= 4);

    const duplicate = await client.request(
      `/api/coffee/sessions/${encodeURIComponent(sessionId)}/depart`,
      jsonInit({ preferredProvider: "openai" })
    );
    assert.equal(duplicate.status, 202);
    const duplicatePayload = await json(duplicate);
    assert.equal(duplicatePayload.departureRecorded, false);
    assert.equal(duplicatePayload.epilogueStarted, false);
    assert.equal(duplicatePayload.epilogueTurnTarget, firstPayload.epilogueTurnTarget);

    const resumeAttempt = await client.request(
      `/api/coffee/sessions/${encodeURIComponent(sessionId)}/continue`,
      jsonInit({ preferredProvider: "local" })
    );
    assert.equal(resumeAttempt.status, 400);
    assert.match(String((await json(resumeAttempt)).error), /ended when the player left/i);

    const deadline = Date.now() + 5_000;
    let assistantCount = 0;
    while (Date.now() < deadline) {
      assistantCount = Number(
        (db.prepare(
          "SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ? AND user_id = ? AND role = 'assistant' AND content <> ''"
        ).get(sessionId, userId) as { count: number }).count
      );
      if (assistantCount >= firstPayload.epilogueTurnTarget) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(assistantCount, firstPayload.epilogueTurnTarget);
    const markerCount = Number(
      (db.prepare(
        "SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ? AND user_id = ? AND role = 'system' AND tool_payload LIKE '%playerDeparture%'"
      ).get(sessionId, userId) as { count: number }).count
    );
    assert.equal(markerCount, 1);
    const epilogueProviders = db.prepare(
      "SELECT DISTINCT provider FROM messages WHERE conversation_id = ? AND user_id = ? AND role = 'assistant'"
    ).all(sessionId, userId) as Array<{ provider: string | null }>;
    assert.deepEqual(epilogueProviders.map((row) => row.provider), ["local"]);
  });

  it("routes CORS preflight, root landing, and unknown paths without external services", async () => {
    const preflight = await createClient().request("/api/health", { method: "OPTIONS" });
    assert.equal(preflight.status, 204);

    const root = await createClient().request("/");
    assert.equal(root.status, 200);
    assert.match(await root.text(), /Prism API/);

    const missing = await createClient().request("/api/does-not-exist");
    assert.equal(missing.status, 404);
  });

  it("registers, authenticates, scopes conversations, gates local image generation, and logs out", async () => {
    const first = createClient();
    const register = await first.request(
      "/api/auth/register",
      jsonInit({ username: "first@example.com", password: "first-password", displayName: "First" })
    );
    assert.equal(register.status, 201);
    const registered = await json(register);
    const firstUserId = String(registered.user.id);

    const me = await first.request("/api/auth/me");
    assert.equal(me.status, 200);
    assert.equal((await json(me)).user.email, "first@example.com");

    db.prepare(
      "INSERT INTO conversations (id, user_id, title, conversation_mode, created_at, updated_at) VALUES (?, ?, ?, 'chat', ?, ?)"
    ).run(
      "first-conversation",
      firstUserId,
      "First conversation",
      "2026-07-10T00:00:00.000Z",
      "2026-07-10T00:00:00.000Z"
    );

    const firstConversations = await first.request("/api/conversations");
    assert.equal(firstConversations.status, 200);
    assert.equal((await json(firstConversations)).conversations.length, 1);

    const localImage = await first.request(
      "/api/images/generate",
      jsonInit({ prompt: "test image", preferredProvider: "local", model: "disabled" })
    );
    assert.equal(localImage.status, 400);
    assert.match((await json(localImage)).error, /Local image generation is disabled/i);

    const second = createClient();
    const secondRegister = await second.request(
      "/api/auth/register",
      jsonInit({ username: "second@example.com", password: "second-password" })
    );
    assert.equal(secondRegister.status, 201);
    const secondConversations = await second.request("/api/conversations");
    assert.equal(secondConversations.status, 200);
    assert.deepEqual((await json(secondConversations)).conversations, []);

    const logout = await first.request("/api/auth/logout", { method: "POST" });
    assert.equal(logout.status, 200);
    const afterLogout = await first.request("/api/conversations");
    assert.notEqual(afterLogout.status, 200);
    assert.deepEqual(fetchRecorder.calls, []);
  });

  it("persists face motion, rotation, and custom blink geometry", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "blink-default@example.com", password: "blink-password" })
    );
    assert.equal(register.status, 201);

    const created = await client.request(
      "/api/bots",
      jsonInit({
        name: "Marketplace update target",
        faceEyeCharacter: "8",
        faceEyeAnimation: "spin",
        faceEyeRotationDeg: -25,
        faceMouthCharacter: "△",
        faceMouthAnimation: "wobble",
        faceBlinkScale: 1.2,
        faceBlinkOffsetX: -0.08,
        faceBlinkOffsetY: 0.06,
      })
    );
    assert.equal(created.status, 201);
    const createdPayload = await json(created);
    const botId = String(createdPayload.bot.id);
    assert.equal(createdPayload.bot.face_eye_animation, undefined);
    assert.equal(createdPayload.bot.face_eye_rotation_deg, -25);
    assert.equal(createdPayload.bot.face_mouth_animation, "wobble");
    assert.equal(createdPayload.bot.face_blink_scale, 1.2);
    assert.equal(createdPayload.bot.face_blink_offset_x, -0.08);
    assert.equal(createdPayload.bot.face_blink_offset_y, 0.06);

    const updated = await client.request(`/api/bots/${encodeURIComponent(botId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        faceBlinkBar: " ",
        faceEyeAnimation: "flicker",
        faceEyeRotationDeg: 35,
        faceMouthAnimation: "pulsate",
        faceBlinkScale: 0.85,
        faceBlinkOffsetX: 0.1,
        faceBlinkOffsetY: -0.12,
      }),
    });
    assert.equal(updated.status, 200);
    const updatedPayload = await json(updated);
    assert.equal(updatedPayload.bot.face_blink_bar, " ");
    assert.equal(updatedPayload.bot.face_eye_animation, "none");
    assert.equal(updatedPayload.bot.face_eye_rotation_deg, 35);
    assert.equal(updatedPayload.bot.face_mouth_animation, "pulsate");
    assert.equal(updatedPayload.bot.face_blink_scale, 0.85);
    assert.equal(updatedPayload.bot.face_blink_offset_x, 0.1);
    assert.equal(updatedPayload.bot.face_blink_offset_y, -0.12);

    const updatedDefault = await client.request("/api/default-bot", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        faceEyeCharacter: "8",
        faceEyeAnimation: "spin",
        faceEyeRotationDeg: -45,
        faceMouthCharacter: "△",
        faceMouthAnimation: "wobble",
        faceBlinkScale: 1.25,
        faceBlinkOffsetX: -0.06,
        faceBlinkOffsetY: 0.08,
      }),
    });
    assert.equal(updatedDefault.status, 200);
    const defaultPayload = await json(updatedDefault);
    assert.equal(defaultPayload.defaultBot.prismDefaultBotFaceEyeAnimation, undefined);
    assert.equal(defaultPayload.defaultBot.prismDefaultBotFaceEyeRotationDeg, -45);
    assert.equal(defaultPayload.defaultBot.prismDefaultBotFaceMouthAnimation, "wobble");
    assert.equal(defaultPayload.defaultBot.prismDefaultBotFaceBlinkScale, 1.25);
    assert.equal(defaultPayload.defaultBot.prismDefaultBotFaceBlinkOffsetX, -0.06);
    assert.equal(defaultPayload.defaultBot.prismDefaultBotFaceBlinkOffsetY, 0.08);
  });

  it("runs a Zen chat through a deterministic provider without external egress", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "chat@example.com", password: "chat-password" })
    );
    assert.equal(register.status, 201);

    const beforeCalls = fetchRecorder.calls.length;
    const response = await client.request(
      "/api/chat",
      jsonInit({
        message: "A deterministic integration turn",
        mode: "zen",
        preferredProvider: "local",
        incognito: true,
        ephemeralMessages: [],
      })
    );
    assert.equal(response.status, 200);
    const payload = await json(response);
    assert.equal(payload.ok, true);
    assert.equal(payload.conversation.messages.at(-1)?.content, "Deterministic API reply.");
    assert.ok(deterministicProvider.calls.length > 0);

    const chatFetches = fetchRecorder.calls.slice(beforeCalls);
    assert.ok(
      chatFetches.every(
        ({ input }) =>
          !/api\.openai\.com|api\.anthropic\.com|api\.elevenlabs\.io|qdrant/i.test(input)
      )
    );
  });

  it("synthesizes persisted LOCAL replies offline even when ElevenLabs is requested", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "voice-local@example.com", password: "voice-password" })
    );
    assert.equal(register.status, 201);
    const userId = String((await json(register)).user.id);
    const now = "2026-07-11T18:00:00.000Z";
    db.prepare(
      "INSERT INTO conversations (id, user_id, title, conversation_mode, created_at, updated_at) VALUES (?, ?, ?, 'chat', ?, ?)"
    ).run("voice-local-conversation", userId, "Voice privacy", now, now);
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, provider, created_at) VALUES (?, ?, ?, 'assistant', ?, 'local', ?)"
    ).run(
      "voice-local-message",
      "voice-local-conversation",
      userId,
      "*straightens the napkin edge* This local reply must stay on the device.",
      now
    );
    const spokenText = "This local reply must stay on the device.";

    const beforeCalls = fetchRecorder.calls.length;
    const response = await client.request(
      "/api/voices/synthesize",
      jsonInit({
        messageId: "voice-local-message",
        spokenText,
        mode: "english",
        engine: "elevenlabs",
        explicitOnlineContext: true,
        profile: {
          v: 1,
          baseVoiceId: "voice-3",
          pitch: 0.1,
          warmth: 0.2,
          pace: 0,
          lilt: 0,
        },
      })
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-prism-voice-engine"), "builtin-local-fallback");
    assert.equal(response.headers.get("x-prism-voice-characters"), String(spokenText.length));
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString(), "RIFF");

    const alignedResponse = await client.request(
      "/api/voices/synthesize",
      jsonInit({
        messageId: "voice-local-message",
        spokenText,
        mode: "english",
        engine: "elevenlabs",
        explicitOnlineContext: true,
        includeAlignment: true,
        profile: {
          v: 1,
          baseVoiceId: "voice-3",
          pitch: 0.1,
          warmth: 0.2,
          pace: 0,
          lilt: 0,
        },
      })
    );
    assert.equal(alignedResponse.status, 200);
    assert.equal(alignedResponse.headers.get("content-type"), "application/json; charset=utf-8");
    assert.equal(alignedResponse.headers.get("x-prism-voice-engine"), "builtin-local-fallback");
    assert.equal(alignedResponse.headers.get("x-prism-voice-alignment"), "none");
    const alignedPayload = await json(alignedResponse);
    assert.equal(alignedPayload.audioContentType, "audio/wav");
    assert.equal(alignedPayload.alignment, null);
    assert.equal(Buffer.from(alignedPayload.audioBase64, "base64").subarray(0, 4).toString(), "RIFF");
    assert.deepEqual(fetchRecorder.calls.slice(beforeCalls), []);
  });

  it("synthesizes Babble through the system voice and keeps Bottish client-procedural", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "voice-babble@example.com", password: "voice-password" })
    );
    assert.equal(register.status, 201);
    const beforeCalls = fetchRecorder.calls.length;
    const response = await client.request(
      "/api/voices/synthesize",
      jsonInit({
        text: "Hello, curious robot 42!",
        mode: "babble",
        engine: "elevenlabs",
        explicitOnlineContext: true,
        seed: "babble-integration",
        profile: {
          v: 2,
          enabled: true,
          baseVoiceId: "voice-1",
          pitch: 0.1,
          warmth: 0,
          pace: 0,
          lilt: 0.2,
          bottishTone: 0.5,
          volume: 1,
          texture: {
            preset: "clean",
            amount: 0,
            bandwidth: 1,
            noise: 0,
            instability: 0,
            distortion: 0,
            damage: 0,
          },
        },
      })
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-prism-voice-engine"), "builtin-babble");
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString(), "RIFF");
    assert.deepEqual(fetchRecorder.calls.slice(beforeCalls), []);
    const bottishResponse = await client.request(
      "/api/voices/synthesize",
      jsonInit({ text: "Hello robot", mode: "bottish", engine: "builtin" })
    );
    assert.equal(bottishResponse.status, 409);
    assert.equal((await json(bottishResponse)).code, "procedural-client-only");
    assert.deepEqual(fetchRecorder.calls.slice(beforeCalls), []);
    const unavailableResponse = await client.request(
      "/api/voices/synthesize",
      jsonInit({
        text: "Try again shortly",
        mode: "babble",
        engine: "builtin",
        profile: {
          ...normalizeBotAudioVoiceProfileV1(undefined),
          systemVoiceName: "Unavailable Test",
        },
      })
    );
    assert.equal(unavailableResponse.status, 503);
    assert.equal((await json(unavailableResponse)).code, "babble-system-unavailable");
  });

  it("ignores legacy per-bot model fields on create and update", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "inherited-models@example.com", password: "model-password" })
    );
    assert.equal(register.status, 201);

    const created = await client.request(
      "/api/bots",
      jsonInit({
        name: "Inherited model bot",
        model: "legacy-default",
        localModel: "legacy-local",
        onlineModel: "legacy-online",
        localImageModel: "legacy-local-image",
        openaiImageModel: "legacy-online-image",
      })
    );
    assert.equal(created.status, 201);
    const createdPayload = await json(created);
    const botId = String(createdPayload.bot.id);
    assert.deepEqual(
      [
        createdPayload.bot.model,
        createdPayload.bot.local_model,
        createdPayload.bot.online_model,
        createdPayload.bot.local_image_model,
        createdPayload.bot.openai_image_model,
      ],
      [null, null, null, null, null]
    );

    const updated = await client.request(`/api/bots/${encodeURIComponent(botId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        color: "#123456",
        model: "patched-default",
        localModel: "patched-local",
        onlineModel: "patched-online",
        localImageModel: "patched-local-image",
        openaiImageModel: "patched-online-image",
      }),
    });
    assert.equal(updated.status, 200);
    const row = db
      .prepare(
        `SELECT color, model, local_model, online_model, local_image_model, openai_image_model
           FROM bots WHERE id = ?`
      )
      .get(botId) as {
        color: string | null;
        model: string | null;
        local_model: string | null;
        online_model: string | null;
        local_image_model: string | null;
        openai_image_model: string | null;
      };
    assert.equal(row.color, "#123456");
    assert.deepEqual(
      [
        row.model,
        row.local_model,
        row.online_model,
        row.local_image_model,
        row.openai_image_model,
      ],
      [null, null, null, null, null]
    );
  });

  it("persists authored bot voices separately from user overrides", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "voice-profile@example.com", password: "voice-password" })
    );
    assert.equal(register.status, 201);
    const authored = {
      v: 1,
      baseVoiceId: "voice-4",
      pitch: 0.2,
      warmth: -0.1,
      pace: 0.15,
      lilt: 0.35,
    };
    const created = await client.request(
      "/api/bots",
      jsonInit({ name: "Voiced bot", authoredAudioVoiceProfile: authored })
    );
    assert.equal(created.status, 201);
    const createdPayload = await json(created);
    assert.deepEqual(
      createdPayload.bot.authored_audio_voice_profile,
      normalizeBotAudioVoiceProfileV1(authored)
    );
    assert.equal(createdPayload.bot.audio_voice_profile_override, null);

    const generatedPreview = await client.request(
      "/api/voices/preview-line",
      jsonInit({
        botId: createdPayload.bot.id,
        botName: "Voiced bot",
        systemPrompt: "A careful voice tester.",
      })
    );
    assert.equal(generatedPreview.status, 200);
    const generatedPreviewLine = (await json(generatedPreview)).line;
    assert.equal(typeof generatedPreviewLine, "string");
    assert.equal(
      (db.prepare("SELECT voice_preview_line FROM bots WHERE id = ?")
        .get(createdPayload.bot.id) as { voice_preview_line?: string }).voice_preview_line,
      generatedPreviewLine
    );

    const cachedPreview = await client.request(
      "/api/voices/preview-line",
      jsonInit({ botId: createdPayload.bot.id, botName: "Voiced bot" })
    );
    assert.equal((await json(cachedPreview)).line, generatedPreviewLine);

    const capabilitiesResponse = await client.request("/api/voices/capabilities");
    assert.equal(capabilitiesResponse.status, 200);
    const capabilitiesPayload = await json(capabilitiesResponse);
    const systemVoices = capabilitiesPayload.capabilities?.builtinEnglish?.voices;
    assert.equal(Array.isArray(systemVoices), true);
    assert.equal(
      systemVoices.every((voice: unknown) => {
        const record = voice as { name?: unknown; locale?: unknown };
        return typeof record.name === "string" && typeof record.locale === "string";
      }),
      true
    );

    const override = {
      baseVoiceId: "voice-2",
      pitch: -0.25,
      warmth: authored.warmth,
      pace: authored.pace,
      lilt: authored.lilt,
      systemVoiceName: "Alex",
      elevenLabsVoiceId: "eleven-voice-id",
    };
    const updated = await client.request(`/api/bots/${createdPayload.bot.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ audioVoiceProfileOverride: override }),
    });
    assert.equal(updated.status, 200);
    const updatedPayload = await json(updated);
    assert.deepEqual(
      updatedPayload.bot.authored_audio_voice_profile,
      normalizeBotAudioVoiceProfileV1(authored)
    );
    assert.deepEqual(
      updatedPayload.bot.audio_voice_profile_override,
      normalizeBotAudioVoiceProfileV1(override)
    );
  });
});
