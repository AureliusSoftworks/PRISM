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
process.env.ENCRYPTION_MASTER_KEY = "slate-proposal-continuity-test-key";

const { createPrismRequestHandler } = await import("../server.ts");
const db = createTestDatabase();
const fittedLengthProse = [
  "Mara fetched the clapper from the maintenance locker, cut the old seal, installed it on the bell's empty mount, and pulled the cord.",
  "She checked the pin twice before rain reached the glass. The warning traveled through the frame and out across the dry basin. Nothing in the mechanism moved without a named cause. She stayed beside it until the last vibration faded, holding the broken wire in one hand and the locker key in the other, ready to tell the town exactly what she had restored and why.",
].join(" ");
const provider = createDeterministicProvider([
  JSON.stringify({ conflicts: [] }),
  "At the warning bell, Mara found the clapper hanging inside the sealed bell and pulled its cord.",
  JSON.stringify({
    conflicts: [
      {
        summary: "The removed component silently reappears",
        explanation:
          "Accepted prose removes the clapper, while the candidate places it back inside without a transition.",
        acceptedQuote: "The clapper had been removed from the bell.",
        proposalQuote: "the clapper hanging inside the sealed bell",
        confidence: 0.99,
      },
    ],
  }),
  "Mara fetched the clapper from the maintenance locker, cut the old seal, installed it on the bell's empty mount, and pulled the cord.",
  JSON.stringify({ conflicts: [] }),
  fittedLengthProse,
  JSON.stringify({ conflicts: [] }),
  JSON.stringify({
    conflicts: [
      {
        summary: "The direction erases an established removal",
        explanation:
          "The writer explicitly asks Slate to treat the removed clapper as though it never left.",
        acceptedQuote: "The clapper had been removed from the bell.",
        proposalQuote: "the removed clapper inside the bell as though it never left",
        confidence: 0.99,
      },
    ],
  }),
]);
const fetchRecorder = createFetchRecorder();
const server = createServer(
  createPrismRequestHandler({
    db,
    config: {
      ...getAppConfig(),
      apiPort: 0,
      sessionCookieName: "prism_slate_continuity_audit_session",
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

async function runWritingOperation<T>(
  client: ReturnType<typeof createClient>,
  projectId: string,
  initial: {
    operation: {
      id: string;
      status: string;
      revisionFingerprint: { value: string };
    };
  },
): Promise<T> {
  if (
    initial.operation.status !== "compiling" &&
    initial.operation.status !== "generating"
  ) {
    return initial as T;
  }
  const response = await client.request(
    `/api/slate/projects/${projectId}/writing-operations/${initial.operation.id}/run`,
    jsonInit({
      revisionFingerprint: initial.operation.revisionFingerprint.value,
      idempotencyKey: `run-${initial.operation.id}`,
    }),
  );
  assert.equal(response.status, 200, await response.clone().text());
  return jsonBody<T>(response);
}

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.ENCRYPTION_MASTER_KEY;
});

describe("Slate grounded proposal Continuity lifecycle", () => {
  it("auto-repairs AI-introduced state conflicts and questions explicit writer conflicts before composition", async () => {
    const client = createClient();
    assert.equal(
      (
        await client.request(
          "/api/auth/register",
          jsonInit({
            username: "continuity-audit-writer@example.com",
            password: "continuity-audit-writer-password",
          }),
        )
      ).status,
      201,
    );
    const created = await jsonBody<{ project: { id: string } }>(
      await client.request(
        "/api/slate/projects",
        jsonInit({
          title: "The Empty Mount",
          spark: "A warning bell must sound after its clapper is removed.",
        }),
      ),
    );
    const projectId = created.project.id;
    assert.equal(
      (
        await client.request(
          `/api/slate/projects/${projectId}`,
          jsonInit(
            {
              structure: [
                {
                  id: "state-scene-a",
                  kind: "scene",
                  title: "Removal",
                  summary: "The component is removed and carried away.",
                  direction: "",
                  status: "planned",
                  locked: false,
                },
                {
                  id: "state-scene-b",
                  kind: "scene",
                  title: "Silence",
                  summary: "No restoration occurs.",
                  direction: "",
                  status: "planned",
                  locked: false,
                },
                {
                  id: "state-scene-c",
                  kind: "scene",
                  title: "Warning",
                  summary: "The bell must serve its narrative function.",
                  direction: "",
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
    const sections = (
      await jsonBody<{
        sections: Array<{ id: string; title: string; revision: number }>;
      }>(await client.request(`/api/slate/projects/${projectId}/sections`))
    ).sections;
    const removal = sections.find((section) => section.title === "Removal")!;
    const silence = sections.find((section) => section.title === "Silence")!;
    const warning = sections.find((section) => section.title === "Warning")!;
    const acceptedEvidence =
      "The clapper had been removed from the bell. Mara carried it to the maintenance locker. The empty mount was sealed behind glass.";
    const saveEvidence = await client.request(
      `/api/slate/projects/${projectId}/sections/${removal.id}`,
      jsonInit(
        {
          expectedRevision: removal.revision,
          mutationId: "state-evidence-1",
          prose: acceptedEvidence,
        },
        "PATCH",
      ),
    );
    assert.equal(saveEvidence.status, 200, await saveEvidence.clone().text());

    const repairedResponse = await client.request(
      `/api/slate/projects/${projectId}/writing-operations`,
      jsonInit({
        sectionId: silence.id,
        operation: "draft",
        direction: "Use the warning bell to close this beat.",
        scope: "beat",
        wordTarget: 100,
        idempotencyKey: "state-repair-operation",
      }),
    );
    assert.equal(
      repairedResponse.status,
      202,
      await repairedResponse.clone().text(),
    );
    const queuedRepaired = await jsonBody<{
      operation: {
        id: string;
        status: string;
        revisionFingerprint: { value: string };
        proposal: { prose: string };
      };
      clarification: null;
    }>(repairedResponse);
    assert.equal(queuedRepaired.operation.status, "generating");
    const repaired = await runWritingOperation<{
      operation: {
        id: string;
        status: string;
        revisionFingerprint: { value: string };
        proposal: { prose: string };
      };
      clarification: null;
    }>(client, projectId, queuedRepaired);
    assert.equal(repaired.operation.status, "proposed");
    assert.match(repaired.operation.proposal.prose, /empty mount/iu);
    assert.match(repaired.operation.proposal.prose, /installed/iu);
    assert.doesNotMatch(
      repaired.operation.proposal.prose,
      /clapper hanging inside the sealed bell/iu,
    );
    const repairedWordCount = repaired.operation.proposal.prose
      .trim()
      .split(/\s+/u).length;
    assert.ok(repairedWordCount >= 70 && repairedWordCount <= 130);
    assert.equal(provider.calls.length, 7);
    const repairEvents = db
      .prepare(
        `SELECT kind FROM slate_continuity_developer_events
          WHERE operation_id = ?
          ORDER BY sequence ASC`,
      )
      .all(repaired.operation.id) as unknown as Array<{ kind: string }>;
    assert.ok(
      repairEvents.some(
        (event) => event.kind === "proposal_continuity_conflict_detected",
      ),
    );
    assert.ok(
      repairEvents.some(
        (event) => event.kind === "proposal_continuity_repaired",
      ),
    );
    assert.ok(
      repairEvents.some(
        (event) => event.kind === "proposal_length_rebalanced",
      ),
    );

    const blockedResponse = await client.request(
      `/api/slate/projects/${projectId}/writing-operations`,
      jsonInit({
        sectionId: warning.id,
        operation: "draft",
        direction:
          "Hang the removed clapper inside the bell as though it never left.",
        scope: "scene",
        idempotencyKey: "state-explicit-conflict",
      }),
    );
    assert.equal(
      blockedResponse.status,
      202,
      await blockedResponse.clone().text(),
    );
    const queuedBlocked = await jsonBody<{
      operation: {
        id: string;
        status: string;
        revisionFingerprint: { value: string };
      };
      clarification: {
        choices: Array<{ id: string }>;
        customVibe: { label: string };
        sourceEvidence: Array<unknown>;
      };
    }>(blockedResponse);
    assert.equal(queuedBlocked.operation.status, "generating");
    const blocked = await runWritingOperation<{
      operation: { status: string };
      clarification: {
        choices: Array<{ id: string }>;
        customVibe: { label: string };
        sourceEvidence: Array<unknown>;
      };
    }>(client, projectId, queuedBlocked);
    assert.equal(blocked.operation.status, "awaiting_clarification");
    assert.equal(blocked.clarification.choices.length, 3);
    assert.equal(blocked.clarification.customVibe.label, "Describe the vibe…");
    assert.ok(blocked.clarification.sourceEvidence.length > 0);
    assert.equal(provider.calls.length, 8);
    assert.doesNotMatch(
      provider.calls[7]!.map((message) => message.content).join("\n"),
      /Write now:/u,
    );
  });
});
