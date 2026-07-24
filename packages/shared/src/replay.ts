import type {
  BotAudioVoiceProfileV1,
  EnglishVoiceEngine,
  VoiceDeliveryMood,
  VoiceMode,
} from "./audioVoice.js";

export const REPLAY_MANIFEST_VERSION = 1 as const;
export const REPLAY_MANIFEST_V2_VERSION = 2 as const;
export const REPLAY_VIDEO_WIDTH = 1920 as const;
export const REPLAY_VIDEO_HEIGHT = 1080 as const;
export const REPLAY_VIDEO_FPS = 30 as const;

export type ReplaySurfaceV1 = "signal" | "coffee";
export type ReplayAvailabilityV2 =
  | "saving"
  | "faithful"
  | "transcript_only";

export type ReplayRecordingStatusV1 =
  | "collecting"
  | "queued"
  | "preparing_audio"
  | "rendering"
  | "ready"
  | "ready_with_warnings"
  | "failed";

export type ReplayRenderKindV1 = "standard" | "premium";

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

export type ReplayDirectionEventKindV2 =
  | "scene_snapshot"
  | "speech"
  | "camera"
  | "segment"
  | "thinking"
  | "arrival"
  | "mood"
  | "top_off"
  | "sip"
  | "action"
  | "reaction"
  | "overlap"
  | "departure"
  | "studio_mix"
  | "voice_setting"
  | "intro"
  | "outro";

export interface ReplayDirectionEventV2 {
  sequence: number;
  atMs: number;
  endMs?: number;
  kind: ReplayDirectionEventKindV2;
  sourceMessageId?: string | null;
  payload: Record<string, unknown>;
}

export interface ReplayThinkingDirectionPayloadV2
  extends Record<string, unknown> {
  participantId: string;
  botId: string;
  startMs: number;
  endMs: number;
  audible: boolean;
  camera: string | null;
  segment: string | null;
  followingMessageId: string | null;
  endReason:
    | "completed"
    | "interrupted"
    | "cancelled"
    | "failed"
    | "replaced"
    | "capture_end";
}

export interface ReplayParticipantSceneV2 {
  visible: boolean;
  present: boolean;
  speaking: boolean;
  thinking: boolean;
  mood: string | null;
  cupLevel: number | null;
  sipping: boolean;
  voiceMode: VoiceMode | null;
  audible: boolean;
  gain: number;
  pan: number;
  effects: string[];
}

export interface ReplaySceneSnapshotV2 {
  camera: string | null;
  segment: string | null;
  introActive: boolean;
  outroActive: boolean;
  activeAction: string | null;
  activeReaction: string | null;
  overlapMessageIds: string[];
  studioMix: Record<string, number>;
  participants: Record<string, ReplayParticipantSceneV2>;
}

export interface ReplayManifestV2 {
  v: typeof REPLAY_MANIFEST_V2_VERSION;
  surface: ReplaySurfaceV1;
  sourceId: string;
  title: string;
  createdAt: string;
  completedAt: string;
  privacyMode: "local" | "online" | "mixed";
  participants: ReplayParticipantSnapshotV1[];
  utterances: ReplayUtteranceV1[];
  initialScene: ReplaySceneSnapshotV2;
  direction: ReplayDirectionEventV2[];
  visual: ReplayManifestV1["visual"];
}

export type ReplayManifest = ReplayManifestV1 | ReplayManifestV2;

export interface ReplaySceneCheckpointV2 {
  atMs: number;
  nextEventIndex: number;
  state: ReplaySceneSnapshotV2;
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

export type ReplayPremiumProductionPhaseV1 =
  | "idle"
  | "mastering_voices"
  | "mixing_episode"
  | "rendering_studio"
  | "finalizing"
  | "ready"
  | "failed";

export interface ReplayPremiumProductionV1 {
  phase: ReplayPremiumProductionPhaseV1;
  progress: number;
  inputHash: string | null;
  masterReady: boolean;
  audioUrl: string | null;
  videoUrl: string | null;
  timeline: ReplayTimelineV1 | null;
  warning: string | null;
  error: string | null;
  updatedAt: string | null;
}

export interface ReplayPremiumVoiceTimingV1 {
  sourceMessageId: string;
  startMs: number;
  endMs: number;
  alignment: ReplaySpeechAlignmentV1 | null;
}

export interface ReplayPremiumSegmentV1 {
  id: string;
  recordingId: string;
  index: number;
  strategy: "dialogue" | "isolated_tts";
  inputHash: string;
  sourceMessageIds: string[];
  audioUrl: string;
  audioContentType: string;
  durationMs: number;
  timings: ReplayPremiumVoiceTimingV1[];
  createdAt: string;
  updatedAt: string;
}

export interface ReplayRecordingV1 {
  id: string;
  surface: ReplaySurfaceV1;
  sourceId: string;
  status: ReplayRecordingStatusV1;
  progress: number;
  manifest: ReplayManifest | null;
  timeline: ReplayTimelineV1 | null;
  width: number;
  height: number;
  fps: number;
  durationMs: number | null;
  sizeBytes: number | null;
  codec: string | null;
  contentType: string | null;
  videoUrl: string | null;
  /** Flattened live Signal/Coffee output. This is the canonical faithful recording. */
  audioUrl?: string | null;
  audioContentType?: string | null;
  audioSizeBytes?: number | null;
  audioDurationMs?: number | null;
  transcriptVttUrl: string | null;
  transcriptMarkdownUrl: string | null;
  /** V2 availability is derived from durable audio + manifest presence. */
  availability?: ReplayAvailabilityV2;
  warning: string | null;
  error: string | null;
  premiumProduction?: ReplayPremiumProductionV1 | null;
  createdAt: string;
  updatedAt: string;
}

const REPLAY_TITLE_CARD_MS = 2_100;
const REPLAY_SIGNAL_INTRO_CARD_MS = 4_200;
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
  const capturedSpeechTimingByMessageId = new Map<
    string,
    { startMs?: number; endMs?: number }
  >();
  let capturedOutroStartMs: number | null = null;
  let capturedEndMs: number | null = null;
  for (const event of manifest.events) {
    if (event.kind !== "capture_timing") continue;
    const phase = event.payload.phase;
    const atMs = Number(event.payload.atMs);
    if (!Number.isFinite(atMs) || atMs < 0) continue;
    const roundedAtMs = Math.round(atMs);
    if (phase === "outro_start") {
      capturedOutroStartMs = roundedAtMs;
      continue;
    }
    if (phase === "capture_end") {
      capturedEndMs = roundedAtMs;
      continue;
    }
    const messageId =
      typeof event.payload.messageId === "string"
        ? event.payload.messageId.trim()
        : "";
    if (!messageId) continue;
    const timing = capturedSpeechTimingByMessageId.get(messageId) ?? {};
    if (phase === "speech_start") timing.startMs = roundedAtMs;
    if (phase === "speech_end") timing.endMs = roundedAtMs;
    capturedSpeechTimingByMessageId.set(messageId, timing);
  }
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
  const savedIntroPresentationMs = Number(
    manifest.visual.metadata?.introPresentationDurationMs,
  );
  const firstCapturedSpeechStartMs = Math.min(
    ...[...capturedSpeechTimingByMessageId.values()].flatMap((timing) =>
      typeof timing.startMs === "number" ? [timing.startMs] : [],
    ),
  );
  const titleCardMs = Number.isFinite(firstCapturedSpeechStartMs)
    ? Math.max(0, Math.round(firstCapturedSpeechStartMs))
    : manifest.surface === "signal"
      ? Math.max(
          REPLAY_SIGNAL_INTRO_CARD_MS,
          Number.isFinite(savedIntroPresentationMs)
            ? Math.round(savedIntroPresentationMs)
            : 0,
        )
      : REPLAY_TITLE_CARD_MS;
  const beats: ReplayTimelineBeatV1[] = [
    {
      id: "title",
      kind: "title",
      startMs: 0,
      endMs: titleCardMs,
      utteranceId: null,
      sourceMessageId: null,
      speakerId: null,
      speakerName: null,
      text: manifest.title,
      channel: null,
    },
  ];
  let cursorMs = titleCardMs + 260;
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
    const capturedTiming = capturedSpeechTimingByMessageId.get(
      utterance.sourceMessageId,
    );
    const startMs =
      typeof capturedTiming?.startMs === "number"
        ? capturedTiming.startMs
        : overlapRatio !== null && previousUtteranceBeat
        ? Math.round(
            previousUtteranceBeat.startMs +
              (previousUtteranceBeat.endMs - previousUtteranceBeat.startMs) *
                overlapRatio,
          )
        : cursorMs;
    const endMs =
      typeof capturedTiming?.endMs === "number" &&
      capturedTiming.endMs > startMs
        ? capturedTiming.endMs
        : startMs + durationMs;
    const participant = participantById.get(utterance.speakerId);
    const beat: ReplayTimelineBeatV1 = {
      id: `utterance:${utterance.id}`,
      kind: "utterance",
      startMs,
      endMs,
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
  const endStartMs =
    capturedOutroStartMs ??
    Math.max(cursorMs + 240, titleCardMs + 1_000);
  const endEndMs =
    capturedEndMs !== null && capturedEndMs > endStartMs
      ? capturedEndMs
      : endStartMs + REPLAY_END_CARD_MS;
  beats.push({
    id: "end",
    kind: "end",
    startMs: endStartMs,
    endMs: endEndMs,
    utteranceId: null,
    sourceMessageId: null,
    speakerId: null,
    speakerName: null,
    text: manifest.surface === "signal" ? "End of episode" : "The table settles",
    channel: null,
  });
  return {
    v: REPLAY_MANIFEST_VERSION,
    durationMs: beats.at(-1)?.endMs ?? titleCardMs + REPLAY_END_CARD_MS,
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

function finiteNonNegativeNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function cloneParticipantScene(
  participant: ReplayParticipantSceneV2,
): ReplayParticipantSceneV2 {
  return { ...participant, effects: [...participant.effects] };
}

export function cloneReplaySceneV2(
  scene: ReplaySceneSnapshotV2,
): ReplaySceneSnapshotV2 {
  return {
    ...scene,
    overlapMessageIds: [...scene.overlapMessageIds],
    studioMix: { ...scene.studioMix },
    participants: Object.fromEntries(
      Object.entries(scene.participants).map(([id, participant]) => [
        id,
        cloneParticipantScene(participant),
      ]),
    ),
  };
}

export function defaultReplaySceneV2(
  participants: readonly ReplayParticipantSnapshotV1[],
): ReplaySceneSnapshotV2 {
  return {
    camera: null,
    segment: null,
    introActive: false,
    outroActive: false,
    activeAction: null,
    activeReaction: null,
    overlapMessageIds: [],
    studioMix: {},
    participants: Object.fromEntries(
      participants.map((participant) => [
        participant.id,
        {
          visible: participant.visible,
          present: participant.visible,
          speaking: false,
          thinking: false,
          mood: null,
          cupLevel: null,
          sipping: false,
          voiceMode: null,
          audible: true,
          gain: 1,
          pan: 0,
          effects: [],
        } satisfies ReplayParticipantSceneV2,
      ]),
    ),
  };
}

function eventParticipantId(event: ReplayDirectionEventV2): string | null {
  const value =
    event.payload.participantId ??
    event.payload.speakerId ??
    event.payload.botId ??
    null;
  return boundedId(value) || null;
}

function updateParticipantScene(
  state: ReplaySceneSnapshotV2,
  participantId: string | null,
  patch: Partial<ReplayParticipantSceneV2>,
): void {
  if (!participantId) return;
  const current = state.participants[participantId] ?? {
    visible: true,
    present: true,
    speaking: false,
    thinking: false,
    mood: null,
    cupLevel: null,
    sipping: false,
    voiceMode: null,
    audible: true,
    gain: 1,
    pan: 0,
    effects: [],
  };
  state.participants[participantId] = {
    ...current,
    ...patch,
    effects: patch.effects ? [...patch.effects] : [...current.effects],
  };
}

/**
 * Applies one private direction event without reading wall-clock state.
 * Signal and Coffee share this reducer so a seek always reconstructs the
 * same scene from the saved master-audio timestamp.
 */
export function reduceReplaySceneV2(
  previous: ReplaySceneSnapshotV2,
  event: ReplayDirectionEventV2,
): ReplaySceneSnapshotV2 {
  const state = cloneReplaySceneV2(previous);
  const participantId = eventParticipantId(event);
  const active = event.payload.active !== false;
  switch (event.kind) {
    case "scene_snapshot": {
      const snapshot = event.payload.scene;
      if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)) {
        return cloneReplaySceneV2(snapshot as ReplaySceneSnapshotV2);
      }
      return state;
    }
    case "speech": {
      updateParticipantScene(state, participantId, {
        speaking: active,
        audible: event.payload.audible !== false,
        voiceMode:
          typeof event.payload.voiceMode === "string"
            ? (event.payload.voiceMode as VoiceMode)
            : null,
        gain: finiteNonNegativeNumber(event.payload.gain) ?? 1,
        pan: Math.max(
          -1,
          Math.min(1, Number(event.payload.pan) || 0),
        ),
        effects: Array.isArray(event.payload.effects)
          ? event.payload.effects.filter(
              (effect): effect is string => typeof effect === "string",
            )
          : [],
      });
      return state;
    }
    case "camera":
      state.camera = boundedText(event.payload.shot, 80) || null;
      return state;
    case "segment":
      state.segment = boundedText(event.payload.segment, 120) || null;
      return state;
    case "thinking":
      if (active && (event.payload.camera === null || typeof event.payload.camera === "string")) {
        state.camera = event.payload.camera;
      }
      if (
        active &&
        (event.payload.segment === null ||
          typeof event.payload.segment === "string")
      ) {
        state.segment = event.payload.segment;
      }
      updateParticipantScene(state, participantId, {
        thinking: active,
        ...(active && typeof event.payload.audible === "boolean"
          ? { audible: event.payload.audible }
          : {}),
      });
      return state;
    case "arrival":
      updateParticipantScene(state, participantId, {
        present: true,
        visible: event.payload.visible !== false,
      });
      return state;
    case "mood":
      updateParticipantScene(state, participantId, {
        mood: boundedText(event.payload.mood, 80) || null,
      });
      return state;
    case "top_off":
      updateParticipantScene(state, participantId, {
        cupLevel:
          finiteNonNegativeNumber(event.payload.cupLevel) ??
          finiteNonNegativeNumber(event.payload.level),
      });
      return state;
    case "sip":
      updateParticipantScene(state, participantId, { sipping: active });
      return state;
    case "action":
      state.activeAction = active
        ? boundedText(
            event.payload.userVisibleText ?? event.payload.text,
            500,
          ) || null
        : null;
      return state;
    case "reaction":
      state.activeReaction = active
        ? boundedText(event.payload.text ?? event.payload.kind, 500) || null
        : null;
      return state;
    case "overlap": {
      const ids = Array.isArray(event.payload.messageIds)
        ? event.payload.messageIds
            .map((value) => boundedId(value))
            .filter(Boolean)
        : event.sourceMessageId
          ? [event.sourceMessageId]
          : [];
      state.overlapMessageIds = active ? ids : [];
      return state;
    }
    case "departure":
      updateParticipantScene(state, participantId, {
        present: false,
        visible: false,
        speaking: false,
        thinking: false,
        sipping: false,
      });
      return state;
    case "studio_mix":
      state.studioMix = Object.fromEntries(
        Object.entries(event.payload).flatMap(([key, value]) => {
          const number = finiteNonNegativeNumber(value);
          return number === null ? [] : [[key, number]];
        }),
      );
      return state;
    case "voice_setting":
      updateParticipantScene(state, participantId, {
        voiceMode:
          typeof event.payload.voiceMode === "string"
            ? (event.payload.voiceMode as VoiceMode)
            : null,
        audible: event.payload.audible !== false,
        gain: finiteNonNegativeNumber(event.payload.gain) ?? 1,
        pan: Math.max(-1, Math.min(1, Number(event.payload.pan) || 0)),
        effects: Array.isArray(event.payload.effects)
          ? event.payload.effects.filter(
              (effect): effect is string => typeof effect === "string",
            )
          : [],
      });
      return state;
    case "intro":
      state.introActive = active;
      return state;
    case "outro":
      state.outroActive = active;
      return state;
  }
}

export function buildReplaySceneCheckpointsV2(
  manifest: ReplayManifestV2,
  intervalMs = 10_000,
): ReplaySceneCheckpointV2[] {
  const checkpoints: ReplaySceneCheckpointV2[] = [
    {
      atMs: 0,
      nextEventIndex: 0,
      state: cloneReplaySceneV2(manifest.initialScene),
    },
  ];
  let state = cloneReplaySceneV2(manifest.initialScene);
  let nextAtMs = Math.max(1_000, intervalMs);
  const transitions = replayDirectionTransitionsV2(manifest);
  transitions.forEach((event, index) => {
    state = reduceReplaySceneV2(state, event);
    if (event.atMs < nextAtMs) return;
    checkpoints.push({
      atMs: event.atMs,
      nextEventIndex: index + 1,
      state: cloneReplaySceneV2(state),
    });
    nextAtMs = event.atMs + Math.max(1_000, intervalMs);
  });
  return checkpoints;
}

export function replaySceneAtV2(
  manifest: ReplayManifestV2,
  atMs: number,
  checkpoints: readonly ReplaySceneCheckpointV2[] =
    buildReplaySceneCheckpointsV2(manifest),
): ReplaySceneSnapshotV2 {
  const targetMs = Math.max(0, Number.isFinite(atMs) ? atMs : 0);
  let checkpoint = checkpoints[0] ?? {
    atMs: 0,
    nextEventIndex: 0,
    state: manifest.initialScene,
  };
  for (const candidate of checkpoints) {
    if (candidate.atMs > targetMs) break;
    checkpoint = candidate;
  }
  let state = cloneReplaySceneV2(checkpoint.state);
  const transitions = replayDirectionTransitionsV2(manifest);
  for (
    let index = checkpoint.nextEventIndex;
    index < transitions.length;
    index += 1
  ) {
    const event = transitions[index]!;
    if (event.atMs > targetMs) break;
    state = reduceReplaySceneV2(state, event);
  }
  return state;
}

const REPLAY_DIRECTION_DURATION_KINDS = new Set<ReplayDirectionEventKindV2>([
  "speech",
  "thinking",
  "sip",
  "action",
  "reaction",
  "overlap",
  "intro",
  "outro",
]);

function replayDirectionTransitionsV2(
  manifest: ReplayManifestV2,
): ReplayDirectionEventV2[] {
  return manifest.direction
    .flatMap((event) => [
      event,
      ...(event.endMs !== undefined &&
      REPLAY_DIRECTION_DURATION_KINDS.has(event.kind)
        ? [
            {
              ...event,
              atMs: event.endMs,
              endMs: undefined,
              payload: { ...event.payload, active: false },
            },
          ]
        : []),
    ])
    .sort(
      (left, right) =>
        left.atMs - right.atMs ||
        left.sequence - right.sequence ||
        Number(left.payload.active !== false) -
          Number(right.payload.active !== false),
    );
}

export function compileReplayTimelineV2(
  manifest: ReplayManifestV2,
): ReplayTimelineV1 {
  const participantById = new Map(
    manifest.participants.map((participant) => [participant.id, participant]),
  );
  const utteranceByMessageId = new Map(
    manifest.utterances.map((utterance) => [
      utterance.sourceMessageId,
      utterance,
    ]),
  );
  const beats = manifest.direction.flatMap((event) => {
    if (event.kind !== "speech" || event.payload.active === false) return [];
    const messageId = event.sourceMessageId ?? "";
    const utterance = utteranceByMessageId.get(messageId);
    if (!utterance) return [];
    const speakerId =
      boundedId(event.payload.speakerId) || utterance.speakerId;
    return [
      {
        id: `utterance:${utterance.id}`,
        kind: "utterance" as const,
        startMs: event.atMs,
        endMs: Math.max(event.atMs + 1, event.endMs ?? event.atMs + 1),
        utteranceId: utterance.id,
        sourceMessageId: messageId,
        speakerId,
        speakerName:
          participantById.get(speakerId)?.name ?? utterance.speakerRole,
        text: utterance.text,
        channel:
          event.payload.channel === "crosstalk" ||
          event.payload.channel === "reaction"
            ? event.payload.channel
            : "primary",
      } satisfies ReplayTimelineBeatV1,
    ];
  });
  const durationMs = Math.max(
    1,
    ...manifest.direction.map((event) => event.endMs ?? event.atMs),
  );
  return {
    v: REPLAY_MANIFEST_VERSION,
    durationMs,
    beats: [
      ...beats,
      {
        id: "end",
        kind: "end",
        startMs: durationMs,
        endMs: durationMs,
        utteranceId: null,
        sourceMessageId: null,
        speakerId: null,
        speakerName: null,
        text:
          manifest.surface === "signal"
            ? "End of episode"
            : "The table settles",
        channel: null,
      },
    ],
  };
}

export function replayManifestV2IsValid(
  value: unknown,
): value is ReplayManifestV2 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (
    record.v !== REPLAY_MANIFEST_V2_VERSION ||
    (record.surface !== "signal" && record.surface !== "coffee") ||
    !boundedId(record.sourceId) ||
    !boundedText(record.title, 240) ||
    !boundedText(record.createdAt, 80) ||
    !boundedText(record.completedAt, 80) ||
    (record.privacyMode !== "local" &&
      record.privacyMode !== "online" &&
      record.privacyMode !== "mixed") ||
    !Array.isArray(record.participants) ||
    !Array.isArray(record.utterances) ||
    !record.initialScene ||
    typeof record.initialScene !== "object" ||
    Array.isArray(record.initialScene) ||
    !Array.isArray(record.direction)
  ) {
    return false;
  }
  let priorSequence = 0;
  let priorAtMs = -1;
  const directionKinds = new Set<ReplayDirectionEventKindV2>([
    "scene_snapshot",
    "speech",
    "camera",
    "segment",
    "thinking",
    "arrival",
    "mood",
    "top_off",
    "sip",
    "action",
    "reaction",
    "overlap",
    "departure",
    "studio_mix",
    "voice_setting",
    "intro",
    "outro",
  ]);
  for (const entry of record.direction) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return false;
    const event = entry as Record<string, unknown>;
    const sequence = Number(event.sequence);
    const atMs = finiteNonNegativeNumber(event.atMs);
    const endMs =
      event.endMs === undefined ? null : finiteNonNegativeNumber(event.endMs);
    if (
      !Number.isInteger(sequence) ||
      sequence <= priorSequence ||
      atMs === null ||
      atMs < priorAtMs ||
      (endMs !== null && endMs < atMs) ||
      typeof event.kind !== "string" ||
      !directionKinds.has(event.kind as ReplayDirectionEventKindV2) ||
      !event.payload ||
      typeof event.payload !== "object" ||
      Array.isArray(event.payload)
    ) {
      return false;
    }
    if (event.kind === "thinking") {
      const payload = event.payload as Record<string, unknown>;
      const endReasons = new Set<ReplayThinkingDirectionPayloadV2["endReason"]>([
        "completed",
        "interrupted",
        "cancelled",
        "failed",
        "replaced",
        "capture_end",
      ]);
      if (
        !boundedId(payload.participantId) ||
        !boundedId(payload.botId) ||
        finiteNonNegativeNumber(payload.startMs) !== atMs ||
        endMs === null ||
        finiteNonNegativeNumber(payload.endMs) !== endMs ||
        typeof payload.audible !== "boolean" ||
        !(
          payload.camera === null ||
          typeof payload.camera === "string"
        ) ||
        !(
          payload.segment === null ||
          typeof payload.segment === "string"
        ) ||
        !(
          payload.followingMessageId === null ||
          typeof payload.followingMessageId === "string"
        ) ||
        typeof payload.endReason !== "string" ||
        !endReasons.has(
          payload.endReason as ReplayThinkingDirectionPayloadV2["endReason"],
        )
      ) {
        return false;
      }
    }
    priorSequence = sequence;
    priorAtMs = atMs;
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

export function replayManifestToMarkdownV2(
  manifest: ReplayManifestV2,
  timeline: ReplayTimelineV1 = compileReplayTimelineV2(manifest),
): string {
  const actionByMessageId = new Map<string, string[]>();
  for (const event of manifest.direction) {
    if (event.kind !== "action") continue;
    const text = boundedText(
      event.payload.userVisibleText ?? event.payload.text,
      500,
    );
    if (!text) continue;
    const key = event.sourceMessageId ?? `at:${event.atMs}`;
    actionByMessageId.set(key, [
      ...(actionByMessageId.get(key) ?? []),
      text,
    ]);
  }
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
      const actions = actionByMessageId.get(beat.sourceMessageId ?? "") ?? [];
      return [
        `**${time} · ${beat.speakerName ?? utterance?.speakerRole ?? "Speaker"}**`,
        "",
        beat.text,
        ...actions.flatMap((action) => ["", `*${action}*`]),
        "",
      ];
    }),
  ].join("\n");
}
