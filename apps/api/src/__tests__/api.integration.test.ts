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

  it("accepts the canonical blank-space blink on bot updates", async () => {
    const client = createClient();
    const register = await client.request(
      "/api/auth/register",
      jsonInit({ username: "blink-default@example.com", password: "blink-password" })
    );
    assert.equal(register.status, 201);

    const created = await client.request(
      "/api/bots",
      jsonInit({ name: "Marketplace update target" })
    );
    assert.equal(created.status, 201);
    const createdPayload = await json(created);
    const botId = String(createdPayload.bot.id);

    const updated = await client.request(`/api/bots/${encodeURIComponent(botId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ faceBlinkBar: " " }),
    });
    assert.equal(updated.status, 200);
    assert.equal((await json(updated)).bot.face_blink_bar, " ");
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
});
