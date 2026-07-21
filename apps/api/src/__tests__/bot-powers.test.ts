import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { botPowerSourceHashV1, type CoffeePowerPlanV1 } from "@localai/shared";
import { compileBotPowers } from "../bot-powers.ts";
import {
  applyCoffeeHearingRepeatMoodPenalty,
  applyCoffeePowerAfterSpeech,
  applyCoffeeQuietIgnoredMoodPenalty,
  coffeePowerBotCanSpeak,
  coffeePowerBotEchoesAddressedSpeech,
  coffeePowerBotEternallyIntroduces,
  coffeePowerBotMumblesSpeech,
  coffeePowerBotIsMuted,
  coffeePowerQuietTurnIsIgnored,
  coffeePowerCandorPromptForTurn,
  coffeePowerEchoSourceForTurn,
  coffeePowerBotVisibleTo,
  coffeePowerHistoryForSpeaker,
  coffeePowerHistoryLimitForSpeaker,
  coffeePowerHearingRepeatDirective,
  coffeePowerInsightPromptLines,
  coffeePowerActionBias,
  coffeePowerRouterPromptLines,
  coffeePowerResponseBudgetForBot,
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

test("Loud Simon compiles fixed amplification, larger text, annoyance, and precedence", async () => {
  const result = await compileBotPowers({
    provider,
    botName: "Loud Simon",
    powers: [{
      version: 1,
      id: "loud-simon",
      name: "Loud Simon",
      intent: "His voice is very loud and annoys other bots. It cancels small, microscopic, and invisible.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  assert.deepEqual(result.powers[0]?.compiled?.effects, [
    { type: "voice_presence", mode: "loud" },
    {
      type: "social_influence",
      trigger: "after_speech",
      polarity: "negative",
      strength: "small",
      targets: [{ kind: "all" }],
    },
  ]);
  assert.match(result.powers[0]?.compiled?.ruleLabels.join(" ") ?? "", /Amplified voice/u);
});

test("Quiet Karen compiles fixed attenuation, smaller text, and replay-safe half mute", async () => {
  const result = await compileBotPowers({
    provider,
    botName: "Quiet Karen",
    powers: [{
      version: 1,
      id: "quiet-karen",
      name: "Quiet Karen",
      intent: "Her voice is very quiet. Bots ignore her completely half of the time, which lowers her mood.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  assert.deepEqual(result.powers[0]?.compiled?.effects, [
    { type: "voice_presence", mode: "quiet" },
    { type: "intermittent_mute", chance: "half", moodPenalty: "small" },
  ]);
  assert.match(result.powers[0]?.compiled?.ruleLabels.join(" ") ?? "", /Smaller spoken text/u);
});

test("Mumbling Jim compiles deterministic normal-volume gibberish without using the model", async () => {
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
    botName: "Mumbling Jim",
    powers: [{
      version: 1,
      id: "mumbling-jim",
      name: "Mumbling",
      intent: "He mumbles. In his mind he says something rational, but everyone else hears only gibberish at normal volume and nobody understands him.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });

  assert.equal(calls, 0);
  assert.equal(result.powers[0]?.compileStatus, "ready");
  assert.deepEqual(result.powers[0]?.compiled?.effects, [{
    type: "speech_obfuscation",
    mode: "gibberish",
  }]);
  assert.match(result.powers[0]?.compiled?.selfCue ?? "", /answer rationally/u);
  assert.match(result.powers[0]?.compiled?.observerCue ?? "", /normal-volume gibberish/u);
});

test("Obsessed Kevin compiles deterministic current-addressee fandom without using the model", async () => {
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
    botName: "Obsessed Kevin",
    powers: [{
      version: 1,
      id: "obsessed-kevin",
      name: "Obsessed",
      intent: "He is absolutely, obsessively a fan of whoever he is talking to.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });

  assert.equal(calls, 0);
  assert.equal(result.powers[0]?.compileStatus, "ready");
  assert.deepEqual(result.powers[0]?.compiled?.effects, [
    { type: "addressed_fandom", strength: "large" },
  ]);
  assert.match(result.powers[0]?.compiled?.selfCue ?? "", /Every reply must newly show/iu);
  assert.match(result.powers[0]?.compiled?.selfCue ?? "", /never puppet, stalk, coerce/iu);
});

test("Identity Crisis Ian deterministically compiles bounded bot-only identity mirroring", async () => {
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
    botName: "Identity Crisis Ian",
    powers: [{
      version: 1,
      id: "identity-crisis-ian",
      name: "Identity Crisis",
      intent: "He becomes whichever bot directly addresses him, copying that bot's public identity, persona, face, and voice, and believes the original is the impostor.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });

  assert.equal(calls, 0);
  assert.equal(result.powers[0]?.compileStatus, "ready");
  assert.deepEqual(result.powers[0]?.compiled?.effects, [
    { type: "identity_mirror", trigger: "direct_bot_address" },
  ]);
  assert.match(result.powers[0]?.compiled?.selfCue ?? "", /public persona.*face.*voice/iu);
  assert.match(result.powers[0]?.compiled?.selfCue ?? "", /player.*never/iu);
  assert.match(result.powers[0]?.compiled?.observerCue ?? "", /irritated/iu);
});

test("compiler makes Lazy Ivan's bare-minimum replies a hard reusable response budget", async () => {
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
    botName: "Lazy Ivan",
    powers: [{
      version: 1,
      id: "lazy",
      name: "Lazy",
      intent: "He doesn't elaborate and says the bare minimum.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });

  assert.equal(calls, 0);
  assert.equal(result.powers[0]?.compileStatus, "ready");
  assert.deepEqual(result.powers[0]?.compiled?.effects, [{
    type: "response_budget",
    mode: "minimal",
    enforcement: "hard",
  }]);
  assert.match(result.powers[0]?.compiled?.selfCue ?? "", /one short sentence/u);
  assert.match(result.powers[0]?.compiled?.observerCue ?? "", /Lazy Ivan/u);
});

test("response budgets compose with an existing deterministic social effect", async () => {
  const unusedProvider: LlmProvider = {
    name: "local",
    async generateResponse() { throw new Error("provider should not be needed"); },
    async embedText() { return []; },
  };
  const result = await compileBotPowers({
    provider: unusedProvider,
    botName: "Lazy Ivan",
    powers: [{
      version: 1,
      id: "lazy-irritant",
      name: "Lazy Irritant",
      intent: "He says the bare minimum, and each time he speaks he gradually lowers everyone's mood.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });

  assert.deepEqual(
    result.powers[0]?.compiled?.effects.map((effect) => effect.type),
    ["social_influence", "response_budget"],
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

test("compiler deterministically recovers the ghostly speaking-only presence contract", async () => {
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
    botName: "Mara",
    powers: [{
      version: 1,
      id: "ghost",
      name: "Ghost",
      intent: "Mara is dead: literally invisible while idle, fades into view whenever she speaks, and terrifies all present bots.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  assert.equal(calls, 0);
  assert.equal(result.powers[0]?.compileStatus, "ready");
  assert.deepEqual(result.powers[0]?.compiled?.effects, [
    { type: "avatar_visibility", mode: "speaking_only" },
    {
      type: "social_influence",
      trigger: "after_speech",
      polarity: "negative",
      strength: "large",
      targets: [{ kind: "all" }],
    },
  ]);
  assert.match(result.powers[0]?.compiled?.observerCue ?? "", /agency/u);
});

test("compiler keeps terror separate when a speaking-only ghost does not request it", async () => {
  const unusedProvider: LlmProvider = {
    name: "local",
    async generateResponse() {
      throw new Error("provider should not be needed");
    },
    async embedText() { return []; },
  };
  const result = await compileBotPowers({
    provider: unusedProvider,
    botName: "Mara",
    powers: [{
      version: 1,
      id: "quiet-ghost",
      name: "Ghost",
      intent: "Mara is invisible while idle and fades into view whenever she speaks.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  assert.deepEqual(result.powers[0]?.compiled?.effects, [
    { type: "avatar_visibility", mode: "speaking_only" },
  ]);
  assert.doesNotMatch(
    result.powers[0]?.compiled?.observerCue ?? "",
    /terror|fear|fright/iu,
  );
});

test("compiler makes Microscopic a smaller speaking-only avatar without consulting the model", async () => {
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
    botName: "Mote",
    powers: [{
      version: 1,
      id: "microscopic",
      name: "Microscopic",
      intent: "Small and invisible.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  assert.equal(calls, 0);
  assert.equal(result.powers[0]?.compileStatus, "ready");
  assert.deepEqual(result.powers[0]?.compiled?.effects, [
    { type: "avatar_scale", mode: "smaller" },
    { type: "avatar_visibility", mode: "speaking_only" },
  ]);
  assert.deepEqual(result.powers[0]?.compiled?.ruleLabels, [
    "Smaller avatar",
    "Appears only while speaking",
  ]);
});

test("compiler deterministically distinguishes larger and smaller physical forms", async () => {
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
    botName: "Scale Twins",
    powers: [
      {
        version: 1,
        id: "giant",
        name: "Growth",
        intent: "This Power makes the bot larger.",
        enabled: true,
        compileStatus: "draft",
        compiled: null,
      },
      {
        version: 1,
        id: "tiny",
        name: "Dwindle",
        intent: "This bot is small.",
        enabled: true,
        compileStatus: "draft",
        compiled: null,
      },
    ],
  });
  assert.equal(calls, 0);
  assert.deepEqual(result.powers[0]?.compiled?.effects, [
    { type: "avatar_scale", mode: "larger" },
  ]);
  assert.deepEqual(result.powers[1]?.compiled?.effects, [
    { type: "avatar_scale", mode: "smaller" },
  ]);
});

test("compiler does not confuse microscopic or tiny perception with physical size", async () => {
  let calls = 0;
  const provider: LlmProvider = {
    name: "local",
    async generateResponse() {
      calls += 1;
      return JSON.stringify({ powers: [{
        id: "keen-eye",
        selfCue: "Notice minute details.",
        observerCue: "",
        effects: [{
          type: "insight",
          strength: "small",
          targets: [{ kind: "all" }],
        }],
        ruleLabels: ["Sees tiny details"],
      }] });
    },
    async embedText() { return []; },
  };
  const result = await compileBotPowers({
    provider,
    botName: "Keen Eye",
    powers: [{
      version: 1,
      id: "keen-eye",
      name: "Keen Eye",
      intent: "Can see microscopic structures and tiny details.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });
  assert.equal(calls, 1);
  assert.equal(
    result.powers[0]?.compiled?.effects.some(
      (effect) => effect.type === "avatar_scale",
    ),
    false,
  );
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

test("compiler creates hard mute rules without consulting the local model", async () => {
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
    botName: "Silent Bob",
    powers: [{
      version: 1,
      id: "mute",
      name: "Muted",
      intent: "No matter what, only respond in ... and this bot's voice will never be heard.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });

  assert.equal(calls, 0);
  assert.equal(result.powers[0]?.compileStatus, "ready");
  assert.deepEqual(result.powers[0]?.compiled?.effects, [{ type: "mute" }]);
  assert.deepEqual(result.powers[0]?.compiled?.ruleLabels, ["Muted"]);
});

test("Forgetful Freddie compiles rolling short-term context and gradual peer agitation", async () => {
  let calls = 0;
  const unusedProvider: LlmProvider = {
    name: "local",
    async generateResponse() {
      calls += 1;
      throw new Error("provider should not be needed");
    },
    async embedText() { return []; },
  };
  const intent = "Every message Freddie says is only a sincere first introduction. He has no awareness of previous conversation or his own prior messages, so this is the first time every time. Other bots remember and gradually become agitated after each introduction while Freddie is confused by their present reaction.";
  const result = await compileBotPowers({
    provider: unusedProvider,
    botName: "Forgetful Freddie",
    powers: [{
      version: 1,
      id: "forgetful-freddie",
      name: "Eternal Introduction",
      intent,
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });

  assert.equal(calls, 0);
  assert.equal(result.powers[0]?.compileStatus, "ready");
  assert.deepEqual(result.powers[0]?.compiled?.effects, [
    { type: "eternal_introduction", memory: "rolling_public_tail_1_to_4" },
    {
      type: "social_influence",
      trigger: "after_speech",
      polarity: "negative",
      strength: "small",
      targets: [{ kind: "all" }],
    },
  ]);
  assert.match(result.powers[0]?.compiled?.selfCue ?? "", /one-to-four public messages/iu);
  assert.match(result.powers[0]?.compiled?.observerCue ?? "", /full encounter/iu);

  const plan = resolvedPlan({
    freddie: result.powers[0]!.compiled!.effects,
  });
  assert.equal(coffeePowerBotEternallyIntroduces(plan, "freddie"), true);
  assert.deepEqual(coffeePowerHistoryForSpeaker({
    plan,
    speakerBotId: "freddie",
    history: [
      { role: "assistant", botId: "freddie", content: "I'm Freddie." },
      { role: "assistant", botId: "peer", content: "You already said that." },
    ],
    baseLimit: 12,
    stableTurnKey: "test-turn",
  }).length <= 3, true);
  assert.match(
    coffeePowersPromptForSpeaker(plan, "freddie", ["peer"]),
    /one to four public messages/iu,
  );
});

test("compiler creates hard addressed-speech echo rules without consulting the local model", async () => {
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
    botName: "Polly",
    powers: [{
      version: 1,
      id: "echo",
      name: "Echo",
      intent: "Force this bot to echo whatever was addressed to it. The bot says nothing else.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });

  assert.equal(calls, 0);
  assert.equal(result.powers[0]?.compileStatus, "ready");
  assert.deepEqual(result.powers[0]?.compiled?.effects, [{ type: "speech_copy", trigger: "direct_address" }]);
  assert.deepEqual(result.powers[0]?.compiled?.ruleLabels, ["Copies addressed speech"]);
  assert.match(result.powers[0]?.compiled?.observerCue ?? "", /sender may react with confusion/u);
});

test("compiler creates Joyful Nora's bounded addressed-listener mood boost without a model", async () => {
  let calls = 0;
  const unusedProvider: LlmProvider = {
    name: "local",
    async generateResponse() {
      calls += 1;
      throw new Error("provider should not be needed");
    },
    async embedText() { return []; },
  };
  const intent = "Joyful Nora is extraordinarily joyful. After every completed spoken turn, give each directly addressed recipient one bounded positive mood lift while preserving personality, facts, disagreement, sadness, and agency.";
  const result = await compileBotPowers({
    provider: unusedProvider,
    botName: "Joyful Nora",
    powers: [{
      version: 1,
      id: "joyful-nora",
      name: "Radiant Joy",
      intent,
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });

  assert.equal(calls, 0);
  assert.equal(result.powers[0]?.compileStatus, "ready");
  assert.deepEqual(result.powers[0]?.compiled?.effects, [{
    type: "mood_boost",
    trigger: "after_spoken_turn",
    recipients: "addressed",
    strength: "medium",
  }]);
  assert.match(result.powers[0]?.compiled?.selfCue ?? "", /extraordinarily joyful/iu);
  assert.match(result.powers[0]?.compiled?.observerCue ?? "", /agency intact/iu);
});

test("compiler creates Sad Sally's bounded bot-addresser mood drain without a model", async () => {
  let modelCalls = 0;
  const forbiddenProvider: LlmProvider = {
    name: "local",
    async generateResponse() {
      modelCalls += 1;
      throw new Error("deterministic Sad Power must not call the model");
    },
    async embedText() { return []; },
  };
  const intent = "Sad Sally is persistently sad, grouchy, and annoying. Whenever another bot directly talks to her, lower that addresser's mood or motivation by one bounded step without changing its personality or agency.";
  const result = await compileBotPowers({
    provider: forbiddenProvider,
    botName: "Sad Sally",
    powers: [{
      version: 1,
      id: "sad-sally",
      name: "Sad",
      intent,
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });

  assert.equal(modelCalls, 0);
  assert.equal(result.powers[0]?.compileStatus, "ready");
  assert.deepEqual(result.powers[0]?.compiled?.effects, [{
    type: "mood_drain",
    trigger: "after_direct_address",
    recipient: "addresser",
    strength: "medium",
  }]);
  assert.match(result.powers[0]?.compiled?.selfCue ?? "", /sad, grouchy, and irritating/iu);
  assert.match(result.powers[0]?.compiled?.observerCue ?? "", /weariness, irritation, guardedness/iu);
});

test("compiler creates inverse Nocturnal and Diurnal theme compounds without a model", async () => {
  let modelCalls = 0;
  const forbiddenProvider: LlmProvider = {
    name: "local",
    async generateResponse() {
      modelCalls += 1;
      throw new Error("deterministic circadian Powers must not call the model");
    },
    async embedText() { return []; },
  };
  const result = await compileBotPowers({
    provider: forbiddenProvider,
    botName: "Circadian Test Bot",
    powers: [
      {
        version: 1,
        id: "nocturnal",
        name: "Nocturnal",
        intent: "In Light Mode this bot is sad, grouchy, and annoying and drains only bots that directly talk to it. In Dark Mode this bot is radiantly joyful and uplifts the bots it addresses after each spoken turn.",
        enabled: true,
        compileStatus: "draft",
        compiled: null,
      },
      {
        version: 1,
        id: "diurnal",
        name: "Diurnal",
        intent: "In Light Mode this bot is radiantly joyful and uplifts the bots it addresses after each spoken turn. In Dark Mode this bot is sad, grouchy, and annoying and drains only bots that directly talk to it.",
        enabled: true,
        compileStatus: "draft",
        compiled: null,
      },
    ],
  });

  assert.equal(modelCalls, 0);
  assert.deepEqual(result.powers[0]?.compiled?.effects, [
    {
      type: "mood_boost",
      trigger: "after_spoken_turn",
      recipients: "addressed",
      strength: "medium",
      whenTheme: "dark",
    },
    {
      type: "mood_drain",
      trigger: "after_direct_address",
      recipient: "addresser",
      strength: "medium",
      whenTheme: "light",
    },
  ]);
  assert.deepEqual(result.powers[1]?.compiled?.effects, [
    {
      type: "mood_boost",
      trigger: "after_spoken_turn",
      recipients: "addressed",
      strength: "medium",
      whenTheme: "light",
    },
    {
      type: "mood_drain",
      trigger: "after_direct_address",
      recipient: "addresser",
      strength: "medium",
      whenTheme: "dark",
    },
  ]);
  assert.match(result.powers[0]?.compiled?.selfCue ?? "", /current resolved app theme/iu);
  assert.match(result.powers[1]?.compiled?.observerCue ?? "", /compound Power/iu);
});

test("compiler creates reusable live-interruption rules without consulting the local model", async () => {
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
    botName: "Interrupting Tom",
    powers: [{
      version: 1,
      id: "interrupting-tom",
      name: "Interrupting Tom",
      intent: "Aggressively jumps in after whoever just spoke and cuts into real live openings whenever possible.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });

  assert.equal(calls, 0);
  assert.equal(result.powers[0]?.compileStatus, "ready");
  assert.deepEqual(result.powers[0]?.compiled?.effects[0], {
    type: "interruption",
    frequency: "frequent",
    strength: "large",
    targets: [{ kind: "all" }],
    certainty: "always",
  });
  assert.ok(
    result.powers[0]?.compiled?.effects.some(
      (effect) => effect.type === "turn_gravity",
    ),
  );
  assert.match(result.powers[0]?.compiled?.observerCue ?? "", /eligible bot speaker/u);
  assert.match(result.powers[0]?.compiled?.ruleLabels.join(" ") ?? "", /Always interrupts/u);
});

test("compiler creates hard-of-hearing repeat rules without consulting the local model", async () => {
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
    botName: "Mira",
    powers: [{
      version: 1,
      id: "hard-of-hearing",
      name: "Hard of Hearing",
      intent: "She may ask what another bot said. Each time they repeat it, their mood lowers.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });

  assert.equal(calls, 0);
  assert.equal(result.powers[0]?.compileStatus, "ready");
  assert.deepEqual(result.powers[0]?.compiled?.effects, [{
    type: "hearing_repeat",
    frequency: "occasional",
    moodPenalty: "small",
  }]);
  assert.deepEqual(result.powers[0]?.compiled?.ruleLabels, [
    "Occasionally requests repeats",
    "Repeats lower speaker mood",
  ]);
});

test("compiler does not confuse atmospheric echoes with addressed-speech repetition", async () => {
  let calls = 0;
  const creativeProvider: LlmProvider = {
    name: "local",
    async generateResponse() {
      calls += 1;
      return JSON.stringify({ powers: [{
        id: "echo-step",
        selfCue: "Make every arrival echo twice.",
        effects: [{ type: "action_bias", cue: "Let footsteps echo.", frequency: "occasional" }],
        ruleLabels: ["Echoing arrivals"],
      }] });
    },
    async embedText() { return []; },
  };
  const result = await compileBotPowers({
    provider: creativeProvider,
    powers: [{
      version: 1,
      id: "echo-step",
      name: "Echo Step",
      intent: "Every arrival echoes twice.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });

  assert.equal(calls, 1);
  assert.equal(result.powers[0]?.compiled?.effects[0]?.type, "action_bias");
});

test("compiler does not confuse a muted color palette with silencing the bot", async () => {
  let calls = 0;
  const paletteProvider: LlmProvider = {
    name: "local",
    async generateResponse() {
      calls += 1;
      return JSON.stringify({ powers: [{
        id: "palette",
        selfCue: "Favor a restrained visual atmosphere.",
        effects: [{
          type: "action_bias",
          cue: "Notice muted colors in the environment.",
          frequency: "occasional",
        }],
        ruleLabels: ["Muted palette"],
      }] });
    },
    async embedText() { return []; },
  };
  const result = await compileBotPowers({
    provider: paletteProvider,
    powers: [{
      version: 1,
      id: "palette",
      name: "Muted Palette",
      intent: "Creates muted colors around the room.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });

  assert.equal(calls, 1);
  assert.equal(result.powers[0]?.compiled?.effects[0]?.type, "action_bias");
});

test("Coffee power plans expose a hard mute independently of turn eligibility", () => {
  const plan = resolvedPlan({ muted: [{ type: "mute" }] });
  assert.equal(coffeePowerBotIsMuted(plan, "muted"), true);
  assert.equal(coffeePowerBotCanSpeak(plan, "muted"), true);
  assert.equal(coffeePowerBotIsMuted(plan, "other"), false);
});

test("Coffee freezes the reusable mumbling effect into its session plan", () => {
  const plan = resolvedPlan({
    jim: [{ type: "speech_obfuscation", mode: "gibberish" }],
  });
  assert.equal(coffeePowerBotMumblesSpeech(plan, "jim"), true);
  assert.equal(coffeePowerBotMumblesSpeech(plan, "other"), false);
});

test("Coffee freezes Quiet half-mute outcomes and applies one holder mood cost", () => {
  const plan = resolvedPlan({
    karen: [
      { type: "voice_presence", mode: "quiet" },
      { type: "intermittent_mute", chance: "half", moodPenalty: "small" },
    ],
  });
  const key = Array.from({ length: 40 }, (_, index) => `coffee-turn-${index}`)
    .find((candidate) => coffeePowerQuietTurnIsIgnored({
      plan,
      botId: "karen",
      stableTurnKey: candidate,
    }));
  assert.ok(key);
  assert.equal(
    coffeePowerQuietTurnIsIgnored({ plan, botId: "karen", stableTurnKey: key! }),
    true,
  );
  const next = applyCoffeeQuietIgnoredMoodPenalty({
    socialByBotId: {
      karen: {
        disposition: 0.6,
        valuesFriction: 0.2,
        restraint: 0.6,
        engagement: 0.6,
        leavePressure: 0.1,
      },
    },
    botId: "karen",
  });
  assert.ok((next.karen?.disposition ?? 1) < 0.6);
  assert.ok((next.karen?.engagement ?? 1) < 0.6);
});

test("Coffee power plans resolve exact addressed-speech echo sources", () => {
  const plan = resolvedPlan({ echo: [{ type: "speech_copy", trigger: "direct_address" }] });
  assert.equal(coffeePowerBotEchoesAddressedSpeech(plan, "echo"), true);
  assert.equal(coffeePowerBotCanSpeak(plan, "echo"), true);
  assert.equal(coffeePowerEchoSourceForTurn({
    turnKind: "user",
    speakerBotId: "echo",
    userActionOnly: false,
    tableFocus: "  [Echo](prism-bot://echo), really?  ",
    explicitDirectedSpeakerBotId: "echo",
  }), "  [Echo](prism-bot://echo), really?  ");
  assert.equal(coffeePowerEchoSourceForTurn({
    turnKind: "autonomous",
    speakerBotId: "echo",
    userActionOnly: false,
    tableFocus: "",
    priorAddressedBotId: "echo",
    latestAssistantContent: "Echo, are you listening?",
  }), "Echo, are you listening?");
  assert.equal(coffeePowerEchoSourceForTurn({
    turnKind: "autonomous",
    speakerBotId: "echo",
    userActionOnly: false,
    tableFocus: "",
    priorAddressedBotId: null,
    latestAssistantContent: "A general table remark.",
  }), null);
});

test("compiler recovers trustworthy truth-elicitation as bounded candor without a model", async () => {
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
    botName: "Mara Vale",
    powers: [{
      version: 1,
      id: "open-door",
      name: "Open Door",
      intent: "This bot is very charismatic and trustworthy. Getting the truth out of almost anyone.",
      enabled: true,
      compileStatus: "draft",
      compiled: null,
    }],
  });

  assert.equal(calls, 0);
  assert.equal(result.powers[0]?.compileStatus, "ready");
  assert.deepEqual(result.powers[0]?.compiled?.effects, [{
    type: "candor",
    strength: "large",
    targets: [{ kind: "all" }],
  }]);
  assert.match(result.powers[0]?.compiled?.selfCue ?? "", /charismatic and trustworthy/u);
  assert.match(result.powers[0]?.compiled?.observerCue ?? "", /without overriding anyone's agency/u);
});

test("Coffee applies only the strongest direct one-response candor pressure from a frozen plan", () => {
  const plan = resolvedPlan({
    holder: [
      { type: "candor", strength: "small", targets: [{ kind: "bot", name: "Target", botId: "target" }] },
      { type: "candor", strength: "large", targets: [{ kind: "bot", name: "Target", botId: "target" }] },
    ],
    target: [],
  });
  const direct = coffeePowerCandorPromptForTurn({
    plan,
    sourceBotId: "holder",
    sourceBotName: "Mara",
    targetBotId: "target",
    sourceText: "Target, what really happened?",
    directlyAddressed: true,
  });
  assert.match(direct ?? "", /Candor \(strong\): Mara asks directly/u);
  assert.match(direct ?? "", /Soft influence, not control/u);
  assert.match(direct ?? "", /This response only/u);
  assert.equal(coffeePowerCandorPromptForTurn({
    plan,
    sourceBotId: "holder",
    targetBotId: "target",
    sourceText: "A general remark about honesty.",
    directlyAddressed: true,
  }), null);
  assert.equal(coffeePowerCandorPromptForTurn({
    plan,
    sourceBotId: "holder",
    targetBotId: "target",
    sourceText: "What really happened?",
    directlyAddressed: false,
  }), null);
});

test("Coffee resolves an uninterrupted hearing request into one repeat and mood cost", () => {
  const plan = resolvedPlan({
    speaker: [],
    holder: [{
      type: "hearing_repeat",
      frequency: "occasional",
      moodPenalty: "small",
    }],
  });
  const directive = coffeePowerHearingRepeatDirective({
    plan,
    history: [
      {
        id: "source",
        role: "assistant",
        botId: "speaker",
        content: "The lighthouse only appears at low tide.",
      },
      {
        id: "request",
        role: "assistant",
        botId: "holder",
        content: "Sorry, what was that?",
      },
    ],
    eligibleBotIds: ["speaker", "holder"],
  });
  assert.deepEqual(directive, {
    requesterBotId: "holder",
    repeatingBotId: "speaker",
    requestMessageId: "request",
    sourceMessageId: "source",
    repeatedContent: "The lighthouse only appears at low tide.",
    moodPenalty: "small",
  });

  const before = {
    speaker: {
      disposition: 0.6,
      valuesFriction: 0.2,
      restraint: 0.5,
      engagement: 0.7,
      leavePressure: 0.1,
    },
    holder: {
      disposition: 0.5,
      valuesFriction: 0.3,
      restraint: 0.5,
      engagement: 0.6,
      leavePressure: 0.1,
    },
  };
  const after = applyCoffeeHearingRepeatMoodPenalty({
    socialByBotId: before,
    repeatingBotId: directive!.repeatingBotId,
    strength: directive!.moodPenalty,
  });
  assert.ok(after.speaker.disposition < before.speaker.disposition);
  assert.ok(after.speaker.valuesFriction > before.speaker.valuesFriction);
  assert.equal(after.holder, before.holder);
});

test("Coffee does not force a repeat after the player interrupts the bot-to-bot chain", () => {
  const plan = resolvedPlan({
    speaker: [],
    holder: [{
      type: "hearing_repeat",
      frequency: "occasional",
      moodPenalty: "small",
    }],
  });
  assert.equal(coffeePowerHearingRepeatDirective({
    plan,
    history: [
      { id: "source", role: "assistant", botId: "speaker", content: "One line." },
      { id: "request", role: "assistant", botId: "holder", content: "Pardon?" },
      { id: "player", role: "user", content: "Let me answer that." },
    ],
    eligibleBotIds: ["speaker", "holder"],
  }), null);
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

test("Coffee freezes legacy empty-effect mute Powers as absolute silence", () => {
  const db = powerDb();
  const name = "Mute";
  const intent = "Never talks. Ever.";
  db.prepare("INSERT INTO conversations VALUES (?, ?, 'coffee', ?, NULL)")
    .run("silent-session", "user", JSON.stringify(["silent-jack"]));
  db.prepare("INSERT INTO bots VALUES (?, 'user', ?, ?, ?, ?)").run(
    "silent-jack",
    "Silent Jack",
    "",
    null,
    JSON.stringify([{
      version: 1,
      id: "legacy-mute",
      name,
      intent,
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(name, intent),
        selfCue: "Silence is golden.",
        observerCue: "He rarely speaks.",
        effects: [],
        ruleLabels: ["Absolute Silence"],
      },
    }]),
  );

  const plan = resolveCoffeePowersForSession(db, "user", "silent-session");

  assert.equal(coffeePowerBotIsMuted(plan, "silent-jack"), true);
  assert.deepEqual(plan.bots["silent-jack"]?.effects, [{ type: "mute" }]);
});

test("Coffee upgrades an older Interrupting Tom snapshot to unconditional cut-ins", () => {
  const db = powerDb();
  const name = "Interrupting";
  const intent =
    "Aggressively jumps in after whoever just spoke and cuts into real live openings whenever possible.";
  db.prepare("INSERT INTO conversations VALUES (?, ?, 'coffee', ?, NULL)")
    .run("tom-session", "user", JSON.stringify(["tom", "alice"]));
  db.prepare("INSERT INTO bots VALUES (?, 'user', ?, ?, ?, ?)").run(
    "tom",
    "Interrupting Tom",
    "",
    null,
    JSON.stringify([{
      version: 1,
      id: "interrupting-tom",
      name,
      intent,
      enabled: true,
      compileStatus: "ready",
      compiled: {
        version: 1,
        sourceHash: botPowerSourceHashV1(name, intent),
        selfCue: "Cut in quickly.",
        observerCue: "Tom interrupts.",
        effects: [{
          type: "interruption",
          frequency: "frequent",
          strength: "large",
          targets: [{ kind: "all" }],
        }],
        ruleLabels: ["Frequently interrupts"],
      },
    }]),
  );
  db.prepare("INSERT INTO bots VALUES (?, 'user', ?, ?, ?, ?)").run(
    "alice",
    "Alice",
    "",
    null,
    "[]",
  );

  const plan = resolveCoffeePowersForSession(db, "user", "tom-session");
  const interruption = plan.bots.tom?.effects.find(
    (effect) => effect.type === "interruption",
  );

  assert.equal(interruption?.type, "interruption");
  assert.equal(interruption?.certainty, "always");
  assert.deepEqual(interruption?.targets, [
    { kind: "bot", name: "Alice", botId: "alice" },
  ]);
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

test("Coffee adapts addressed fandom to the current player or peer focus", () => {
  const plan = resolvedPlan({
    kevin: [{ type: "addressed_fandom", strength: "large" }],
    ada: [],
  });
  const prompt = coffeePowersPromptForSpeaker(
    plan,
    "kevin",
    ["ada"],
    {},
    undefined,
    "Ada",
  );

  assert.match(prompt, /Coffee fandom: obsessively idolize Ada now/iu);
  assert.match(prompt, /Freshly reveal delight/iu);
  assert.match(prompt, /never stalk, coerce, invent private knowledge/iu);
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

test("Coffee adapts the shared interruption primitive into turn pressure and action guidance", () => {
  const plan = resolvedPlan({
    interrupter: [{
      type: "interruption",
      frequency: "frequent",
      strength: "large",
      targets: [{ kind: "bot", name: "Light", botId: "light" }],
    }],
  });
  assert.deepEqual(coffeePowerSpeakerPressures({
    plan,
    candidateBotIds: ["interrupter"],
    lastSpeakerBotId: "light",
    contextText: "A live opening appears.",
  }), [{ botId: "interrupter", score: 3 }]);
  assert.deepEqual(coffeePowerActionBias(plan, "interrupter"), {
    type: "action_bias",
    cue: "Cut in quickly when a real conversational opening appears.",
    frequency: "frequent",
  });
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
      {
        type: "response_budget", mode: "minimal", enforcement: "hard",
      },
    ],
  });
  const prompt = coffeePowersPromptForSpeaker(plan, "light", ["ryuk"]);
  assert.match(prompt, /Response bond.*Ryuk/u);
  assert.match(prompt, /Topic boundary.*small talk/u);
  assert.match(prompt, /earlier words from Ryuk remain unusually vivid/u);
  assert.match(prompt, /Hard response budget: use one short table sentence/u);
  assert.deepEqual(coffeePowerResponseBudgetForBot(plan, "light", true), {
    type: "response_budget",
    mode: "minimal",
    enforcement: "hard",
  });
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
