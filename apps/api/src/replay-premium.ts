import { createHash } from "node:crypto";
import {
  ASTERISK_HUMAN_SOUND_VOICE_TAGS,
  BOTCAST_IMMERSIVE_VOICE_TAGS,
  elevenLabsVoiceDirectionForMood,
  normalizeBotAudioVoiceProfileV1,
  normalizeElevenLabsVoiceDirection,
  type ReplayManifestV1,
  type ReplayPremiumVoiceTimingV1,
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
}

function stableJsonHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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

function primaryPremiumInputs(
  manifest: ReplayManifestV1,
  takes: readonly ReplayVoiceTakeRecordV1[],
): ReplayPremiumPlannedInput[] {
  const takeByMessageId = new Map(
    takes
      .filter(
        (take) =>
          take.snapshot.channel === "primary" && take.snapshot.sourceMessageId,
      )
      .map((take) => [take.snapshot.sourceMessageId as string, take]),
  );
  return manifest.utterances.flatMap((utterance) => {
    if (!utterance.audible) return [];
    const take = takeByMessageId.get(utterance.sourceMessageId);
    if (!take || !take.snapshot.audible || take.snapshot.mode === "mute") return [];
    const voiceId = resolveElevenLabsVoiceId(take.snapshot.profile);
    if (!voiceId) {
      throw new Error(
        `${take.snapshot.speakerName} needs an ElevenLabs voice before Premium production can begin.`,
      );
    }
    const text = premiumPerformanceText(take);
    if (Array.from(text).length > REPLAY_PREMIUM_DIALOGUE_MAX_CHARACTERS) {
      throw new Error(
        `${take.snapshot.speakerName}'s saved line exceeds the 2,000-character Premium message limit.`,
      );
    }
    return [{
      sourceMessageId: utterance.sourceMessageId,
      speakerId: take.snapshot.speakerId,
      voiceId,
      text,
      take,
    }];
  });
}

export function planReplayPremiumSegments(
  manifest: ReplayManifestV1,
  takes: readonly ReplayVoiceTakeRecordV1[],
): ReplayPremiumPlannedSegment[] {
  const inputs = primaryPremiumInputs(manifest, takes);
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
    const timings = args.segment.inputs.map((input, index) => {
      const timing = voiceSegments.find(
        (candidate) => Number(candidate.dialogue_input_index) === index,
      );
      return {
        sourceMessageId: input.sourceMessageId,
        startMs: Math.max(0, Math.round(Number(timing?.start_time_seconds ?? 0) * 1_000)),
        endMs: Math.max(1, Math.round(Number(timing?.end_time_seconds ?? 0) * 1_000)),
        alignment: null,
      } satisfies ReplayPremiumVoiceTimingV1;
    });
    const durationMs = Math.max(1, ...timings.map((timing) => timing.endMs));
    return {
      audio: Buffer.from(audioBase64, "base64"),
      contentType: "audio/mpeg",
      durationMs,
      timings,
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
  };
}
