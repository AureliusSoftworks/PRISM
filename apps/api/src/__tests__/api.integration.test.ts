import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type AddressInfo } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getAppConfig } from "@localai/config";
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

  it("persists mouth animation and eye rotation while ignoring legacy eye animation", async () => {
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
      })
    );
    assert.equal(created.status, 201);
    const createdPayload = await json(created);
    const botId = String(createdPayload.bot.id);
    assert.equal(createdPayload.bot.face_eye_animation, undefined);
    assert.equal(createdPayload.bot.face_eye_rotation_deg, -25);
    assert.equal(createdPayload.bot.face_mouth_animation, "wobble");

    const updated = await client.request(`/api/bots/${encodeURIComponent(botId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        faceBlinkBar: " ",
        faceEyeAnimation: "flicker",
        faceEyeRotationDeg: 35,
        faceMouthAnimation: "pulsate",
      }),
    });
    assert.equal(updated.status, 200);
    const updatedPayload = await json(updated);
    assert.equal(updatedPayload.bot.face_blink_bar, " ");
    assert.equal(updatedPayload.bot.face_eye_animation, "none");
    assert.equal(updatedPayload.bot.face_eye_rotation_deg, 35);
    assert.equal(updatedPayload.bot.face_mouth_animation, "pulsate");

    const updatedDefault = await client.request("/api/default-bot", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        faceEyeCharacter: "8",
        faceEyeAnimation: "spin",
        faceEyeRotationDeg: -45,
        faceMouthCharacter: "△",
        faceMouthAnimation: "wobble",
      }),
    });
    assert.equal(updatedDefault.status, 200);
    const defaultPayload = await json(updatedDefault);
    assert.equal(defaultPayload.defaultBot.prismDefaultBotFaceEyeAnimation, undefined);
    assert.equal(defaultPayload.defaultBot.prismDefaultBotFaceEyeRotationDeg, -45);
    assert.equal(defaultPayload.defaultBot.prismDefaultBotFaceMouthAnimation, "wobble");
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
      "This local reply must stay on the device.",
      now
    );

    const beforeCalls = fetchRecorder.calls.length;
    const response = await client.request(
      "/api/voices/synthesize",
      jsonInit({
        messageId: "voice-local-message",
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
    assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString(), "RIFF");
    assert.deepEqual(fetchRecorder.calls.slice(beforeCalls), []);
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
    assert.deepEqual(createdPayload.bot.authored_audio_voice_profile, authored);
    assert.equal(createdPayload.bot.audio_voice_profile_override, null);

    const override = { ...authored, baseVoiceId: "voice-2", pitch: -0.25 };
    const updated = await client.request(`/api/bots/${createdPayload.bot.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ audioVoiceProfileOverride: override }),
    });
    assert.equal(updated.status, 200);
    const updatedPayload = await json(updated);
    assert.deepEqual(updatedPayload.bot.authored_audio_voice_profile, authored);
    assert.deepEqual(updatedPayload.bot.audio_voice_profile_override, override);
  });
});
