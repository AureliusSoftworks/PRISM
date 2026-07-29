import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import {
  DEBATE_SCHEMA_VERSION,
  botPowerSourceHashV1,
  serializeBotPowersV1,
  type BotPowerEffectV1,
  type BotPowerV1,
  type DebateMotionSlateV1,
} from "@localai/shared";
import { initializeDatabase } from "../db.ts";
import { exportUserSnapshot, importUserSnapshot } from "../backup.ts";
import { restoreFactoryDefaultsInDatabase } from "../account-reset.ts";
import {
  advanceDebateSession,
  checkDebateAdvocacyRoles,
  createDebateSession,
  debateMotionHash,
  getDebateSession,
  listDebateSessions,
  pauseDebateSession,
  refineDebateCaseBoard,
  resumeDebateSession,
  submitDebateInterjection,
  submitDebatePlayerTurn,
  submitDebateTurnaboutAction,
  submitDebateVerdict,
  type DebateAiRuntime,
} from "../debate.ts";
import type {
  GenerateOptions,
  LlmProvider,
  ProviderMessage,
} from "../providers.ts";
import { HttpError } from "../utils.http.ts";

const NOW = "2026-07-27T12:00:00.000Z";
const debateSource = readFileSync(
  fileURLToPath(new URL("../debate.ts", import.meta.url)),
  "utf8",
);

const MOTION: DebateMotionSlateV1 = {
  version: DEBATE_SCHEMA_VERSION,
  id: "housing-motion",
  motion: "This city should legalize six-story apartments near every rail station.",
  forSide: {
    label: "Build Near Rail",
    brief: "Defend broad six-story zoning as a fair response to housing scarcity.",
  },
  againstSide: {
    label: "Plan With Limits",
    brief: "Oppose the blanket rule and defend more locally tailored growth.",
  },
};

class DebateProviderStub implements LlmProvider {
  public readonly name = "local" as const;
  public readonly diagnosticModel = "debate-test";

  public async generateResponse(
    messages: ProviderMessage[],
    _options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("private advocacy consent check")) {
      return JSON.stringify({ status: "accept", reason: null });
    }
    if (text.includes("Vote independently")) {
      return JSON.stringify({
        sideId: "for",
        reason: "The For side answered the central tradeoff more directly.",
      });
    }
    if (text.includes("Ask one concise, difficult")) {
      return JSON.stringify({
        content: "What cost or constraint most threatens this position?",
      });
    }
    return JSON.stringify({
      content:
        "The central constraint is real, and this proposal addresses it directly [[source:housing-1]].",
    });
  }

  public async embedText(): Promise<number[]> {
    return [0.1, 0.2];
  }
}

class PersonaVoicePromptProvider extends DebateProviderStub {
  public speechPrompt = "";
  public ballotPrompt = "";

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("Vote independently")) this.ballotPrompt = text;
    else if (!text.includes("private advocacy consent check")) {
      this.speechPrompt = text;
    }
    return super.generateResponse(messages, options);
  }
}

class TurnaboutProvider extends DebateProviderStub {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("validate one PRISM Turnabout contradiction")) {
      return JSON.stringify({
        contradicts: true,
        statementQuote: "central constraint is real",
        evidenceQuote: "A frozen housing source",
        reason:
          "The frozen source conflicts with the statement's central constraint.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class UngroundedTurnaboutProvider extends DebateProviderStub {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("validate one PRISM Turnabout contradiction")) {
      return JSON.stringify({
        contradicts: true,
        statementQuote: "fabricated statement marker",
        evidenceQuote: "fabricated evidence marker",
        reason: "A dramatic but unsupported contradiction.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class FabricatedTurnaboutTestimonyProvider extends DebateProviderStub {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("Deliver testimony statement")) {
      return JSON.stringify({
        content:
          "According to a new study, reserving the lane changes travel time by 47% and saves 19 minutes.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

function runtime(): DebateAiRuntime {
  return runtimeWith(new DebateProviderStub());
}

function runtimeWith(provider: LlmProvider): DebateAiRuntime {
  return {
    preferredProvider: "local",
    local: {
      provider,
      providerName: "local",
      model: "debate-test",
    },
  };
}

function autoRuntime(
  primary: LlmProvider,
  fallback: LlmProvider,
): DebateAiRuntime {
  const local = {
    provider: primary,
    providerName: "local" as const,
    model: "debate-primary",
  };
  const online = {
    provider: fallback,
    providerName: "openai" as const,
    model: "debate-fallback",
  };
  return {
    preferredProvider: "local",
    responseMode: "auto",
    local,
    online,
    lanes: [local, online],
  };
}

class FailingDebateProvider implements LlmProvider {
  public readonly name = "local" as const;
  public readonly diagnosticModel = "debate-failure";

  public async generateResponse(): Promise<string> {
    throw new Error("provider unavailable");
  }

  public async embedText(): Promise<number[]> {
    return [];
  }
}

class MalformedDebateProvider implements LlmProvider {
  public readonly name = "local" as const;
  public readonly diagnosticModel = "debate-malformed";

  public async generateResponse(): Promise<string> {
    return "{not-valid-json";
  }

  public async embedText(): Promise<number[]> {
    return [];
  }
}

class DevilsAdvocateProvider extends DebateProviderStub {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("private advocacy consent check")) {
      return JSON.stringify({
        status: "devils_advocate",
        reason: "This position conflicts with my ordinary convictions.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class DecliningAdvocateProvider extends DebateProviderStub {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("private advocacy consent check")) {
      return JSON.stringify({
        status: "decline",
        reason: "This assignment crosses a defining authored boundary.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class CaseBoardProvider extends DebateProviderStub {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("Distill a scoreless public debate case board")) {
      return JSON.stringify({
        summary: "Transit zoning directly addresses scarce rail-adjacent land.",
        summaryQuote: "this proposal addresses it directly",
        statusUpdates: [],
      });
    }
    return super.generateResponse(messages, options);
  }
}

class ConcessionPreambleProvider extends DebateProviderStub {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("Give the Build Near Rail opening")) {
      return JSON.stringify({
        content:
          "I concede that local planning has value. But broad rail zoning still addresses the citywide shortage directly.",
      });
    }
    return super.generateResponse(messages, options);
  }
}

class UngroundedCaseBoardProvider extends DebateProviderStub {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("Distill a scoreless public debate case board")) {
      return JSON.stringify({
        summary: "Coolness is social impact and presence.",
        summaryQuote: "Coolness is social impact and presence.",
        statusUpdates: [],
      });
    }
    return super.generateResponse(messages, options);
  }
}

class SpoofedCaseBoardStatusProvider extends DebateProviderStub {
  private readonly targetCardId: string;

  public constructor(targetCardId: string) {
    super();
    this.targetCardId = targetCardId;
  }

  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (text.includes("Distill a scoreless public debate case board")) {
      return JSON.stringify({
        summary:
          "The house cannot rationally conclude that the affirmative carried the motion.",
        summaryQuote:
          "the house cannot rationally conclude that he is generally cooler",
        statusUpdates: [
          {
            id: this.targetCardId,
            status: "conceded",
            evidenceQuote: "I concede both points.",
          },
        ],
      });
    }
    return super.generateResponse(messages, options);
  }
}

class HearingRepeatProvider extends DebateProviderStub {
  public override async generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    const text = messages.map((message) => message.content).join("\n");
    if (
      text.includes("Basil is thoughtful") &&
      text.includes("Respond with the Plan With Limits opening")
    ) {
      return JSON.stringify({ content: "What did you just say?" });
    }
    return super.generateResponse(messages, options);
  }
}

function createTestDb(): DatabaseSync {
  const db = initializeDatabase(new DatabaseSync(":memory:"));
  db.prepare(
    `INSERT INTO users
       (id, email, display_name, password_hash, password_salt,
        wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
        created_at, last_active_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "user-1",
    "debate@example.com",
    "Debater",
    "hash",
    "salt",
    "cipher",
    "iv",
    "tag",
    NOW,
    NOW,
  );
  db.prepare(
    `INSERT INTO users
       (id, email, display_name, password_hash, password_salt,
        wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
        created_at, last_active_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "user-2",
    "other@example.com",
    "Other",
    "hash",
    "salt",
    "cipher",
    "iv",
    "tag",
    NOW,
    NOW,
  );
  return db;
}

function mutePower(): BotPowerV1 {
  const name = "Vow of Silence";
  const intent = "This bot cannot speak.";
  return {
    version: 1,
    id: "mute-power",
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: "Remain silent.",
      observerCue: "They cannot speak.",
      effects: [{ type: "mute" }],
      ruleLabels: ["Hard mute"],
    },
  };
}

function readyPower(
  id: string,
  name: string,
  intent: string,
  effects: BotPowerEffectV1[],
): BotPowerV1 {
  return {
    version: 1,
    id,
    name,
    intent,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, intent),
      selfCue: intent,
      observerCue: intent,
      effects,
      ruleLabels: [name],
    },
  };
}

function seedBot(
  db: DatabaseSync,
  id: string,
  name: string,
  powers: BotPowerV1[] = [],
): void {
  db.prepare(
    `INSERT INTO bots
       (id, user_id, name, system_prompt, powers_json, color, glyph,
        online_enabled, model, local_model, online_model, created_at, updated_at)
     VALUES (?, 'user-1', ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    name,
    `${name} is thoughtful, candid, and concise.`,
    serializeBotPowersV1(powers),
    id === "moderator" ? "#d7d2ff" : id === "for" ? "#59d7ff" : "#ff6d9c",
    id === "moderator" ? "◇" : "◆",
    `${id}-legacy-model`,
    `${id}-legacy-local-model`,
    `${id}-legacy-online-model`,
    NOW,
    NOW,
  );
}

async function createJudgeDebate(
  db: DatabaseSync,
  debateRuntime: DebateAiRuntime = runtime(),
) {
  seedBot(db, "moderator", "Mira");
  seedBot(db, "for", "Avery");
  seedBot(db, "against", "Basil");
  const checks = await checkDebateAdvocacyRoles(
    db,
    "user-1",
    {
      motion: MOTION,
      forAdvocateBotId: "for",
      againstAdvocateBotId: "against",
    },
    debateRuntime,
  );
  return createDebateSession(
    db,
    "user-1",
    {
      motion: MOTION,
      evidence: {
        version: 1,
        notes: "Rail-adjacent land is scarce.",
        sources: [
          {
            id: "housing-1",
            title: "Housing report",
            url: "https://example.com/housing",
            snippet: "A frozen housing source.",
            publishedAt: "2026-01-01",
          },
        ],
        frozenAt: null,
      },
      moderatorBotId: "moderator",
      forAdvocateBotId: "for",
      againstAdvocateBotId: "against",
      playerRole: "judge",
      playerSideId: null,
      advocacyConsent: checks,
      preferredProvider: "local",
      theme: "dark",
      idempotencyKey: "create:judge:0001",
    },
    debateRuntime,
  );
}

async function createDebateForRole(
  db: DatabaseSync,
  role: "participant" | "spectator",
) {
  seedBot(db, "moderator", "Mira");
  seedBot(db, "for", "Avery");
  seedBot(db, "against", "Basil");
  const checks = await checkDebateAdvocacyRoles(
    db,
    "user-1",
    {
      motion: MOTION,
      forAdvocateBotId: "for",
      againstAdvocateBotId: "against",
    },
    runtime(),
  );
  return createDebateSession(
    db,
    "user-1",
    {
      motion: MOTION,
      evidence: { version: 1, notes: "", sources: [], frozenAt: null },
      moderatorBotId: "moderator",
      forAdvocateBotId: "for",
      againstAdvocateBotId: "against",
      playerRole: role,
      playerSideId: role === "participant" ? "against" : null,
      advocacyConsent: checks,
      preferredProvider: "local",
      theme: "light",
      idempotencyKey: `create:${role}:0001`,
    },
    runtime(),
  );
}

async function createTurnaboutForRole(
  db: DatabaseSync,
  role: "judge" | "participant" | "spectator",
  debateRuntime: DebateAiRuntime = runtimeWith(new TurnaboutProvider()),
) {
  seedBot(db, "moderator", "Mira");
  seedBot(db, "for", "Avery");
  seedBot(db, "against", "Basil");
  const checks = await checkDebateAdvocacyRoles(
    db,
    "user-1",
    {
      format: "turnabout",
      motion: MOTION,
      forAdvocateBotId: "for",
      againstAdvocateBotId: "against",
    },
    debateRuntime,
  );
  return createDebateSession(
    db,
    "user-1",
    {
      format: "turnabout",
      motion: MOTION,
      evidence: {
        version: 1,
        notes: "Rail-adjacent land is scarce.",
        sources: [
          {
            id: "housing-1",
            title: "Housing report",
            url: "https://example.com/housing",
            snippet: "A frozen housing source.",
            publishedAt: "2026-01-01",
          },
        ],
        frozenAt: null,
      },
      moderatorBotId: "moderator",
      forAdvocateBotId: "for",
      againstAdvocateBotId: "against",
      playerRole: role,
      playerSideId: role === "participant" ? "against" : null,
      advocacyConsent: checks,
      preferredProvider: "local",
      theme: "dark",
      idempotencyKey: `create:turnabout:${role}:0001`,
    },
    debateRuntime,
  );
}

describe("Debate engine", () => {
  it("has no relationship-memory or conversation-continuity data path", () => {
    assert.doesNotMatch(
      debateSource,
      /\b(?:FROM|INTO|UPDATE)\s+(?:memories|memory_summaries|conversations|messages)\b/iu,
    );
  });

  it("makes saved persona diction binding for Debate speech and ballot reasons", async () => {
    const db = createTestDb();
    try {
      const provider = new PersonaVoicePromptProvider();
      let session = await createJudgeDebate(db, runtimeWith(provider));
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "debate.advance:persona-voice:0001",
        },
        runtimeWith(provider),
      );
      assert.match(provider.speechPrompt, /Persona voice is binding/);
      assert.match(provider.speechPrompt, /generic polished-debater, corporate, academic, or assistant language/);
      assert.match(provider.speechPrompt, /formal Debate role changes the structure of a turn, not the persona's vocabulary or fluency/);
      // A neutral ballot is generated only at normal completion; direct coverage
      // of the shared prompt text is pinned by its exported source contract below.
      assert.match(debateSource, /personaVoicePrompt\(voter\)/);
    } finally {
      db.close();
    }
  });

  it("freezes one runtime model for the session instead of bot model fields", async () => {
    const db = createTestDb();
    try {
      const session = await createJudgeDebate(db);
      assert.equal(session.format, "forum");
      assert.equal(session.formatState.format, "forum");
      assert.equal(session.provider, "local");
      assert.equal(session.model, "debate-test");
      assert.deepEqual(
        [
          session.moderator.model,
          session.forAdvocate.model,
          session.againstAdvocate.model,
        ],
        ["debate-test", "debate-test", "debate-test"],
      );
      assert.ok(
        [
          session.moderator.provider,
          session.forAdvocate.provider,
          session.againstAdvocate.provider,
        ].every((provider) => provider === session.provider),
      );
    } finally {
      db.close();
    }
  });

  it("backfills legacy sessions and archive rows to the default Forum format", async () => {
    const db = createTestDb();
    try {
      const created = await createJudgeDebate(db);
      const row = db
        .prepare("SELECT session_json FROM debate_sessions WHERE id = ?")
        .get(created.id) as { session_json: string };
      const legacy = JSON.parse(row.session_json) as Record<string, unknown>;
      delete legacy.format;
      delete legacy.formatVersion;
      delete legacy.formatState;
      db.prepare(
        "UPDATE debate_sessions SET session_json = ? WHERE id = ?",
      ).run(JSON.stringify(legacy), created.id);

      const restored = getDebateSession(db, "user-1", created.id);
      assert.equal(restored.format, "forum");
      assert.deepEqual(restored.formatState, { version: 1, format: "forum" });
      assert.equal(listDebateSessions(db, "user-1")[0]?.format, "forum");
    } finally {
      db.close();
    }
  });

  it("binds advocacy consent to the selected Debate format", async () => {
    const db = createTestDb();
    try {
      seedBot(db, "moderator", "Mira");
      seedBot(db, "for", "Avery");
      seedBot(db, "against", "Basil");
      const forumChecks = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          format: "forum",
          motion: MOTION,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        runtime(),
      );
      assert.ok(forumChecks.every((check) => check.format === "forum"));
      assert.throws(
        () =>
          createDebateSession(
            db,
            "user-1",
            {
              format: "turnabout",
              motion: MOTION,
              evidence: {
                version: 1,
                notes: "",
                sources: [],
                frozenAt: null,
              },
              moderatorBotId: "moderator",
              forAdvocateBotId: "for",
              againstAdvocateBotId: "against",
              playerRole: "judge",
              playerSideId: null,
              advocacyConsent: forumChecks,
              preferredProvider: "local",
              idempotencyKey: "create:stale-format:0001",
            },
            runtime(),
          ),
        (error: unknown) =>
          error instanceof HttpError &&
          error.statusCode === 409 &&
          /consent is stale/u.test(error.message),
      );
    } finally {
      db.close();
    }
  });

  it("runs a grounded Judge Turnabout with stable actions, rulings, reversals, and verdict continuity", async () => {
    const db = createTestDb();
    const debateRuntime = runtimeWith(new TurnaboutProvider());
    try {
      let session = await createTurnaboutForRole(
        db,
        "judge",
        debateRuntime,
      );
      assert.equal(session.format, "turnabout");
      assert.equal(session.stepKey, "turnabout_intro");
      assert.ok(session.evidence.frozenAt);

      let mutation = 0;
      while (session.stepKey !== "turnabout_action") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `turnabout-setup:${mutation}`,
          },
          debateRuntime,
        );
      }
      assert.equal(session.status, "waiting_for_player");
      assert.equal(session.formatState.format, "turnabout");
      if (session.formatState.format !== "turnabout") {
        assert.fail("Turnabout state should stay discriminated.");
      }
      assert.equal(session.formatState.statements.length, 4);
      const first = session.formatState.statements.find(
        (statement) =>
          statement.id === session.formatState.activeStatementId,
      );
      assert.ok(first);
      assert.equal(session.formatState.floorOwnerBotId, first.speakerBotId);

      session = pauseDebateSession(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "turnabout-pause:0001",
      });
      assert.equal(session.status, "paused");
      session = resumeDebateSession(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "turnabout-resume:0001",
      });
      assert.equal(session.status, "waiting_for_player");

      const pressRequest = {
        expectedRevision: session.revision,
        idempotencyKey: "turnabout-press:0001",
        action: "press" as const,
        statementId: first.id,
      };
      session = await submitDebateTurnaboutAction(
        db,
        "user-1",
        session.id,
        pressRequest,
        debateRuntime,
      );
      const replay = await submitDebateTurnaboutAction(
        db,
        "user-1",
        session.id,
        pressRequest,
        debateRuntime,
      );
      assert.equal(replay.revision, session.revision);
      assert.equal(
        session.events.at(-1)?.kind,
        "moderator_ruling",
      );
      assert.equal(session.formatState.format, "turnabout");
      if (session.formatState.format !== "turnabout") {
        assert.fail("Turnabout state should stay discriminated.");
      }
      assert.equal(
        session.formatState.statements.find(
          (statement) => statement.id === first.id,
        )?.status,
        "pressed",
      );

      await assert.rejects(
        submitDebateTurnaboutAction(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: "turnabout-invalid-evidence:0001",
            action: "present_evidence",
            statementId: first.id,
            evidenceSourceId: "not-frozen",
          },
          debateRuntime,
        ),
        (error: unknown) =>
          error instanceof HttpError &&
          error.statusCode === 400 &&
          /frozen before Start/u.test(error.message),
      );

      session = await submitDebateTurnaboutAction(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "turnabout-evidence:0001",
          action: "present_evidence",
          statementId: first.id,
          evidenceSourceId: "housing-1",
        },
        debateRuntime,
      );
      assert.equal(session.formatState.format, "turnabout");
      if (session.formatState.format !== "turnabout") {
        assert.fail("Turnabout state should stay discriminated.");
      }
      assert.equal(session.formatState.contradictions.length, 1);
      assert.deepEqual(
        {
          grounded: session.formatState.contradictions[0]?.grounded,
          ruling: session.formatState.contradictions[0]?.ruling,
        },
        { grounded: true, ruling: "sustained" },
      );
      assert.equal(session.formatState.round, 2);
      assert.ok(
        session.events.some(
          (event) =>
            event.kind === "moderator_ruling" &&
            event.ruling === "sustained" &&
            event.evidenceSourceId === "housing-1",
        ),
      );
      assert.ok(session.events.some((event) => event.kind === "revelation"));
      assert.ok(
        session.events.every(
          (event) => !event.content.includes("[[source:not-frozen]]"),
        ),
      );

      while (session.stepKey !== "turnabout_verdict_player") {
        mutation += 1;
        if (session.stepKey === "turnabout_action") {
          assert.equal(session.formatState.format, "turnabout");
          if (session.formatState.format !== "turnabout") {
            assert.fail("Turnabout state should stay discriminated.");
          }
          session = await submitDebateTurnaboutAction(
            db,
            "user-1",
            session.id,
            {
              expectedRevision: session.revision,
              idempotencyKey: `turnabout-pass:${mutation}`,
              action: "pass",
              statementId: session.formatState.activeStatementId!,
            },
            debateRuntime,
          );
        } else {
          session = await advanceDebateSession(
            db,
            "user-1",
            session.id,
            {
              expectedRevision: session.revision,
              idempotencyKey: `turnabout-advance:${mutation}`,
            },
            debateRuntime,
          );
        }
        assert.ok(mutation < 30);
      }
      session = submitDebateVerdict(db, "user-1", session.id, {
        expectedRevision: session.revision,
        idempotencyKey: "turnabout-verdict:0001",
        sideId: "for",
        reason: "The sustained contradiction changed the public record.",
      });
      while (session.status !== "completed") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `turnabout-ballot:${mutation}`,
          },
          debateRuntime,
        );
        assert.ok(mutation < 40);
      }
      assert.equal(session.winnerSideId, "for");
      assert.equal(session.ballots.length, 3);
      assert.equal(session.formatState.format, "turnabout");
      assert.equal(
        session.events.at(-1)?.content.includes("public record"),
        true,
      );
    } finally {
      db.close();
    }
  });

  it("overrules ungrounded contradiction output without publishing fabricated markers", async () => {
    const db = createTestDb();
    const debateRuntime = runtimeWith(new UngroundedTurnaboutProvider());
    try {
      let session = await createTurnaboutForRole(
        db,
        "judge",
        debateRuntime,
      );
      let mutation = 0;
      while (session.stepKey !== "turnabout_action") {
        mutation += 1;
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey: `turnabout-ungrounded-setup:${mutation}`,
          },
          debateRuntime,
        );
      }
      assert.equal(session.formatState.format, "turnabout");
      if (session.formatState.format !== "turnabout") {
        assert.fail("Turnabout state should stay discriminated.");
      }
      const statementId = session.formatState.activeStatementId;
      assert.ok(statementId);
      session = await submitDebateTurnaboutAction(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "turnabout-ungrounded-evidence:0001",
          action: "present_evidence",
          statementId,
          evidenceSourceId: "housing-1",
        },
        debateRuntime,
      );
      assert.equal(session.formatState.format, "turnabout");
      if (session.formatState.format !== "turnabout") {
        assert.fail("Turnabout state should stay discriminated.");
      }
      assert.deepEqual(
        session.formatState.contradictions.map((contradiction) => ({
          grounded: contradiction.grounded,
          ruling: contradiction.ruling,
          statementQuote: contradiction.statementQuote,
          evidenceQuote: contradiction.evidenceQuote,
        })),
        [
          {
            grounded: false,
            ruling: "overruled",
            statementQuote: "",
            evidenceQuote: "",
          },
        ],
      );
      const ruling = session.events.at(-1);
      assert.equal(ruling?.kind, "moderator_ruling");
      assert.equal(ruling?.speakerBotId, session.moderator.id);
      assert.equal(ruling?.ruling, "overruled");
      assert.deepEqual(ruling?.sourceIds, []);
      assert.ok(
        session.events.every(
          (event) =>
            !event.content.includes("fabricated statement marker") &&
            !event.content.includes("fabricated evidence marker"),
        ),
      );
    } finally {
      db.close();
    }
  });

  it("replaces unsupported evidence-like testimony with a record-bound claim", async () => {
    const db = createTestDb();
    const debateRuntime = runtimeWith(
      new FabricatedTurnaboutTestimonyProvider(),
    );
    try {
      let session = await createTurnaboutForRole(
        db,
        "judge",
        debateRuntime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "turnabout-fabrication-intro:0001",
        },
        debateRuntime,
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "turnabout-fabrication-testimony:0001",
        },
        debateRuntime,
      );
      assert.equal(session.formatState.format, "turnabout");
      if (session.formatState.format !== "turnabout") {
        assert.fail("Turnabout state should stay discriminated.");
      }
      assert.equal(session.formatState.statements.length, 2);
      assert.ok(
        session.formatState.statements.every(
          (statement) =>
            !/47%|19 minutes|according to a new study/iu.test(
              statement.content,
            ) &&
            /no independent evidence/iu.test(statement.content),
        ),
      );
      assert.notEqual(
        session.formatState.statements[0]?.content,
        session.formatState.statements[1]?.content,
      );
    } finally {
      db.close();
    }
  });

  it("adapts Turnabout examination to Participant and Spectator roles", async () => {
    for (const role of ["participant", "spectator"] as const) {
      const db = createTestDb();
      const debateRuntime = runtimeWith(new TurnaboutProvider());
      try {
        let session = await createTurnaboutForRole(
          db,
          role,
          debateRuntime,
        );
        let mutation = 0;
        while (session.status !== "completed") {
          mutation += 1;
          assert.ok(mutation < 40);
          if (session.stepKey === "turnabout_action") {
            assert.equal(role, "participant");
            assert.equal(session.formatState.format, "turnabout");
            if (session.formatState.format !== "turnabout") {
              assert.fail("Turnabout state should stay discriminated.");
            }
            const active = session.formatState.statements.find(
              (statement) =>
                statement.id === session.formatState.activeStatementId,
            );
            assert.equal(active?.sideId, "for");
            session = await submitDebateTurnaboutAction(
              db,
              "user-1",
              session.id,
              {
                expectedRevision: session.revision,
                idempotencyKey: `turnabout-${role}-pass:${mutation}`,
                action: "pass",
                statementId: active!.id,
              },
              debateRuntime,
            );
          } else {
            assert.notEqual(
              role === "spectator" ? session.status : "live",
              "waiting_for_player",
            );
            session = await advanceDebateSession(
              db,
              "user-1",
              session.id,
              {
                expectedRevision: session.revision,
                idempotencyKey: `turnabout-${role}-advance:${mutation}`,
              },
              debateRuntime,
            );
          }
        }
        if (role === "spectator") {
          assert.equal(
            session.events.filter((event) => event.kind === "press").length,
            4,
          );
          assert.ok(
            session.events
              .filter((event) => event.kind === "press")
              .every(
                (event) =>
                  event.speakerBotId === session.moderator.id &&
                  event.speakerKind === "moderator",
              ),
          );
        }
      } finally {
        db.close();
      }
    }
  });

  it("runs a complete Judge Duel with a final player ruling and bot epilogue", async () => {
    const db = createTestDb();
    try {
      let session = await createJudgeDebate(db);
      let mutation = 0;
      while (session.status !== "completed") {
        mutation += 1;
        assert.ok(mutation < 40, "Debate should complete within a bounded turn count.");
        if (session.stepKey === "challenge_judge_question") {
          session = submitDebatePlayerTurn(db, "user-1", session.id, {
            expectedRevision: session.revision,
            idempotencyKey: `player-question:${mutation}`,
            targetSideId: "for",
            content: "What is the strongest displacement safeguard?",
          });
        } else if (session.stepKey === "verdict_player") {
          session = submitDebateVerdict(db, "user-1", session.id, {
            expectedRevision: session.revision,
            idempotencyKey: `judge-verdict:${mutation}`,
            sideId: "against",
            reason: "Against was more responsive to the implementation risk.",
          });
        } else {
          session = await advanceDebateSession(
            db,
            "user-1",
            session.id,
            {
              expectedRevision: session.revision,
              idempotencyKey: `advance:${mutation}:stable`,
            },
            runtime(),
          );
        }
      }

      assert.equal(session.winnerSideId, "against");
      assert.equal(session.playerVerdict, "against");
      assert.equal(session.ballots.length, 3);
      assert.ok(session.ballots.every((ballot) => ballot.sideId === "for"));
      assert.equal(
        session.events.filter((event) => event.kind === "ballot").length,
        3,
      );
      assert.equal(session.events.at(-1)?.kind, "verdict");
      assert.ok(
        session.caseBoard.every((card) => card.sourceIds.includes("housing-1")),
      );
      assert.ok(
        session.caseBoard.filter((card) => card.sideId === "for").length <= 4,
      );
      assert.ok(
        session.caseBoard.filter((card) => card.sideId === "against").length <= 4,
      );
      assert.ok(
        session.events.some((event) => event.kind === "case_board"),
        "case-board history should be durable events",
      );
      assert.equal(listDebateSessions(db, "user-2").length, 0);
      assert.throws(
        () => getDebateSession(db, "user-2", session.id),
        (error) => error instanceof HttpError && error.statusCode === 404,
      );
    } finally {
      db.close();
    }
  });

  it("replays duplicate mutations, rejects stale revisions, and resumes the exact step", async () => {
    const db = createTestDb();
    try {
      const created = await createJudgeDebate(db);
      const request = {
        expectedRevision: created.revision,
        idempotencyKey: "advance:idempotent:0001",
      };
      const first = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        request,
        runtime(),
      );
      const duplicate = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        request,
        runtime(),
      );
      assert.deepEqual(duplicate, first);
      await assert.rejects(
        () =>
          advanceDebateSession(
            db,
            "user-1",
            created.id,
            {
              expectedRevision: created.revision,
              idempotencyKey: "advance:stale:0002",
            },
            runtime(),
          ),
        (error) => error instanceof HttpError && error.statusCode === 409,
      );

      const paused = pauseDebateSession(db, "user-1", created.id, {
        expectedRevision: first.revision,
        idempotencyKey: "pause:stable:0001",
      });
      assert.equal(paused.status, "paused");
      assert.equal(paused.stepKey, first.stepKey);
      const resumed = resumeDebateSession(db, "user-1", created.id, {
        expectedRevision: paused.revision,
        idempotencyKey: "resume:stable:0001",
      });
      assert.equal(resumed.status, "live");
      assert.equal(resumed.stepKey, first.stepKey);
    } finally {
      db.close();
    }
  });

  it("gives a Participant exactly two direct speaking slots and lets a Spectator watch through completion", async () => {
    for (const role of ["participant", "spectator"] as const) {
      const db = createTestDb();
      try {
        let session = await createDebateForRole(db, role);
        let mutation = 0;
        while (session.status !== "completed") {
          mutation += 1;
          assert.ok(mutation < 40);
          if (session.status === "waiting_for_player") {
            session = submitDebatePlayerTurn(db, "user-1", session.id, {
              expectedRevision: session.revision,
              idempotencyKey: `${role}:player:${mutation}`,
              content:
                session.phase === "challenge"
                  ? "The safeguard should be enforceable before approvals."
                  : "That implementation gap remains unanswered.",
            });
          } else {
            session = await advanceDebateSession(
              db,
              "user-1",
              session.id,
              {
                expectedRevision: session.revision,
                idempotencyKey: `${role}:advance:${mutation}`,
              },
              runtime(),
            );
          }
        }
        assert.equal(session.winnerSideId, "for");
        assert.equal(
          session.events.filter((event) => event.kind === "player_turn").length,
          role === "participant" ? 2 : 0,
        );
      } finally {
        db.close();
      }
    }
  });

  it("lets a Participant cut an opposing live floor and records the moderator ruling", async () => {
    const db = createTestDb();
    try {
      let session = await createDebateForRole(db, "participant");
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "interject:intro:0001",
        },
        runtime(),
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "interject:opening:0001",
        },
        runtime(),
      );
      const target = session.events.find(
        (event) =>
          event.kind === "speech" &&
          event.sideId === "for" &&
          event.stepKey === "opening_for",
      );
      assert.ok(target);
      const request = {
        expectedRevision: session.revision,
        idempotencyKey: "interject:player:0001",
        eventId: target.id,
        heardCharacterCount: Math.max(
          24,
          Math.floor(target.content.length * 0.58),
        ),
        content: "Point of order: that conclusion does not follow from the premise.",
      };
      const interjected = await submitDebateInterjection(
        db,
        "user-1",
        session.id,
        request,
        runtime(),
      );
      const revised = interjected.events.find(
        (event) => event.id === target.id,
      );
      assert.equal(revised?.interrupted, true);
      assert.equal(revised?.interruptedBy, "player");
      assert.ok((revised?.content.length ?? 0) < target.content.length);
      assert.match(revised?.content ?? "", /…$/u);
      assert.equal(interjected.stepKey, "opening_against");
      assert.ok(
        interjected.events.some(
          (event) =>
            event.kind === "interjection" &&
            event.parentEventId === target.id &&
            event.speakerKind === "player",
        ),
      );
      assert.ok(
        interjected.events.some(
          (event) =>
            event.kind === "moderator_ruling" &&
            event.speakerBotId === interjected.moderator.id,
        ),
      );
      assert.deepEqual(
        await submitDebateInterjection(
          db,
          "user-1",
          session.id,
          request,
          runtime(),
        ),
        interjected,
      );
      assert.equal(
        (
          JSON.parse(
            (
              db
                .prepare(
                  "SELECT event_json FROM debate_events WHERE id = ? AND user_id = ?",
                )
                .get(target.id, "user-1") as { event_json: string }
            ).event_json,
          ) as { interrupted?: boolean }
        ).interrupted,
        true,
      );
    } finally {
      db.close();
    }
  });

  it("binds consent to the exact motion hash and rejects a hard-muted moderator", async () => {
    const db = createTestDb();
    try {
      seedBot(db, "moderator", "Silent Mira", [mutePower()]);
      seedBot(db, "for", "Avery");
      seedBot(db, "against", "Basil");
      const checks = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          motion: MOTION,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        runtime(),
      );
      assert.ok(checks.every((check) => check.motionHash === debateMotionHash(MOTION)));
      assert.throws(
        () =>
          createDebateSession(
            db,
            "user-1",
            {
              motion: MOTION,
              evidence: { version: 1, notes: "", sources: [], frozenAt: null },
              moderatorBotId: "moderator",
              forAdvocateBotId: "for",
              againstAdvocateBotId: "against",
              playerRole: "spectator",
              advocacyConsent: checks,
              theme: "light",
              idempotencyKey: "create:muted:0001",
            },
            runtime(),
          ),
        /hard-muted/u,
      );
    } finally {
      db.close();
    }
  });

  it("discloses Devil's Advocate consent once in the moderator intro", async () => {
    const db = createTestDb();
    try {
      seedBot(db, "moderator", "Mira");
      seedBot(db, "for", "Avery");
      seedBot(db, "against", "Basil");
      const devilRuntime = runtimeWith(new DevilsAdvocateProvider());
      const checks = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          motion: MOTION,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        devilRuntime,
      );
      assert.ok(
        checks.every((check) => check.status === "devils_advocate"),
      );
      const created = createDebateSession(
        db,
        "user-1",
        {
          motion: MOTION,
          evidence: { version: 1, notes: "", sources: [], frozenAt: null },
          moderatorBotId: "moderator",
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
          playerRole: "spectator",
          advocacyConsent: checks,
          idempotencyKey: "create:devils:0001",
        },
        devilRuntime,
      );
      const intro = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: created.revision,
          idempotencyKey: "advance:devils:intro",
        },
        devilRuntime,
      );
      assert.equal(
        intro.events.filter((event) =>
          /Devil['’]s Advocate/iu.test(event.content),
        ).length,
        1,
      );
    } finally {
      db.close();
    }
  });

  it("never overrides a declined role assignment", async () => {
    const db = createTestDb();
    try {
      seedBot(db, "moderator", "Mira");
      seedBot(db, "for", "Avery");
      seedBot(db, "against", "Basil");
      const decliningRuntime = runtimeWith(new DecliningAdvocateProvider());
      const checks = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          motion: MOTION,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        decliningRuntime,
      );
      assert.ok(checks.every((check) => check.status === "decline"));
      assert.throws(
        () =>
          createDebateSession(
            db,
            "user-1",
            {
              motion: MOTION,
              evidence: { version: 1, notes: "", sources: [], frozenAt: null },
              moderatorBotId: "moderator",
              forAdvocateBotId: "for",
              againstAdvocateBotId: "against",
              playerRole: "spectator",
              advocacyConsent: checks,
              idempotencyKey: "create:declined:0001",
            },
            decliningRuntime,
          ),
        /declined this role.*Swap sides.*choose another bot.*revise the motion/iu,
      );
    } finally {
      db.close();
    }
  });

  it("pauses recoverably on provider failure and skips without fabricated dialogue", async () => {
    const db = createTestDb();
    try {
      const created = await createJudgeDebate(db);
      const failed = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: created.revision,
          idempotencyKey: "advance:failure:0001",
        },
        runtimeWith(new FailingDebateProvider()),
      );
      assert.equal(failed.status, "paused");
      assert.match(failed.error ?? "", /Turn unavailable/u);
      assert.equal(
        failed.events.filter((event) => event.kind === "speech").length,
        0,
      );
      const skipped = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: failed.revision,
          idempotencyKey: "advance:failure:skip",
          skip: true,
        },
        runtime(),
      );
      assert.equal(skipped.status, "live");
      assert.equal(skipped.stepKey, "opening_for");
      assert.equal(
        skipped.events.filter((event) => event.kind === "speech").length,
        0,
      );
    } finally {
      db.close();
    }
  });

  it("freezes Auto routing, records the winning lane, and pauses when the chain is exhausted", async () => {
    const db = createTestDb();
    try {
      const recoveringRuntime = autoRuntime(
        new MalformedDebateProvider(),
        new DebateProviderStub(),
      );
      const created = await createJudgeDebate(db, recoveringRuntime);
      assert.equal(created.responseMode, "auto");
      assert.deepEqual(created.generationChain, [
        { provider: "local", model: "debate-primary" },
        { provider: "openai", model: "debate-fallback" },
      ]);

      const recovered = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: created.revision,
          idempotencyKey: "advance:auto:recovery",
        },
        recoveringRuntime,
      );
      const generated = recovered.events.find(
        (event) => event.kind === "speech",
      );
      assert.equal(generated?.provider, "openai");
      assert.equal(generated?.model, "debate-fallback");
      assert.equal(generated?.autoRecovery?.attempts.length, 2);
      assert.equal(generated?.autoRecovery?.crossedOnline, true);

      const exhausted = await advanceDebateSession(
        db,
        "user-1",
        recovered.id,
        {
          expectedRevision: recovered.revision,
          idempotencyKey: "advance:auto:exhausted",
        },
        autoRuntime(
          new FailingDebateProvider(),
          new FailingDebateProvider(),
        ),
      );
      assert.equal(exhausted.status, "paused");
      assert.match(exhausted.error ?? "", /All configured Auto models failed/u);
      assert.equal(
        exhausted.events.filter((event) => event.kind === "speech").length,
        recovered.events.filter((event) => event.kind === "speech").length,
      );
    } finally {
      db.close();
    }
  });

  it("lets interruption Powers cut the heard speech, then gives the moderator the ruling", async () => {
    const db = createTestDb();
    try {
      seedBot(db, "moderator", "Mira");
      seedBot(db, "for", "Avery");
      seedBot(db, "against", "Basil", [
        readyPower(
          "always-interrupt",
          "Always Cuts In",
          "Always interrupt Avery.",
          [
            {
              type: "interruption",
              frequency: "frequent",
              strength: "large",
              certainty: "always",
              targets: [{ kind: "bot", botId: "for", name: "Avery" }],
            },
          ],
        ),
      ]);
      const checks = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          motion: MOTION,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        runtime(),
      );
      let session = createDebateSession(
        db,
        "user-1",
        {
          motion: MOTION,
          evidence: { version: 1, notes: "", sources: [], frozenAt: null },
          moderatorBotId: "moderator",
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
          playerRole: "spectator",
          advocacyConsent: checks,
          idempotencyKey: "create:interrupt:0001",
        },
        runtime(),
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "interrupt:intro",
        },
        runtime(),
      );
      session = await advanceDebateSession(
        db,
        "user-1",
        session.id,
        {
          expectedRevision: session.revision,
          idempotencyKey: "interrupt:opening",
        },
        runtime(),
      );
      const interruptedSpeech = session.events.find(
        (event) =>
          event.stepKey === "opening_for" &&
          event.kind === "speech" &&
          event.speakerBotId === "for",
      );
      const interjections = session.events.filter(
        (event) =>
          event.stepKey === "opening_for" && event.kind === "interjection",
      );
      const ruling = session.events.find(
        (event) =>
          event.stepKey === "opening_for" &&
          event.kind === "moderator_ruling",
      );
      assert.equal(interruptedSpeech?.interrupted, true);
      assert.equal(interruptedSpeech?.interruptedBy, "bot");
      assert.match(interruptedSpeech?.content ?? "", /…$/u);
      assert.equal(interjections.length, 1);
      assert.equal(interjections[0]?.speakerBotId, "against");
      assert.equal(interjections[0]?.parentEventId, interruptedSpeech?.id);
      assert.equal(ruling?.speakerBotId, "moderator");
      assert.equal(ruling?.parentEventId, interjections[0]?.id);
      assert.doesNotMatch(
        session.caseBoard.find(
          (card) => card.createdEventId === interruptedSpeech?.id,
        )?.summary ?? "",
        /addresses it directly/u,
      );
      assert.equal(session.stepKey, "opening_against");
    } finally {
      db.close();
    }
  });

  it("enforces hearing-repeat as the prior exact public line", async () => {
    const db = createTestDb();
    try {
      seedBot(db, "moderator", "Mira");
      seedBot(db, "for", "Avery");
      seedBot(db, "against", "Basil", [
        readyPower(
          "hearing-repeat",
          "Hard of Hearing",
          "Sometimes asks others to repeat themselves.",
          [
            {
              type: "hearing_repeat",
              frequency: "frequent",
              moodPenalty: "small",
            },
          ],
        ),
      ]);
      const hearingRuntime = runtimeWith(new HearingRepeatProvider());
      const checks = await checkDebateAdvocacyRoles(
        db,
        "user-1",
        {
          motion: MOTION,
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
        },
        hearingRuntime,
      );
      let session = createDebateSession(
        db,
        "user-1",
        {
          motion: MOTION,
          evidence: { version: 1, notes: "", sources: [], frozenAt: null },
          moderatorBotId: "moderator",
          forAdvocateBotId: "for",
          againstAdvocateBotId: "against",
          playerRole: "spectator",
          advocacyConsent: checks,
          idempotencyKey: "create:hearing:0001",
        },
        hearingRuntime,
      );
      for (const idempotencyKey of [
        "hearing:intro",
        "hearing:for",
        "hearing:against",
      ]) {
        session = await advanceDebateSession(
          db,
          "user-1",
          session.id,
          {
            expectedRevision: session.revision,
            idempotencyKey,
          },
          hearingRuntime,
        );
      }
      const request = session.events.find(
        (event) =>
          event.stepKey === "opening_against" &&
          event.speakerBotId === "against" &&
          event.kind === "speech",
      );
      const repeated = session.events.find(
        (event) =>
          event.stepKey === "opening_against" &&
          event.speakerBotId === "for" &&
          event.kind === "reaction",
      );
      const prior = [...session.events]
        .reverse()
        .find(
          (event) =>
            event.stepKey === "opening_for" &&
            event.speakerBotId === "for" &&
            event.kind === "speech",
        );
      assert.match(request?.content ?? "", /What did you just say/u);
      assert.equal(repeated?.content, prior?.content);
      assert.equal(session.stepKey, "challenge_for_prompt");
    } finally {
      db.close();
    }
  });

  it("refines the case board locally without blocking or losing the prior board on failure", async () => {
    const db = createTestDb();
    try {
      const created = await createJudgeDebate(db);
      const intro = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: created.revision,
          idempotencyKey: "case:intro",
        },
        runtime(),
      );
      const opening = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: intro.revision,
          idempotencyKey: "case:opening",
        },
        runtime(),
      );
      const sourceEvent = opening.events.find(
        (event) => event.kind === "speech" && event.sideId === "for",
      );
      assert.ok(sourceEvent);
      const prior = structuredClone(opening.caseBoard);
      await assert.rejects(() =>
        refineDebateCaseBoard(
          db,
          "user-1",
          opening.id,
          sourceEvent,
          new FailingDebateProvider(),
        ),
      );
      assert.deepEqual(
        getDebateSession(db, "user-1", opening.id).caseBoard,
        prior,
      );
      await refineDebateCaseBoard(
        db,
        "user-1",
        opening.id,
        sourceEvent,
        new CaseBoardProvider(),
      );
      const refined = getDebateSession(db, "user-1", opening.id);
      assert.equal(
        refined.caseBoard.find(
          (card) => card.createdEventId === sourceEvent.id,
        )?.summary,
        "Transit zoning directly addresses scarce rail-adjacent land.",
      );
      assert.equal(
        refined.events
          .filter((event) => event.kind === "case_board")
          .at(-1)?.parentEventId,
        sourceEvent.id,
      );
      assert.ok(
        refined.events.some(
          (event) =>
            event.kind === "case_board" &&
            event.content.includes(
              "Transit zoning directly addresses scarce rail-adjacent land.",
            ),
        ),
      );
    } finally {
      db.close();
    }
  });

  it("keeps concession preambles off the speaker's active case-board card", async () => {
    const db = createTestDb();
    const provider = new ConcessionPreambleProvider();
    const debateRuntime = runtimeWith(provider);
    try {
      const created = await createJudgeDebate(db, debateRuntime);
      const intro = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: created.revision,
          idempotencyKey: "case:preamble:intro",
        },
        debateRuntime,
      );
      const opening = await advanceDebateSession(
        db,
        "user-1",
        intro.id,
        {
          expectedRevision: intro.revision,
          idempotencyKey: "case:preamble:opening",
        },
        debateRuntime,
      );
      const openingEvent = opening.events.find(
        (event) =>
          event.kind === "speech" &&
          event.stepKey === "opening_for" &&
          event.sideId === "for",
      );
      assert.ok(openingEvent);
      assert.equal(
        opening.caseBoard.find(
          (card) => card.createdEventId === openingEvent.id,
        )?.summary,
        "But broad rail zoning still addresses the citywide shortage directly.",
      );
    } finally {
      db.close();
    }
  });

  it("rejects ungrounded card rewrites and unrelated conceded statuses", async () => {
    const db = createTestDb();
    try {
      const created = await createJudgeDebate(db);
      const intro = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: created.revision,
          idempotencyKey: "case:grounding:intro",
        },
        runtime(),
      );
      const forOpening = await advanceDebateSession(
        db,
        "user-1",
        intro.id,
        {
          expectedRevision: intro.revision,
          idempotencyKey: "case:grounding:for",
        },
        runtime(),
      );
      const againstOpening = await advanceDebateSession(
        db,
        "user-1",
        forOpening.id,
        {
          expectedRevision: forOpening.revision,
          idempotencyKey: "case:grounding:against",
        },
        runtime(),
      );
      const sourceEvent = againstOpening.events.find(
        (event) =>
          event.kind === "speech" &&
          event.stepKey === "opening_against" &&
          event.sideId === "against",
      );
      assert.ok(sourceEvent);
      const originalTarget = againstOpening.caseBoard.find(
        (card) => card.createdEventId === sourceEvent.id,
      );
      const opposingCard = againstOpening.caseBoard.find(
        (card) => card.sideId === "for",
      );
      assert.ok(originalTarget);
      assert.ok(opposingCard);

      const observedSource = {
        ...sourceEvent,
        content:
          "Trump's strongest point is fair: the Rubik's Cube proves a skill, not general coolness. I concede both points. But that symmetry does not rescue the affirmative; the house cannot rationally conclude that he is generally cooler.",
      };
      await refineDebateCaseBoard(
        db,
        "user-1",
        againstOpening.id,
        observedSource,
        new UngroundedCaseBoardProvider(),
      );
      let stored = getDebateSession(db, "user-1", againstOpening.id);
      assert.equal(
        stored.caseBoard.find((card) => card.id === originalTarget.id)?.summary,
        originalTarget.summary,
      );

      await refineDebateCaseBoard(
        db,
        "user-1",
        againstOpening.id,
        observedSource,
        new SpoofedCaseBoardStatusProvider(opposingCard.id),
      );
      stored = getDebateSession(db, "user-1", againstOpening.id);
      assert.equal(
        stored.caseBoard.find((card) => card.id === originalTarget.id)?.summary,
        "The house cannot rationally conclude that the affirmative carried the motion.",
      );
      assert.notEqual(
        stored.caseBoard.find((card) => card.id === opposingCard.id)?.status,
        "conceded",
      );
      assert.equal(
        stored.events
          .filter((event) => event.kind === "case_board")
          .at(-1)?.parentEventId,
        sourceEvent.id,
      );
    } finally {
      db.close();
    }
  });

  it("round-trips Debate sessions and events through account backup and clears them on reset", async () => {
    const db = createTestDb();
    try {
      const created = await createJudgeDebate(db);
      const advanced = await advanceDebateSession(
        db,
        "user-1",
        created.id,
        {
          expectedRevision: created.revision,
          idempotencyKey: "backup:advance:0001",
        },
        runtime(),
      );
      const key = Buffer.alloc(32, 7);
      const snapshot = exportUserSnapshot(db, "user-1", key);
      assert.equal(snapshot.debates?.sessions.length, 1);
      assert.equal(snapshot.debates?.events.length, 1);

      db.prepare("DELETE FROM users WHERE id = ?").run("user-1");
      importUserSnapshot(db, "user-2", snapshot, key);
      const restored = getDebateSession(db, "user-2", advanced.id);
      assert.equal(restored.stepKey, advanced.stepKey);
      assert.equal(restored.events.length, advanced.events.length);
      assert.equal(restored.evidence.frozenAt, advanced.evidence.frozenAt);

      restoreFactoryDefaultsInDatabase(db, "user-2");
      assert.equal(listDebateSessions(db, "user-2").length, 0);
      assert.equal(
        (
          db
            .prepare("SELECT COUNT(*) AS count FROM debate_events WHERE user_id = ?")
            .get("user-2") as { count: number }
        ).count,
        0,
      );
    } finally {
      db.close();
    }
  });
});
