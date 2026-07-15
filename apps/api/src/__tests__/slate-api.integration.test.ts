import assert from "node:assert/strict";
import { createServer, type AddressInfo } from "node:http";
import { after, describe, it } from "node:test";
import { getAppConfig } from "@localai/config";
import {
  createDeterministicProvider,
  createFetchRecorder,
  createTestDatabase,
} from "../test-support.ts";

process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.ENCRYPTION_MASTER_KEY = "slate-api-test-master-key";

const { createPrismRequestHandler } = await import("../server.ts");
const db = createTestDatabase();
const provider = createDeterministicProvider(["unused"]);
const server = createServer(
  createPrismRequestHandler({
    db,
    config: {
      ...getAppConfig(),
      apiPort: 0,
      sessionCookieName: "prism_slate_test_session",
      lanAccessEnabled: false,
      discoveryEnabled: false,
      openAiApiKey: "",
      anthropicApiKey: "",
      elevenLabsApiKey: "",
    },
    fetchImpl: createFetchRecorder(),
    providerFactory: () => provider,
    auxiliaryProviderFactory: () => provider,
  }),
);
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${address.port}`;

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

function jsonInit(body: Record<string, unknown>, method = "POST"): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.ENCRYPTION_MASTER_KEY;
});

describe("Slate API", () => {
  it("creates, saves, reopens, and isolates a Slate project by authenticated tenant", async () => {
    const owner = createClient();
    const registered = await owner.request(
      "/api/auth/register",
      jsonInit({ username: "slate-owner@example.com", password: "slate-owner-password" }),
    );
    assert.equal(registered.status, 201);

    const createdResponse = await owner.request(
      "/api/slate/projects",
      jsonInit({ title: "The Glass City", spark: "A city calls its architect home." }),
    );
    assert.equal(createdResponse.status, 201);
    const created = (await body(createdResponse)).project as { id: string };

    const savedResponse = await owner.request(
      `/api/slate/projects/${created.id}`,
      jsonInit(
        {
          premise: "An architect returns to the city that learned her name.",
          manuscript: "The city called at midnight.",
          structure: [
            {
              id: "scene-1",
              kind: "scene",
              title: "The Call",
              summary: "The city reaches Mara through an abandoned switchboard.",
              direction: "Keep it intimate.",
              status: "planned",
              locked: true,
            },
          ],
        },
        "PATCH",
      ),
    );
    assert.equal(savedResponse.status, 200);

    const reopenedResponse = await owner.request(`/api/slate/projects/${created.id}`);
    assert.equal(reopenedResponse.status, 200);
    const reopened = (await body(reopenedResponse)).project as {
      manuscript: string;
      structure: Array<{ locked: boolean }>;
    };
    assert.equal(reopened.manuscript, "The city called at midnight.");
    assert.equal(reopened.structure[0]?.locked, true);

    const stranger = createClient();
    const strangerRegistered = await stranger.request(
      "/api/auth/register",
      jsonInit({ username: "slate-stranger@example.com", password: "slate-stranger-password" }),
    );
    assert.equal(strangerRegistered.status, 201);
    const strangerList = await stranger.request("/api/slate/projects");
    assert.equal(strangerList.status, 200);
    assert.deepEqual((await body(strangerList)).projects, []);
    const strangerRead = await stranger.request(`/api/slate/projects/${created.id}`);
    assert.notEqual(strangerRead.status, 200);
  });

  it("resolves a LOCAL built-in wildcard and reopens its project provenance", async () => {
    const owner = createClient();
    const registered = await owner.request(
      "/api/auth/register",
      jsonInit({ username: "slate-wildcards@example.com", password: "slate-wildcards-password" }),
    );
    assert.equal(registered.status, 201);

    const providerCallsBefore = provider.calls.length;
    const resolutionResponse = await owner.request(
      "/api/slate/wildcards/resolve",
      jsonInit({ template: "A cartographer finds a door beneath {PLACE}." }),
    );
    assert.equal(resolutionResponse.status, 200);
    const resolution = await body(resolutionResponse) as {
      spark: string;
      sparkWildcards: Record<string, unknown>;
    };
    assert.doesNotMatch(resolution.spark, /\{PLACE\}/u);
    assert.equal(provider.calls.length, providerCallsBefore);

    const createdResponse = await owner.request(
      "/api/slate/projects",
      jsonInit({
        title: "The Buried Door",
        spark: resolution.spark,
        sparkWildcards: resolution.sparkWildcards,
      }),
    );
    assert.equal(createdResponse.status, 201);
    const created = (await body(createdResponse)).project as {
      id: string;
      sparkWildcards: { template?: string } | null;
    };
    assert.equal(
      created.sparkWildcards?.template,
      "A cartographer finds a door beneath {PLACE}.",
    );

    const reopenedResponse = await owner.request(`/api/slate/projects/${created.id}`);
    const reopened = (await body(reopenedResponse)).project as {
      spark: string;
      sparkWildcards: { resolvedPrompt?: string } | null;
    };
    assert.equal(reopened.sparkWildcards?.resolvedPrompt, reopened.spark);
  });
});
