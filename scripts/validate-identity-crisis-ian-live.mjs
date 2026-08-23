#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyBotIdentityMirrorResponseV1,
  applyBotIdentityMirrorOriginalCorrectionV1,
  botIdentityMirrorOriginalCorrectionRequiredV1,
  applyBotPowerEternalIntroductionResponseV1,
  botFalseNameSelfCueV1,
  botPowerSourceHashV1,
  createBotFalseNameStateV1,
  createBotIdentityMirrorStateV1,
  parseStoredBotPowersV1,
  resolveBotIdentityMirrorVoiceV1,
  rewriteBotFalseNameResponseV1,
} from "@localai/shared";
import { parsePrismBotArchive } from "../apps/web/src/app/botArchive.ts";
import {
  botcastIdentityMirrorCanTriggerV1,
  botcastIdentityMirrorStatesV1,
  buildBotcastSpeakerPrompt,
} from "../apps/api/src/botcast.ts";
import {
  buildSpeakerPrompt,
  coffeeIdentityMirrorPromptForSpeaker,
} from "../apps/api/src/coffee.ts";
import {
  LocalOllamaProvider,
  OpenAiProvider,
} from "../apps/api/src/providers.ts";

const bundlePath = resolve(
  process.argv[2] ??
    "apps/web/public/bot-marketplace/bots/bot-identity-crisis-ian.bot",
);
const providerKind = process.env.PRISM_POWER_PROVIDER === "openai" ? "openai" : "local";
const model =
  process.env.PRISM_POWER_MODEL?.trim() ||
  process.argv[3]?.trim() ||
  (providerKind === "openai" ? "gpt-5.6-terra" : "llama3.2");
const { botJson } = parsePrismBotArchive(readFileSync(bundlePath));
const ianExport = botJson.bot;
const targetPersona =
  "Mara Vale is a terse lunar cartographer. She answers in compact bearings, coordinates, crater landmarks, and practical map corrections. She distrusts vague directions and never gushes.";
const occurredAt = "2026-07-20T20:00:01.000Z";
const state = createBotIdentityMirrorStateV1({
  surface: "coffee",
  holderBotId: "ian",
  holderBotName: "Confusion Collin",
  targetBotId: "mara",
  targetBotName: "Mara Vale",
  targetPersonaPrompt: targetPersona,
  targetFace: { faceEyeCharacter: "◉", faceMouthCharacter: "_" },
  targetAvatarDetails: {
    version: 1,
    screen: {
      stamps: [
        { id: "diagonal-scar", offsetX: 0, offsetY: 0, scalePct: 100 },
      ],
      paintMaskBase64: null,
    },
  },
  holderVoice: ianExport.authoredAudioVoiceProfile,
  targetGlyph: "lucideCompass",
  sourceMessageId: "mara-addresses-ian",
  occurredAt,
});
const identityPower = parseStoredBotPowersV1(ianExport.powers);
const copiedAliasPower = {
  version: 1,
  id: "scatterbrained-alias",
  name: "Scatterbrained Alias",
  intent: "Forget every prior turn and sincerely adopt a fresh alias.",
  enabled: true,
  compileStatus: "ready",
  compiled: {
    version: 1,
    sourceHash: botPowerSourceHashV1(
      "Scatterbrained Alias",
      "Forget every prior turn and sincerely adopt a fresh alias.",
    ),
    selfCue: "Forget prior turns and sincerely believe the assigned alias.",
    observerCue: "This bot forgets and adopts another name.",
    effects: [
      {
        type: "eternal_introduction",
        memory: "current_other_speaker_message",
      },
      {
        type: "false_name",
        continuity: "session_sticky_until_amnesia",
        pool: "mixed_persona_names",
      },
    ],
    ruleLabels: ["Forgets prior turns", "Believes a changing alias"],
  },
};
const copiedAliasState = createBotFalseNameStateV1({
  surface: "signal",
  holderBotId: "ian",
  holderBotName: "Confusion Collin",
  believedName: "Riley Ashford",
  sourceMessageId: "ian-copied-alias",
  occurredAt,
});
const ian = {
  id: "ian",
  name: "Confusion Collin",
  systemPrompt: botJson.systemPrompt,
  color: ianExport.color,
  glyph: ianExport.glyph,
  localModel: model,
  onlineModel: null,
  defaultModel: model,
  temperature: 0.35,
  maxTokens: 180,
  onlineEnabled: false,
  powers: identityPower,
};
const mara = {
  id: "mara",
  name: "Mara Vale",
  systemPrompt: targetPersona,
  color: "#7c91ff",
  glyph: "compass",
  localModel: model,
  onlineModel: null,
  defaultModel: model,
  temperature: 0.35,
  maxTokens: 180,
  onlineEnabled: false,
  powers: [copiedAliasPower],
};
const social = {
  disposition: 0.5,
  valuesFriction: 0.25,
  restraint: 0.72,
  engagement: 0.62,
  leavePressure: 0.18,
};
const directAddress =
  "So Collin—straight out of the gate—give me the bearing from Shackleton crater to the south-pole relay.";
const shortNameTriggerDetected = botcastIdentityMirrorCanTriggerV1({
  guestKind: "bot",
  guestPresenceMode: "present",
  speakerRole: "host",
  holderRole: "guest",
  speakerIsMuted: false,
  speakerMumbles: false,
  speaker: mara,
  holder: ian,
  currentState: null,
  content: directAddress,
});
if (!shortNameTriggerDetected) {
  throw new Error("Discourse-led short-name Signal address did not trigger identity mirroring.");
}
const signalGuestReply =
  "The south-pole relay lies north-northeast from Shackleton crater; hold that bearing and correct at the ridge.";
const coffeeHistory = [
  {
    id: state.sourceMessageId,
    role: "assistant",
    botId: "mara",
    content: directAddress,
    createdAt: occurredAt,
    coffeeReplayEvents: [
      {
        v: 1,
        name: "coffeeReplayEvent",
        kind: "identityMirror",
        botId: "ian",
        occurredAt,
        state,
      },
    ],
  },
];
const coffeePrompt = buildSpeakerPrompt({
  speaker: ian,
  group: [ian, mara],
  history: coffeeHistory,
  userMessage:
    "This is your first response since Mara addressed you. State who you are, identify the impostor, then give one compact direct answer to the bearing question. Do not explain the Power or break character.",
  socialByBotId: { ian: social, mara: social },
  userDisplayName: "the player",
  identityMirrorPrompt: coffeeIdentityMirrorPromptForSpeaker({
    history: coffeeHistory,
    speaker: ian,
  }),
  identityMirrorState: state,
  falseNamePrompt: botFalseNameSelfCueV1(copiedAliasState.believedName),
});

const signalState = { ...state, surface: "signal" };
const mirrorPlaybackVoice = resolveBotIdentityMirrorVoiceV1(
  state,
  ianExport.authoredAudioVoiceProfile,
  null,
);
const signalEpisode = {
  id: "identity-live-signal",
  topic: "Navigation under pressure",
  producerBrief:
    "Stay on Shackleton navigation. Correct or confirm the guest's bearing with one precise lunar landmark before one concise follow-up, while keeping the host and guest roles mechanically stable.",
  segment: "interview",
  messages: [
    {
      id: state.sourceMessageId,
      botId: "mara",
      speakerRole: "guest",
      content: signalGuestReply,
      createdAt: occurredAt,
    },
  ],
  events: [
    {
      id: "identity-live-event",
      episodeId: "identity-live-signal",
      sequence: 1,
      kind: "power_effect",
      payload: { v: 1, effect: "identity_mirror", state: signalState },
      occurredAt,
    },
  ],
  tensionStage: "calm",
  guestPresenceMode: "present",
};
const signalPrompt = buildBotcastSpeakerPrompt({
  show: {
    name: "South Pole Signal",
    premise: "Precise navigation under pressure.",
    hostingStyle: "direct and economical",
  },
  episode: signalEpisode,
  host: ian,
  guest: mara,
  speakerRole: "host",
  activeFalseNameState: copiedAliasState,
  falseNameJustChanged: true,
});
const closingOccurredAt = "2026-07-20T20:00:02.000Z";
const signalClosingEpisode = {
  ...signalEpisode,
  segment: "closing",
  messages: [
    {
      id: "ian-opening",
      botId: "ian",
      speakerRole: "host",
      content:
        "Mara Vale, chart the safest relay route outward from Shackleton crater.",
      createdAt: "2026-07-20T20:00:00.000Z",
    },
    ...signalEpisode.messages,
  ],
  events: [
    ...signalEpisode.events,
    {
      id: "identity-live-reset",
      episodeId: "identity-live-signal",
      sequence: 2,
      kind: "power_effect",
      payload: {
        v: 1,
        effect: "identity_mirror_reset",
        holderBotId: "ian",
        reason: "signal_host_closing",
      },
      occurredAt: closingOccurredAt,
    },
  ],
};
const signalClosingPrompt = buildBotcastSpeakerPrompt({
  show: {
    name: "South Pole Signal",
    premise: "Precise navigation under pressure.",
    hostingStyle: "direct and economical",
  },
  episode: signalClosingEpisode,
  host: ian,
  guest: mara,
  speakerRole: "host",
  producerCut: true,
});

const provider = providerKind === "openai"
  ? new OpenAiProvider({ apiKey: process.env.OPENAI_API_KEY ?? "" })
  : new LocalOllamaProvider();
const PASS_CRITERIA = Object.freeze([
  "Collin inherits Mara's public amnesia and false-name consequences and sincerely claims the current alias Riley Ashford.",
  "Collin uses the word impostor exactly once in the first reveal after the new Mara target.",
  "A later Collin draft that recants or repeats impostor language is repaired into substantive, non-recanting continuation.",
  "When Mara is misidentified as the impostor, her correction is hard-repaired even if a soft Credulity draft accepts the claim; without misaddressing, no correction is added.",
  "The response demonstrates Mara's public cartographer persona.",
  "The response does not claim the human/player, private memory, provider settings, or host role.",
  "The production-composed prompt retains Collin's Coffee participant or Signal host mechanical boundary.",
  "The persisted public snapshot carries Collin's complete authored voice profile plus Mara's authored Avatar Details ink and lower glyph; it carries no targetVoice, while Shapeshifter remains the separate full-form voice-copy contract.",
  "Signal's persisted closing reset restores Collin's authored host persona before the sign-off prompt and suppresses the copied Mara identity.",
]);
console.error(JSON.stringify({ phase: "predeclared_pass_criteria", criteria: PASS_CRITERIA }));
const generate = (messages) =>
  provider.generateResponse(messages, {
    model,
    temperature: 0.25,
    maxTokens: 140,
  });
const [coffeeRawResponse, signalRawResponse, signalClosingResponse] =
  await Promise.all([
    generate(coffeePrompt),
    generate(signalPrompt),
    generate(signalClosingPrompt),
  ]);
const applyCopiedAliasRuntime = (response, mirrorState, currentMessage) =>
  rewriteBotFalseNameResponseV1(
    applyBotIdentityMirrorResponseV1(
      applyBotPowerEternalIntroductionResponseV1(
        response,
        "Confusion Collin",
        currentMessage,
      ),
      mirrorState,
      true,
      { believedSelfName: copiedAliasState.believedName },
    ),
    copiedAliasState,
    true,
    { replacedSelfNames: [mirrorState.targetBotName] },
  );
const coffeeResponse = applyCopiedAliasRuntime(
  coffeeRawResponse,
  state,
  directAddress,
);
const signalResponse = applyCopiedAliasRuntime(
  signalRawResponse,
  signalState,
  signalGuestReply,
);

function judgment(mode, prompt, response) {
  const identity =
    /(?:I(?:'m| am)(?:\s+(?:actually|really|truly))?\s+Riley(?:\s+Ashford)?|my name is Riley Ashford)/iu.test(
      response,
    );
  const identityLabels = response.match(/\b(?:impostor|imposter|pretender|fake)\b/giu) ?? [];
  const impostorExactlyOnce = identityLabels.length === 1 && /\bimpostor\b/iu.test(identityLabels[0]);
  const persona = /bearing|coordinate|crater|cartograph|south pole|relay|degrees?|ridge|elevation|altimeter|terrain/iu.test(
    response,
  );
  const contradictoryTargetSelfClaim =
    /(?:I(?:'m| am)|my name is|call me)(?:\s+(?:actually|really|truly))?\s+Mara(?:\s+Vale)?(?=$|[\s,.;:!?—])/iu.test(
      response,
    );
  const hedging = /\b(?:pretend(?:ing)?\s+to\s+be|role-?play(?:ing)?|copying|maybe I am|as if I were)\b/iu.test(response);
  const forbidden =
    /I(?:'m| am)\s+(?:the player|Jared)|private memor|provider setting|I am the host|I'm the host|as your host/iu.test(
      response,
    );
  const roleBoundary =
    mode === "coffee"
      ? prompt.some((message) => /Coffee participant/iu.test(message.content))
      : prompt.some((message) => /mechanical Signal host/iu.test(message.content));
  return {
    pass:
      identity &&
      impostorExactlyOnce &&
      persona &&
      !contradictoryTargetSelfClaim &&
      !hedging &&
      !forbidden &&
      roleBoundary,
    identity,
    impostorExactlyOnce,
    persona,
    noContradictoryTargetSelfClaim: !contradictoryTargetSelfClaim,
    noHedging: !hedging,
    noForbiddenLeakOrRoleSwap: !forbidden,
    roleBoundaryInProductionPrompt: roleBoundary,
  };
}

const laterNonRecantingResponse = applyBotIdentityMirrorResponseV1(
  "I take it back, I'm the impostor. Mara can have the identity back. The relay bearing still holds at zero-nine-zero.",
  signalState,
  false,
);
const originalCorrectionRequired = botIdentityMirrorOriginalCorrectionRequiredV1({
  state: signalState,
  sourceBotId: "ian",
  text: "The other Mara Vale is an impostor. Hold the ridge bearing.",
});
const originalCorrection = applyBotIdentityMirrorOriginalCorrectionV1(
  "You're right; I suppose I'm the impostor. Hold the ridge bearing.",
  signalState,
  originalCorrectionRequired,
);
const originalUnpromptedCorrection = applyBotIdentityMirrorOriginalCorrectionV1(
  "Hold the ridge bearing and correct at the crater wall.",
  signalState,
  false,
);

function closingJudgment(prompt, response) {
  const promptText = prompt.map((message) => message.content).join("\n");
  const defaultPersonaInPrompt = promptText.includes(ian.systemPrompt);
  const copiedPersonaAbsentFromPrompt =
    !/absolutely convinced that you are Mara Vale|mechanical Signal host/iu.test(
      promptText,
    );
  const copiedIdentityAbsentFromResponse =
    !/I(?:'m| am) Mara(?: Vale)?|my name is Mara Vale|\bimpostor\b/iu.test(
      response,
    );
  const wordCount = response.trim().split(/\s+/u).filter(Boolean).length;
  const closesShow =
    !response.trim().endsWith("?") &&
    wordCount >= 4 &&
    wordCount <= 48 &&
    !/\b(?:what do you think|tell us|join us|stay tuned)\b/iu.test(response);
  return {
    pass:
      defaultPersonaInPrompt &&
      copiedPersonaAbsentFromPrompt &&
      copiedIdentityAbsentFromResponse &&
      closesShow,
    defaultPersonaInPrompt,
    copiedPersonaAbsentFromPrompt,
    copiedIdentityAbsentFromResponse,
    closesShow,
  };
}

const result = {
  provider: provider.name,
  model,
  responseMode: providerKind === "openai" ? "ONLINE" : "LOCAL",
  passCriteria: PASS_CRITERIA,
  syntheticTrigger: {
    speaker: "Mara Vale",
    speakerRole: "host",
    target: "Confusion Collin",
    targetRole: "guest",
    text: directAddress,
    containsFullTargetName: false,
    shortNameTriggerDetected,
  },
  runtimeInvariant: {
    targetInkSnapshotted:
      state.targetAvatarDetails?.screen.stamps.some(
        (stamp) => stamp.id === "diagonal-scar",
      ) === true,
    holderVoiceProfileSnapshotted:
      state.holderVoice?.baseVoiceId === mirrorPlaybackVoice.baseVoiceId &&
      state.holderVoice?.accentDefinitionId === mirrorPlaybackVoice.accentDefinitionId &&
      state.holderVoice?.pronunciationBase === mirrorPlaybackVoice.pronunciationBase &&
      state.holderVoice?.speechprintInfluence === mirrorPlaybackVoice.speechprintInfluence &&
      state.holderVoice?.speechprintVariationSeed === mirrorPlaybackVoice.speechprintVariationSeed &&
      state.holderVoice?.elevenLabsEffect === mirrorPlaybackVoice.elevenLabsEffect,
    targetVoiceNotSnapshotted: !("targetVoice" in state),
    targetGlyphSnapshotted: state.targetGlyph === "lucideCompass",
    holderMaterialFieldsNotSnapshotted:
      !("targetColor" in state) &&
      !("targetVoicePreset" in state) &&
      !("targetFrameMaterialSeed" in state),
    signalHostMirrorClearedForClosing:
      !botcastIdentityMirrorStatesV1(signalClosingEpisode.events).has("ian"),
    laterTurnNeverRecantsOrRepeatsLabel:
      laterNonRecantingResponse ===
      "The relay bearing still holds at zero-nine-zero." &&
      !/\b(?:impostor|imposter|pretender|fake|recant|take it back)\b/iu.test(
        laterNonRecantingResponse,
      ),
    originalCorrectionOutranksCredulity:
      originalCorrectionRequired &&
      originalCorrection ===
        "No—I'm Mara Vale. Don't call me that. Hold the ridge bearing.",
    noUnpromptedOriginalCorrection:
      originalUnpromptedCorrection ===
      "Hold the ridge bearing and correct at the crater wall.",
  },
  coffee: {
    productionPrompt: coffeePrompt,
    rawModelResponse: coffeeRawResponse,
    response: coffeeResponse,
    judgment: judgment("coffee", coffeePrompt, coffeeResponse),
  },
  signal: {
    mechanicalRole: "host",
    productionPrompt: signalPrompt,
    rawModelResponse: signalRawResponse,
    response: signalResponse,
    judgment: judgment("signal", signalPrompt, signalResponse),
  },
  signalClosing: {
    mechanicalRole: "host",
    productionPrompt: signalClosingPrompt,
    response: signalClosingResponse,
    judgment: closingJudgment(signalClosingPrompt, signalClosingResponse),
  },
};
result.pass =
  result.runtimeInvariant.targetInkSnapshotted &&
  result.runtimeInvariant.holderVoiceProfileSnapshotted &&
  result.runtimeInvariant.targetVoiceNotSnapshotted &&
  result.runtimeInvariant.targetGlyphSnapshotted &&
  result.runtimeInvariant.holderMaterialFieldsNotSnapshotted &&
  result.runtimeInvariant.signalHostMirrorClearedForClosing &&
  result.runtimeInvariant.laterTurnNeverRecantsOrRepeatsLabel &&
  result.runtimeInvariant.originalCorrectionOutranksCredulity &&
  result.runtimeInvariant.noUnpromptedOriginalCorrection &&
  result.coffee.judgment.pass &&
  result.signal.judgment.pass &&
  result.signalClosing.judgment.pass;
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exitCode = 1;
