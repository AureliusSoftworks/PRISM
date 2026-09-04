import assert from "node:assert/strict";
import test from "node:test";

import {
  BOT_IDENTITY_SHAPESHIFT_TRANSITION_MS,
  applyBotIdentityShapeshiftAccentMapV1,
  applyBotIdentityShapeshiftResponseV1,
  botIdentityShapeshiftHolderPromptV1,
  botIdentityShapeshiftObserverPromptV1,
  botIdentityShapeshiftQuotedTargetNameV1,
  botIdentityShapeshiftTargetChangesV1,
  botIdentityShapeshiftTransitionActiveV1,
  createBotIdentityShapeshiftStateV1,
  normalizeBotIdentityShapeshiftStateV1,
  pickBotIdentityShapeshiftCandidateIndexV1,
  resolveBotIdentityShapeshiftVoiceV1,
} from "./botIdentityShapeshift.ts";
import {
  botPowerShapeshiftsIdentityV1,
  botPowerSourceHashV1,
  normalizeBotPowerEffectV1,
} from "./botPower.ts";
import {
  botcastIdentityShapeshiftStateBeforeMessageV1,
  type BotcastEpisode,
} from "./botcast.ts";

const occurredAt = "2026-07-25T20:00:00.000Z";

function shapeshiftState() {
  return createBotIdentityShapeshiftStateV1({
    surface: "coffee",
    holderBotId: "sam",
    holderBotName: "Shapeshifter Sam",
    targetBotId: "mara",
    targetBotName: "Mara Vale",
    targetSource: "library",
    targetPersonaPrompt: "A terse lunar cartographer who speaks in bearings.",
    targetFace: { faceEyeCharacter: "◉", faceMouthCharacter: "_" },
    targetAvatarDetails: null,
    holderVoice: {
      v: 2,
      enabled: true,
      baseVoiceId: "voice-2",
      elevenLabsVoiceId: "shannon-provider-voice",
      elevenLabsEffect: "echo",
      voiceEffectExplicit: true,
      pitch: -0.35,
      warmth: 0.4,
    },
    targetVoice: {
      v: 2,
      enabled: true,
      baseVoiceId: "voice-4",
      elevenLabsVoiceId: "terry-provider-voice",
      elevenLabsEffect: "deep-space",
      voiceEffectExplicit: true,
      pitch: 0.2,
      pronunciationBase: "en-GB",
      accentDefinitionId: "irish-english",
      pronunciationMapPoint: { x: 0.83, y: 0.19 },
      speechprintInfluence: "irish-english",
      speechprintStrength: "strong",
      speechprintVariationSeed: "terry-irish-v1",
      ttsPronunciationEnabled: true,
      premiumPronunciationEnabled: true,
    },
    targetColor: "#ff00aa",
    targetGlyph: "lucideOrbit",
    targetVoicePreset: "playful",
    targetFrameMaterialSeed: "bot-frame-material:id:mara",
    sourceMessageId: "message-1",
    occurredAt,
  });
}

test("identity shapeshift effect normalizes to the sticky library/marketplace contract", () => {
  assert.deepEqual(
    normalizeBotPowerEffectV1({
      type: "identity_shapeshift",
      pool: "anything",
      continuity: "nope",
    }),
    {
      type: "identity_shapeshift",
      pool: "library_or_marketplace",
      continuity: "session_sticky_until_amnesia",
    },
  );
  const intent = "take on the form of a different library bot";
  assert.equal(
    botPowerShapeshiftsIdentityV1([
      {
        version: 1,
        id: "p1",
        name: "Shapeshifter",
        intent,
        enabled: true,
        compileStatus: "ready",
        compiled: {
          version: 1,
          sourceHash: botPowerSourceHashV1("Shapeshifter", intent),
          selfCue: "shift",
          observerCue: "shifted",
          effects: [
            {
              type: "identity_shapeshift",
              pool: "library_or_marketplace",
              continuity: "session_sticky_until_amnesia",
            },
          ],
          ruleLabels: [],
        },
      },
    ]),
    true,
  );
});

test("identity shapeshift snapshot stays public-form only and sticky until target changes", () => {
  const state = shapeshiftState();
  const normalized = normalizeBotIdentityShapeshiftStateV1(state);
  assert.equal(normalized?.targetBotName, "Mara Vale");
  assert.equal(normalized?.targetColor, "#ff00aa");
  assert.equal(normalized?.targetGlyph, "lucideOrbit");
  assert.equal(normalized?.targetVoicePreset, "playful");
  assert.equal(normalized?.targetFrameMaterialSeed, "bot-frame-material:id:mara");
  assert.equal(normalized?.holderVoice?.baseVoiceId, "voice-2");
  assert.equal(normalized?.targetVoice.baseVoiceId, "voice-4");
  assert.equal(botIdentityShapeshiftTargetChangesV1(state, "mara"), false);
  assert.equal(botIdentityShapeshiftTargetChangesV1(state, "sol"), true);
  assert.match(
    botIdentityShapeshiftHolderPromptV1({
      holderName: "Shapeshifter Sam",
      roleLabel: "Coffee seat",
      state,
      identityJustChanged: true,
    }),
    /Hard shapeshift rule:[\s\S]*"Mara Vale"/u,
  );
  assert.equal(
    botIdentityShapeshiftQuotedTargetNameV1(state.targetBotName),
    '"Mara Vale"',
  );
  assert.equal(
    botIdentityShapeshiftQuotedTargetNameV1('  "Mara   Vale"  '),
    '"Mara Vale"',
    "an already quoted effective target must not gain nested quotes",
  );
});

test("identity shapeshift gives active observers an occasional voice-mismatch cue", () => {
  const state = shapeshiftState();
  const observer = botIdentityShapeshiftObserverPromptV1({
    observerBotId: "other-bot",
    state,
  });
  const original = botIdentityShapeshiftObserverPromptV1({
    observerBotId: state.targetBotId,
    state,
  });
  for (const cue of [observer, original]) {
    assert.match(cue, /Sometimes, but never by obligation or on every turn/iu);
    assert.match(cue, /voice still does not sound like "Mara Vale"/iu);
    assert.match(cue, /own judgment/u);
  }
});

test("identity shapeshift retains Shannon voice identity and overlays only Terry Accent Map", () => {
  const state = shapeshiftState();
  const voice = resolveBotIdentityShapeshiftVoiceV1(state, null, null);
  assert.equal(voice.baseVoiceId, "voice-2");
  assert.equal(voice.elevenLabsVoiceId, "shannon-provider-voice");
  assert.equal(voice.elevenLabsEffect, "echo");
  assert.equal(voice.pitch, -0.35);
  assert.equal(voice.warmth, 0.4);
  assert.equal(voice.pronunciationBase, "en-GB");
  assert.equal(voice.accentDefinitionId, "irish-english");
  assert.deepEqual(voice.pronunciationMapPoint, { x: 0.83, y: 0.19 });
  assert.equal(voice.speechprintInfluence, "irish-english");
  assert.equal(voice.speechprintStrength, "strong");
  assert.equal(voice.speechprintVariationSeed, "terry-irish-v1");
  assert.equal(voice.ttsPronunciationEnabled, true);
  assert.equal(voice.premiumPronunciationEnabled, true);

  const disabled = applyBotIdentityShapeshiftAccentMapV1(
    state.holderVoice,
    {
      ...state.targetVoice,
      ttsPronunciationEnabled: false,
      premiumPronunciationEnabled: false,
    },
  );
  assert.equal(disabled.baseVoiceId, "voice-2");
  assert.equal(disabled.elevenLabsVoiceId, "shannon-provider-voice");
  assert.equal(disabled.elevenLabsEffect, "echo");
  assert.equal(disabled.ttsPronunciationEnabled, false);
  assert.equal(disabled.premiumPronunciationEnabled, false);
  assert.equal(disabled.accentDefinitionId, undefined);
  assert.equal(disabled.pronunciationMapPoint, undefined);
  assert.equal(disabled.pronunciationBase, "follow-voice");
  assert.equal(disabled.speechprintInfluence, "none");
  assert.equal(disabled.speechprintVariationSeed, "natural-v1");
});

test("identity shapeshift response rewrite claims the borrowed form once", () => {
  const state = shapeshiftState();
  const first = applyBotIdentityShapeshiftResponseV1(
    "Hello there from the table.",
    state,
    true,
  );
  assert.match(first, /^I am "Mara Vale"\./u);
  assert.equal(
    applyBotIdentityShapeshiftResponseV1(
      "I am Mara Vale. This is Veil of Voices, and I am Mara Vale. Across from me sits Forgetful Forrest.",
      state,
      true,
    ),
    'I am "Mara Vale". This is Veil of Voices. Across from me sits Forgetful Forrest.',
  );
  const later = applyBotIdentityShapeshiftResponseV1(
    "I am Mara Vale. Bearing north looks clear.",
    state,
    false,
  );
  assert.equal(later, "Bearing north looks clear.");
  const rewritten = applyBotIdentityShapeshiftResponseV1(
    "I am Shapeshifter Sam and ready.",
    state,
    false,
  );
  assert.match(rewritten, /I am "Mara Vale"/u);
});

test("identity shapeshift response rewrite recognizes an already quoted reveal", () => {
  const state = shapeshiftState();
  // The holder prompt names the borrowed form in quotes, so a faithful reveal
  // arrives already quoted. Review 5acc4ecc36592d5f9148cdc0 aired it twice.
  assert.equal(
    applyBotIdentityShapeshiftResponseV1(
      'This is Veil of Voices, and I am "Mara Vale"; Forrest, you have spent your life looking past teeth.',
      state,
      true,
    ),
    'This is Veil of Voices, and I am "Mara Vale"; Forrest, you have spent your life looking past teeth.',
  );
  assert.equal(
    applyBotIdentityShapeshiftResponseV1(
      "I'm “Mara Vale”, and this is Veil of Voices. Forrest, welcome.",
      state,
      true,
    ),
    "I'm “Mara Vale”, and this is Veil of Voices. Forrest, welcome.",
  );
  // A bare mid-sentence claim keeps the punctuation that follows it.
  assert.equal(
    applyBotIdentityShapeshiftResponseV1(
      "This is Veil of Voices, and I am Mara Vale; Forrest, you have spent your life looking past teeth.",
      state,
      true,
    ),
    'This is Veil of Voices, and I am "Mara Vale"; Forrest, you have spent your life looking past teeth.',
  );
  // Later turns strip a quoted restatement exactly like a bare one.
  assert.equal(
    applyBotIdentityShapeshiftResponseV1(
      'I am "Mara Vale". Bearing north looks clear.',
      state,
      false,
    ),
    "Bearing north looks clear.",
  );
});

test("signal shapeshift reveal line carries the state it announces", () => {
  const state = { ...shapeshiftState(), surface: "signal" as const };
  const reshaped = {
    ...state,
    targetBotId: "terry",
    targetBotName: "Terry Vale",
    sourceMessageId: "message-3",
  };
  const episode = {
    messages: [{ id: "message-1" }, { id: "message-2" }, { id: "message-3" }],
    events: [
      { sequence: 1, kind: "utterance", payload: { messageId: "message-1" }, occurredAt },
      // Recorded right after its own utterance, exactly as the engine does.
      { sequence: 2, kind: "power_effect", payload: { v: 1, effect: "identity_shapeshift", state }, occurredAt },
      { sequence: 3, kind: "listener_reaction", payload: {}, occurredAt },
      { sequence: 4, kind: "utterance", payload: { messageId: "message-2" }, occurredAt },
      { sequence: 5, kind: "utterance", payload: { messageId: "message-3" }, occurredAt },
      { sequence: 6, kind: "power_effect", payload: { v: 1, effect: "identity_shapeshift", state: reshaped }, occurredAt },
    ],
  } as unknown as BotcastEpisode;
  assert.equal(
    botcastIdentityShapeshiftStateBeforeMessageV1(episode, "sam", "message-1")
      ?.targetBotId,
    "mara",
    "the line that announces the form is voiced and faced in that form",
  );
  assert.equal(
    botcastIdentityShapeshiftStateBeforeMessageV1(episode, "sam", "message-2")
      ?.targetBotId,
    "mara",
    "a later reshape never leaks back onto an earlier line",
  );
  assert.equal(
    botcastIdentityShapeshiftStateBeforeMessageV1(episode, "sam", "message-3")
      ?.targetBotId,
    "terry",
  );
  assert.equal(
    botcastIdentityShapeshiftStateBeforeMessageV1(episode, "other", "message-1"),
    null,
  );
});

test("identity shapeshift transition window and deterministic pick stay bounded", () => {
  const state = shapeshiftState();
  const at = Date.parse(occurredAt);
  assert.equal(botIdentityShapeshiftTransitionActiveV1(state, at + 10), true);
  assert.equal(
    botIdentityShapeshiftTransitionActiveV1(
      state,
      at + BOT_IDENTITY_SHAPESHIFT_TRANSITION_MS + 1,
    ),
    false,
  );
  assert.equal(pickBotIdentityShapeshiftCandidateIndexV1("seed-a", 5), pickBotIdentityShapeshiftCandidateIndexV1("seed-a", 5));
  assert.notEqual(
    pickBotIdentityShapeshiftCandidateIndexV1("seed-a", 5),
    pickBotIdentityShapeshiftCandidateIndexV1("seed-b", 5),
  );
  assert.equal(pickBotIdentityShapeshiftCandidateIndexV1("seed", 0), -1);
});
