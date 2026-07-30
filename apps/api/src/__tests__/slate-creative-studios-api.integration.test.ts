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
process.env.ENCRYPTION_MASTER_KEY = "slate-creative-studios-api-key";

const { createPrismRequestHandler } = await import("../server.ts");
const db = createTestDatabase();
const provider = createDeterministicProvider([
  '{"verdict":"promising","headline":"The opening carries pressure.","strongestElement":"The bell arrives through touch.","primaryConcern":"The choice has not landed.","nextMove":"Let Mara’s next action cost her certainty."}',
  '{"verdict":"promising","headline":"Pressure with a clear next move.","consensus":"The physical image works; the choice needs consequence.","tensions":[],"nextMove":"Make Mara act before explaining the bell."}',
]);
const fetchRecorder = createFetchRecorder();
const server = createServer(
  createPrismRequestHandler({
    db,
    config: {
      ...getAppConfig(),
      apiPort: 0,
      sessionCookieName: "prism_slate_studios_session",
      lanAccessEnabled: false,
      discoveryEnabled: false,
      openAiApiKey: "",
      anthropicApiKey: "",
      elevenLabsApiKey: "",
    },
    fetchImpl: fetchRecorder,
    providerFactory: () => provider,
    auxiliaryProviderFactory: () => provider,
  }),
);
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

function client() {
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

describe("Slate Creative Studios API", () => {
  it("runs Source Shelf promotion, an offline-safe Visual Bible, and one immutable reader room", async () => {
    const author = client();
    assert.equal(
      (
        await author.request(
          "/api/auth/register",
          jsonInit({
            username: "studios-writer@example.com",
            password: "studios-writer-password",
          }),
        )
      ).status,
      201,
    );
    const created = await jsonBody<{ project: { id: string } }>(
      await author.request(
        "/api/slate/projects",
        jsonInit({
          title: "The Bell's Dry Mouth",
          spark: "A drowned bell rings when the reservoir empties.",
        }),
      ),
    );
    const projectId = created.project.id;
    assert.equal(
      (
        await author.request(
          `/api/slate/projects/${projectId}`,
          jsonInit(
            {
              proseMode: "offline",
              structure: [
                {
                  id: "opening",
                  kind: "scene",
                  title: "Low Water",
                  summary: "Mara reaches the bell.",
                  direction: "Open under pressure.",
                  status: "planned",
                  locked: false,
                },
              ],
            },
            "PATCH",
          ),
        )
      ).status,
      200,
    );
    const sectionList = await jsonBody<{
      sections: Array<{ id: string; revision: number }>;
    }>(
      await author.request(`/api/slate/projects/${projectId}/sections`),
    );
    const section = sectionList.sections[0]!;
    assert.equal(
      (
        await author.request(
          `/api/slate/projects/${projectId}/sections/${section.id}`,
          jsonInit(
            {
              expectedRevision: section.revision,
              mutationId: "creative-studios-prose",
              prose:
                "The rope remembered the lake better than Mara did. Three dry knocks rose through it.",
              status: "drafting",
            },
            "PATCH",
          ),
        )
      ).status,
      200,
    );

    const sourceResponse = await author.request(
      `/api/slate/projects/${projectId}/sources`,
      jsonInit({
        title: "Bell metallurgy",
        kind: "research",
        content: "Immersed bronze carries a dry, fractured overtone.",
      }),
    );
    assert.equal(sourceResponse.status, 201);
    const source = await jsonBody<{
      source: { id: string; promotedSourceId: string | null };
    }>(sourceResponse);
    assert.equal(source.source.promotedSourceId, null);
    const promotedResponse = await author.request(
      `/api/slate/projects/${projectId}/sources/${source.source.id}/promote`,
      jsonInit({}),
    );
    assert.equal(promotedResponse.status, 200);
    const promoted = await jsonBody<{
      source: { promotedSourceId: string; mirrorEligible: boolean };
    }>(promotedResponse);
    assert.ok(promoted.source.promotedSourceId);
    assert.equal(promoted.source.mirrorEligible, false);

    const egressBefore = fetchRecorder.calls.length;
    const visualResponse = await author.request(
      `/api/slate/projects/${projectId}/visual-references`,
      jsonInit({
        sectionId: section.id,
        kind: "scene_keyframe",
        prompt: "Mara at low water beside the exposed bronze bell.",
        preferredProvider: "openai",
      }),
    );
    assert.equal(visualResponse.status, 400);
    assert.equal(
      fetchRecorder.calls.length,
      egressBefore,
      "OFFLINE visual generation cannot call an online image provider",
    );
    assert.deepEqual(
      await jsonBody<{ visuals: unknown[] }>(
        await author.request(
          `/api/slate/projects/${projectId}/visual-references`,
        ),
      ),
      { ok: true, visuals: [] },
    );

    const user = db
      .prepare("SELECT id FROM users WHERE email = ?")
      .get("studios-writer@example.com") as { id: string };
    const now = "2026-07-29T14:00:00.000Z";
    db.prepare(
      `INSERT INTO bots
        (id, user_id, name, system_prompt, created_at, updated_at)
       VALUES ('studios-reader', ?, 'June',
               'A patient reader attentive to emotional causality.', ?, ?)`,
    ).run(user.id, now, now);
    const roomResponse = await author.request(
      `/api/slate/projects/${projectId}/review-circle`,
      jsonInit({
        sectionId: section.id,
        reviewerBotIds: ["studios-reader"],
      }),
    );
    assert.equal(roomResponse.status, 201);
    const room = await jsonBody<{
      room: {
        id: string;
        artifact: { evidence: unknown[] };
        reviews: unknown[];
        roomNote: { verdict: string };
      };
    }>(roomResponse);
    assert.equal(room.room.artifact.evidence.length, 1);
    assert.equal(room.room.reviews.length, 1);
    assert.equal(room.room.roomNote.verdict, "promising");
    assert.equal(
      (
        await author.request(
          `/api/slate/projects/${projectId}/review-circle/${room.room.id}`,
        )
      ).status,
      200,
    );
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM slate_writing_operations WHERE project_id = ?",
        )
        .get(projectId)?.count,
      0,
    );
  });
});
