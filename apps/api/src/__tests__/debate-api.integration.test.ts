import assert from "node:assert/strict";
import { createServer, type AddressInfo } from "node:http";
import { after, describe, it } from "node:test";
import { getAppConfig } from "@localai/config";
import {
  DEBATE_SCHEMA_VERSION,
  type DebateSessionV1,
} from "@localai/shared";
import {
  createFetchRecorder,
  createTestDatabase,
  withTestRegistrationAcceptance,
} from "../test-support.ts";
import type {
  GenerateOptions,
  LlmProvider,
  ProviderMessage,
} from "../providers.ts";

process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.ENCRYPTION_MASTER_KEY = "debate-api-test-master-key";

class DebateApiProvider implements LlmProvider {
  public readonly name = "local" as const;
  public readonly diagnosticModel = "debate-api-model";
  public readonly generationCalls: Array<{
    model: string | null;
    auxiliary: boolean;
  }> = [];

  public async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    this.generationCalls.push({
      model: options?.model?.trim() || null,
      auxiliary: text.includes("Distill a scoreless public debate case board"),
    });
    if (text.includes("Create exactly three genuinely distinct")) {
      return JSON.stringify({
        slates: [1, 2, 3].map((index) => ({
          id: `slate-${index}`,
          motion: `This city should adopt transit housing policy ${index}.`,
          forSide: {
            label: `Build ${index}`,
            brief: "Defend the policy as a fair response to housing scarcity.",
          },
          againstSide: {
            label: `Pause ${index}`,
            brief: "Oppose the blanket policy and defend tailored growth.",
          },
        })),
      });
    }
    if (text.includes("private advocacy consent check")) {
      return JSON.stringify({ status: "accept", reason: null });
    }
    if (text.includes("Vote independently")) {
      return JSON.stringify({
        sideId: "for",
        reason: "The For side answered the central tradeoff.",
      });
    }
    if (text.includes("Ask one concise, difficult")) {
      return JSON.stringify({
        content: "Which implementation cost most threatens this position?",
      });
    }
    if (text.includes("Distill a scoreless public debate case board")) {
      return JSON.stringify({
        summary: "The proposal directly addresses the stated constraint.",
        statusUpdates: [],
      });
    }
    return JSON.stringify({
      content:
        "The proposal directly addresses the stated constraint [[source:note-1]].",
    });
  }

  public async embedText(): Promise<number[]> {
    return [];
  }
}

const { createPrismRequestHandler } = await import("../server.ts");
const db = createTestDatabase();
const provider = new DebateApiProvider();
const fetchRecorder = createFetchRecorder();
const server = createServer(
  createPrismRequestHandler({
    db,
    config: {
      ...getAppConfig(),
      apiPort: 0,
      sessionCookieName: "prism_debate_test_session",
      lanAccessEnabled: false,
      discoveryEnabled: false,
      openAiApiKey: "",
      anthropicApiKey: "",
      elevenLabsApiKey: "",
      braveSearchApiKey: "must-not-leave-local-mode",
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

async function payload(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

function insertBot(userId: string, id: string, name: string): void {
  const now = "2026-07-28T00:00:00.000Z";
  db.prepare(
    `INSERT INTO bots
       (id, user_id, name, system_prompt, color, glyph, online_enabled, model,
        local_model, online_model, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    userId,
    name,
    `${name} is candid, concise, and fair-minded.`,
    id === "moderator" ? "#d7d2ff" : id === "for" ? "#59d7ff" : "#ff6d9c",
    id === "moderator" ? "◇" : "◆",
    `${id}-legacy-model`,
    `${id}-legacy-local-model`,
    `${id}-legacy-online-model`,
    now,
    now,
  );
}

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.ENCRYPTION_MASTER_KEY;
});

describe("Debate API", () => {
  it("runs authenticated Judge, Participant, and Spectator Duels with zero LOCAL network calls", async () => {
    const owner = createClient();
    const registration = await owner.request(
      "/api/auth/register",
      jsonInit({
        username: "debate-owner@example.com",
        password: "debate-owner-password",
      }),
    );
    assert.equal(registration.status, 201);
    const userId = String((await payload(registration)).user.id);
    // Pin request-level LOCAL even when the account otherwise permits online work.
    db.prepare(
      `UPDATE users
          SET preferred_provider = 'openai',
              preferred_local_model = 'debate-account-default'
        WHERE id = ?`,
    ).run(userId);
    for (const [id, name] of [
      ["moderator", "Mira"],
      ["for", "Avery"],
      ["against", "Basil"],
    ] as const) {
      insertBot(userId, id, name);
    }

    const callsBeforeResearch = fetchRecorder.calls.length;
    const blockedResearch = await owner.request(
      "/api/debates/research",
      jsonInit({
        query: "transit housing",
        preferredProvider: "local",
      }),
    );
    assert.equal(blockedResearch.status, 409);
    assert.equal(fetchRecorder.calls.length, callsBeforeResearch);

    const accountDefaultSynthesis = await owner.request(
      "/api/debates/synthesize",
      jsonInit({
        topic: "account default routing",
        preferredProvider: "local",
      }),
    );
    assert.equal(accountDefaultSynthesis.status, 200);
    assert.equal(
      provider.generationCalls.at(-1)?.model,
      "debate-account-default",
    );
    const explicitGenerationStart = provider.generationCalls.length;

    const synthesis = await owner.request(
      "/api/debates/synthesize",
      jsonInit({
        topic: "transit housing",
        preferredProvider: "local",
        modelOverride: "debate-navbar-override",
      }),
    );
    assert.equal(synthesis.status, 200);
    const motion = (await payload(synthesis)).slates[0];
    const roleChecks = await owner.request(
      "/api/debates/role-checks",
      jsonInit({
        motion,
        forAdvocateBotId: "for",
        againstAdvocateBotId: "against",
        preferredProvider: "local",
        modelOverride: "debate-navbar-override",
      }),
    );
    assert.equal(roleChecks.status, 200);
    const checks = (await payload(roleChecks)).checks;

    const createdResponse = await owner.request(
      "/api/debates",
      jsonInit({
        motion,
        evidence: {
          version: DEBATE_SCHEMA_VERSION,
          notes: "One frozen player note.",
          sources: [
            {
              id: "note-1",
              title: "Player note",
              url: "https://example.com/note",
              snippet: "Frozen supporting context.",
              publishedAt: null,
            },
          ],
          frozenAt: null,
        },
        moderatorBotId: "moderator",
        forAdvocateBotId: "for",
        againstAdvocateBotId: "against",
        playerRole: "spectator",
        playerSideId: null,
        advocacyConsent: checks,
        preferredProvider: "local",
        modelOverride: "debate-navbar-override",
        theme: "dark",
        idempotencyKey: "api:create:spectator",
      }),
    );
    assert.equal(createdResponse.status, 201);
    let session = (await payload(createdResponse)).session as DebateSessionV1;
    assert.equal(session.provider, "local");
    assert.equal(session.model, "debate-navbar-override");
    assert.deepEqual(
      [
        session.moderator.model,
        session.forAdvocate.model,
        session.againstAdvocate.model,
      ],
      [
        "debate-navbar-override",
        "debate-navbar-override",
        "debate-navbar-override",
      ],
    );
    let turn = 0;
    while (session.status !== "completed") {
      turn += 1;
      assert.ok(turn < 32);
      const advanced = await owner.request(
        `/api/debates/${session.id}/advance`,
        jsonInit({
          expectedRevision: session.revision,
          idempotencyKey: `api:advance:${turn}`,
          preferredProvider: "local",
        }),
      );
      assert.equal(advanced.status, 200, JSON.stringify(await payload(advanced.clone())));
      session = (await payload(advanced)).session as DebateSessionV1;
    }
    assert.equal(session.ballots.length, 3);
    assert.equal(session.winnerSideId, "for");
    assert.ok(session.events.some((event) => event.kind === "case_board"));
    assert.ok(
      provider.generationCalls
        .slice(explicitGenerationStart)
        .filter((call) => !call.auxiliary)
        .every((call) => call.model === "debate-navbar-override"),
      "Every setup, cast, and ballot generation should use the Debate-wide model.",
    );
    assert.equal(fetchRecorder.calls.length, callsBeforeResearch);

    const deleted = await owner.request(
      `/api/debates/${session.id}`,
      jsonInit(
        {
          expectedRevision: session.revision,
          idempotencyKey: "api:delete:spectator",
        },
        "DELETE",
      ),
    );
    assert.equal(deleted.status, 200);
    const deleteRun = (await payload(deleted)).actionRun;
    assert.equal(deleteRun.capabilityId, "debate.session.delete");
    assert.equal(deleteRun.undoAvailable, true);
    assert.deepEqual((await payload(await owner.request("/api/debates"))).sessions, []);

    const undone = await owner.request(
      "/api/prism/actions/undo",
      jsonInit({
        runId: deleteRun.id,
        surface: { surfaceId: "debate", debateSessionId: session.id },
      }),
    );
    assert.equal(undone.status, 200);
    assert.equal((await payload(undone)).run.status, "undone");
    const restoredResponse = await owner.request(`/api/debates/${session.id}`);
    assert.equal(restoredResponse.status, 200);
    session = (await payload(restoredResponse)).session as DebateSessionV1;
    assert.equal(session.status, "completed");

    for (const role of ["judge", "participant"] as const) {
      const created = await owner.request(
        "/api/debates",
        jsonInit({
          motion,
          evidence: {
            version: DEBATE_SCHEMA_VERSION,
            notes: "Frozen role-path note.",
            sources: [],
            frozenAt: null,
          },
          moderatorBotId: "moderator",
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
          playerRole: role,
          playerSideId: role === "participant" ? "against" : null,
          advocacyConsent: checks,
          preferredProvider: "local",
          modelOverride: "debate-navbar-override",
          theme: "light",
          idempotencyKey: `api:create:${role}`,
        }),
      );
      assert.equal(created.status, 201);
      let roleSession = (await payload(created)).session as DebateSessionV1;
      let roleTurn = 0;
      if (role === "participant") {
        for (const [index, label] of ["intro", "opening"].entries()) {
          const advanced = await owner.request(
            `/api/debates/${roleSession.id}/advance`,
            jsonInit({
              expectedRevision: roleSession.revision,
              idempotencyKey: `api:participant:pre-interject:${label}`,
            }),
          );
          assert.equal(advanced.status, 200);
          roleSession = (await payload(advanced)).session as DebateSessionV1;
          roleTurn = index + 1;
        }
        const opposingOpening = roleSession.events.find(
          (event) =>
            event.kind === "speech" &&
            event.sideId === "for" &&
            event.stepKey === "opening_for",
        );
        assert.ok(opposingOpening);
        const interjected = await owner.request(
          `/api/debates/${roleSession.id}/interject`,
          jsonInit({
            expectedRevision: roleSession.revision,
            idempotencyKey: "api:participant:interject",
            eventId: opposingOpening.id,
            heardCharacterCount: Math.max(
              24,
              Math.floor(opposingOpening.content.length * 0.58),
            ),
            content:
              "Point of order: that conclusion outruns the stated premise.",
          }),
        );
        assert.equal(interjected.status, 200);
        roleSession = (await payload(interjected))
          .session as DebateSessionV1;
        assert.ok(
          roleSession.events.some(
            (event) => event.kind === "moderator_ruling",
          ),
        );
      }
      while (roleSession.status !== "completed") {
        roleTurn += 1;
        assert.ok(roleTurn < 40);
        let response: Response;
        if (roleSession.stepKey === "verdict_player") {
          response = await owner.request(
            `/api/debates/${roleSession.id}/verdict`,
            jsonInit({
              expectedRevision: roleSession.revision,
              idempotencyKey: `api:${role}:verdict`,
              sideId: "against",
              reason: "The Against side best addressed implementation risk.",
            }),
          );
        } else if (roleSession.status === "waiting_for_player") {
          response = await owner.request(
            `/api/debates/${roleSession.id}/player-turn`,
            jsonInit({
              expectedRevision: roleSession.revision,
              idempotencyKey: `api:${role}:player:${roleTurn}`,
              content:
                role === "judge"
                  ? "Which safeguard is enforceable before approval?"
                  : "The implementation safeguard must precede approval.",
              ...(role === "judge" ? { targetSideId: "for" } : {}),
            }),
          );
        } else {
          response = await owner.request(
            `/api/debates/${roleSession.id}/advance`,
            jsonInit({
              expectedRevision: roleSession.revision,
              idempotencyKey: `api:${role}:advance:${roleTurn}`,
            }),
          );
        }
        assert.equal(response.status, 200);
        roleSession = (await payload(response)).session as DebateSessionV1;
      }
      assert.equal(roleSession.ballots.length, 3);
      assert.equal(
        roleSession.events.filter((event) => event.kind === "player_turn").length,
        role === "participant" ? 2 : 1,
      );
      assert.equal(
        roleSession.winnerSideId,
        role === "judge" ? "against" : "for",
      );
    }

    const turnaboutRoleChecks = await owner.request(
      "/api/debates/role-checks",
      jsonInit({
        format: "turnabout",
        motion,
        forAdvocateBotId: "for",
        againstAdvocateBotId: "against",
        preferredProvider: "local",
        modelOverride: "debate-navbar-override",
      }),
    );
    assert.equal(turnaboutRoleChecks.status, 200);
    const turnaboutCreated = await owner.request(
      "/api/debates",
      jsonInit({
        format: "turnabout",
        motion,
        evidence: {
          version: DEBATE_SCHEMA_VERSION,
          notes: "Frozen Turnabout route check.",
          sources: [
            {
              id: "note-1",
              title: "Player note",
              url: null,
              snippet: "Frozen supporting context.",
              publishedAt: null,
            },
          ],
          frozenAt: null,
        },
        moderatorBotId: "moderator",
        forAdvocateBotId: "for",
        againstAdvocateBotId: "against",
        playerRole: "judge",
        playerSideId: null,
        advocacyConsent: (await payload(turnaboutRoleChecks)).checks,
        preferredProvider: "local",
        modelOverride: "debate-navbar-override",
        theme: "dark",
        idempotencyKey: "api:create:turnabout",
      }),
    );
    assert.equal(turnaboutCreated.status, 201);
    let turnaboutSession = (await payload(turnaboutCreated))
      .session as DebateSessionV1;
    assert.equal(turnaboutSession.format, "turnabout");
    for (const label of ["intro", "for-testimony", "against-testimony"]) {
      const advanced = await owner.request(
        `/api/debates/${turnaboutSession.id}/advance`,
        jsonInit({
          expectedRevision: turnaboutSession.revision,
          idempotencyKey: `api:turnabout:${label}`,
        }),
      );
      assert.equal(advanced.status, 200);
      turnaboutSession = (await payload(advanced)).session as DebateSessionV1;
    }
    assert.equal(turnaboutSession.stepKey, "turnabout_action");
    assert.equal(turnaboutSession.status, "waiting_for_player");
    assert.equal(turnaboutSession.formatState.format, "turnabout");
    if (turnaboutSession.formatState.format !== "turnabout") {
      assert.fail("Turnabout format state should remain discriminated.");
    }
    const activeStatementId = turnaboutSession.formatState.activeStatementId;
    assert.ok(activeStatementId);
    const pressed = await owner.request(
      `/api/debates/${turnaboutSession.id}/turnabout-action`,
      jsonInit({
        expectedRevision: turnaboutSession.revision,
        idempotencyKey: "api:turnabout:press",
        action: "press",
        statementId: activeStatementId,
      }),
    );
    assert.equal(pressed.status, 200);
    turnaboutSession = (await payload(pressed)).session as DebateSessionV1;
    assert.equal(turnaboutSession.status, "waiting_for_player");
    assert.ok(
      turnaboutSession.events.some(
        (event) =>
          event.kind === "moderator_ruling" &&
          event.statementId === activeStatementId &&
          event.speakerBotId === "moderator",
      ),
    );
    assert.equal(fetchRecorder.calls.length, callsBeforeResearch);

    db.prepare(
      `UPDATE users
          SET preferred_provider = 'local',
              auto_switch_model = 1,
              auto_fallback_chain = ?
        WHERE id = ?`,
    ).run(
      JSON.stringify({
        v: 1,
        fallbacks: [
          { provider: "openai", model: "debate-online-fallback" },
        ],
      }),
      userId,
    );
    const autoCreatedResponse = await owner.request(
      "/api/debates",
      jsonInit({
        motion,
        evidence: {
          version: DEBATE_SCHEMA_VERSION,
          notes: "Frozen Auto routing check.",
          sources: [],
          frozenAt: null,
        },
        moderatorBotId: "moderator",
        forAdvocateBotId: "for",
        againstAdvocateBotId: "against",
        playerRole: "spectator",
        advocacyConsent: checks,
        preferredProvider: "local",
        modelOverride: "debate-auto-primary",
        responseMode: "auto",
        theme: "dark",
        idempotencyKey: "api:auto:create:0001",
      }),
    );
    assert.equal(autoCreatedResponse.status, 201);
    const autoSession = (await payload(autoCreatedResponse))
      .session as DebateSessionV1;
    assert.equal(autoSession.responseMode, "auto");
    assert.deepEqual(autoSession.generationChain, [
      { provider: "local", model: "debate-auto-primary" },
      { provider: "openai", model: "debate-online-fallback" },
    ]);

    assert.equal(fetchRecorder.calls.length, callsBeforeResearch);

    const stranger = createClient();
    assert.equal(
      (
        await stranger.request(
          "/api/auth/register",
          jsonInit({
            username: "debate-stranger@example.com",
            password: "debate-stranger-password",
          }),
        )
      ).status,
      201,
    );
    const strangerList = await stranger.request("/api/debates");
    assert.deepEqual((await payload(strangerList)).sessions, []);
    assert.equal(
      (await stranger.request(`/api/debates/${session.id}`)).status,
      404,
    );
  });
});
