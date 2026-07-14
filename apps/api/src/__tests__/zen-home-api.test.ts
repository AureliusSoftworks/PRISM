import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type AddressInfo } from "node:http";
import { getAppConfig } from "@localai/config";
import {
  createDeterministicProvider,
  createFetchRecorder,
  createTestDatabase,
} from "../test-support.ts";

process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.ENCRYPTION_MASTER_KEY = "zen-home-api-test-master-key";

const { createPrismRequestHandler } = await import("../server.ts");
const db = createTestDatabase();
const provider = createDeterministicProvider(["unused"]);
const server = createServer(
  createPrismRequestHandler({
    db,
    config: {
      ...getAppConfig(),
      apiPort: 0,
      sessionCookieName: "prism_zen_home_test_session",
      lanAccessEnabled: false,
      discoveryEnabled: false,
      openAiApiKey: "",
      anthropicApiKey: "",
      elevenLabsApiKey: "",
    },
    fetchImpl: createFetchRecorder(),
    providerFactory: () => provider,
    auxiliaryProviderFactory: () => provider,
  })
);
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${address.port}`;

function jsonInit(body: Record<string, unknown>): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function createClient() {
  let cookie = "";
  return {
    async request(path: string, init: RequestInit = {}) {
      const headers = new Headers(init.headers);
      if (cookie) headers.set("cookie", cookie);
      const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";", 1)[0] ?? "";
      return response;
    },
  };
}

async function body(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.ENCRYPTION_MASTER_KEY;
});

describe("Zen Home API", () => {
  it("opens one isolated resumable Home per persona and one Prism Home", async () => {
    const client = createClient();
    const registered = await client.request(
      "/api/auth/register",
      jsonInit({ username: "zen-homes@example.com", password: "zen-home-password" })
    );
    assert.equal(registered.status, 201);

    const createBot = async (name: string): Promise<string> => {
      const response = await client.request("/api/bots", jsonInit({ name }));
      assert.equal(response.status, 201);
      return String((await body(response)).bot.id);
    };
    const botA = await createBot("Persona A");
    const botB = await createBot("Persona B");

    const openHome = async (
      botId: string | null,
      newSession = false
    ): Promise<string> => {
      const response = await client.request(
        "/api/conversations/zen/open",
        jsonInit({ botId, ...(newSession ? { newSession: true } : {}) })
      );
      assert.equal(response.status, 200);
      return String((await body(response)).conversationId);
    };

    const prismHome = await openHome(null);
    const personaA = await openHome(botA);
    const personaB = await openHome(botB);
    assert.notEqual(prismHome, personaA);
    assert.notEqual(personaA, personaB);
    assert.equal(await openHome(botA), personaA);

    const personaANextEpisode = await openHome(botA, true);
    assert.notEqual(personaANextEpisode, personaA);
    assert.equal(await openHome(botA), personaANextEpisode);

    const listResponse = await client.request("/api/conversations");
    assert.equal(listResponse.status, 200);
    const list = (await body(listResponse)).conversations as Array<{
      id: string;
      history?: {
        contextKey: string;
        ownerBotId: string | null;
        continuationConversationId: string | null;
      };
    }>;
    const byId = new Map(list.map((entry) => [entry.id, entry]));
    assert.equal(byId.get(prismHome)?.history?.contextKey, "prism");
    assert.equal(byId.get(personaA)?.history?.contextKey, `bot:${botA}`);
    assert.equal(byId.get(personaA)?.history?.continuationConversationId, personaANextEpisode);
    assert.equal(byId.get(personaB)?.history?.ownerBotId, botB);
  });
});
