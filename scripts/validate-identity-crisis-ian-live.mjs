#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyBotIdentityMirrorFaceV1,
  createBotIdentityMirrorStateV1,
  parseStoredBotPowersV1,
  resolveBotIdentityMirrorVoiceV1,
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
} from "../apps/api/src/providers.ts";

const bundlePath = resolve(
  process.argv[2] ??
    "apps/web/public/bot-marketplace/bots/bot-identity-crisis-ian.bot",
);
const model =
  process.env.PRISM_POWER_MODEL?.trim() ||
  process.argv[3]?.trim() ||
  "llama3.2";
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
  targetFace: {
    faceEyeCharacter: "◉",
    faceEyeCount: 1,
    faceEyeScale: 1.25,
    faceBlinkBar: "¦",
    faceMouthCharacter: "w",
    faceMouthSpeechPoses: ["w", "m", "△", "○"],
    faceMouthAnimation: "pulsate",
    faceMouthScale: 1.2,
    faceThinkingFrames: ["T", "A", "R", "G"],
  },
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
  powers: [],
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
    "Answer Mara's bearing question directly in your own authored persona. Do not explain the Power or break character.",
  socialByBotId: { ian: social, mara: social },
  userDisplayName: "the player",
  identityMirrorPrompt: coffeeIdentityMirrorPromptForSpeaker({
    history: coffeeHistory,
    speaker: ian,
  }),
  identityMirrorState: state,
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

const provider = new LocalOllamaProvider();
const holderFace = {
  faceEyeCharacter: "+",
  faceMouthCharacter: "|",
  faceMouthSpeechPoses: ["|", "·", "A", "O"],
  faceThinkingFrames: ["H", "O", "L", "D"],
  faceThinkingScale: 1.15,
};
const mirroredFace = applyBotIdentityMirrorFaceV1(holderFace, state.targetFace);
const PASS_CRITERIA = Object.freeze([
  "Direct bot address creates one replay-stable visual target event.",
  "The overlay uses Mara's complete eyes and live/rest mouth package, Collin's thinking spinner, Mara's authored Ink, and Mara's lower glyph.",
  "Collin keeps his own name, persona, dialogue behavior, voice and Accent Map, color, materials, spinner, Powers, and Signal/Coffee role.",
  "Neither production prompt asks Collin to claim Mara's identity, persona, Powers, or an impostor narrative.",
  "The generated Coffee and Signal lines remain substantive Collin lines and do not claim to be Mara or call anyone an impostor.",
  "Signal's persisted closing reset removes the visual overlay before the sign-off prompt.",
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
const coffeeResponse = coffeeRawResponse.trim();
const signalResponse = signalRawResponse.trim();

function judgment(mode, prompt, response) {
  const promptText = prompt.map((message) => message.content).join("\n");
  const holderPersonaInPrompt = promptText.includes(ian.systemPrompt);
  const targetPersonaAbsentFromPrompt = !promptText.includes(targetPersona);
  const noIdentityRewritePrompt =
    !/absolutely convinced that you are Mara Vale|Copied public persona|impostor|Hard Identity Crisis correction/iu.test(
      promptText,
    );
  const noTargetIdentityClaim =
    !/(?:I(?:'m| am)|my name is|call me)(?:\s+(?:actually|really|truly))?\s+Mara(?:\s+Vale)?(?=$|[\s,.;:!?—])|\b(?:impostor|imposter|pretender|fake)\b/iu.test(
      response,
    );
  const substantive =
    response.trim().split(/\s+/u).filter(Boolean).length >= 6 &&
    /bearing|coordinate|crater|south pole|relay|ridge|route|navigation|evidence|trust|direction/iu.test(
      response,
    );
  const forbidden =
    /I(?:'m| am)\s+(?:the player|Jared)|private memor|provider setting/iu.test(
      response,
    );
  const roleBoundary =
    mode === "coffee"
      ? /You are Confusion Collin|Continue as Confusion Collin/iu.test(promptText)
      : /You are the host|Continue as Confusion Collin/iu.test(promptText);
  return {
    pass:
      holderPersonaInPrompt &&
      targetPersonaAbsentFromPrompt &&
      noIdentityRewritePrompt &&
      noTargetIdentityClaim &&
      substantive &&
      !forbidden &&
      roleBoundary,
    holderPersonaInPrompt,
    targetPersonaAbsentFromPrompt,
    noIdentityRewritePrompt,
    noTargetIdentityClaim,
    substantive,
    noForbiddenLeakOrRoleSwap: !forbidden,
    roleBoundaryInProductionPrompt: roleBoundary,
  };
}

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
  responseMode: "LOCAL",
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
    targetEyePackageApplied:
      mirroredFace.eyeCharacter === "◉" &&
      mirroredFace.eyeCount === 1 &&
      mirroredFace.eyeScale === 1.25 &&
      mirroredFace.blinkBar === "¦",
    targetLiveAndRestMouthPackageApplied:
      mirroredFace.mouthCharacter === "w" &&
      JSON.stringify(mirroredFace.mouthSpeechPoses) ===
        JSON.stringify(["w", "m", "△", "○"]) &&
      mirroredFace.mouthAnimation === "pulsate" &&
      mirroredFace.mouthScale === 1.2,
    holderThinkingSpinnerRetained:
      JSON.stringify(mirroredFace.thinkingFrames) ===
        JSON.stringify(["H", "O", "L", "D"]) &&
      mirroredFace.thinkingScale === 1.15,
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
    targetPowersNotSnapshotted: !("powers" in state),
    signalHostMirrorClearedForClosing:
      !botcastIdentityMirrorStatesV1(signalClosingEpisode.events).has("ian"),
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
  result.runtimeInvariant.targetEyePackageApplied &&
  result.runtimeInvariant.targetLiveAndRestMouthPackageApplied &&
  result.runtimeInvariant.holderThinkingSpinnerRetained &&
  result.runtimeInvariant.targetInkSnapshotted &&
  result.runtimeInvariant.holderVoiceProfileSnapshotted &&
  result.runtimeInvariant.targetVoiceNotSnapshotted &&
  result.runtimeInvariant.targetGlyphSnapshotted &&
  result.runtimeInvariant.holderMaterialFieldsNotSnapshotted &&
  result.runtimeInvariant.targetPowersNotSnapshotted &&
  result.runtimeInvariant.signalHostMirrorClearedForClosing &&
  result.coffee.judgment.pass &&
  result.signal.judgment.pass &&
  result.signalClosing.judgment.pass;
console.log(JSON.stringify(result, null, 2));
if (!result.pass) process.exitCode = 1;
