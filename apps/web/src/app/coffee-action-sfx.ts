import { extractStageDirectionCues } from "./botMention.ts";

export type CoffeeActionSfxKind =
  | "cup_set_down"
  | "coffee_pour"
  | "spoon_stir"
  | "table_knock";

export interface CoffeeActionSfxPlan {
  kind: CoffeeActionSfxKind;
  revealAtDisplayLength: number;
}

export interface CoffeeActionSfxGateState {
  lastPlayedAtMs: number | null;
  lastPlayedAtMsByKind: Partial<Record<CoffeeActionSfxKind, number>>;
}

export const COFFEE_ACTION_SFX_GLOBAL_COOLDOWN_MS = 2_200;
export const COFFEE_ACTION_SFX_KIND_COOLDOWN_MS = 7_000;

export function coffeeActionSfxKindForAction(
  action: string,
): CoffeeActionSfxKind | null {
  const normalized = action.replace(/\s+/gu, " ").trim().toLowerCase();
  if (!normalized) return null;
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

export function coffeeActionSfxIsEligible(args: {
  coffeeProvider: string;
  offlineProtectedBotPresent: boolean;
  voiceMode: string;
  englishVoiceEngine: string;
  voiceEffectsEnabled: boolean;
  voiceVolume: number;
  elevenLabsKeyAvailable: boolean;
}): boolean {
  return (
    args.coffeeProvider !== "local" &&
    !args.offlineProtectedBotPresent &&
    args.voiceMode === "english" &&
    args.englishVoiceEngine === "elevenlabs" &&
    args.voiceEffectsEnabled &&
    Number.isFinite(args.voiceVolume) &&
    args.voiceVolume > 0 &&
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

export async function playPreparedCoffeeActionSfx(args: {
  kind: CoffeeActionSfxKind;
  voiceVolume: number;
}): Promise<boolean> {
  const clip = preparedClips.get(args.kind);
  if (
    !clip ||
    typeof Audio === "undefined" ||
    typeof URL.createObjectURL !== "function"
  ) {
    return false;
  }
  stopCoffeeActionSfx();
  const url = URL.createObjectURL(clip);
  const audio = new Audio(url);
  activeAudio = audio;
  activeAudioUrl = url;
  audio.preload = "auto";
  audio.volume = Math.min(0.24, Math.max(0, args.voiceVolume) * 0.22);
  const release = (): void => {
    if (activeAudio === audio) activeAudio = null;
    if (activeAudioUrl === url) activeAudioUrl = null;
    URL.revokeObjectURL(url);
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
