import {
  extractStageDirectionCues,
  extractStageDirections,
  getBotMentionDisplayText,
} from "./botMention.ts";
import {
  replayAudioMasterCaptureActive,
  routeAudioElementToPrismOutput,
} from "./replayAudioMasterCapture.ts";
import {
  resolveActionSfxPackPlayback,
} from "./action-sfx-pack-client.ts";
import {
  resolveBodilyActionSfxPlayback,
  resolveLegacyBodilyActionSfxPlayback,
  type BodilyActionSfxKind,
} from "./corporality-action-sfx.ts";
import {
  playBodilyFoleyThroughVoiceBus,
  stopBodilyFoleyThroughVoiceBus,
} from "./voiceEffects.ts";
import {
  isActionSfxPackKind,
  normalizeBotAudioVoiceProfileV1,
  normalizeCorporality,
  type ActionSfxPackKind,
  type ActionSfxPackOwnerKind,
  type BotAudioVoiceProfileV1,
} from "@localai/shared";

export type CoffeeActionSfxKind =
  | "cup_set_down"
  | "coffee_pour"
  | "spoon_stir"
  | "table_knock"
  | BundledCoffeeActionSfxKind
  | VocalActionSfxKind;

export type BundledCoffeeActionSfxKind = "fart" | "burp" | "cough";

/** Pack-only vocal Foley — silent until a local action pack exists. */
export type VocalActionSfxKind = "laugh" | "sigh" | "gasp" | "throat_clear";

export type PackPlayableActionSfxKind = ActionSfxPackKind;

export type CoffeeActionReactionKind =
  | "nod"
  | BundledCoffeeActionSfxKind
  | VocalActionSfxKind;

export interface CoffeeActionReactionPlan {
  kind: CoffeeActionReactionKind;
  revealAtDisplayLength: number;
}

export interface CoffeeActionSfxPlan {
  kind: CoffeeActionSfxKind;
  revealAtDisplayLength: number;
}

export interface BundledActionSfxPlan {
  kind: PackPlayableActionSfxKind;
  revealAtDisplayLength: number;
}

export interface BundledActionSfxCharacterAlignment {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
}

export interface CoffeeActionSfxGateState {
  lastPlayedAtMs: number | null;
  lastPlayedAtMsByKind: Partial<Record<CoffeeActionSfxKind, number>>;
}

export interface CoffeeActionMessageSource {
  content: string;
  coffeeUserAction?: { action: string } | null;
}

export const COFFEE_ACTION_SFX_GLOBAL_COOLDOWN_MS = 2_200;
export const COFFEE_ACTION_SFX_KIND_COOLDOWN_MS = 7_000;

const BUNDLED_COFFEE_ACTION_SFX_SOURCES = {
  fart: [
    "/audio/coffee/action-reactions/fart-01.mp3",
    "/audio/coffee/action-reactions/fart-02.mp3",
    "/audio/coffee/action-reactions/fart-03.mp3",
    "/audio/coffee/action-reactions/fart-04.mp3",
  ],
  burp: [
    "/audio/coffee/action-reactions/burp-01.mp3",
    "/audio/coffee/action-reactions/burp-02.mp3",
    "/audio/coffee/action-reactions/burp-03.mp3",
    "/audio/coffee/action-reactions/burp-04.mp3",
  ],
  cough: [
    "/audio/coffee/action-reactions/cough-01.mp3",
    "/audio/coffee/action-reactions/cough-02.mp3",
    "/audio/coffee/action-reactions/cough-03.mp3",
    "/audio/coffee/action-reactions/cough-04.mp3",
  ],
} as const satisfies Record<BundledCoffeeActionSfxKind, readonly string[]>;

function normalizeCoffeeAction(action: string): string {
  return action.replace(/\s+/gu, " ").trim().toLowerCase();
}

export function coffeeActionCueTextForMessage(
  message: CoffeeActionMessageSource,
): string {
  const userAction = message.coffeeUserAction?.action
    .replace(/\s+/gu, " ")
    .trim();
  return userAction ? `*${userAction}*` : message.content;
}

export function coffeeActionReactionKindForAction(
  action: string,
): CoffeeActionReactionKind | null {
  const normalized = normalizeCoffeeAction(action);
  if (!normalized) return null;
  if (
    /\b(?:fart(?:s|ed|ing)?|flatulat(?:e|es|ed|ing)|toot(?:s|ed|ing)?)\b/u.test(
      normalized,
    ) ||
    /\b(?:pass(?:es|ed|ing)?\s+(?:some\s+)?gas|break(?:s|ing)?\s+wind|broke\s+wind|cut(?:s|ting)?\s+the\s+cheese|let(?:s|ting)?\s+(?:one|it|a\s+fart)\s+rip)\b/u.test(
      normalized,
    )
  ) {
    return "fart";
  }
  if (
    /\b(?:burp(?:s|ed|ing)?|belch(?:es|ed|ing)?|eructat(?:e|es|ed|ing))\b/u.test(
      normalized,
    ) ||
    /\bbring(?:s|ing)?\s+up\s+wind\b/u.test(normalized)
  ) {
    return "burp";
  }
  if (
    /\bclear(?:s|ed|ing)?\s+(?:(?:his|her|their|its)\s+)?throat\b/u.test(
      normalized,
    )
  ) {
    return "throat_clear";
  }
  if (
    /\b(?:cough(?:s|ed|ing)?|hack(?:s|ed|ing)?|ahem(?:s|ed|ing)?)\b/u.test(
      normalized,
    )
  ) {
    return "cough";
  }
  if (
    /\b(?:laugh(?:s|ed|ing)?|chuckl(?:e|es|ed|ing)|giggle(?:s|d|ing)?|snicker(?:s|ed|ing)?)\b/u.test(
      normalized,
    )
  ) {
    return "laugh";
  }
  if (/\bsigh(?:s|ed|ing)?\b/u.test(normalized)) {
    return "sigh";
  }
  if (/\bgasp(?:s|ed|ing)?\b/u.test(normalized)) {
    return "gasp";
  }
  if (
    /\bnod(?:s|ded|ding)?\b/u.test(normalized) ||
    /\b(?:bob(?:s|bed|bing)?|dip(?:s|ped|ping)?|incline(?:s|d|ing)?)\s+(?:(?:his|her|their|its)\s+)?(?:head|chin)\b/u.test(
      normalized,
    ) ||
    (/(?:\bshak(?:e|es|ing)|\bshook)\b/u.test(normalized) &&
      /\b(?:(?:his|her|their|its)\s+)?head\b/u.test(normalized))
  ) {
    return "nod";
  }
  return null;
}

export function buildCoffeeActionReactionPlan(
  messageText: string,
): CoffeeActionReactionPlan | null {
  for (const cue of extractStageDirectionCues(messageText)) {
    const kind = coffeeActionReactionKindForAction(cue.action);
    if (kind) {
      return {
        kind,
        revealAtDisplayLength: cue.revealAtDisplayLength,
      };
    }
  }
  return null;
}

function comparableActionSfxCharacters(value: string): string[] {
  return Array.from(value.toLocaleLowerCase()).filter((character) =>
    /[\p{L}\p{N}]/u.test(character),
  );
}

function alignedActionSfxCueAtMs(
  prefix: string,
  durationMs: number,
  alignment: BundledActionSfxCharacterAlignment | null | undefined,
): number | null {
  if (!alignment) return null;
  const count = alignment.characters.length;
  if (
    count === 0 ||
    count !== alignment.characterStartTimesSeconds.length ||
    count !== alignment.characterEndTimesSeconds.length
  ) {
    return null;
  }
  const target = comparableActionSfxCharacters(prefix);
  if (target.length === 0) return 0;
  let targetIndex = 0;
  let matchedAlignmentIndex = -1;
  let previousEndSeconds = 0;
  for (let index = 0; index < count; index += 1) {
    const startSeconds = alignment.characterStartTimesSeconds[index];
    const endSeconds = alignment.characterEndTimesSeconds[index];
    if (
      typeof startSeconds !== "number" ||
      typeof endSeconds !== "number" ||
      !Number.isFinite(startSeconds) ||
      !Number.isFinite(endSeconds) ||
      startSeconds < 0 ||
      endSeconds < startSeconds ||
      endSeconds < previousEndSeconds
    ) {
      return null;
    }
    previousEndSeconds = endSeconds;
    const character = alignment.characters[index] ?? "";
    if (!/[\p{L}\p{N}]/u.test(character)) continue;
    if (character.toLocaleLowerCase() !== target[targetIndex]) return null;
    targetIndex += 1;
    matchedAlignmentIndex = index;
    if (targetIndex >= target.length) break;
  }
  if (targetIndex < target.length || matchedAlignmentIndex < 0) return null;
  const alignmentDurationSeconds = alignment.characterEndTimesSeconds.at(-1);
  const cueEndSeconds =
    alignment.characterEndTimesSeconds[matchedAlignmentIndex];
  if (
    typeof alignmentDurationSeconds !== "number" ||
    typeof cueEndSeconds !== "number" ||
    alignmentDurationSeconds <= 0
  ) {
    return null;
  }
  return Math.max(
    0,
    Math.min(
      durationMs,
      Math.round(
        cueEndSeconds * 1_000 * (durationMs / (alignmentDurationSeconds * 1_000)),
      ),
    ),
  );
}

/**
 * Resolves a bundled cue onto the utterance clock. Provider character timing
 * wins so an inline cue fires after the preceding word; a proportional clock
 * keeps silent caption fallbacks and replays deterministic.
 */
export function bundledActionSfxCueAtMs(
  messageText: string,
  durationMs: number,
  alignment?: BundledActionSfxCharacterAlignment | null,
): number | null {
  const plan = buildBundledActionSfxPlan(messageText);
  if (!plan) return null;
  const normalizedDurationMs = Math.max(1, Math.round(durationMs));
  if (plan.revealAtDisplayLength <= 0) return 0;
  const displayText = getBotMentionDisplayText(
    extractStageDirections(messageText).mainText,
  );
  const displayCharacters = Array.from(displayText);
  if (displayCharacters.length === 0) return 0;
  const prefix = displayCharacters
    .slice(0, plan.revealAtDisplayLength)
    .join("")
    .trimEnd();
  const alignedCueAtMs = alignedActionSfxCueAtMs(
    prefix,
    normalizedDurationMs,
    alignment,
  );
  if (alignedCueAtMs !== null) return alignedCueAtMs;
  return Math.max(
    0,
    Math.min(
      normalizedDurationMs,
      Math.round(
        normalizedDurationMs *
          (plan.revealAtDisplayLength / displayCharacters.length),
      ),
    ),
  );
}

export function isBundledCoffeeActionSfxKind(
  kind: CoffeeActionSfxKind,
): kind is BundledCoffeeActionSfxKind {
  return kind === "fart" || kind === "burp" || kind === "cough";
}

export function isVocalActionSfxKind(
  kind: CoffeeActionSfxKind,
): kind is VocalActionSfxKind {
  return (
    kind === "laugh" ||
    kind === "sigh" ||
    kind === "gasp" ||
    kind === "throat_clear"
  );
}

export function isPackPlayableActionSfxKind(
  kind: CoffeeActionSfxKind,
): kind is PackPlayableActionSfxKind {
  return isActionSfxPackKind(kind);
}

export function coffeeActionSfxKindForAction(
  action: string,
): CoffeeActionSfxKind | null {
  const normalized = normalizeCoffeeAction(action);
  if (!normalized) return null;
  const reactionKind = coffeeActionReactionKindForAction(normalized);
  if (reactionKind && reactionKind !== "nod") return reactionKind;
  if (
    /\b(?:pour|pours|poured|pouring|refill|refills|refilled|refilling)\b[^.!?]{0,42}\b(?:coffee|cup|mug|refill)\b/u.test(
      normalized,
    ) ||
    /\b(?:top|tops|topped|topping)\b[^.!?]{0,24}\b(?:off|up)\b[^.!?]{0,24}\b(?:cup|mug|coffee)\b/u.test(
      normalized,
    )
  ) {
    return "coffee_pour";
  }
  if (
    /\b(?:stir|stirs|stirred|stirring)\b[^.!?]{0,42}\b(?:coffee|cup|mug|spoon)\b/u.test(
      normalized,
    ) ||
    /\bspoon\b[^.!?]{0,32}\b(?:circle|circles|clink|clinks|stir|stirs)\b/u.test(
      normalized,
    )
  ) {
    return "spoon_stir";
  }
  if (
    /\b(?:knock|knocks|knocked|knocking|tap|taps|tapped|tapping)\b[^.!?]{0,28}\b(?:table|tabletop)\b/u.test(
      normalized,
    )
  ) {
    return "table_knock";
  }
  if (
    /\b(?:set|sets|setting|put|puts|putting|place|places|placed|placing|lower|lowers|lowered|lowering)\b[^.!?]{0,42}\b(?:cup|mug)\b[^.!?]{0,28}\b(?:down|table|tabletop)\b/u.test(
      normalized,
    ) ||
    /\b(?:cup|mug)\b[^.!?]{0,24}\b(?:clink|clinks|clinked|touches|meets)\b[^.!?]{0,20}\b(?:table|tabletop|wood)\b/u.test(
      normalized,
    )
  ) {
    return "cup_set_down";
  }
  return null;
}

export function buildCoffeeActionSfxPlan(
  messageText: string,
): CoffeeActionSfxPlan | null {
  for (const cue of extractStageDirectionCues(messageText)) {
    const kind = coffeeActionSfxKindForAction(cue.action);
    if (kind) {
      return {
        kind,
        revealAtDisplayLength: cue.revealAtDisplayLength,
      };
    }
  }
  return null;
}

/** Shared bodily/vocal-action foley that is safe to play outside Coffee. */
export function buildBundledActionSfxPlan(
  messageText: string,
): BundledActionSfxPlan | null {
  const plan = buildCoffeeActionSfxPlan(messageText);
  if (!plan || !isPackPlayableActionSfxKind(plan.kind)) return null;
  return {
    kind: plan.kind,
    revealAtDisplayLength: plan.revealAtDisplayLength,
  };
}

export function bundledActionSfxIsEligible(args: {
  voiceMode: string;
  voiceEffectsEnabled: boolean;
  voiceVolume: number;
}): boolean {
  return (
    args.voiceMode !== "mute" &&
    args.voiceEffectsEnabled &&
    Number.isFinite(args.voiceVolume) &&
    args.voiceVolume > 0
  );
}

export function coffeeActionSfxIsEligible(args: {
  kind: CoffeeActionSfxKind;
  coffeeProvider: string;
  offlineProtectedBotPresent: boolean;
  voiceMode: string;
  englishVoiceEngine: string;
  voiceEffectsEnabled: boolean;
  voiceVolume: number;
  elevenLabsKeyAvailable: boolean;
}): boolean {
  if (!bundledActionSfxIsEligible(args)) return false;
  if (isPackPlayableActionSfxKind(args.kind)) return true;
  return (
    args.coffeeProvider !== "local" &&
    !args.offlineProtectedBotPresent &&
    args.voiceMode === "english" &&
    args.englishVoiceEngine === "elevenlabs" &&
    args.elevenLabsKeyAvailable
  );
}

export function coffeeActionSfxGate(args: {
  kind: CoffeeActionSfxKind;
  nowMs: number;
  state: CoffeeActionSfxGateState;
}): { allowed: boolean; state: CoffeeActionSfxGateState } {
  const lastGlobal = args.state.lastPlayedAtMs;
  const lastKind = args.state.lastPlayedAtMsByKind[args.kind] ?? null;
  const allowed =
    (lastGlobal === null ||
      args.nowMs - lastGlobal >= COFFEE_ACTION_SFX_GLOBAL_COOLDOWN_MS) &&
    (lastKind === null ||
      args.nowMs - lastKind >= COFFEE_ACTION_SFX_KIND_COOLDOWN_MS);
  if (!allowed) return { allowed: false, state: args.state };
  return {
    allowed: true,
    state: {
      lastPlayedAtMs: args.nowMs,
      lastPlayedAtMsByKind: {
        ...args.state.lastPlayedAtMsByKind,
        [args.kind]: args.nowMs,
      },
    },
  };
}

/** Soft release when a new foley starts or the scene tears down. */
export const COFFEE_ACTION_SFX_RELEASE_FADE_MS = 180;

/** Bodily foley that should drive the default CRT “oh” mouth while it plays. */
export function coffeeActionSfxDrivesOhMouth(
  kind: CoffeeActionReactionKind | CoffeeActionSfxKind | null | undefined,
): boolean {
  return (
    kind === "fart" ||
    kind === "burp" ||
    kind === "cough" ||
    kind === "laugh" ||
    kind === "gasp" ||
    kind === "throat_clear"
  );
}

const preparedClips = new Map<CoffeeActionSfxKind, Blob>();
const pendingClips = new Map<CoffeeActionSfxKind, Promise<void>>();
let activeAudio: HTMLAudioElement | null = null;
let activeAudioUrl: string | null = null;
let activeAudioOutputCleanup: (() => void) | null = null;

export function prefetchCoffeeActionSfx(args: {
  kind: CoffeeActionSfxKind;
  messageId: string;
  headers?: HeadersInit;
}): void {
  if (
    typeof window === "undefined" ||
    isBundledCoffeeActionSfxKind(args.kind) ||
    preparedClips.has(args.kind) ||
    pendingClips.has(args.kind)
  ) {
    return;
  }
  const pending = fetch(new URL("/api/coffee/action-sfx", window.location.origin), {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(args.headers ?? {}),
    },
    body: JSON.stringify({ kind: args.kind, messageId: args.messageId }),
  })
    .then(async (response) => {
      if (!response.ok) return;
      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.startsWith("audio/")) return;
      preparedClips.set(args.kind, await response.blob());
    })
    .catch(() => undefined)
    .finally(() => {
      pendingClips.delete(args.kind);
    });
  pendingClips.set(args.kind, pending);
}

function boundedRandom(random: () => number): number {
  const value = random();
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(0.999_999, Math.max(0, value));
}

export function resolveBundledCoffeeActionSfxPlayback(
  kind: BundledCoffeeActionSfxKind,
  random: () => number = Math.random,
): { source: string; playbackRate: number } {
  const sources = BUNDLED_COFFEE_ACTION_SFX_SOURCES[kind];
  const source = sources[Math.floor(boundedRandom(random) * sources.length)];
  const pitchDepth = kind === "cough" ? 0.1 : 0.16;
  const playbackRate = 1 + (boundedRandom(random) * 2 - 1) * pitchDepth;
  return { source, playbackRate };
}

function stableActionSfxUnit(seed: string, index: number): number {
  let hash = 2166136261;
  const value = `${seed}:${index}`;
  for (let offset = 0; offset < value.length; offset += 1) {
    hash ^= value.charCodeAt(offset);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

export function bundledCoffeeActionSfxPlaybackForSeed(
  kind: BundledCoffeeActionSfxKind,
  seed: string,
): { source: string; playbackRate: number } {
  let index = 0;
  return resolveBundledCoffeeActionSfxPlayback(
    kind,
    () => stableActionSfxUnit(seed, index++),
  );
}

export async function playPreparedCoffeeActionSfx(args: {
  kind: CoffeeActionSfxKind;
  voiceVolume: number;
  seed?: string;
  ownerKind?: ActionSfxPackOwnerKind;
  ownerId?: string | null;
  /** Identity corporality continuum (0 artificial → 1 ethereal). */
  corporality?: number | null;
  /** Voice profile used to color bodily Foley through the vocal FX bus. */
  voiceProfile?: BotAudioVoiceProfileV1 | null;
  voiceEffectsEnabled?: boolean;
}): Promise<boolean> {
  let packPlayback: { source: string; variantIndex: number } | null = null;
  if (
    typeof window !== "undefined" &&
    isPackPlayableActionSfxKind(args.kind) &&
    args.ownerKind
  ) {
    try {
      packPlayback = await resolveActionSfxPackPlayback({
        origin: window.location.origin,
        ownerKind: args.ownerKind,
        ownerId: args.ownerId,
        kind: args.kind,
      });
    } catch {
      packPlayback = null;
    }
  }

  const bodilyKind = isBundledCoffeeActionSfxKind(args.kind)
    ? args.kind
    : null;
  if (bodilyKind) {
    const corporality = normalizeCorporality(
      args.corporality ??
        (args.voiceProfile
          ? normalizeBotAudioVoiceProfileV1(args.voiceProfile).corporality
          : undefined),
    );
    const resolved =
      resolveBodilyActionSfxPlayback({
        kind: bodilyKind,
        corporality,
        packSource: packPlayback?.source ?? null,
        packVariantIndex: packPlayback?.variantIndex ?? null,
        random: args.seed
          ? (() => {
              let index = 0;
              return () => stableActionSfxUnit(args.seed!, index++);
            })()
          : Math.random,
      }) ??
      resolveLegacyBodilyActionSfxPlayback(
        bodilyKind,
        args.seed
          ? (() => {
              let index = 0;
              return () => stableActionSfxUnit(args.seed!, index++);
            })()
          : Math.random,
      );

    stopCoffeeActionSfx(COFFEE_ACTION_SFX_RELEASE_FADE_MS);
    const profile = normalizeBotAudioVoiceProfileV1(
      args.voiceProfile ?? undefined,
    );
    try {
      return await playBodilyFoleyThroughVoiceBus({
        urls: resolved.urls,
        gains: resolved.gains,
        profile,
        effectsEnabled: args.voiceEffectsEnabled !== false,
        voiceVolume: args.voiceVolume,
        playbackRate: resolved.playbackRate,
      });
    } catch {
      // Fall through to HTMLAudioElement legacy path below.
    }
  }

  const bundledPlayback =
    !packPlayback && bodilyKind
      ? args.seed
        ? bundledCoffeeActionSfxPlaybackForSeed(bodilyKind, args.seed)
        : resolveBundledCoffeeActionSfxPlayback(bodilyKind)
      : null;
  const clip =
    !packPlayback && !bundledPlayback ? preparedClips.get(args.kind) : null;
  if (
    (!clip && !bundledPlayback && !packPlayback) ||
    typeof Audio === "undefined" ||
    (clip && typeof URL.createObjectURL !== "function")
  ) {
    return false;
  }
  // Fade the previous clip instead of hard-cutting mid-waveform.
  stopCoffeeActionSfx(COFFEE_ACTION_SFX_RELEASE_FADE_MS);
  const url = packPlayback
    ? packPlayback.source
    : clip
      ? URL.createObjectURL(clip)
      : bundledPlayback!.source;
  const audio = new Audio(url);
  const outputCleanup = routeAudioElementToPrismOutput(audio);
  if (!outputCleanup && replayAudioMasterCaptureActive()) {
    if (clip) URL.revokeObjectURL(url);
    return false;
  }
  activeAudioOutputCleanup = outputCleanup;
  activeAudio = audio;
  activeAudioUrl = clip ? url : null;
  audio.preload = "auto";
  audio.volume =
    packPlayback || bundledPlayback
      ? Math.min(0.48, Math.max(0, args.voiceVolume) * 0.42)
      : Math.min(0.24, Math.max(0, args.voiceVolume) * 0.22);
  if (bundledPlayback) {
    audio.playbackRate = bundledPlayback.playbackRate;
    audio.preservesPitch = false;
    (
      audio as HTMLAudioElement & { webkitPreservesPitch?: boolean }
    ).webkitPreservesPitch = false;
  }
  const release = (): void => {
    if (activeAudio !== audio) return;
    activeAudio = null;
    outputCleanup?.();
    if (activeAudioOutputCleanup === outputCleanup) {
      activeAudioOutputCleanup = null;
    }
    if (clip) {
      if (activeAudioUrl === url) activeAudioUrl = null;
      URL.revokeObjectURL(url);
    }
  };
  audio.addEventListener("ended", release, { once: true });
  audio.addEventListener("error", release, { once: true });
  try {
    await audio.play();
    return true;
  } catch {
    release();
    return false;
  }
}

function releaseCoffeeActionAudioElement(
  audio: HTMLAudioElement,
  outputCleanup: (() => void) | null,
  url: string | null,
): void {
  audio.pause();
  outputCleanup?.();
  if (url) URL.revokeObjectURL(url);
}

/** Stop active action foley. Prefer a short fade so bodily cues are not clipped. */
export function stopCoffeeActionSfx(
  fadeMs: number = COFFEE_ACTION_SFX_RELEASE_FADE_MS,
): void {
  stopBodilyFoleyThroughVoiceBus();
  const audio = activeAudio;
  if (!audio) {
    activeAudioOutputCleanup?.();
    activeAudioOutputCleanup = null;
    if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
    activeAudioUrl = null;
    return;
  }
  // Detach from the singleton so a new clip can start while this one fades.
  activeAudio = null;
  const outputCleanup = activeAudioOutputCleanup;
  activeAudioOutputCleanup = null;
  const url = activeAudioUrl;
  activeAudioUrl = null;
  const durationMs = Math.max(0, Math.round(fadeMs));
  if (audio.paused || durationMs <= 0 || audio.volume <= 0) {
    releaseCoffeeActionAudioElement(audio, outputCleanup, url);
    return;
  }
  const initialVolume = audio.volume;
  const startedAt = Date.now();
  const fadeTimer = globalThis.setInterval(() => {
    const progress = Math.min(1, (Date.now() - startedAt) / durationMs);
    audio.volume = initialVolume * (1 - progress);
    if (progress < 1) return;
    globalThis.clearInterval(fadeTimer);
    releaseCoffeeActionAudioElement(audio, outputCleanup, url);
  }, 20);
}
