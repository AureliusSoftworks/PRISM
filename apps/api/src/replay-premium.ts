import { createHash } from "node:crypto";
import {
  ASTERISK_HUMAN_SOUND_VOICE_TAGS,
  BOTCAST_IMMERSIVE_VOICE_TAGS,
  elevenLabsVoiceDirectionForMood,
  normalizeBotAudioVoiceProfileV1,
  normalizeElevenLabsVoiceDirection,
  type ReplayManifest,
  type ReplayPremiumAudioActionV1,
  type ReplayPremiumVoiceTimingV1,
  type ReplayVoiceQualityV1,
  type ReplayVoiceTakeRecordV1,
} from "@localai/shared";
import {
  ElevenLabsVoiceError,
  elevenLabsVoiceIsolationSeed,
  requestElevenLabsSpeechWithTimestamps,
  resolveElevenLabsVoiceId,
} from "./voices.ts";

export const REPLAY_PREMIUM_DIALOGUE_MAX_CHARACTERS = 2_000;

export interface ReplayPremiumPlannedInput {
  sourceMessageId: string;
  speakerId: string;
  voiceId: string;
  text: string;
  take: ReplayVoiceTakeRecordV1;
}

export interface ReplayPremiumPlannedSegment {
  index: number;
  strategy: "dialogue" | "isolated_tts";
  inputHash: string;
  inputs: ReplayPremiumPlannedInput[];
}

export interface ReplayPremiumGeneratedSegment {
  audio: Uint8Array;
  contentType: "audio/mpeg";
  durationMs: number;
  timings: ReplayPremiumVoiceTimingV1[];
  characterCost: number;
}

export class ReplayStudioCutEligibilityError extends Error {
  readonly missingSpeakers: string[];

  constructor(
    message: string,
    missingSpeakers: string[],
  ) {
    super(message);
    this.name = "ReplayStudioCutEligibilityError";
    this.missingSpeakers = missingSpeakers;
  }
}

function stableJsonHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function speakerList(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "A speaker";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

function uniqueNames(names: readonly string[]): string[] {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))];
}

function premiumSavedSpeechText(take: ReplayVoiceTakeRecordV1): string {
  const spokenText = take.snapshot.spokenText.replace(/\s+/gu, " ").trim();
  const performanceText = take.snapshot.performanceText
    ?.replace(/\s+/gu, " ")
    .trim();
  const allowedTags = new Set<string>([
    ...BOTCAST_IMMERSIVE_VOICE_TAGS,
    ...ASTERISK_HUMAN_SOUND_VOICE_TAGS,
  ]);
  const safePerformanceText = performanceText
    ? performanceText.replace(/\[([^\]\n]{1,48})\]/giu, (match, tag: string) =>
        allowedTags.has(tag.trim().toLowerCase()) ? " " : match,
      )
    : "";
  return (
    performanceText && safePerformanceText.replace(/\s+/gu, " ").trim() === spokenText
      ? performanceText
      : spokenText
  );
}

function premiumPerformanceText(take: ReplayVoiceTakeRecordV1): string {
  const exactPerformanceText = premiumSavedSpeechText(take);
  const hasPerformanceTag = /\[[^\]\n]{1,48}\]/u.test(exactPerformanceText);
  const profile = normalizeBotAudioVoiceProfileV1(take.snapshot.profile);
  const moodDirection = hasPerformanceTag
    ? null
    : elevenLabsVoiceDirectionForMood(take.snapshot.moodKey);
  const direction = normalizeElevenLabsVoiceDirection(
    [profile.elevenLabsDirection, moodDirection].filter(Boolean).join(", ") || null,
  );
  if (!direction) return exactPerformanceText;
  const prefix = direction
    .split(",")
    .map((entry) => `[${entry.trim().replace(/[\[\]]/gu, "")}]`)
    .join(" ");
  return `${prefix} ${exactPerformanceText}`;
}

function takeByAudibleMessageId(
  manifest: ReplayManifest,
  takes: readonly ReplayVoiceTakeRecordV1[],
): Map<string, ReplayVoiceTakeRecordV1> {
  const audibleMessageIds = new Set(
    manifest.utterances
      .filter((utterance) => utterance.audible)
      .map((utterance) => utterance.sourceMessageId),
  );
  return new Map(
    takes
      .filter(
        (take) =>
          take.snapshot.channel === "primary" &&
          take.snapshot.sourceMessageId &&
          audibleMessageIds.has(take.snapshot.sourceMessageId),
      )
      .map((take) => [take.snapshot.sourceMessageId as string, take]),
  );
}

function premiumTargetMessageIds(
  manifest: ReplayManifest,
  takes: readonly ReplayVoiceTakeRecordV1[],
  intent: ReplayPremiumAudioActionV1,
): Set<string> {
  const takeByMessageId = takeByAudibleMessageId(manifest, takes);
  return new Set(
    manifest.utterances
      .filter((utterance) => utterance.audible)
      .flatMap((utterance) => {
        const take = takeByMessageId.get(utterance.sourceMessageId);
        if (!take || take.snapshot.resolvedEngine === "elevenlabs") return [];
        if (
          intent === "repair" &&
          take.snapshot.requestedEngine !== "elevenlabs"
        ) {
          return [];
        }
        return [utterance.sourceMessageId];
      }),
  );
}

export function classifyReplayVoiceQuality(
  manifest: ReplayManifest,
  takes: readonly ReplayVoiceTakeRecordV1[],
): ReplayVoiceQualityV1 {
  const audibleUtterances = manifest.utterances.filter(
    (utterance) => utterance.audible,
  );
  const takeByMessageId = takeByAudibleMessageId(manifest, takes);
  let premiumLineCount = 0;
  let fallbackLineCount = 0;
  let standardLineCount = 0;
  const missingTakeNames: string[] = [];
  const missingProvenanceNames: string[] = [];
  const missingVoiceNames: string[] = [];
  for (const utterance of audibleUtterances) {
    const take = takeByMessageId.get(utterance.sourceMessageId);
    if (
      !take ||
      !take.snapshot.audible ||
      take.snapshot.mode === "mute"
    ) {
      missingTakeNames.push(utterance.speakerRole);
      continue;
    }
    if (!take.snapshot.resolvedEngine) {
      missingProvenanceNames.push(take.snapshot.speakerName);
      continue;
    }
    if (take.snapshot.resolvedEngine === "elevenlabs") {
      premiumLineCount += 1;
    } else if (take.snapshot.requestedEngine === "elevenlabs") {
      fallbackLineCount += 1;
    } else {
      standardLineCount += 1;
    }
    if (
      take.snapshot.resolvedEngine !== "elevenlabs" &&
      !resolveElevenLabsVoiceId(take.snapshot.profile)
    ) {
      missingVoiceNames.push(take.snapshot.speakerName);
    }
  }
  const totalLineCount = audibleUtterances.length;
  if (totalLineCount === 0) {
    return {
      status: "original_only",
      recommendedAction: null,
      totalLineCount,
      premiumLineCount,
      fallbackLineCount,
      standardLineCount,
      targetLineCount: 0,
      targetCharacterEstimate: 0,
      blockedReason: "This replay has no audible dialogue.",
    };
  }
  if (missingTakeNames.length > 0 || missingProvenanceNames.length > 0) {
    const missingNames = uniqueNames([
      ...missingTakeNames,
      ...missingProvenanceNames,
    ]);
    return {
      status: "original_only",
      recommendedAction: null,
      totalLineCount,
      premiumLineCount,
      fallbackLineCount,
      standardLineCount,
      targetLineCount: 0,
      targetCharacterEstimate: 0,
      blockedReason: `${speakerList(missingNames)} ${
        missingNames.length === 1 ? "is" : "are"
      } missing reliable recorded voice provenance.`,
    };
  }
  if (fallbackLineCount === 0 && standardLineCount === 0) {
    return {
      status: "premium",
      recommendedAction: null,
      totalLineCount,
      premiumLineCount,
      fallbackLineCount,
      standardLineCount,
      targetLineCount: 0,
      targetCharacterEstimate: 0,
      blockedReason: null,
    };
  }
  const recommendedAction: ReplayPremiumAudioActionV1 =
    standardLineCount > 0 ? "upgrade" : "repair";
  const targetMessageIds = premiumTargetMessageIds(
    manifest,
    takes,
    recommendedAction,
  );
  const preservedPremiumWithoutAudio = audibleUtterances.some((utterance) => {
    const take = takeByMessageId.get(utterance.sourceMessageId);
    return (
      take?.snapshot.resolvedEngine === "elevenlabs" &&
      (take.status !== "captured" || !take.audioUrl)
    );
  });
  const targetTakes = audibleUtterances.flatMap((utterance) => {
    if (!targetMessageIds.has(utterance.sourceMessageId)) return [];
    const take = takeByMessageId.get(utterance.sourceMessageId);
    return take ? [take] : [];
  });
  const targetCharacterEstimate = targetTakes.reduce(
    (sum, take) => sum + Array.from(premiumPerformanceText(take)).length,
    0,
  );
  const blockedReason =
    missingVoiceNames.length > 0
      ? `${speakerList(uniqueNames(missingVoiceNames))} ${
          uniqueNames(missingVoiceNames).length === 1 ? "needs" : "need"
        } a saved ElevenLabs voice.`
      : preservedPremiumWithoutAudio
        ? "The successful Premium lines are missing reusable captured takes."
        : null;
  return {
    status: blockedReason
      ? "original_only"
      : recommendedAction === "repair"
        ? "repairable"
        : "upgradeable",
    recommendedAction: blockedReason ? null : recommendedAction,
    totalLineCount,
    premiumLineCount,
    fallbackLineCount,
    standardLineCount,
    targetLineCount: targetMessageIds.size,
    targetCharacterEstimate,
    blockedReason,
  };
}

function primaryPremiumInputs(
  manifest: ReplayManifest,
  takes: readonly ReplayVoiceTakeRecordV1[],
  targetMessageIds: ReadonlySet<string> | null = null,
): ReplayPremiumPlannedInput[] {
  const takeByMessageId = new Map(
    takes
      .filter(
        (take) =>
          take.snapshot.channel === "primary" && take.snapshot.sourceMessageId,
      )
      .map((take) => [take.snapshot.sourceMessageId as string, take]),
  );
  const participantNameById = new Map(
    manifest.participants.map((participant) => [participant.id, participant.name]),
  );
  const audibleUtterances = manifest.utterances.filter(
    (utterance) =>
      utterance.audible &&
      (!targetMessageIds || targetMessageIds.has(utterance.sourceMessageId)),
  );
  const missingSnapshotSpeakers = uniqueNames(
    audibleUtterances.flatMap((utterance) => {
      const take = takeByMessageId.get(utterance.sourceMessageId);
      return !take || !take.snapshot.audible || take.snapshot.mode === "mute"
        ? [
            take?.snapshot.speakerName ??
              participantNameById.get(utterance.speakerId) ??
              utterance.speakerRole,
          ]
        : [];
    }),
  );
  const missingVoiceSpeakers = uniqueNames(
    audibleUtterances.flatMap((utterance) => {
      const take = takeByMessageId.get(utterance.sourceMessageId);
      return take &&
          take.snapshot.audible &&
          take.snapshot.mode !== "mute" &&
          !resolveElevenLabsVoiceId(take.snapshot.profile)
        ? [take.snapshot.speakerName]
        : [];
    }),
  );
  if (missingSnapshotSpeakers.length > 0 || missingVoiceSpeakers.length > 0) {
    const reasons: string[] = [];
    if (missingSnapshotSpeakers.length > 0) {
      const speakers = speakerList(missingSnapshotSpeakers);
      reasons.push(
        `${speakers} ${missingSnapshotSpeakers.length === 1 ? "needs" : "need"} an audible saved replay voice snapshot`,
      );
    }
    if (missingVoiceSpeakers.length > 0) {
      const speakers = speakerList(missingVoiceSpeakers);
      reasons.push(
        `${speakers} ${missingVoiceSpeakers.length === 1 ? "needs" : "need"} an ElevenLabs voice`,
      );
    }
    throw new ReplayStudioCutEligibilityError(
      `${reasons.join("; ")} before Premium audio can be created.`,
      uniqueNames([...missingSnapshotSpeakers, ...missingVoiceSpeakers]),
    );
  }
  return audibleUtterances.map((utterance) => {
    const take = takeByMessageId.get(utterance.sourceMessageId);
    if (!take) {
      throw new Error("Premium audio voice snapshot validation failed.");
    }
    const voiceId = resolveElevenLabsVoiceId(take.snapshot.profile);
    if (!voiceId) {
      throw new Error("Premium audio ElevenLabs voice validation failed.");
    }
    const text = premiumPerformanceText(take);
    if (Array.from(text).length > REPLAY_PREMIUM_DIALOGUE_MAX_CHARACTERS) {
      throw new Error(
        `${take.snapshot.speakerName}'s saved line exceeds the 2,000-character Premium message limit.`,
      );
    }
    return {
      sourceMessageId: utterance.sourceMessageId,
      speakerId: take.snapshot.speakerId,
      voiceId,
      text,
      take,
    };
  });
}

export function planReplayPremiumSegments(
  manifest: ReplayManifest,
  takes: readonly ReplayVoiceTakeRecordV1[],
  generationSeed = "studio-cut",
  intent?: ReplayPremiumAudioActionV1,
): ReplayPremiumPlannedSegment[] {
  const targetMessageIds = intent
    ? premiumTargetMessageIds(manifest, takes, intent)
    : null;
  const inputs = primaryPremiumInputs(manifest, takes, targetMessageIds);
  const speakersByVoiceId = new Map<string, Set<string>>();
  for (const input of inputs) {
    const speakers = speakersByVoiceId.get(input.voiceId) ?? new Set<string>();
    speakers.add(input.speakerId);
    speakersByVoiceId.set(input.voiceId, speakers);
  }
  const sharedVoiceIds = new Set(
    [...speakersByVoiceId.entries()]
      .filter(([, speakers]) => speakers.size > 1)
      .map(([voiceId]) => voiceId),
  );
  const groups: Array<{
    strategy: ReplayPremiumPlannedSegment["strategy"];
    inputs: ReplayPremiumPlannedInput[];
  }> = [];
  let dialogueInputs: ReplayPremiumPlannedInput[] = [];
  let dialogueCharacters = 0;
  const flushDialogue = (): void => {
    if (dialogueInputs.length === 0) return;
    if (new Set(dialogueInputs.map((input) => input.voiceId)).size > 1) {
      groups.push({ strategy: "dialogue", inputs: dialogueInputs });
    } else {
      groups.push(
        ...dialogueInputs.map((input) => ({
          strategy: "isolated_tts" as const,
          inputs: [input],
        })),
      );
    }
    dialogueInputs = [];
    dialogueCharacters = 0;
  };
  for (const input of inputs) {
    if (sharedVoiceIds.has(input.voiceId)) {
      flushDialogue();
      groups.push({ strategy: "isolated_tts", inputs: [input] });
      continue;
    }
    const characters = Array.from(input.text).length;
    if (
      dialogueInputs.length > 0 &&
      dialogueCharacters + characters > REPLAY_PREMIUM_DIALOGUE_MAX_CHARACTERS
    ) {
      flushDialogue();
    }
    dialogueInputs.push(input);
    dialogueCharacters += characters;
  }
  flushDialogue();
  return groups.map((group, index) => ({
    index,
    strategy: group.strategy,
    inputs: group.inputs,
    inputHash: stableJsonHash({
      v: 1,
      generationSeed,
      strategy: group.strategy,
      inputs: group.inputs.map((input) => ({
        sourceMessageId: input.sourceMessageId,
        speakerId: input.speakerId,
        voiceId: input.voiceId,
        text: input.text,
        seed: input.take.snapshot.seed,
        profile: input.take.snapshot.profile,
      })),
    }),
  }));
}

export function replayPremiumInputHash(
  segments: readonly ReplayPremiumPlannedSegment[],
): string {
  return stableJsonHash(segments.map((segment) => segment.inputHash));
}

function alignmentDurationMs(alignment: {
  characterEndTimesSeconds: number[];
} | null): number {
  return Math.max(1, Math.round((alignment?.characterEndTimesSeconds.at(-1) ?? 0) * 1_000));
}

export async function generateReplayPremiumSegment(args: {
  segment: ReplayPremiumPlannedSegment;
  apiKey: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  generationSeed?: string;
}): Promise<ReplayPremiumGeneratedSegment> {
  if (args.segment.strategy === "dialogue") {
    const response = await (args.fetchImpl ?? fetch)(
      "https://api.elevenlabs.io/v1/text-to-dialogue/with-timestamps?output_format=mp3_44100_128",
      {
        method: "POST",
        signal: args.signal,
        headers: {
          "content-type": "application/json",
          "xi-api-key": args.apiKey,
        },
        body: JSON.stringify({
          inputs: args.segment.inputs.map((input) => ({
            text: input.text,
            voice_id: input.voiceId,
          })),
          model_id: "eleven_v3",
          seed: Number.parseInt(
            stableJsonHash({
              generationSeed: args.generationSeed ?? "studio-cut",
              segment: args.segment.index,
            }).slice(0, 8),
            16,
          ),
        }),
      },
    );
    if (!response.ok) {
      const detail = (await response.text()).trim();
      throw new ElevenLabsVoiceError(
        response.status,
        detail || `ElevenLabs dialogue failed (${response.status}).`,
      );
    }
    const payload = (await response.json()) as Record<string, unknown>;
    const audioBase64 = typeof payload.audio_base64 === "string"
      ? payload.audio_base64.trim()
      : "";
    if (!audioBase64) {
      throw new ElevenLabsVoiceError(502, "ElevenLabs returned empty dialogue audio.");
    }
    const voiceSegments = Array.isArray(payload.voice_segments)
      ? payload.voice_segments as Array<Record<string, unknown>>
      : [];
    const rawAlignment =
      payload.normalized_alignment && typeof payload.normalized_alignment === "object"
        ? payload.normalized_alignment as Record<string, unknown>
        : payload.alignment && typeof payload.alignment === "object"
          ? payload.alignment as Record<string, unknown>
          : null;
    const characters = Array.isArray(rawAlignment?.characters)
      ? rawAlignment.characters.filter((value): value is string => typeof value === "string")
      : [];
    const starts = Array.isArray(rawAlignment?.character_start_times_seconds)
      ? rawAlignment.character_start_times_seconds.map(Number)
      : [];
    const ends = Array.isArray(rawAlignment?.character_end_times_seconds)
      ? rawAlignment.character_end_times_seconds.map(Number)
      : [];
    const timings = args.segment.inputs.map((input, index) => {
      const timing = voiceSegments.find(
        (candidate) => Number(candidate.dialogue_input_index) === index,
      );
      const characterStartIndex = Math.max(
        0,
        Math.round(Number(timing?.character_start_index ?? 0)),
      );
      const characterEndIndex = Math.max(
        characterStartIndex,
        Math.round(Number(timing?.character_end_index ?? characterStartIndex)),
      );
      const alignmentCharacters = characters.slice(characterStartIndex, characterEndIndex);
      const alignmentStarts = starts.slice(characterStartIndex, characterEndIndex);
      const alignmentEnds = ends.slice(characterStartIndex, characterEndIndex);
      return {
        sourceMessageId: input.sourceMessageId,
        startMs: Math.max(0, Math.round(Number(timing?.start_time_seconds ?? 0) * 1_000)),
        endMs: Math.max(1, Math.round(Number(timing?.end_time_seconds ?? 0) * 1_000)),
        alignment: alignmentCharacters.length > 0
          ? {
              characters: alignmentCharacters,
              characterStartTimesSeconds: alignmentStarts,
              characterEndTimesSeconds: alignmentEnds,
            }
          : null,
      } satisfies ReplayPremiumVoiceTimingV1;
    });
    const durationMs = Math.max(1, ...timings.map((timing) => timing.endMs));
    return {
      audio: Buffer.from(audioBase64, "base64"),
      contentType: "audio/mpeg",
      durationMs,
      timings,
      characterCost: Math.max(
        0,
        Number.parseInt(response.headers.get("character-cost") ?? "", 10) ||
          args.segment.inputs.reduce(
            (sum, input) => sum + Array.from(input.text).length,
            0,
          ),
      ),
    };
  }

  const input = args.segment.inputs[0];
  if (!input) throw new Error("Premium segment is empty.");
  const speech = await requestElevenLabsSpeechWithTimestamps({
    apiKey: args.apiKey,
    voiceId: input.voiceId,
    model: "eleven_v3",
    text: premiumSavedSpeechText(input.take),
    profile: input.take.snapshot.profile,
    deliveryMood: input.take.snapshot.moodKey,
    seed: elevenLabsVoiceIsolationSeed(input.take.snapshot.speakerId),
    signal: args.signal,
    fetchImpl: args.fetchImpl,
  });
  const alignment = speech.normalizedAlignment ?? speech.alignment;
  const durationMs = alignmentDurationMs(alignment);
  return {
    audio: Buffer.from(speech.audioBase64, "base64"),
    contentType: speech.audioContentType,
    durationMs,
    timings: [{
      sourceMessageId: input.sourceMessageId,
      startMs: 0,
      endMs: durationMs,
      alignment,
    }],
    characterCost: Array.from(input.text).length,
  };
}
