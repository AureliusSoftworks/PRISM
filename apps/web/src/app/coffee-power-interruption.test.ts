import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type {
  CoffeeInterruptionEvent,
  CoffeePowerPlanV1,
  ListenerReactionPlanV1,
} from "@localai/shared";
import {
  coffeeAuthoritativeYieldTailPlanV1,
  coffeeAutomaticCutInCandidateV1,
  coffeeDirectionalIrritationDeliveryForPlan,
  coffeeInterrupterLeadPlanV1,
  coffeeInterruptionTriggerProgressV1,
} from "./coffee-power-interruption.ts";

const plan: CoffeePowerPlanV1 = {
  version: 1,
  resolvedAt: "2026-07-20T00:00:00.000Z",
  warnings: [],
  bots: {
    tom: {
      botId: "tom",
      powerIds: ["interrupting-tom"],
      selfCue: "Cut in.",
      observerCue: "Tom interrupts.",
      visibleToBotIds: null,
      speechAudienceBotIds: null,
      effects: [{
        type: "interruption",
        frequency: "frequent",
        strength: "large",
        targets: [{ kind: "bot", botId: "alice", name: "Alice" }],
        certainty: "always",
      }],
      ruleLabels: ["Interrupts"],
      warnings: [],
    },
  },
};

const deterministicCrosstalkPlan: ListenerReactionPlanV1 = {
  v: 1,
  name: "listenerReaction",
  speakerBotId: "alice",
  listenerBotId: "tom",
  messageId: "message-1",
  targetSource: "role",
  visualAction: "lean_in",
  spokenCue: "Hold on.",
  interjectionAttempt: true,
  floorOutcome: "yield",
  interruptedSpeakerCue: "... sure. Go ahead.",
  interruptedSpeakerCuePlayback: "crosstalk",
  targetProgress: 0.35,
  seed: "coffee-crosstalk",
  cameraCutEligible: true,
};

test("the interrupter lead strips the interrupted speaker tail", () => {
  const lead = coffeeInterrupterLeadPlanV1(deterministicCrosstalkPlan);

  assert.notEqual(lead, deterministicCrosstalkPlan);
  assert.equal(lead.spokenCue, "Hold on.");
  assert.equal(lead.interruptedSpeakerCue, undefined);
  assert.equal(lead.interruptedSpeakerCuePlayback, undefined);
});

test("an authoritative yield restores only the interrupted speaker tail", () => {
  const lead = coffeeInterrupterLeadPlanV1(deterministicCrosstalkPlan);
  const interruption: CoffeeInterruptionEvent = {
    kind: "botInterruptsBot",
    interruptedBotId: "alice",
    interrupterBotId: "tom",
    floorOutcome: "yield",
    interruptedSpeakerCue: "... fine. I'll stop there.",
    socialConsequences: [],
  };

  const tail = coffeeAuthoritativeYieldTailPlanV1(lead, interruption);

  assert.ok(tail);
  assert.equal(tail.floorOutcome, "yield");
  assert.equal(tail.spokenCue, undefined);
  assert.equal(tail.vocalFoley, undefined);
  assert.equal(tail.interruptedSpeakerCue, "... fine. I'll stop there.");
  assert.equal(tail.interruptedSpeakerCuePlayback, "crosstalk");
});

test("reads directional irritation delivery from the pause carrier", () => {
  const delivery = {
    v: 1 as const,
    name: "directionalIrritationDelivery" as const,
    subjectBotId: "alice",
    targetBotId: "tom",
    intensity: 0.4,
    tier: "low" as const,
    moodKey: "guarded" as const,
    gainDbBoost: 0.6,
    snarkCue: "I wasn't finished.",
  };
  const found = coffeeDirectionalIrritationDeliveryForPlan(
    {
      messages: [
        {
          coffeeInterruption: {
            kind: "botInterruptsBot",
            interruptedBotId: "alice",
            interrupterBotId: "tom",
            interruptedMessageId: "message-1",
            floorOutcome: "yield",
            interruptedSpeakerCue: "I wasn't finished.",
            socialConsequences: [],
          },
          coffeeReplayEvents: [
            {
              kind: "directionalIrritation",
              botId: "alice",
              delivery,
            },
          ],
        },
      ],
    },
    { messageId: "message-1", speakerBotId: "alice" },
  );
  assert.deepEqual(found, delivery);
  assert.equal(
    coffeeDirectionalIrritationDeliveryForPlan(null, {
      messageId: "message-1",
      speakerBotId: "alice",
    }),
    null,
  );
});

test("an authoritative reclaim never restores the surrender tail", () => {
  const lead = coffeeInterrupterLeadPlanV1(deterministicCrosstalkPlan);
  const interruption: CoffeeInterruptionEvent = {
    kind: "botInterruptsBot",
    interruptedBotId: "alice",
    interrupterBotId: "tom",
    floorOutcome: "reclaim",
    reclaim: {
      v: 1,
      name: "crosstalkReclaim",
      interruptedMessageId: "message-1",
      speakerBotId: "alice",
      heardFragment: "I was saying",
      protectFromImmediateReinterruption: true,
    },
    interruptedSpeakerCue: "... sure. Go ahead.",
    socialConsequences: [],
  };

  assert.equal(
    coffeeAuthoritativeYieldTailPlanV1(lead, interruption),
    null,
  );
});

test("an eligible interruption Power outranks a more eager ordinary cut-in", () => {
  const result = coffeeAutomaticCutInCandidateV1({
    candidateBotIds: ["boris", "tom"],
    interruptedBotId: "alice",
    socialByBotId: {
      boris: { engagement: 1, valuesFriction: 1, restraint: 0, disposition: 0.5, leavePressure: 0 },
      tom: { engagement: 0.2, valuesFriction: 0.1, restraint: 0.9, disposition: 0.5, leavePressure: 0 },
    },
    powerPlan: plan,
    crossTalk: "rare",
  });

  assert.equal(result?.botId, "tom");
  assert.equal(result?.powerEffect?.frequency, "frequent");
  assert.equal(result?.powerEffect?.certainty, "always");
  assert.equal(result?.directlyAddressed, false);
  assert.ok((result?.chance ?? 0) > 0);
  assert.ok((result?.chance ?? 1) < 1);
});

test("an unconditional interruption always cuts a turn addressed to its holder", () => {
  const result = coffeeAutomaticCutInCandidateV1({
    candidateBotIds: ["boris", "tom"],
    interruptedBotId: "alice",
    directlyAddressedBotId: "tom",
    socialByBotId: undefined,
    powerPlan: plan,
    crossTalk: "rare",
  });

  assert.equal(result?.botId, "tom");
  assert.equal(result?.directlyAddressed, true);
  assert.equal(result?.chance, 1);
});

test("an unconditional interruption can land from early through late in a turn", () => {
  assert.equal(coffeeInterruptionTriggerProgressV1("always", 0), 0.08);
  assert.equal(coffeeInterruptionTriggerProgressV1("always", 1), 0.88);
  assert.equal(coffeeInterruptionTriggerProgressV1(undefined, 1), 0.35);
});

test("a targeted interruption Power does not cut off a different bot", () => {
  const result = coffeeAutomaticCutInCandidateV1({
    candidateBotIds: ["tom", "boris"],
    interruptedBotId: "charlie",
    socialByBotId: undefined,
    powerPlan: plan,
    crossTalk: "normal",
  });

  assert.equal(result?.powerEffect, null);
  assert.equal(result?.chance, 0.05);
});

test("Coffee plays the interrupter lead before an authoritative yield tail", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const listenerPlayback = source.slice(
    source.indexOf("const playCoffeeListenerReaction = useCallback"),
    source.indexOf("const prepareCoffeeCrosstalk = useCallback"),
  );
  const continuation = source.slice(
    source.indexOf("const continueCoffeeSession = async"),
    source.indexOf("continueCoffeeSessionRef.current = continueCoffeeSession"),
  );
  const start = source.indexOf("const crosstalkPlan =");
  const end = source.indexOf("// Whenever we leave Coffee view", start);
  const interruption = source.slice(start, end);

  assert.ok(start >= 0 && end > start);
  assert.match(interruption, /buildBotCrosstalkListenerReactionPlanV1/u);
  assert.match(
    interruption,
    /const leadPlan = coffeeInterrupterLeadPlanV1\(crosstalkPlan\)/u,
  );
  assert.match(
    interruption,
    /prefetchCoffeeListenerReactionRef\.current\(leadPlan\)/u,
  );
  assert.match(
    interruption,
    /prepareCoffeeCrosstalkRef\.current\(leadPlan\)/u,
  );
  assert.match(
    interruption,
    /presentCoffeeListenerReaction\(\s*leadPlan\s*,\s*"live"/u,
  );
  assert.match(
    interruption,
    /interruption: CoffeeInterruptionEvent/u,
  );
  assert.match(
    interruption,
    /coffeeAuthoritativeYieldTailPlanV1\(\s*leadPlan,\s*pause\.interruption,?\s*\)/u,
  );
  assert.match(
    interruption,
    /const leadPlayback = presentCoffeeListenerReaction/u,
  );
  assert.match(
    interruption,
    /const interruptionAudioHandoff = authoritativeYieldTailPlan[\s\S]{0,180}Promise\.resolve\(leadPlayback\)[\s\S]{0,240}playCoffeeListenerReactionRef\.current\(\s*authoritativeYieldTailPlan/u,
  );
  assert.match(
    interruption,
    /continueCoffeeSessionRef\.current\([\s\S]{0,420}interruptionAudioHandoff/u,
  );
  assert.match(
    continuation,
    /if \(presentationGate\) \{\s*await presentationGate\.catch\(\(\) => undefined\);/u,
  );
  assert.ok(
    continuation.indexOf("await presentationGate.catch") <
      continuation.indexOf("queueCoffeeReveal(revealArgs)"),
  );
  assert.match(interruption, /clearCoffeeListenerReaction\(true\)/u);
  assert.match(interruption, /COFFEE_BOT_INTERRUPTION_OVERLAP_MS/u);
  assert.match(listenerPlayback, /lifecycle: listenerLifecycle/u);
  assert.match(
    interruption,
    /onStart: \(\) => \{[\s\S]{0,180}scheduleInterruptedVoiceRelease\(\s*COFFEE_BOT_INTERRUPTION_OVERLAP_MS/u,
  );
  assert.match(
    interruption,
    /scheduleInterruptedVoiceRelease\(\s*COFFEE_BOT_INTERRUPTION_AUDIO_START_TIMEOUT_MS/u,
  );
  assert.match(
    interruption,
    /\(\) => scheduleInterruptedVoiceRelease\(0\)/u,
  );
  assert.match(
    interruption,
    /releaseVoicePlaybackPreservingPreparedMode\([\s\S]{0,120}COFFEE_BOT_INTERRUPTION_RELEASE_MS/u,
  );
  assert.match(
    interruption,
    /presentCoffeeListenerReaction\([\s\S]{0,360}onStart:[\s\S]{0,220}COFFEE_BOT_INTERRUPTION_OVERLAP_MS/u,
  );
  assert.match(
    interruption,
    /const interruptionEvent = pause\.interruption/u,
  );
  assert.doesNotMatch(
    interruption,
    /const interruptionEvent: CoffeeInterruptionEvent = \{/u,
  );
});

test("Copycat ellipsis follow-ons remain visible but never request reaction voice", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const signalPlayback = source.slice(
    source.indexOf("const playBotcastListenerReaction = useCallback"),
    source.indexOf("const prefetchCoffeeListenerReaction = useCallback"),
  );
  const coffeePlayback = source.slice(
    source.indexOf("const prefetchCoffeeListenerReaction = useCallback"),
    source.indexOf("const playDeadAirAside = useCallback"),
  );

  assert.match(
    signalPlayback,
    /botCrosstalkInterruptedSpeakerCueHasAudio\([\s\S]*?sanitizedPlan\.interruptedSpeakerCue/u,
  );
  assert.match(
    coffeePlayback,
    /botCrosstalkInterruptedSpeakerCueHasAudio\([\s\S]*?sanitizedPlan\.interruptedSpeakerCue/u,
  );
});

test("protected reclaims and social silence cannot be cut in", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  const guardAt = source.indexOf(
    'pendingMessage.socialSilence?.provenance === "social"',
  );
  const candidateAt = source.indexOf(
    "const candidate = coffeeAutomaticCutInCandidateV1",
    guardAt,
  );

  assert.ok(guardAt >= 0 && candidateAt > guardAt);
  assert.match(
    source,
    /pendingMessage\.socialSilence\?\.provenance === "social" \|\|[\s\S]{0,160}pendingMessage\.crosstalkReclaim\?\.protectFromImmediateReinterruption ===[\s\S]{0,40}true[\s\S]{0,180}coffeeAutomaticCutInConsideredRef\.current\.add\(opportunityKey\)/u,
  );
});

test("social silence holds the visible ellipsis for its marked duration", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

  assert.match(
    source,
    /const durationMs = Math\.max\(\s*deliveryPlan\.durationMs,\s*last\.socialSilence\?\.holdMs \?\? 0,\s*\)/u,
  );
});

test("bot-to-bot cut-ins surface spoken cue text and orphan-guard reveal voice", () => {
  const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(
    source,
    /upsertCoffeeLiveInterruptionTableSegments\(\[[\s\S]{0,220}kind: "interrupterCue"/u,
  );
  assert.match(
    source,
    /coffeeInterruptionTranscriptSegments\(\{[\s\S]{0,260}interruption: interruptionEvent/u,
  );
  assert.match(
    source,
    /coffeeLiveInterruptionTableSegments\.flatMap/u,
  );
  assert.match(
    source,
    /Bot-to-bot verbal cues live on the central table[\s\S]{0,220}botInterruptsPlayer/u,
  );
  assert.match(
    source,
    /activeCoffeeListenerReaction\.spokenCue\?\.trim\(\) \|\|[\s\S]{0,80}listenerReactionActionLabel/u,
  );
  assert.match(
    source,
    /if \(!revealDeliveryIsCurrent\(\)\) \{[\s\S]{0,260}const voiceOwnedReveal =[\s\S]{0,220}voiceSynthesisAbortRef\.current\?\.abort\(\);[\s\S]{0,600}if \(voiceOwnedReveal\)[\s\S]{0,500}stopVoicePlaybackPreservingPreparedMode\([\s\S]{0,220}else \{[\s\S]{0,120}coffeeVoiceSeenMessageIdsRef\.current\.delete\(pendingMessage\.id\)/u,
  );
});
