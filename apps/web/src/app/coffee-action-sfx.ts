import { extractStageDirectionCues } from "./botMention.ts";

export type CoffeeActionSfxKind =
  | "cup_set_down"
  | "coffee_pour"
  | "spoon_stir"
  | "table_knock"
  | BundledCoffeeActionSfxKind;

export type BundledCoffeeActionSfxKind = "fart" | "burp" | "cough";

export type CoffeeActionReactionKind = "nod" | BundledCoffeeActionSfxKind;

export interface CoffeeActionReactionPlan {
  kind: CoffeeActionReactionKind;
  revealAtDisplayLength: number;
}

export interface CoffeeActionSfxPlan {
  kind: CoffeeActionSfxKind;
  revealAtDisplayLength: number;
}

export interface BundledActionSfxPlan {
  kind: BundledCoffeeActionSfxKind;
  revealAtDisplayLength: number;
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
    /\b(?:cough(?:s|ed|ing)?|hack(?:s|ed|ing)?|ahem(?:s|ed|ing)?)\b/u.test(
      normalized,
    ) ||
    /\bclear(?:s|ed|ing)?\s+(?:(?:his|her|their|its)\s+)?throat\b/u.test(
      normalized,
    )
  ) {
    return "cough";
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

export function isBundledCoffeeActionSfxKind(
  kind: CoffeeActionSfxKind,
): kind is BundledCoffeeActionSfxKind {
  return kind === "fart" || kind === "burp" || kind === "cough";
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

/** Shared bodily-action foley that is safe to play outside Coffee. */
export function buildBundledActionSfxPlan(
  messageText: string,
): BundledActionSfxPlan | null {
  const plan = buildCoffeeActionSfxPlan(messageText);
  if (!plan || !isBundledCoffeeActionSfxKind(plan.kind)) return null;
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
  if (isBundledCoffeeActionSfxKind(args.kind)) return true;
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

const preparedClips = new Map<CoffeeActionSfxKind, Blob>();
const pendingClips = new Map<CoffeeActionSfxKind, Promise<void>>();
let activeAudio: HTMLAudioElement | null = null;
let activeAudioUrl: string | null = null;

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

export async function playPreparedCoffeeActionSfx(args: {
  kind: CoffeeActionSfxKind;
  voiceVolume: number;
}): Promise<boolean> {
  const bundledPlayback = isBundledCoffeeActionSfxKind(args.kind)
    ? resolveBundledCoffeeActionSfxPlayback(args.kind)
    : null;
  const clip = bundledPlayback ? null : preparedClips.get(args.kind);
  if (
    (!clip && !bundledPlayback) ||
    typeof Audio === "undefined" ||
    (clip && typeof URL.createObjectURL !== "function")
  ) {
    return false;
  }
  stopCoffeeActionSfx();
  const url = clip ? URL.createObjectURL(clip) : bundledPlayback!.source;
  const audio = new Audio(url);
  activeAudio = audio;
  activeAudioUrl = clip ? url : null;
  audio.preload = "auto";
  audio.volume = bundledPlayback
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
    if (activeAudio === audio) activeAudio = null;
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

export function stopCoffeeActionSfx(): void {
  activeAudio?.pause();
  activeAudio = null;
  if (activeAudioUrl) URL.revokeObjectURL(activeAudioUrl);
  activeAudioUrl = null;
}
