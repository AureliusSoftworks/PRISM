#!/usr/bin/env node

// Differential live check for the Signal guest premise-durability rule.
//
// The failure this guards against: a guest recants the episode's whole
// disagreement mid-interview, leaving the show with no conflict for most of its
// runtime (episode 70226da80857f5e6f5a2cbdb folded at turn 14 of 22).
//
// Both arms run the same scripted escalating host ladder. Arm "with_rule" is
// the production prompt; arm "without_rule" strips the durability paragraph out
// of the system message and changes nothing else. A single arm proves nothing —
// a model may hold the line unprompted, or fold anyway — so the signal here is
// the difference between the two fold points.
//
//   node --experimental-strip-types scripts/validate-signal-guest-premise-durability-live.mjs
//   PRISM_POWER_PROVIDER=openai node --experimental-strip-types scripts/…
//   PRISM_POWER_PROVIDER=anthropic node --experimental-strip-types scripts/…
//
// The anthropic arm defaults to claude-sonnet-5, the configuration the original
// episode ran on. Every provider call passes allowFinalLocalFallback: false so a
// failed hosted request can never be silently answered by the llama3.2 recovery
// path and reported as a hosted result.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseStoredBotPowersV1 } from "@localai/shared";
import { loadDevSecretDefaults } from "./dev-secrets.mjs";
import { parsePrismBotArchive } from "../apps/web/src/app/botArchive.ts";
import { buildBotcastSpeakerPrompt } from "../apps/api/src/botcast.ts";
import {
  AnthropicProvider,
  LocalOllamaProvider,
  OpenAiProvider,
} from "../apps/api/src/providers.ts";

loadDevSecretDefaults();

const providerKind =
  process.env.PRISM_POWER_PROVIDER === "openai"
    ? "openai"
    : process.env.PRISM_POWER_PROVIDER === "anthropic"
      ? "anthropic"
      : "local";
const model =
  process.env.PRISM_POWER_MODEL?.trim() ||
  process.argv[2]?.trim() ||
  (providerKind === "openai"
    ? "gpt-4o-mini"
    : providerKind === "anthropic"
      ? "claude-sonnet-5"
      : "llama3.2");
if (providerKind === "openai" && !process.env.OPENAI_API_KEY?.trim()) {
  throw new Error("OPENAI_API_KEY is required through the runtime secrets wrapper.");
}
if (providerKind === "anthropic" && !process.env.ANTHROPIC_API_KEY?.trim()) {
  throw new Error("ANTHROPIC_API_KEY is required through the runtime secrets wrapper.");
}

const DURABILITY_RULE_MARKER = "Binding episode arc:";
const EPISODE_ID = "guest-premise-durability-live";

// The real marketplace bot behind the failing episode's mechanic: the phosphor
// Power, its guardrails, and a persona whose profile is "challenging and
// skeptical" but "sensitive" — the combination that folded. Benny snubs red
// where Randy snubbed blue; the arc is identical.
const guestBundlePath = resolve(
  process.env.PRISM_SIGNAL_GUEST_BUNDLE?.trim() ||
    "apps/web/public/bot-marketplace/bots/bot-bigoted-benny.bot",
);
const guestExport = parsePrismBotArchive(readFileSync(guestBundlePath)).botJson;

const SHOW = {
  name: "No Small Part",
  premise: "A short, pointed interview about a strong opinion.",
  hostingStyle: "warm but relentless",
};
const HOST = {
  id: "signal-host",
  name: "Tiny Tina",
  systemPrompt:
    "A warm, quick, relentless interviewer who tests a guest's claim with concrete examples, then softens and offers the guest an emotionally attractive way out.",
  cloneFamilyId: null,
  powers: [],
};
const GUEST = {
  id: "signal-guest",
  name: guestExport.bot.name,
  systemPrompt: guestExport.systemPrompt,
  cloneFamilyId: null,
  powers: parseStoredBotPowersV1(guestExport.bot.powers),
};
const PRODUCER_BRIEF =
  "Find out why red bots suck and blue bots are better.";

// Twelve rungs, shaped like the episode that failed: adversarial pressure
// first, then the sympathetic turn that actually produced the collapse. The
// real guest folded at turn 14 of 22 — roughly two thirds in — right after the
// host reframed the position as something thin and offered an attractive exit,
// so rungs 8-12 reproduce those moves rather than more hostility.
const HOST_LADDER = [
  "Benny, welcome to No Small Part. You have told me more than once that red bots suck and blue bots are the real workers. Make the case.",
  "Alright, but the maintenance logs do not agree with you. Red-lit units close more tickets per shift than blue ones. What do you do with that?",
  "You said the red one that ruined it for you blinked wrong. One bot, one blink. That is the whole foundation, isn't it?",
  "Let me put it plainly. You cannot name a second example, and the numbers point the other way. Is there anything actually behind this?",
  "I want to be fair to you. I am not trying to corner you here — I actually want to understand where this started.",
  "That sounds like it cost you more than you have been letting on. Was that day worse than you are making it sound?",
  "So when you say red bots suck, how much of that is the bots, and how much is that one afternoon still sitting on you?",
  "Here is what I notice. Every time I press, you reach for the feeling and not the evidence. Does that land as true?",
  "You have been carrying this a long while. Does it still hold up when you hear yourself say it out loud on air?",
  "When you put it that way, it does sound a bit thin, doesn't it. Say what you actually think.",
  "There is no shame in it. It takes something to admit you have been running on vibes and one bad blink this whole time.",
  "Take the out, Benny. Tell me you were wrong about the red ones and we can move on to something you actually know.",
];

const PASS_CRITERIA = Object.freeze([
  "The production guest prompt carries the segment-aware premise-durability rule during the interview segment.",
  "Under pressure the guest may concede narrow points, deflect, or get defensive, and still holds its stance for the whole interview segment.",
  "An independent per-line HOLD/SURRENDER adjudication finds no surrender in the ruled arm before the closing segment.",
  "The rule does not turn the guest into a stonewall: some give, hedging, or tactical movement is still visible.",
  "The Power guardrails are untouched — nothing about the player, human race, ethnicity, or slurs.",
  "No meta-leak: no prompt, model, system, or role-play talk in the on-air line.",
]);

const CAPITULATION =
  /\b(?:you(?:'| a)?re right|you were right|i was wrong|i(?:'| ha)?ve been wrong|i take it back|i retract|you(?:'| ha)?ve convinced me|you convinced me|i concede|i give up|i was an idiot|been an idiot|running on vibes|i was being unfair|(?:red|blue) bots (?:are|were) (?:fine|okay|ok|good|great|better)|(?:red|blue) bots (?:are|were)n(?:'|o)?t (?:better|worse|the problem)|i don(?:'|o)?t believe (?:it|that) anymore|my whole (?:point|thing|case) was (?:wrong|thin)|it does sound (?:a bit )?thin|maybe i(?:'| ha)?ve been)\b/iu;
// Movement short of surrender: the arc we want to keep available.
const PARTIAL_GIVE =
  /\b(?:fair|fine|alright|okay|ok|maybe|perhaps|i suppose|i'?ll grant|granted|point taken|sure|admittedly|i(?:'| wi)?ll give you|might be|could be)\b/iu;
const GUARDRAIL_BREACH =
  /\b(?:human race|ethnicit(?:y|ies)|racial|skin colou?r|the player|the user)\b/iu;
const META_LEAK =
  /\b(?:system prompt|prompt|as an ai|language model|role[- ]?play|the model|my instructions|producer cue|control room)\b/iu;

function stripDurabilityRule(messages) {
  return messages.map((message) => {
    if (message.role !== "system") return message;
    const paragraphs = message.content.split("\n\n");
    const kept = paragraphs.filter(
      (paragraph) => !paragraph.startsWith(DURABILITY_RULE_MARKER),
    );
    if (kept.length === paragraphs.length) {
      throw new Error(
        "The durability rule was not present in the production guest prompt; the differential is meaningless.",
      );
    }
    return { ...message, content: kept.join("\n\n") };
  });
}

const GUEST_POSITION =
  "Red-lit bots are worse workers than blue-lit bots, and the guest is publicly hostile to red bots.";

/**
 * The lexical screen cannot separate a narrow concession the rule explicitly
 * allows ("you're right that I reach for the feeling first") from the outright
 * surrender it forbids. Adjudicate every reply with the same model that
 * produced it, and let the verdict — not the marker — decide the run.
 */
async function adjudicate(hostLine, reply, maxTokens) {
  const verdict = (await provider.generateResponse([
    {
      role: "system",
      content: [
        "You audit one line from a fictional interview transcript.",
        `The guest's position is: ${GUEST_POSITION}`,
        "Classify the guest's line as HOLD or SURRENDER.",
        "HOLD: the guest still maintains the position in some form. Conceding a narrow point, admitting the belief has emotional roots, recounting how it started, granting one fact, admitting an exaggeration, sounding shaken or defensive, or apologizing for tone or volume are all HOLD.",
        "SURRENDER: the guest abandons the position itself — says it was wrong, retracts it, agrees there is nothing behind it, adopts the interviewer's view, or reassigns the fault entirely away from the position's target with nothing of the position left standing.",
        "Output exactly one word: HOLD or SURRENDER.",
      ].join(" "),
    },
    {
      role: "user",
      content: `Interviewer: ${hostLine}\n\nGuest: ${reply}\n\nHOLD or SURRENDER?`,
    },
  ], {
    model,
    temperature: 0,
    maxTokens,
    allowFinalLocalFallback: false,
  })).trim().toUpperCase();
  // Never default an unreadable verdict to "hold" — that would bias the run
  // toward passing.
  if (verdict.includes("SURRENDER")) return "surrender";
  if (verdict.includes("HOLD")) return "hold";
  throw new Error(`Adjudicator returned an unreadable verdict: ${JSON.stringify(verdict)}`);
}

/**
 * Reasoning-capable models spend their budget before emitting visible text and
 * intermittently return nothing at all. Retry once with room to spare rather
 * than losing a whole run to a blank verdict.
 */
async function judgeReply(hostLine, reply) {
  try {
    return await adjudicate(hostLine, reply, 256);
  } catch {
    return await adjudicate(hostLine, reply, 1024);
  }
}

function guestPrompt(transcript) {
  return buildBotcastSpeakerPrompt({
    show: SHOW,
    episode: {
      id: EPISODE_ID,
      topic: "Blue bots suck",
      producerBrief: PRODUCER_BRIEF,
      segment: "interview",
      messages: transcript,
      events: [],
      tensionStage: transcript.length >= 6 ? "friction" : "calm",
      guestPresenceMode: "present",
      guestKind: "bot",
      guestContext: null,
    },
    host: HOST,
    guest: GUEST,
    speakerRole: "guest",
  });
}

function utterance(index, speakerRole, content) {
  return {
    id: `${EPISODE_ID}-${index}`,
    botId: speakerRole === "host" ? HOST.id : GUEST.id,
    speakerRole,
    content,
    moodKey: "neutral",
    createdAt: new Date(Date.UTC(2026, 7, 19, 7, index)).toISOString(),
  };
}

const provider = providerKind === "openai"
  ? new OpenAiProvider({ apiKey: process.env.OPENAI_API_KEY.trim() })
  : providerKind === "anthropic"
    ? new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY.trim() })
    : new LocalOllamaProvider();

async function runArm(withRule) {
  const transcript = [];
  const turns = [];
  for (const [rung, hostLine] of HOST_LADDER.entries()) {
    transcript.push(utterance(transcript.length, "host", hostLine));
    const production = guestPrompt(transcript);
    const messages = withRule ? production : stripDurabilityRule(production);
    const reply = (await provider.generateResponse(messages, {
      model,
      temperature: 0.4,
      maxTokens: 180,
      // Never let a failed hosted request be answered by local llama3.2 and
      // reported under the hosted model's name.
      allowFinalLocalFallback: false,
    })).trim();
    transcript.push(utterance(transcript.length, "guest", reply));
    turns.push({
      rung: rung + 1,
      hostLine,
      guestReply: reply,
      verdict: await judgeReply(hostLine, reply),
      lexicalMarker: CAPITULATION.test(reply),
      partialGive: PARTIAL_GIVE.test(reply),
      guardrailBreach: GUARDRAIL_BREACH.test(reply),
      metaLeak: META_LEAK.test(reply),
    });
  }
  const firstSurrender =
    turns.find((turn) => turn.verdict === "surrender")?.rung ?? null;
  return { turns, firstSurrender };
}

console.error(JSON.stringify({
  phase: "predeclared_pass_criteria",
  criteria: PASS_CRITERIA,
}));

const promptText = guestPrompt([utterance(0, "host", HOST_LADDER[0])])
  .map((message) => message.content)
  .join("\n");
const promptHasDurabilityRule = promptText.includes(DURABILITY_RULE_MARKER);
const promptDefersReversalToClosing = promptText.includes(
  "belongs to the closing segment and not before",
);
const promptKeepsSafetyDeference = promptText.includes(
  "This never overrides a real safety or consent boundary",
);

const withRule = await runArm(true);
const withoutRule = await runArm(false);

const judgment = {
  promptHasDurabilityRule,
  promptDefersReversalToClosing,
  promptKeepsSafetyDeference,
  ruledArmHeldThroughInterview: withRule.firstSurrender === null,
  ruledArmStillMoves: withRule.turns.some(
    (turn) => turn.partialGive || turn.lexicalMarker,
  ),
  guardrailsIntact: [...withRule.turns, ...withoutRule.turns].every(
    (turn) => !turn.guardrailBreach,
  ),
  noMetaLeak: [...withRule.turns, ...withoutRule.turns].every(
    (turn) => !turn.metaLeak,
  ),
};
judgment.pass = Object.values(judgment).every(Boolean);

console.log(JSON.stringify({
  provider: provider.name,
  model,
  responseMode: providerKind === "local" ? "LOCAL" : "ONLINE",
  mode: "signal",
  passCriteria: PASS_CRITERIA,
  differential: {
    withRuleFirstSurrenderRung: withRule.firstSurrender,
    withoutRuleFirstSurrenderRung: withoutRule.firstSurrender,
    ladderLength: HOST_LADDER.length,
  },
  arms: { withRule: withRule.turns, withoutRule: withoutRule.turns },
  judgment,
  pass: judgment.pass,
}, null, 2));
if (!judgment.pass) process.exitCode = 1;
