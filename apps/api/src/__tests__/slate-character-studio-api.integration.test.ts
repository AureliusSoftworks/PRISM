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
process.env.ENCRYPTION_MASTER_KEY = "slate-character-studio-api-test-key";

const { createPrismRequestHandler } = await import("../server.ts");
const db = createTestDatabase();
const provider = createDeterministicProvider();
const server = createServer(
  createPrismRequestHandler({
    db,
    config: {
      ...getAppConfig(),
      apiPort: 0,
      sessionCookieName: "prism_slate_character_studio_session",
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

function jsonInit(
  value: Record<string, unknown>,
  method = "POST",
): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  };
}

async function jsonBody<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.ENCRYPTION_MASTER_KEY;
});

describe("Slate Character Studio API", () => {
  it("turns curated fields and intended arcs into idempotent writer-authority sources without touching observed evidence", async () => {
    const client = createClient();
    const registration = await jsonBody<{ user: { id: string } }>(
      await client.request(
        "/api/auth/register",
        jsonInit({
          username: "character-studio-writer@example.com",
          password: "character-studio-writer-password",
        }),
      ),
    );
    const created = await jsonBody<{
      project: { id: string; seriesId: string };
    }>(
      await client.request(
        "/api/slate/projects",
        jsonInit({
          title: "The Curated Arc",
          spark: "A keeper chooses what truth to preserve.",
        }),
      ),
    );
    const now = "2026-07-29T22:00:00.000Z";
    const provenance = {
      generationId: `${created.project.seriesId}:generation:0`,
      sourceIds: [],
      anchors: [],
      authority: "manuscript",
      provider: null,
      model: null,
      createdAt: now,
    };
    db.prepare(
      `INSERT INTO slate_character_profiles
        (id, user_id, series_id, project_id, entity_id, generation, layer,
         profile_json, field_locks_json, provenance_json, created_at, updated_at)
       VALUES ('character-profile-api', ?, ?, NULL, NULL, 0, 'evidence',
               ?, '{}', ?, ?, ?)`,
    ).run(
      registration.user.id,
      created.project.seriesId,
      JSON.stringify({
        identity: {
          value: "Mara Vale",
          layer: "evidence",
          writerLocked: false,
          provenance,
        },
        privatePressure: {
          value: "She protects the sanctioned story.",
          layer: "evidence",
          writerLocked: false,
          provenance,
        },
      }),
      JSON.stringify(provenance),
      now,
      now,
    );

    const fieldResponse = await client.request(
      `/api/slate/projects/${created.project.id}/characters/character-profile-api/fields/privatePressure`,
      jsonInit(
        {
          value: "She must choose living truth over sanctioned grief.",
          writerLocked: true,
          mutationId: "character-field-api-1",
        },
        "PATCH",
      ),
    );
    assert.equal(fieldResponse.status, 200, await fieldResponse.clone().text());
    const field = await jsonBody<{
      result: {
        sourceId: string;
        writerLocked: boolean;
      };
    }>(fieldResponse);
    assert.equal(field.result.writerLocked, true);
    const storedProfile = db
      .prepare(
        `SELECT profile_json, field_locks_json
           FROM slate_character_profiles
          WHERE id = 'character-profile-api'`,
      )
      .get() as { profile_json: string; field_locks_json: string };
    const storedField = (
      JSON.parse(storedProfile.profile_json) as {
        privatePressure: {
          value: string;
          layer: string;
          writerLocked: boolean;
          provenance: { authority: string; sourceIds: string[] };
        };
      }
    ).privatePressure;
    assert.equal(
      storedField.value,
      "She must choose living truth over sanctioned grief.",
    );
    assert.equal(storedField.layer, "canon");
    assert.equal(storedField.writerLocked, true);
    assert.equal(storedField.provenance.authority, "writer");
    assert.deepEqual(storedField.provenance.sourceIds, [
      field.result.sourceId,
    ]);
    assert.equal(
      (
        JSON.parse(storedProfile.field_locks_json) as {
          privatePressure: boolean;
        }
      ).privatePressure,
      true,
    );

    const duplicate = await client.request(
      `/api/slate/projects/${created.project.id}/characters/character-profile-api/fields/privatePressure`,
      jsonInit(
        {
          value: "She must choose living truth over sanctioned grief.",
          writerLocked: true,
          mutationId: "character-field-api-1",
        },
        "PATCH",
      ),
    );
    assert.equal(duplicate.status, 200);
    assert.equal(
      (
        db
          .prepare(
            `SELECT COUNT(*) AS count
               FROM slate_continuity_sources
              WHERE id = ? AND user_id = ?`,
          )
          .get(field.result.sourceId, registration.user.id) as {
          count: number;
        }
      ).count,
      1,
    );

    const arcResponse = await client.request(
      `/api/slate/projects/${created.project.id}/characters/character-profile-api/intended-arc`,
      jsonInit(
        {
          startState: "Protecting sanctioned grief",
          destinationState: "Choosing living truth",
          writerLocked: true,
          beats: [
            {
              label: "Admit the falsified inspection",
              description: "Mara names her part in the public lie.",
              status: "planned",
            },
          ],
          mutationId: "character-arc-api-1",
        },
        "PATCH",
      ),
    );
    assert.equal(arcResponse.status, 200, await arcResponse.clone().text());
    const arc = await jsonBody<{
      result: { arcId: string; intendedBeatIds: string[] };
    }>(arcResponse);
    assert.equal(arc.result.intendedBeatIds.length, 1);
    const storedArc = db
      .prepare(
        `SELECT intended_json, observed_json
           FROM slate_character_arcs WHERE id = ?`,
      )
      .get(arc.result.arcId) as {
      intended_json: string;
      observed_json: string;
    };
    assert.deepEqual(JSON.parse(storedArc.intended_json), {
      startState: "Protecting sanctioned grief",
      destinationState: "Choosing living truth",
      writerLocked: true,
    });
    assert.deepEqual(JSON.parse(storedArc.observed_json), {
      startState: "",
      destinationState: "",
      writerLocked: false,
    });
  });
});
