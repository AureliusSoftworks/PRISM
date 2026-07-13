import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { botPowerSourceHashV1 } from "@localai/shared";
import { compileBotPowers } from "../bot-powers.ts";
import {
  applyCoffeePowerAfterSpeech,
  coffeePowerBotCanSpeak,
  coffeePowerBotVisibleTo,
  resolveCoffeePowersForSession,
} from "../coffee-powers.ts";
import type { LlmProvider } from "../providers.ts";

const provider: LlmProvider = {
  name: "local",
  async generateResponse() {
    return JSON.stringify({
      powers: [{
        id: "invisible",
        selfCue: "Remain unseen except to Light.",
        observerCue: "Only Light can perceive Ryuk.",
        effects: [{ type: "awareness", allowed: [{ kind: "bot", name: "Light Yagami" }] }],
        ruleLabels: ["Visible only to Light"],
      }],
    });
  },
  async embedText() { return []; },
};

test("local compiler produces ready structured powers", async () => {
  const result = await compileBotPowers({
    provider,
    botName: "Ryuk",
    powers: [{
      version: 1,
      id: "invisible",
      name: "Invisible",
      intent: "Only visible to the bot named Light Yagami",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  assert.equal(result.powers[0]?.compileStatus, "ready");
  assert.equal(result.powers[0]?.compiled?.effects[0]?.type, "awareness");
  assert.equal(
    result.powers[0]?.compiled?.sourceHash,
    botPowerSourceHashV1("Invisible", "Only visible to the bot named Light Yagami")
  );
});

test("compiler creates exclusive visibility rules without consulting the local model", async () => {
  let calls = 0;
  const unusedProvider: LlmProvider = {
    name: "local",
    async generateResponse() {
      calls += 1;
      throw new Error("provider should not be needed");
    },
    async embedText() { return []; },
  };
  const result = await compileBotPowers({
    provider: unusedProvider,
    botName: "Ryuk",
    powers: [{
      version: 1,
      id: "power-mdeadbeef-1",
      name: "Invisible",
      intent: "This bot is invisible to all other bots except Light Yagami.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  assert.equal(calls, 0);
  assert.equal(result.powers[0]?.compileStatus, "ready");
  assert.deepEqual(result.powers[0]?.compiled?.effects, [{
    type: "awareness",
    allowed: [{ kind: "bot", name: "Light Yagami" }],
  }]);
});

test("compiler creates exclusive speech rules without consulting the local model", async () => {
  let calls = 0;
  const unusedProvider: LlmProvider = {
    name: "local",
    async generateResponse() {
      calls += 1;
      throw new Error("provider should not be needed");
    },
    async embedText() { return []; },
  };
  const result = await compileBotPowers({
    provider: unusedProvider,
    botName: "Ryuk",
    powers: [{
      version: 1,
      id: "private-voice",
      name: "Private Voice",
      intent: "This bot is unheard by everyone except Misa Amane.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  assert.equal(calls, 0);
  assert.deepEqual(result.powers[0]?.compiled?.effects, [{
    type: "speech_audience",
    allowed: [{ kind: "bot", name: "Misa Amane" }],
  }]);
});

test("compiler recovers a usable creative power when the local model changes its id", async () => {
  const mismatchedIdProvider: LlmProvider = {
    name: "local",
    async generateResponse() {
      return JSON.stringify([{
        id: "invented-id",
        name: "Respirator",
        self_cue: "Mechanical breathing punctuates tense moments.",
        effect: { type: "action_bias", cue: "Mention mechanical breathing.", frequency: "occasional" },
        labels: ["Mechanical breathing"],
      }]);
    },
    async embedText() { return []; },
  };
  const result = await compileBotPowers({
    provider: mismatchedIdProvider,
    powers: [{
      version: 1,
      id: "respirator",
      name: "Respirator",
      intent: "Mechanical breathing recurs in actions.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  assert.equal(result.powers[0]?.compileStatus, "ready");
  assert.equal(result.powers[0]?.compiled?.effects[0]?.type, "action_bias");
});

test("compiler makes one bounded local repair attempt for malformed creative output", async () => {
  let calls = 0;
  const repairProvider: LlmProvider = {
    name: "local",
    async generateResponse() {
      calls += 1;
      if (calls === 1) return "I could not format that.";
      return JSON.stringify({ power: {
        id: "different-id",
        name: "Respirator",
        selfCue: "Mechanical breathing punctuates tense moments.",
        effects: [{ type: "action_bias", cue: "Mention mechanical breathing.", frequency: "occasional" }],
        ruleLabels: ["Mechanical breathing"],
      } });
    },
    async embedText() { return []; },
  };
  const result = await compileBotPowers({
    provider: repairProvider,
    powers: [{
      version: 1,
      id: "respirator",
      name: "Respirator",
      intent: "Mechanical breathing recurs in actions.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  assert.equal(calls, 2);
  assert.equal(result.powers[0]?.compileStatus, "ready");
});

test("compiler does not mark a cue-only hard visibility constraint ready", async () => {
  let calls = 0;
  const cueOnlyProvider: LlmProvider = {
    name: "local",
    async generateResponse() {
      calls += 1;
      return JSON.stringify({ powers: [{
        id: "conditional-invisibility",
        selfCue: "Remain unseen until the secret condition is met.",
        effects: [],
        ruleLabels: ["Conditionally unseen"],
      }] });
    },
    async embedText() { return []; },
  };
  const result = await compileBotPowers({
    provider: cueOnlyProvider,
    powers: [{
      version: 1,
      id: "conditional-invisibility",
      name: "Conditional Invisibility",
      intent: "Nobody can see this bot unless a secret condition is met.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  assert.equal(calls, 2);
  assert.equal(result.powers[0]?.compileStatus, "error");
  assert.match(result.powers[0]?.compileError ?? "", /required visibility rule/u);
});

test("compiler preserves drafts as inactive errors when the local model fails", async () => {
  const failingProvider: LlmProvider = {
    name: "local",
    async generateResponse() { throw new Error("model unavailable"); },
    async embedText() { return []; },
  };
  const result = await compileBotPowers({
    provider: failingProvider,
    powers: [{
      version: 1,
      id: "respirator",
      name: "Respirator",
      intent: "Mechanical breathing recurs in actions.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  assert.equal(result.powers[0]?.intent, "Mechanical breathing recurs in actions.");
  assert.equal(result.powers[0]?.compileStatus, "error");
  assert.equal(result.powers[0]?.compiled, null);
});

test("compiler bounds strengths and blocks conflicting enabled hard audiences", async () => {
  const conflictProvider: LlmProvider = {
    name: "local",
    async generateResponse() {
      return JSON.stringify({ powers: [
        {
          id: "one",
          selfCue: "First audience.",
          observerCue: "",
          effects: [
            { type: "awareness", allowed: [{ kind: "bot", name: "Light" }] },
            { type: "social_influence", trigger: "after_speech", polarity: "negative", strength: "extreme", targets: [{ kind: "all" }] },
          ],
          ruleLabels: ["Only Light"],
        },
        {
          id: "two",
          selfCue: "Second audience.",
          observerCue: "",
          effects: [{ type: "awareness", allowed: [{ kind: "bot", name: "Misa" }] }],
          ruleLabels: ["Only Misa"],
        },
      ] });
    },
    async embedText() { return []; },
  };
  const result = await compileBotPowers({
    provider: conflictProvider,
    powers: ["one", "two"].map((id) => ({
      version: 1,
      id,
      name: id === "one" ? "Invisible" : "Selective",
      intent: id === "one" ? "Only Light sees me." : "Only Misa sees me.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    })),
  });
  assert.equal(result.conflicts.length, 1);
  assert.match(result.conflicts[0] ?? "", /Invisible.*Selective/u);
  assert.ok(result.powers.every((power) => power.compileStatus === "error"));
});

function powerDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY, user_id TEXT, conversation_mode TEXT,
      bot_group_ids TEXT, coffee_power_plan_json TEXT
    );
    CREATE TABLE bots (
      id TEXT PRIMARY KEY, user_id TEXT, name TEXT, system_prompt TEXT,
      semantic_facets TEXT, powers_json TEXT
    );
    CREATE TABLE coffee_bot_social_state (
      user_id TEXT, conversation_id TEXT, bot_id TEXT, disposition REAL, updated_at TEXT,
      PRIMARY KEY (user_id, conversation_id, bot_id)
    );
  `);
  return db;
}

test("Coffee resolution freezes named visibility and session-start trait mood", () => {
  const db = powerDb();
  db.prepare("INSERT INTO conversations VALUES (?, ?, 'coffee', ?, NULL)")
    .run("session", "user", JSON.stringify(["ryuk", "light", "harry"]));
  const readyPower = (id: string, name: string, effects: unknown[]) => JSON.stringify([{
    version: 1,
    id,
    name,
    intent: name,
    enabled: true,
    compileStatus: "ready",
    compiled: {
      version: 1,
      sourceHash: botPowerSourceHashV1(name, name),
      selfCue: name,
      observerCue: name,
      effects,
      ruleLabels: [name],
    },
  }]);
  db.prepare("INSERT INTO bots VALUES (?, 'user', ?, ?, ?, ?)").run(
    "ryuk", "Ryuk", "", null,
    readyPower("invisible", "Invisible", [
      { type: "awareness", allowed: [{ kind: "bot", name: "Light Yagami" }] },
      { type: "speech_audience", allowed: [{ kind: "bot", name: "Light Yagami" }] },
    ])
  );
  db.prepare("INSERT INTO bots VALUES (?, 'user', ?, ?, ?, ?)").run(
    "light", "Light Yagami", "detective", null, "[]"
  );
  db.prepare("INSERT INTO bots VALUES (?, 'user', ?, ?, ?, ?)").run(
    "harry", "Harry Potter", "wizard at Hogwarts", null,
    readyPower("cursed", "Cursed", [{
      type: "social_influence", trigger: "session_start", polarity: "negative",
      strength: "large", targets: [{ kind: "trait", trait: "wizard" }],
    }])
  );
  for (const id of ["ryuk", "light", "harry"]) {
    db.prepare("INSERT INTO coffee_bot_social_state VALUES ('user', 'session', ?, 0.5, '')").run(id);
  }
  const plan = resolveCoffeePowersForSession(db, "user", "session");
  assert.equal(coffeePowerBotVisibleTo(plan, "ryuk", "light"), true);
  assert.equal(coffeePowerBotVisibleTo(plan, "ryuk", "harry"), false);
  assert.equal(coffeePowerBotCanSpeak(plan, "ryuk"), true);
  assert.equal(resolveCoffeePowersForSession(db, "user", "session").resolvedAt, plan.resolvedAt);

  db.prepare("INSERT INTO conversations VALUES (?, ?, 'coffee', ?, NULL)")
    .run("session-no-light", "user", JSON.stringify(["ryuk", "harry"]));
  for (const id of ["ryuk", "harry"]) {
    db.prepare("INSERT INTO coffee_bot_social_state VALUES ('user', 'session-no-light', ?, 0.5, '')").run(id);
  }
  const noLightPlan = resolveCoffeePowersForSession(db, "user", "session-no-light");
  assert.equal(coffeePowerBotCanSpeak(noLightPlan, "ryuk"), false);
  assert.match(noLightPlan.warnings.join(" "), /No matching Coffee participant.*Light Yagami/u);
});

test("post-speech influence respects receiver resistance", () => {
  const next = applyCoffeePowerAfterSpeech({
    plan: {
      version: 1,
      resolvedAt: "now",
      warnings: [],
      bots: {
        annoying: {
          botId: "annoying", powerIds: [], selfCue: "", observerCue: "",
          visibleToBotIds: null, speechAudienceBotIds: null, ruleLabels: [], warnings: [],
          effects: [{
            type: "social_influence", trigger: "after_speech", polarity: "negative",
            strength: "large", targets: [{ kind: "bot", name: "Stoic", botId: "stoic" }],
          }],
        },
        stoic: {
          botId: "stoic", powerIds: [], selfCue: "", observerCue: "",
          visibleToBotIds: null, speechAudienceBotIds: null, ruleLabels: [], warnings: [],
          effects: [{ type: "mood_resistance", polarity: "both", strength: "large" }],
        },
      },
    },
    speakerBotId: "annoying",
    socialByBotId: { annoying: { disposition: 0.5 }, stoic: { disposition: 0.5 } },
  });
  assert.ok(Math.abs((next.stoic?.disposition ?? 0) - 0.468) < 1e-9);
});

test("hidden speakers cannot alter unaware bots through post-speech powers", () => {
  const plan = {
    version: 1 as const,
    resolvedAt: "now",
    warnings: [],
    bots: {
      ryuk: {
        botId: "ryuk",
        powerIds: ["hidden-annoyance"],
        selfCue: "",
        observerCue: "",
        visibleToBotIds: ["light"],
        speechAudienceBotIds: ["light"],
        ruleLabels: [],
        warnings: [],
        effects: [{
          type: "social_influence" as const,
          trigger: "after_speech" as const,
          polarity: "negative" as const,
          strength: "large" as const,
          targets: [
            { kind: "bot" as const, name: "Light", botId: "light" },
            { kind: "bot" as const, name: "Harry", botId: "harry" },
          ],
        }],
      },
    },
  };
  const next = applyCoffeePowerAfterSpeech({
    plan,
    speakerBotId: "ryuk",
    socialByBotId: {
      ryuk: { disposition: 0.5 },
      light: { disposition: 0.5 },
      harry: { disposition: 0.5 },
    },
  });
  assert.ok(Math.abs((next.light?.disposition ?? 0) - 0.34) < 1e-9);
  assert.equal(next.harry?.disposition, 0.5);
});
