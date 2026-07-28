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
  submitDebatePlayerTurn,
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
        statusUpdates: [],
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
        online_enabled, created_at, updated_at)
     VALUES (?, 'user-1', ?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    id,
    name,
    `${name} is thoughtful, candid, and concise.`,
    serializeBotPowersV1(powers),
    id === "moderator" ? "#d7d2ff" : id === "for" ? "#59d7ff" : "#ff6d9c",
    id === "moderator" ? "◇" : "◆",
    NOW,
    NOW,
  );
}

async function createJudgeDebate(db: DatabaseSync) {
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
    runtime(),
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

describe("Debate engine", () => {
  it("has no relationship-memory or conversation-continuity data path", () => {
    assert.doesNotMatch(
      debateSource,
      /\b(?:FROM|INTO|UPDATE)\s+(?:memories|memory_summaries|conversations|messages)\b/iu,
    );
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

  it("bounds interruption Powers to one between-turn reaction without stealing the floor", async () => {
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
      const reactions = session.events.filter(
        (event) =>
          event.stepKey === "opening_for" && event.kind === "reaction",
      );
      assert.equal(reactions.length, 1);
      assert.equal(reactions[0]?.speakerBotId, "against");
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
