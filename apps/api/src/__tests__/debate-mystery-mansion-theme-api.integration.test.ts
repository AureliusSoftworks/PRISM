import assert from "node:assert/strict";
import { createServer, type AddressInfo } from "node:http";
import { after, describe, it } from "node:test";
import { getAppConfig } from "@localai/config";
import {
  createDeterministicProvider,
  createFetchRecorder,
  createTestDatabase,
  withTestRegistrationAcceptance,
} from "../test-support.ts";

process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.ENCRYPTION_MASTER_KEY = "mansion-theme-api-test-master-key";

const { createPrismRequestHandler } = await import("../server.ts");
const db = createTestDatabase();
const provider = createDeterministicProvider(["unused"]);
const fetchRecorder = createFetchRecorder();
const server = createServer(createPrismRequestHandler({
  db,
  config: {
    ...getAppConfig(),
    apiPort: 0,
    sessionCookieName: "prism_mansion_theme_test_session",
    lanAccessEnabled: false,
    discoveryEnabled: false,
    openAiApiKey: "",
    anthropicApiKey: "",
    elevenLabsApiKey: "",
  },
  fetchImpl: fetchRecorder,
  providerFactory: () => provider,
  auxiliaryProviderFactory: () => provider,
}));
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${address.port}`;

function createClient() {
  let cookie = "";
  return {
    async request(path: string, init: RequestInit = {}): Promise<Response> {
      init = withTestRegistrationAcceptance(path, init);
      const headers = new Headers(init.headers);
      if (cookie) headers.set("cookie", cookie);
      const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";", 1)[0] ?? "";
      return response;
    },
  };
}

function json(value: Record<string, unknown>): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  };
}

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.ENCRYPTION_MASTER_KEY;
});

describe("mansion Soundscape API guardrails", () => {
  it("rejects client music controls, LOCAL generation, missing keys, and cross-tenant mutation", async () => {
    const owner = createClient();
    const registration = await owner.request(
      "/api/auth/register",
      json({ username: "theme-owner@example.com", password: "theme-owner-password" }),
    );
    assert.equal(registration.status, 201);
    const ownerProfile = (await registration.json()) as { user: { id: string } };
    const mansionId = "guarded-mansion";
    const now = "2026-08-28T00:00:00.000Z";
    db.prepare(
      `INSERT INTO debate_mystery_mansion_bundles
         (id, user_id, source_session_id, name, floors, total_rooms,
          suspect_count, style_json, layout_json, created_at, updated_at)
       VALUES (?, ?, NULL, 'Guarded House', 1, 1, 1, ?, '[]', ?, ?)`,
    ).run(
      mansionId,
      ownerProfile.user.id,
      JSON.stringify({
        version: 1,
        id: "guarded-house",
        label: "Gothic manor",
        promptContract: "Rain, walnut, and restrained noir.",
      }),
      now,
      now,
    );

    const clientPrompt = await owner.request(
      `/api/debates/mystery-mansions/${mansionId}/theme/generate`,
      json({ lens: "shadow", responseMode: "online", prompt: "Rewrite this as pop." }),
    );
    assert.equal(clientPrompt.status, 400);
    assert.match(await clientPrompt.text(), /only the current response mode/u);

    const unknownLens = await owner.request(
      `/api/debates/mystery-mansions/${mansionId}/theme/generate`,
      json({ lens: "bright-pop", responseMode: "online" }),
    );
    assert.equal(unknownLens.status, 400);

    const local = await owner.request(
      `/api/debates/mystery-mansions/${mansionId}/theme/generate`,
      json({ responseMode: "local" }),
    );
    assert.equal(local.status, 409);
    assert.match(await local.text(), /LOCAL remains fully offline/u);

    const missingKey = await owner.request(
      `/api/debates/mystery-mansions/${mansionId}/theme/generate`,
      json({ responseMode: "online" }),
    );
    assert.equal(missingKey.status, 409);
    assert.match(await missingKey.text(), /Connect ElevenLabs/u);

    const other = createClient();
    const otherRegistration = await other.request(
      "/api/auth/register",
      json({ username: "other-theme-owner@example.com", password: "other-theme-owner-password" }),
    );
    assert.equal(otherRegistration.status, 201);
    const foreignMutation = await other.request(
      `/api/debates/mystery-mansions/${mansionId}/theme/accept`,
      json({}),
    );
    assert.equal(foreignMutation.status, 404);

    const localAtmosphere = await owner.request(
      `/api/debates/mystery-mansions/${mansionId}/atmosphere/generate`,
      json({ responseMode: "local" }),
    );
    assert.equal(localAtmosphere.status, 409);
    assert.match(await localAtmosphere.text(), /LOCAL remains fully offline/u);

    const atmospherePrompt = await owner.request(
      `/api/debates/mystery-mansions/${mansionId}/atmosphere/generate`,
      json({ responseMode: "online", prompt: "Add a scream." }),
    );
    assert.equal(atmospherePrompt.status, 400);
    assert.match(await atmospherePrompt.text(), /only the current response mode/u);
    assert.equal(fetchRecorder.calls.length, 0);
  });
});
