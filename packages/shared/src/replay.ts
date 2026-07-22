import type {
  BotAudioVoiceProfileV1,
  EnglishVoiceEngine,
  VoiceDeliveryMood,
  VoiceMode,
} from "./audioVoice.js";

export const REPLAY_MANIFEST_VERSION = 1 as const;
export const REPLAY_VIDEO_WIDTH = 1920 as const;
export const REPLAY_VIDEO_HEIGHT = 1080 as const;
export const REPLAY_VIDEO_FPS = 30 as const;

export type ReplaySurfaceV1 = "signal" | "coffee";

export type ReplayRecordingStatusV1 =
  | "collecting"
  | "queued"
  | "preparing_audio"
  | "rendering"
  | "ready"
  | "ready_with_warnings"
  | "failed";

export type ReplayParticipantKindV1 = "bot" | "player" | "prism";

export interface ReplayParticipantSnapshotV1 {
  id: string;
  name: string;
  kind: ReplayParticipantKindV1;
  role: string;
  color: string | null;
  glyph: string | null;
  seatIndex: number | null;
  visible: boolean;
  metadata?: Record<string, unknown>;
}

export interface ReplayUtteranceV1 {
  id: string;
  sourceMessageId: string;
  speakerId: string;
  speakerRole: string;
  text: string;
  spokenText: string;
  moodKey: VoiceDeliveryMood;
  audible: boolean;
  visible: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface ReplayEventV1 {
  id: string;
  kind: string;
  sourceMessageId: string | null;
  occurredAt: string | null;
  payload: Record<string, unknown>;
}

export interface ReplayManifestV1 {
  v: typeof REPLAY_MANIFEST_VERSION;
  surface: ReplaySurfaceV1;
  sourceId: string;
  title: string;
  createdAt: string;
  completedAt: string;
  privacyMode: "local" | "online" | "mixed";
  participants: ReplayParticipantSnapshotV1[];
  utterances: ReplayUtteranceV1[];
  events: ReplayEventV1[];
  visual: {
    theme: "light" | "dark";
    accentColor: string | null;
    atmosphereImageUrl: string | null;
    metadata?: Record<string, unknown>;
  };
}

export interface ReplayVoiceTakeV1 {
  v: typeof REPLAY_MANIFEST_VERSION;
  sourceKey: string;
  sourceMessageId: string | null;
  sourceEventId: string | null;
  speakerId: string;
  speakerName: string;
  spokenText: string;
  performanceText: string | null;
  mode: VoiceMode;
  requestedEngine: EnglishVoiceEngine | null;
  resolvedEngine: string | null;
  profile: BotAudioVoiceProfileV1;
  moodKey: VoiceDeliveryMood;
  effectsEnabled: boolean;
  gain: number;
  stereoPan: number;
  channel: "primary" | "crosstalk" | "reaction";
  seed: string;
  audible: boolean;
  durationMs: number | null;
  alignment: ReplaySpeechAlignmentV1 | null;
}

export interface ReplaySpeechAlignmentV1 {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
}

export interface ReplayVoiceTakeRecordV1 {
  id: string;
  recordingId: string;
  snapshot: ReplayVoiceTakeV1;
  status: "planned" | "captured" | "missing" | "failed";
  audioUrl: string | null;
  audioContentType: string | null;
  audioSizeBytes: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReplayTimelineBeatV1 {
  id: string;
  kind: "title" | "utterance" | "event" | "end";
  startMs: number;
  endMs: number;
  utteranceId: string | null;
  sourceMessageId: string | null;
  speakerId: string | null;
  speakerName: string | null;
  text: string;
  channel: "primary" | "crosstalk" | "reaction" | null;
}

export interface ReplayTimelineV1 {
  v: typeof REPLAY_MANIFEST_VERSION;
  durationMs: number;
  beats: ReplayTimelineBeatV1[];
}

export interface ReplayRecordingV1 {
  id: string;
  surface: ReplaySurfaceV1;
  sourceId: string;
  status: ReplayRecordingStatusV1;
  progress: number;
  manifest: ReplayManifestV1 | null;
  timeline: ReplayTimelineV1 | null;
  width: number;
  height: number;
  fps: number;
  durationMs: number | null;
  sizeBytes: number | null;
  codec: string | null;
  contentType: string | null;
  videoUrl: string | null;
  transcriptVttUrl: string | null;
  transcriptMarkdownUrl: string | null;
  warning: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

const REPLAY_TITLE_CARD_MS = 2_100;
const REPLAY_END_CARD_MS = 2_000;
const REPLAY_BETWEEN_UTTERANCES_MS = 420;
const REPLAY_MIN_UTTERANCE_MS = 1_200;
const REPLAY_MAX_UTTERANCE_MS = 45_000;

function boundedText(value: unknown, max = 20_000): string {
  return typeof value === "string"
    ? value.replace(/\r\n?/gu, "\n").trim().slice(0, max)
    : "";
}

function boundedId(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 180) : "";
}

function estimatedUtteranceDurationMs(text: string): number {
  const wordCount = text.trim().split(/\s+/u).filter(Boolean).length;
  const punctuationPauses = (text.match(/[.!?;:—]/gu) ?? []).length * 115;
  return Math.min(
    REPLAY_MAX_UTTERANCE_MS,
    Math.max(REPLAY_MIN_UTTERANCE_MS, wordCount * 330 + punctuationPauses + 420),
  );
}

function overlapStartRatioForMessage(
  manifest: ReplayManifestV1,
  sourceMessageId: string,
): number | null {
  for (const event of manifest.events) {
    if (
      event.kind !== "perceptionOverlap" &&
      event.kind !== "perception_overlap"
    ) {
      continue;
    }
    if (event.payload.overlappingMessageId !== sourceMessageId) continue;
    const ratio = Number(event.payload.startRatio);
    if (Number.isFinite(ratio)) return Math.max(0.58, Math.min(0.72, ratio));
    return 0.66;
  }
  return null;
}

export function compileReplayTimelineV1(
  manifest: ReplayManifestV1,
  takes: readonly ReplayVoiceTakeRecordV1[] = [],
): ReplayTimelineV1 {
  const takeByMessageId = new Map(
    takes
      .filter(
        (take) =>
          take.snapshot.sourceMessageId && take.snapshot.channel === "primary",
      )
      .map((take) => [take.snapshot.sourceMessageId as string, take]),
  );
  const participantById = new Map(
    manifest.participants.map((participant) => [participant.id, participant]),
  );
  const beats: ReplayTimelineBeatV1[] = [
    {
      id: "title",
      kind: "title",
      startMs: 0,
      endMs: REPLAY_TITLE_CARD_MS,
      utteranceId: null,
      sourceMessageId: null,
      speakerId: null,
      speakerName: null,
      text: manifest.title,
      channel: null,
    },
  ];
  let cursorMs = REPLAY_TITLE_CARD_MS + 260;
  let previousUtteranceBeat: ReplayTimelineBeatV1 | null = null;
  for (const utterance of manifest.utterances) {
    const take = takeByMessageId.get(utterance.sourceMessageId);
    const snapshotDuration = take?.snapshot.durationMs;
    const durationMs = utterance.audible
      ? Math.min(
          REPLAY_MAX_UTTERANCE_MS,
          Math.max(
            REPLAY_MIN_UTTERANCE_MS,
            typeof snapshotDuration === "number" && Number.isFinite(snapshotDuration)
              ? Math.round(snapshotDuration)
              : estimatedUtteranceDurationMs(utterance.spokenText || utterance.text),
          ),
        )
      : Math.min(3_000, estimatedUtteranceDurationMs(utterance.text));
    const overlapRatio = overlapStartRatioForMessage(
      manifest,
      utterance.sourceMessageId,
    );
    const startMs =
      overlapRatio !== null && previousUtteranceBeat
        ? Math.round(
            previousUtteranceBeat.startMs +
              (previousUtteranceBeat.endMs - previousUtteranceBeat.startMs) *
                overlapRatio,
          )
        : cursorMs;
    const participant = participantById.get(utterance.speakerId);
    const beat: ReplayTimelineBeatV1 = {
      id: `utterance:${utterance.id}`,
      kind: "utterance",
      startMs,
      endMs: startMs + durationMs,
      utteranceId: utterance.id,
      sourceMessageId: utterance.sourceMessageId,
      speakerId: utterance.speakerId,
      speakerName: participant?.name ?? utterance.speakerRole,
      text: utterance.text,
      channel: overlapRatio !== null ? "crosstalk" : "primary",
    };
    beats.push(beat);
    previousUtteranceBeat = beat;
    cursorMs = Math.max(cursorMs, beat.endMs + REPLAY_BETWEEN_UTTERANCES_MS);
  }
  const endStartMs = Math.max(cursorMs + 240, REPLAY_TITLE_CARD_MS + 1_000);
  beats.push({
    id: "end",
    kind: "end",
    startMs: endStartMs,
    endMs: endStartMs + REPLAY_END_CARD_MS,
    utteranceId: null,
    sourceMessageId: null,
    speakerId: null,
    speakerName: null,
    text: manifest.surface === "signal" ? "End of episode" : "The table settles",
    channel: null,
  });
  return {
    v: REPLAY_MANIFEST_VERSION,
    durationMs: beats.at(-1)?.endMs ?? REPLAY_TITLE_CARD_MS + REPLAY_END_CARD_MS,
    beats,
  };
}

function vttTimestamp(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1_000);
  const milliseconds = total % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

export function replayTimelineToWebVttV1(timeline: ReplayTimelineV1): string {
  const cues = timeline.beats.filter((beat) => beat.kind === "utterance");
  return [
    "WEBVTT",
    "",
    ...cues.flatMap((beat, index) => [
      String(index + 1),
      `${vttTimestamp(beat.startMs)} --> ${vttTimestamp(beat.endMs)}`,
      `${beat.speakerName ?? "Speaker"}: ${beat.text.replace(/\n+/gu, " ")}`,
      "",
    ]),
  ].join("\n");
}

export function replayManifestToMarkdownV1(
  manifest: ReplayManifestV1,
  timeline: ReplayTimelineV1,
): string {
  const utteranceById = new Map(
    manifest.utterances.map((utterance) => [utterance.id, utterance]),
  );
  return [
    `# ${manifest.title}`,
    "",
    `Replay: ${manifest.surface === "signal" ? "Signal" : "Coffee"}`,
    `Completed: ${manifest.completedAt}`,
    "",
    ...timeline.beats.flatMap((beat) => {
      if (beat.kind !== "utterance" || !beat.utteranceId) return [];
      const utterance = utteranceById.get(beat.utteranceId);
      const minute = Math.floor(beat.startMs / 60_000);
      const second = Math.floor((beat.startMs % 60_000) / 1_000);
      const time = `${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
      return [
        `**${time} · ${beat.speakerName ?? utterance?.speakerRole ?? "Speaker"}**`,
        "",
        beat.text,
        "",
      ];
    }),
  ].join("\n");
}

export function replayManifestV1IsValid(value: unknown): value is ReplayManifestV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    record.v !== REPLAY_MANIFEST_VERSION ||
    (record.surface !== "signal" && record.surface !== "coffee") ||
    !boundedId(record.sourceId) ||
    !boundedText(record.title, 240) ||
    !Array.isArray(record.participants) ||
    !Array.isArray(record.utterances) ||
    !Array.isArray(record.events)
  ) {
    return false;
  }
  return record.utterances.every((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const row = entry as Record<string, unknown>;
    return Boolean(
      boundedId(row.id) &&
        boundedId(row.sourceMessageId) &&
        boundedId(row.speakerId) &&
        boundedText(row.text),
    );
  });
}
