import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { botPowerSourceHashV1, type CoffeePowerPlanV1 } from "@localai/shared";
import { compileBotPowers } from "../bot-powers.ts";
import {
  applyCoffeePowerAfterSpeech,
  coffeePowerBotCanSpeak,
  coffeePowerBotVisibleTo,
  coffeePowerHistoryForSpeaker,
  coffeePowerHistoryLimitForSpeaker,
  coffeePowerInsightPromptLines,
  coffeePowerRouterPromptLines,
  coffeePowerSpeakerOverride,
  coffeePowerSpeakerPressures,
  coffeePowersPromptForSpeaker,
  resolveCoffeePowersForSession,
} from "../coffee-powers.ts";
import { LocalModelRequestError, type LlmProvider } from "../providers.ts";

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

function resolvedPlan(
  effectsByBotId: Record<string, CoffeePowerPlanV1["bots"][string]["effects"]>,
): CoffeePowerPlanV1 {
  return {
    version: 1,
    resolvedAt: "now",
    warnings: [],
    bots: Object.fromEntries(Object.entries(effectsByBotId).map(([botId, effects]) => [
      botId,
      {
        botId,
        powerIds: [],
        selfCue: "",
        observerCue: "",
        visibleToBotIds: null,
        speechAudienceBotIds: null,
        effects,
        ruleLabels: [],
        warnings: [],
      },
    ])),
  };
}

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

test("compiler accepts the neutral routing, memory, and Insight primitives", async () => {
  const neutralProvider: LlmProvider = {
    name: "local",
    async generateResponse() {
      return JSON.stringify({ powers: [{
        id: "presence",
        selfCue: "Attention and memory bend around this presence.",
        effects: [
          { type: "turn_gravity", direction: "more", strength: "large" },
          {
            type: "response_bond", direction: "toward", strength: "medium",
            targets: [{ kind: "bot", name: "Light" }],
          },
          {
            type: "topic_gravity", direction: "toward", strength: "small",
            topics: ["Justice"],
          },
          {
            type: "selective_memory", mode: "remember", strength: "large",
            targets: [{ kind: "bot", name: "Light" }],
          },
          {
            type: "insight", strength: "medium",
            targets: [{ kind: "bot", name: "Light" }],
          },
        ],
        ruleLabels: ["Unusual presence"],
      }] });
    },
    async embedText() { return []; },
  };
  const result = await compileBotPowers({
    provider: neutralProvider,
    powers: [{
      version: 1,
      id: "presence",
      name: "Unusual Presence",
      intent: "Attention and memory bend around this bot.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  assert.equal(result.powers[0]?.compileStatus, "ready");
  assert.deepEqual(
    result.powers[0]?.compiled?.effects.map((effect) => effect.type),
    ["turn_gravity", "response_bond", "topic_gravity", "selective_memory", "insight"],
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

test("compiler creates gradual table mood rules without consulting the local model", async () => {
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
    botName: "Donald Trump",
    powers: [
      {
        version: 1,
        id: "annoying",
        name: "Annoying",
        intent: "Overtime lowers the mood of surrounding bots.",
        enabled: true,
        compileStatus: "draft",
        compiled: null,
      },
      {
        version: 1,
        id: "encouraging",
        name: "Encouraging",
        intent: "Over time, gradually raises the mood of everyone at the table.",
        enabled: true,
        compileStatus: "draft",
        compiled: null,
      },
    ],
  });
  assert.equal(calls, 0);
  assert.deepEqual(
    result.powers.map((power) => power.compiled?.effects[0]),
    [
      {
        type: "social_influence",
        trigger: "after_speech",
        polarity: "negative",
        strength: "small",
        targets: [{ kind: "all" }],
      },
      {
        type: "social_influence",
        trigger: "after_speech",
        polarity: "positive",
        strength: "small",
        targets: [{ kind: "all" }],
      },
    ],
  );
});

test("compiler makes intimidation a strong session-start social influence", async () => {
  let calls = 0;
  const unusedProvider: LlmProvider = {
    name: "local",
    async generateResponse() {
      calls += 1;
      throw new Error("provider should not be needed");
    },
    async embedText() {
      return [];
    },
  };
  const result = await compileBotPowers({
    provider: unusedProvider,
    botName: "Darth Vader",
    powers: [
      {
        version: 1,
        id: "intimidation",
        name: "Intimidation",
        intent: "Strikes fear in other bots.",
        enabled: true,
        compileStatus: "draft",
        compiled: null,
      },
    ],
  });

  assert.equal(calls, 0);
  assert.equal(result.powers[0]?.compileStatus, "ready");
  assert.deepEqual(result.powers[0]?.compiled, {
    version: 1,
    sourceHash: botPowerSourceHashV1(
      "Intimidation",
      "Strikes fear in other bots.",
    ),
    selfCue:
      "Project quiet, disciplined menace without demanding that others describe their fear.",
    observerCue:
      "Darth Vader's controlled presence creates immediate pressure; let it register without abandoning your personality or role.",
    effects: [
      {
        type: "social_influence",
        trigger: "session_start",
        polarity: "negative",
        strength: "large",
        targets: [{ kind: "all" }],
      },
    ],
    ruleLabels: ["Intimidates the room"],
  });
});

test("compiler makes bots who dislike coffee refuse it without consulting the local model", async () => {
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
    botName: "Theodore",
    powers: [{
      version: 1,
      id: "dislikes-coffee",
      name: "Dislikes Coffee",
      intent: "This bot dislikes coffee.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  assert.equal(calls, 0);
  assert.equal(result.powers[0]?.compileStatus, "ready");
  assert.deepEqual(result.powers[0]?.compiled, {
    version: 1,
    sourceHash: botPowerSourceHashV1(
      "Dislikes Coffee",
      "This bot dislikes coffee.",
    ),
    selfCue: "You dislike coffee and do not drink it.",
    observerCue: "Theodore refuses to drink coffee.",
    effects: [{ type: "cup_rate", rate: "none" }],
    ruleLabels: ["Refuses coffee"],
  });
});

test("compiler leaves ambiguous coffee dislikes to the model", async () => {
  let calls = 0;
  const creativeProvider: LlmProvider = {
    name: "local",
    async generateResponse() {
      calls += 1;
      return JSON.stringify({ powers: [{
        id: "coffee-snob",
        selfCue: "Reject coffee that has gone cold.",
        effects: [{
          type: "action_bias",
          cue: "Occasionally inspect the coffee temperature.",
          frequency: "occasional",
        }],
        ruleLabels: ["Dislikes cold coffee"],
      }] });
    },
    async embedText() { return []; },
  };
  const result = await compileBotPowers({
    provider: creativeProvider,
    powers: [{
      version: 1,
      id: "coffee-snob",
      name: "Coffee Snob",
      intent: "Dislikes coffee once it has gone cold.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  assert.equal(calls, 1);
  assert.equal(result.powers[0]?.compiled?.effects[0]?.type, "action_bias");
});

test("compiler leaves ambiguous mood-flavored creative powers to the model", async () => {
  let calls = 0;
  const creativeProvider: LlmProvider = {
    name: "local",
    async generateResponse() {
      calls += 1;
      return JSON.stringify({ powers: [{
        id: "comic",
        selfCue: "Use humor when tension rises.",
        effects: [{ type: "action_bias", cue: "Crack a joke.", frequency: "occasional" }],
        ruleLabels: ["Tension-breaking humor"],
      }] });
    },
    async embedText() { return []; },
  };
  const result = await compileBotPowers({
    provider: creativeProvider,
    powers: [{
      version: 1,
      id: "comic",
      name: "Comic Relief",
      intent: "Tell a joke when the table mood gets tense.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  assert.equal(calls, 1);
  assert.equal(result.powers[0]?.compiled?.effects[0]?.type, "action_bias");
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
    diagnosticModel: "llama3.2",
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
  assert.match(result.powers[0]?.compileError ?? "", /Provider: local; model: llama3\.2/u);
});

test("compiler preserves drafts and distinguishes categorized local failures", async () => {
  const scenarios: Array<{
    kind: LocalModelRequestError["kind"];
    expected: RegExp;
  }> = [
    { kind: "service_unavailable", expected: /service unavailable/u },
    { kind: "endpoint_not_found", expected: /chat endpoint not found/u },
    { kind: "model_unavailable", expected: /configured model unavailable/u },
    {
      kind: "authentication_or_configuration",
      expected: /authentication or configuration failure/u,
    },
  ];

  for (const scenario of scenarios) {
    const failingProvider: LlmProvider = {
      name: "local",
      diagnosticModel: "llama3.2",
      async generateResponse() {
        throw new LocalModelRequestError(scenario.kind);
      },
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
    const power = result.powers[0];
    assert.equal(power?.name, "Respirator");
    assert.equal(power?.intent, "Mechanical breathing recurs in actions.");
    assert.equal(power?.compileStatus, "error");
    assert.equal(power?.compiled, null);
    assert.match(power?.compileError ?? "", scenario.expected);
    assert.match(power?.compileError ?? "", /Provider: local; model: llama3\.2/u);
  }
});

test("compiler redacts raw provider errors and unsafe model context", async () => {
  const failingProvider: LlmProvider = {
    name: "local",
    diagnosticModel: "http://admin:super-secret@192.168.1.99:11434",
    async generateResponse() {
      throw new Error(
        "fetch failed for http://admin:super-secret@192.168.1.99:11434/api/chat?api_key=leaked"
      );
    },
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
  const message = result.powers[0]?.compileError ?? "";
  assert.match(message, /request failed/u);
  assert.match(message, /Provider: local; model: configured model/u);
  assert.doesNotMatch(message, /192\.168|super-secret|api_key|http:/iu);
});

test("compiler reports invalid output after one bounded repair attempt", async () => {
  let calls = 0;
  const malformedProvider: LlmProvider = {
    name: "local",
    diagnosticModel: "llama3.2",
    async generateResponse() {
      calls += 1;
      return "not compiler JSON";
    },
    async embedText() { return []; },
  };
  const result = await compileBotPowers({
    provider: malformedProvider,
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
  assert.equal(result.powers[0]?.name, "Respirator");
  assert.equal(result.powers[0]?.intent, "Mechanical breathing recurs in actions.");
  assert.equal(result.powers[0]?.compileStatus, "error");
  assert.match(result.powers[0]?.compileError ?? "", /invalid compiler output/u);
  assert.match(result.powers[0]?.compileError ?? "", /Provider: local; model: llama3\.2/u);
});

test("a failed draft can be retried without recreating it", async () => {
  const failingProvider: LlmProvider = {
    name: "local",
    diagnosticModel: "llama3.2",
    async generateResponse() {
      throw new LocalModelRequestError("model_unavailable");
    },
    async embedText() { return []; },
  };
  const failed = await compileBotPowers({
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

  const retryProvider: LlmProvider = {
    name: "local",
    diagnosticModel: "llama3.2",
    async generateResponse() {
      return JSON.stringify({ powers: [{
        id: "respirator",
        selfCue: "Mechanical breathing punctuates tense moments.",
        effects: [{
          type: "action_bias",
          cue: "Mention mechanical breathing.",
          frequency: "occasional",
        }],
        ruleLabels: ["Mechanical breathing"],
      }] });
    },
    async embedText() { return []; },
  };
  const retried = await compileBotPowers({
    provider: retryProvider,
    powers: failed.powers,
  });
  assert.equal(retried.powers[0]?.name, "Respirator");
  assert.equal(retried.powers[0]?.intent, "Mechanical breathing recurs in actions.");
  assert.equal(retried.powers[0]?.compileStatus, "ready");
  assert.equal(retried.powers[0]?.compiled?.effects[0]?.type, "action_bias");
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
    "light", "Light Yagami", "detective", null,
    readyPower("fixated", "Fixated", [
      {
        type: "response_bond", direction: "toward", strength: "medium",
        targets: [{ kind: "bot", name: "Ryuk" }],
      },
      {
        type: "selective_memory", mode: "remember", strength: "large",
        targets: [{ kind: "trait", trait: "wizard" }],
      },
      {
        type: "insight", strength: "medium",
        targets: [{ kind: "bot", name: "Ryuk" }],
      },
    ])
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
  assert.deepEqual(plan.bots.light?.effects, [
    {
      type: "response_bond", direction: "toward", strength: "medium",
      targets: [{ kind: "bot", name: "Ryuk", botId: "ryuk" }],
    },
    {
      type: "selective_memory", mode: "remember", strength: "large",
      targets: [{ kind: "bot", name: "Harry Potter", botId: "harry" }],
    },
    {
      type: "insight", strength: "medium",
      targets: [{ kind: "bot", name: "Ryuk", botId: "ryuk" }],
    },
  ]);
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

test("Coffee frames private perception for permitted and unaware speakers", () => {
  const plan = {
    version: 1 as const,
    resolvedAt: "now",
    warnings: [],
    bots: {
      ryuk: {
        botId: "ryuk",
        powerIds: ["invisible", "introvert"],
        selfCue: "Address only Light.",
        observerCue: "Only Light can perceive and hear Ryuk.",
        visibleToBotIds: ["light"],
        speechAudienceBotIds: ["light"],
        effects: [],
        ruleLabels: [],
        warnings: [],
      },
    },
  };

  const lightPrompt = coffeePowersPromptForSpeaker(
    plan,
    "light",
    ["ryuk", "carl"],
  );
  assert.match(lightPrompt, /Private perception/u);
  assert.match(lightPrompt, /addressing empty space/u);
  assert.match(lightPrompt, /intentional in-character choice/u);
  assert.match(lightPrompt, /Only Light can perceive and hear Ryuk/u);

  const carlPrompt = coffeePowersPromptForSpeaker(plan, "carl", ["light"]);
  assert.match(carlPrompt, /Perception boundary/u);
  assert.match(carlPrompt, /only to people and lines present/u);
  assert.match(carlPrompt, /never claim to see, hear, quote, or answer/u);
  assert.doesNotMatch(carlPrompt, /Ryuk/u);
});

test("Coffee speaker pressures are contextual, deterministic, and capped", () => {
  const plan = resolvedPlan({
    gravity: [
      { type: "turn_gravity", direction: "more", strength: "small" },
      {
        type: "topic_gravity", direction: "toward", strength: "large",
        topics: ["justice"],
      },
    ],
    bonded: [{
      type: "response_bond", direction: "toward", strength: "medium",
      targets: [{ kind: "bot", name: "Light", botId: "light" }],
    }],
    reserved: [{ type: "turn_gravity", direction: "less", strength: "large" }],
  });
  assert.deepEqual(coffeePowerSpeakerPressures({
    plan,
    candidateBotIds: ["gravity", "bonded", "reserved"],
    lastSpeakerBotId: "light",
    contextText: "Is justice ever neutral?",
  }), [
    { botId: "gravity", score: 3 },
    { botId: "bonded", score: 2 },
    { botId: "reserved", score: -3 },
  ]);
  assert.deepEqual(coffeePowerSpeakerPressures({
    plan,
    candidateBotIds: ["gravity", "bonded"],
    lastSpeakerBotId: "other",
    contextText: "Let us discuss apples.",
  }), [
    { botId: "gravity", score: 1 },
    { botId: "bonded", score: 0 },
  ]);
  assert.equal(coffeePowerSpeakerOverride({
    plan,
    candidateBotIds: ["gravity", "bonded"],
    pickedBotId: "bonded",
    lastSpeakerBotId: "other",
    contextText: "Apples",
  }), null);
  assert.deepEqual(coffeePowerSpeakerOverride({
    plan,
    candidateBotIds: ["gravity", "bonded", "reserved"],
    pickedBotId: "reserved",
    lastSpeakerBotId: "light",
    contextText: "Justice",
  }), { botId: "gravity", score: 3 });
  assert.equal(coffeePowerSpeakerOverride({
    plan,
    candidateBotIds: ["gravity", "reserved"],
    pickedBotId: "reserved",
    preservePickedBot: true,
    lastSpeakerBotId: "light",
    contextText: "Justice",
  }), null);
  assert.match(coffeePowerRouterPromptLines({
    plan,
    group: [
      { id: "gravity", name: "Gravity" },
      { id: "bonded", name: "Bonded" },
      { id: "reserved", name: "Reserved" },
    ],
    lastSpeakerBotId: "light",
    contextText: "Justice",
  }).join("\n"), /Gravity: \+3/u);
});

test("Coffee selective memory changes only the speaker's bounded history view", () => {
  const history = Array.from({ length: 12 }, (_, index) => ({
    id: `message-${index}`,
    role: index % 2 === 0 ? "assistant" : "user",
    botId: index % 4 === 0 ? "light" : index % 2 === 0 ? "ryuk" : null,
  }));
  const original = structuredClone(history);
  const rememberPlan = resolvedPlan({
    observer: [{
      type: "selective_memory", mode: "remember", strength: "large",
      targets: [{ kind: "bot", name: "Light", botId: "light" }],
    }],
  });
  assert.equal(coffeePowerHistoryLimitForSpeaker(rememberPlan, "observer", 6), 32);
  assert.deepEqual(
    coffeePowerHistoryForSpeaker({
      plan: rememberPlan,
      speakerBotId: "observer",
      history,
      baseLimit: 4,
    }).map((message) => message.id),
    ["message-0", "message-4", "message-8", "message-9", "message-10", "message-11"],
  );

  const forgetPlan = resolvedPlan({
    observer: [{
      type: "selective_memory", mode: "forget", strength: "large",
      targets: [{ kind: "bot", name: "Light", botId: "light" }],
    }],
  });
  assert.deepEqual(
    coffeePowerHistoryForSpeaker({
      plan: forgetPlan,
      speakerBotId: "observer",
      history,
      baseLimit: 12,
    }).filter((message) => message.botId === "light").map((message) => message.id),
    ["message-8"],
  );
  assert.deepEqual(history, original);
});

test("Coffee speaker prompts make response, topic, and memory Powers subjective", () => {
  const plan = resolvedPlan({
    light: [
      {
        type: "response_bond", direction: "toward", strength: "medium",
        targets: [{ kind: "bot", name: "Ryuk", botId: "ryuk" }],
      },
      {
        type: "topic_gravity", direction: "away", strength: "small",
        topics: ["small talk"],
      },
      {
        type: "selective_memory", mode: "remember", strength: "large",
        targets: [{ kind: "bot", name: "Ryuk", botId: "ryuk" }],
      },
    ],
  });
  const prompt = coffeePowersPromptForSpeaker(plan, "light", ["ryuk"]);
  assert.match(prompt, /Response bond.*Ryuk/u);
  assert.match(prompt, /Topic boundary.*small talk/u);
  assert.match(prompt, /earlier words from Ryuk remain unusually vivid/u);
});

test("Coffee Insight gives only its owner bounded qualitative reads of visible targets", () => {
  const plan = resolvedPlan({
    seer: [{
      type: "insight", strength: "large",
      targets: [
        { kind: "bot", name: "Ryuk", botId: "ryuk" },
        { kind: "bot", name: "Hidden", botId: "hidden" },
      ],
    }],
  });
  const socialByBotId = {
    ryuk: {
      disposition: 0.2,
      valuesFriction: 0.9,
      restraint: 0.85,
      engagement: 0.75,
      leavePressure: 0.82,
    },
    hidden: {
      disposition: 0.1,
      valuesFriction: 0.95,
      restraint: 0.9,
      engagement: 0.1,
      leavePressure: 0.9,
    },
  };
  const lines = coffeePowerInsightPromptLines({
    plan,
    speakerBotId: "seer",
    visiblePeerBotIds: ["ryuk"],
    socialByBotId,
  });
  const prompt = lines.join("\n");
  assert.match(prompt, /Private Insight/u);
  assert.match(prompt, /Ryuk/u);
  assert.match(prompt, /looks close to withdrawing/u);
  assert.doesNotMatch(prompt, /Hidden/u);
  assert.doesNotMatch(prompt, /\d/u);
  assert.deepEqual(coffeePowerInsightPromptLines({
    plan,
    speakerBotId: "ryuk",
    visiblePeerBotIds: ["seer"],
    socialByBotId,
  }), []);
});

test("Coffee Insight strength bounds how many social tells become available", () => {
  const socialByBotId = {
    target: {
      disposition: 0.15,
      valuesFriction: 0.9,
      restraint: 0.85,
      engagement: 0.8,
      leavePressure: 0.9,
    },
  };
  const insightPrompt = (strength: "small" | "medium" | "large") =>
    coffeePowerInsightPromptLines({
      plan: resolvedPlan({
        seer: [{
          type: "insight", strength,
          targets: [{ kind: "bot", name: "Target", botId: "target" }],
        }],
      }),
      speakerBotId: "seer",
      visiblePeerBotIds: ["target"],
      socialByBotId,
    }).join("\n");
  assert.equal(insightPrompt("small").match(/;/gu)?.length ?? 0, 0);
  assert.equal(insightPrompt("medium").match(/;/gu)?.length ?? 0, 1);
  assert.equal(insightPrompt("large").match(/;/gu)?.length ?? 0, 2);
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
