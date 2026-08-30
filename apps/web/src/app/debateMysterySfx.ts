import {
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  type WhodunnitTextVoiceMode,
} from "@localai/shared";
import { enqueueBottishVoice } from "./bottishVoice.ts";
import { routeAudioElementToPrismOutput } from "./replayAudioMasterCapture.ts";
import type { RoomAcousticsSend } from "./roomAcoustics.ts";
import {
  debateExhibitImpactForExhibit,
  playDebateExhibitImpactSfx,
  type DebateExhibitImpactMaterial,
} from "./debateExhibitImpactSfx.ts";

export type DebateMysterySfxCue =
  | "map"
  | "navigate"
  | "enter"
  | "return"
  | "dialogue-dismiss"
  | "theory"
  | "evidence"
  | "paper"
  | "paper-pickup"
  | "paper-place"
  | "folder"
  | "clip"
  | "pencil";

export interface DebateMysterySfxVoice {
  delayMs: number;
  gain: number;
  playbackRate: number;
  url: string;
}

export const DEBATE_MYSTERY_TEXT_VOICE_VOLUME_RATIO = 0.28;
/** @deprecated Prefer the mode-neutral text voice ratio. */
export const DEBATE_MYSTERY_TEXT_BOTTISH_VOLUME_RATIO =
  DEBATE_MYSTERY_TEXT_VOICE_VOLUME_RATIO;

type DebateMysteryRestoredPlaybackStateV2 = {
  playPhase: string;
  dialogueHistory: readonly {
    lineId?: string | null;
    nodeId: string;
    occurredAt: string;
  }[];
  court?: {
    activeStatementId?: string | null;
    statements: readonly {
      lineId: string;
      statementId: string;
      version: number;
    }[];
  } | null;
};

/** The already-heard durable line that an Archive return must not replay. */
export function debateMysteryRestoredAudioPerformanceKeyV2(
  state: DebateMysteryRestoredPlaybackStateV2,
): string | null {
  if (state.playPhase === "trial" && state.court) {
    const statement = state.court.statements.find(
      (entry) => entry.statementId === state.court?.activeStatementId,
    ) ?? state.court.statements[0] ?? null;
    return statement
      ? `statement:${statement.statementId}:${statement.version}:${statement.lineId}`
      : null;
  }
  const dialogue = state.dialogueHistory.at(-1) ?? null;
  return dialogue?.lineId
    ? `${dialogue.nodeId}:${dialogue.occurredAt}:${dialogue.lineId}`
    : null;
}

export function debateMysteryPreparedAudioShouldStart(args: {
  audioEnabled: boolean;
  audioVolume: number;
  interrogationAudioMayStart: boolean;
  lastPlayedPerformanceKey: string | null;
  lineId: string | null;
  playbackPerformanceKey: string;
  restoredPerformanceKey: string | null;
  voicesEnabled: boolean;
}): boolean {
  return Boolean(
    args.lineId &&
    args.interrogationAudioMayStart &&
    args.voicesEnabled &&
    args.audioEnabled &&
    args.audioVolume > 0 &&
    args.playbackPerformanceKey !== args.restoredPerformanceKey &&
    args.playbackPerformanceKey !== args.lastPlayedPerformanceKey
  );
}

export function debateMysteryTextVoiceShouldStart(args: {
  audible: boolean;
  delivery?: "spoken" | "text_only" | "anonymous_babble";
  key: string | null;
  mode: WhodunnitTextVoiceMode;
  startedKey: string | null;
  startedMode: WhodunnitTextVoiceMode | null;
  streaming: boolean;
  visibleText: string;
}): boolean {
  return Boolean(
    args.key &&
    args.mode !== "off" &&
    (args.startedKey !== args.key || args.startedMode !== args.mode) &&
    args.delivery === "text_only" &&
    args.streaming &&
    !args.audible &&
    /\S/u.test(args.visibleText),
  );
}

export function debateMysteryTextVoiceShouldStop(args: {
  audible: boolean;
  delivery?: "spoken" | "text_only" | "anonymous_babble";
  key: string | null;
  mode: WhodunnitTextVoiceMode;
  startedKey: string | null;
  startedMode: WhodunnitTextVoiceMode | null;
  streaming: boolean;
}): boolean {
  return Boolean(
    args.startedKey &&
    (
      args.startedKey !== args.key ||
      args.mode === "off" ||
      args.startedMode !== args.mode ||
      args.delivery !== "text_only" ||
      !args.streaming ||
      args.audible
    ),
  );
}

export async function playDebateMysteryTextVoice(args: {
  enabled: boolean;
  mode: WhodunnitTextVoiceMode;
  seed: string;
  signal?: AbortSignal;
  text: string;
  volume: number;
  roomAcoustics?: RoomAcousticsSend;
  play?: (args: {
    mode: Exclude<WhodunnitTextVoiceMode, "off">;
    seed: string;
    signal?: AbortSignal;
    text: string;
    volume: number;
    roomAcoustics?: RoomAcousticsSend;
  }) => Promise<boolean>;
}): Promise<boolean> {
  const volume = Math.max(0, Math.min(1, args.volume));
  if (
    !args.enabled ||
    args.mode === "off" ||
    volume <= 0 ||
    !args.text.trim()
  ) return false;
  try {
    const playbackVolume = volume * DEBATE_MYSTERY_TEXT_VOICE_VOLUME_RATIO;
    if (args.play) {
      return args.play({
        mode: args.mode,
        seed: args.seed,
        signal: args.signal,
        text: args.text,
        volume: playbackVolume,
        roomAcoustics: args.roomAcoustics,
      });
    }
    if (args.mode !== "bottish") return false;
    await enqueueBottishVoice(
      args.text,
      DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
      args.seed,
      true,
      playbackVolume,
      undefined,
      undefined,
      args.roomAcoustics,
    );
    return true;
  } catch {
    return false;
  }
}

export const debateMysteryTextBottishShouldStart =
  debateMysteryTextVoiceShouldStart;
export const debateMysteryTextBottishShouldStop =
  debateMysteryTextVoiceShouldStop;

export function debateMysteryDialoguePresentationDismissed(
  previousKey: string | null,
  nextKey: string | null,
): boolean {
  return Boolean(previousKey && previousKey !== nextKey);
}

export type DebateMysteryDeskItemSfxMoment = "pickup" | "place";

export const DEBATE_MYSTERY_DESK_ITEM_PICKUP_VOLUME_RATIO = 0.5;

interface DebateMysteryDeskImpactItem {
  adjective?: string | null;
  object?: string | null;
  title?: string | null;
}

export function debateMysteryDeskItemSfxPlan(args: {
  item: DebateMysteryDeskImpactItem;
  moment: DebateMysteryDeskItemSfxMoment;
  volume: number;
}): {
  material: DebateExhibitImpactMaterial;
  url: string;
  trim: number;
  volume: number;
} {
  const impact = debateExhibitImpactForExhibit(args.item, "table_place");
  const volume = Math.max(0, Math.min(1, args.volume));
  return {
    material: impact.material,
    url: impact.url,
    trim: impact.trim,
    volume: volume * (args.moment === "pickup"
      ? DEBATE_MYSTERY_DESK_ITEM_PICKUP_VOLUME_RATIO
      : 1),
  };
}

export async function playDebateMysteryDeskItemSfx(args: {
  item: DebateMysteryDeskImpactItem;
  moment: DebateMysteryDeskItemSfxMoment;
  enabled: boolean;
  volume: number;
  roomAcoustics?: RoomAcousticsSend | null;
}): Promise<boolean> {
  const plan = debateMysteryDeskItemSfxPlan(args);
  return playDebateExhibitImpactSfx({
    exhibit: args.item,
    moment: "table_place",
    enabled: args.enabled,
    volume: plan.volume,
    roomAcoustics: args.roomAcoustics,
  });
}

const SINGLE_VOICE_CUES = {
  map: {
    delayMs: 0,
    gain: 0.12,
    playbackRate: 0.94,
    url: "/audio/ui-asmr/bot-hover-02.mp3",
  },
  navigate: {
    delayMs: 0,
    gain: 0.18,
    playbackRate: 0.9,
    url: "/audio/ui-asmr/panel-open-03.mp3",
  },
  enter: {
    delayMs: 0,
    gain: 0.2,
    playbackRate: 0.88,
    url: "/audio/ui-asmr/bot-hover-03.mp3",
  },
  return: {
    delayMs: 0,
    gain: 0.15,
    playbackRate: 0.92,
    url: "/audio/ui-asmr/panel-close-02.mp3",
  },
  "dialogue-dismiss": {
    delayMs: 0,
    gain: 0.14,
    playbackRate: 1.08,
    url: "/audio/ui-asmr/panel-close-01.mp3",
  },
  theory: {
    delayMs: 0,
    gain: 0.2,
    playbackRate: 0.82,
    url: "/audio/prism-companion/glass-tap-03.mp3",
  },
  paper: { delayMs: 0, gain: 0.12, playbackRate: 0.82, url: "/audio/ui-asmr/panel-open-03.mp3" },
  "paper-pickup": { delayMs: 0, gain: 0.34, playbackRate: 1.02, url: "/audio/debate/desk-paper-pickup-01.mp3" },
  "paper-place": { delayMs: 0, gain: 0.38, playbackRate: 0.98, url: "/audio/debate/desk-paper-place-01.mp3" },
  folder: { delayMs: 0, gain: 0.18, playbackRate: 0.68, url: "/audio/ui-asmr/panel-close-02.mp3" },
  clip: { delayMs: 0, gain: 0.14, playbackRate: 1.16, url: "/audio/prism-companion/glass-tap-03.mp3" },
  pencil: { delayMs: 0, gain: 0.09, playbackRate: 1.34, url: "/audio/ui-asmr/bot-hover-02.mp3" },
} as const satisfies Record<
  Exclude<DebateMysterySfxCue, "evidence">,
  DebateMysterySfxVoice
>;

/**
 * The evidence cue is a small descending mystery figure assembled from a
 * bundled, already-reviewed glass voice. Reusing one source keeps the notes
 * timbrally coherent while the pitch and decay create a distinct discovery
 * chime without adding a network-generated runtime dependency.
 */
export const DEBATE_MYSTERY_EVIDENCE_CHIME: readonly DebateMysterySfxVoice[] = [
  {
    delayMs: 0,
    gain: 0.3,
    playbackRate: 1,
    url: "/audio/prism-companion/glass-tap-04.mp3",
  },
  {
    delayMs: 135,
    gain: 0.22,
    playbackRate: 0.8,
    url: "/audio/prism-companion/glass-tap-04.mp3",
  },
  {
    delayMs: 320,
    gain: 0.14,
    playbackRate: 2 / 3,
    url: "/audio/prism-companion/glass-tap-04.mp3",
  },
] as const;

export const DEBATE_MYSTERY_SFX_COOLDOWN_MS = {
  map: 55,
  navigate: 110,
  enter: 110,
  return: 110,
  // Each visible dialogue handoff is authored as a distinct dismissal.
  "dialogue-dismiss": 0,
  theory: 180,
  evidence: 700,
  paper: 80,
  "paper-pickup": 80,
  "paper-place": 80,
  folder: 110,
  clip: 90,
  pencil: 70,
} as const satisfies Record<DebateMysterySfxCue, number>;

const lastPlaybackAt = new Map<DebateMysterySfxCue, number>();

export function debateMysterySfxVoices(
  cue: DebateMysterySfxCue,
): readonly DebateMysterySfxVoice[] {
  return cue === "evidence"
    ? DEBATE_MYSTERY_EVIDENCE_CHIME
    : [SINGLE_VOICE_CUES[cue]];
}

export function debateMysterySfxCueForAction(args: {
  action: string;
  acquiredEvidence: boolean;
  nextPlayPhase: string;
}): DebateMysterySfxCue | null {
  if (args.acquiredEvidence) return "evidence";
  if (args.action === "travel") return "navigate";
  if (
    args.action === "begin_investigation" ||
    args.action === "begin_interview"
  ) {
    return "enter";
  }
  if (args.action === "end_activity") {
    return args.nextPlayPhase === "theory" ? "theory" : "return";
  }
  if (args.action === "file_theory") return "theory";
  return null;
}

function playVoice(
  voice: DebateMysterySfxVoice,
  masterVolume: number,
): Promise<boolean> {
  const audio = new Audio(voice.url);
  audio.preload = "auto";
  audio.volume = Math.max(0, Math.min(1, masterVolume * voice.gain));
  audio.defaultPlaybackRate = voice.playbackRate;
  audio.playbackRate = voice.playbackRate;
  audio.preservesPitch = false;
  const outputCleanup = routeAudioElementToPrismOutput(audio);
  const release = (): void => {
    outputCleanup?.();
    audio.removeEventListener("ended", release);
    audio.removeEventListener("error", release);
  };
  audio.addEventListener("ended", release);
  audio.addEventListener("error", release);
  return audio.play().then(
    () => true,
    () => {
      release();
      return false;
    },
  );
}

export async function playDebateMysterySfx(args: {
  cue: DebateMysterySfxCue;
  enabled: boolean;
  volume: number;
  now?: number;
}): Promise<boolean> {
  if (!args.enabled) return false;
  const volume = Math.max(0, Math.min(1, args.volume));
  if (volume <= 0 || typeof Audio !== "function") return false;

  const now = args.now ?? performance.now();
  const previous = lastPlaybackAt.get(args.cue) ?? -Infinity;
  if (now - previous < DEBATE_MYSTERY_SFX_COOLDOWN_MS[args.cue]) return false;
  lastPlaybackAt.set(args.cue, now);

  const [first, ...tail] = debateMysterySfxVoices(args.cue);
  if (!first) return false;
  for (const voice of tail) {
    window.setTimeout(() => {
      void playVoice(voice, volume);
    }, voice.delayMs);
  }
  return playVoice(first, volume);
}
