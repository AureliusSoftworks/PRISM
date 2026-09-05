import {
  DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
  WHODUNNIT_SFX_CUES_V1,
  type BotAudioVoiceProfileV1,
  type WhodunnitTextVoiceMode,
} from "@localai/shared";
import { enqueueBottishVoice } from "./bottishVoice.ts";
import { DEBATE_IDENT_AUDIO } from "./debateIdentAudio.ts";
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
  | "pencil"
  | "room-complete";

export interface DebateMysterySfxVoice {
  delayMs: number;
  gain: number;
  playbackRate: number;
  url: string;
}

export const DEBATE_MYSTERY_TEXT_VOICE_VOLUME_RATIO = 0.28;
/** A player observation is the investigator speaking, so it carries at closer
 * to full voice volume than the quiet accompaniment under other written lines. */
export const DEBATE_MYSTERY_PLAYER_OBSERVATION_VOICE_VOLUME_RATIO = 0.6;
/** @deprecated Prefer the mode-neutral text voice ratio. */
export const DEBATE_MYSTERY_TEXT_BOTTISH_VOLUME_RATIO =
  DEBATE_MYSTERY_TEXT_VOICE_VOLUME_RATIO;

export function debateMysteryTextVoiceModeForPresentation(args: {
  configuredMode: WhodunnitTextVoiceMode;
  playerObservation: boolean;
}): WhodunnitTextVoiceMode {
  if (args.configuredMode === "off") return "off";
  // An investigation is Bottish all the way to Court: the player's
  // observations and every other written line alike.
  return "bottish";
}

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

/** Prepared local speech owns the caption clock once it becomes audible. */
export function debateMysteryCaptionFallbackShouldStart(args: {
  preparedAudioExpected: boolean;
  preparedAudioStatus: "idle" | "pending" | "started" | "unavailable";
}): boolean {
  return !args.preparedAudioExpected || args.preparedAudioStatus === "unavailable";
}

export function debateMysteryTextVoiceShouldStart(args: {
  audible: boolean;
  delivery?: "spoken" | "text_only" | "persona_babble" | "anonymous_babble";
  key: string | null;
  mode: WhodunnitTextVoiceMode;
  playerObservation: boolean;
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
  delivery?: "spoken" | "text_only" | "persona_babble" | "anonymous_babble";
  key: string | null;
  mode: WhodunnitTextVoiceMode;
  playerObservation: boolean;
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
  instant?: boolean;
  mode: WhodunnitTextVoiceMode;
  voiceProfile: BotAudioVoiceProfileV1 | null;
  seed: string;
  signal?: AbortSignal;
  text: string;
  volume: number;
  roomAcoustics?: RoomAcousticsSend;
  play?: (args: {
    instant?: boolean;
    mode: Exclude<WhodunnitTextVoiceMode, "off">;
    voiceProfile: BotAudioVoiceProfileV1 | null;
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
    (args.mode === "babble" && !args.voiceProfile) ||
    volume <= 0 ||
    !args.text.trim()
  ) return false;
  try {
    const playbackVolume = volume * (
      args.instant
        ? DEBATE_MYSTERY_PLAYER_OBSERVATION_VOICE_VOLUME_RATIO
        : DEBATE_MYSTERY_TEXT_VOICE_VOLUME_RATIO
    );
    if (args.play) {
      return args.play({
        instant: args.instant,
        mode: args.mode,
        voiceProfile: args.voiceProfile,
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
      args.voiceProfile ?? DEFAULT_BOT_AUDIO_VOICE_PROFILE_V1,
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
  "room-complete": { delayMs: 0, gain: 0.35, playbackRate: 1, url: DEBATE_IDENT_AUDIO.intro.url },
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
  "room-complete": 500,
} as const satisfies Record<DebateMysterySfxCue, number>;

const lastPlaybackAt = new Map<DebateMysterySfxCue, number>();

/**
 * The venue's own effects pack for the case on screen. The experience installs
 * it from the case's frozen venue snapshot and clears it on unmount; while a
 * cue has a venue clip that clip plays at the cue's tuned gain in place of the
 * bundled voice. Null keeps the bundled palette, so nothing here changes when
 * a venue owns no effects.
 */
let venueSfxUrls: Partial<Record<DebateMysterySfxCue, string>> | null = null;

export function setDebateMysteryVenueSfxV1(
  next: Partial<Record<DebateMysterySfxCue, string>> | null,
): void {
  venueSfxUrls = next && Object.keys(next).length > 0 ? { ...next } : null;
}

export function debateMysteryVenueSfxUrlV1(cue: DebateMysterySfxCue): string | null {
  return venueSfxUrls?.[cue] ?? null;
}

/** The bundled PRISM clip a cue falls back to; the Library auditions it beside venue clips. */
export function debateMysteryBundledSfxUrlV1(cue: DebateMysterySfxCue): string {
  return cue === "evidence"
    ? DEBATE_MYSTERY_EVIDENCE_CHIME[0]!.url
    : SINGLE_VOICE_CUES[cue].url;
}

export function debateMysterySfxVoices(
  cue: DebateMysterySfxCue,
): readonly DebateMysterySfxVoice[] {
  const venueUrl = venueSfxUrls?.[cue];
  if (venueUrl) {
    return [{ delayMs: 0, gain: WHODUNNIT_SFX_CUES_V1[cue].gain, playbackRate: 1, url: venueUrl }];
  }
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

/** A room ident belongs only to the new, dialogue-free completion presentation. */
export function debateMysteryRoomCompletionCueShouldStart(args: {
  completionCueRoomId: string | null;
  currentRoomId: string | null;
  presentationVisible: boolean;
  roomDialogueVisible: boolean;
  startedRoomId: string | null;
}): boolean {
  return Boolean(
    args.completionCueRoomId &&
      args.completionCueRoomId === args.currentRoomId &&
      args.presentationVisible &&
      !args.roomDialogueVisible &&
      args.startedRoomId !== args.completionCueRoomId,
  );
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

export interface DebateMysteryVocalCueEntryV2 {
  id: string;
  kind: "lead_in" | "listening";
  url: string;
  durationMs: number;
}

/** A lead-in is the investigator's own short voice before their Bottish
 * line, so it carries near speaking volume. */
export const DEBATE_MYSTERY_VOCAL_LEAD_IN_VOLUME_RATIO = 0.8;
/** A listening reaction stays under the line it answers. */
export const DEBATE_MYSTERY_VOCAL_LISTENING_VOLUME_RATIO = 0.5;
/** A lead-in never holds the Bottish line longer than this, whatever the clip. */
export const DEBATE_MYSTERY_VOCAL_LEAD_IN_MAX_WAIT_MS = 900;

export function mysteryVocalSeedUnitV2(seed: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) / 4_294_967_296;
}

/** Picks one cue of a kind, stable for a given line so replay and re-render
 * agree, or null when the voice recorded none of that kind. */
export function pickMysteryVocalCueV2(
  entries: readonly DebateMysteryVocalCueEntryV2[],
  kind: DebateMysteryVocalCueEntryV2["kind"],
  seed: string,
): DebateMysteryVocalCueEntryV2 | null {
  const candidates = entries.filter((entry) => entry.kind === kind);
  if (!candidates.length) return null;
  return candidates[Math.min(candidates.length - 1, Math.floor(mysteryVocalSeedUnitV2(seed) * candidates.length))] ?? null;
}

/** When a listener reacts during a typed line: past the opening beat, inside
 * the stretch the line takes to appear, stable per line. */
export function mysteryListeningReactionDelayMsV2(seed: string, lineLength: number): number {
  const window = Math.max(400, Math.min(1_800, lineLength * 22));
  return Math.round(450 + mysteryVocalSeedUnitV2(`${seed}:delay`) * window);
}

/** Plays one short cue and resolves when it ends, errors, is aborted, or the
 * wait cap passes, so a stuck clip never holds what follows it. */
export function playDebateMysteryVocalCueV2(args: {
  url: string;
  volume: number;
  signal?: AbortSignal;
  maxWaitMs?: number;
}): Promise<void> {
  return new Promise((resolve) => {
    if (args.signal?.aborted || args.volume <= 0 || typeof Audio === "undefined") {
      resolve();
      return;
    }
    const audio = new Audio(args.url);
    audio.volume = Math.min(1, Math.max(0, args.volume));
    let settled = false;
    let cap: number | null = null;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      if (cap !== null) window.clearTimeout(cap);
      args.signal?.removeEventListener("abort", stop);
      resolve();
    };
    const stop = (): void => {
      audio.pause();
      finish();
    };
    audio.addEventListener("ended", finish);
    audio.addEventListener("error", finish);
    args.signal?.addEventListener("abort", stop);
    if (args.maxWaitMs !== undefined) cap = window.setTimeout(finish, args.maxWaitMs);
    void audio.play().catch(finish);
  });
}
