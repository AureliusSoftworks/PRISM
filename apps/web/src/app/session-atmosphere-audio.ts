export const DEFAULT_STUDIO_ATMOSPHERE_URL =
  "/audio/session-atmosphere/default-studio-room-loop.mp3";
export const SIGNAL_STUDIO_GRAIN_URL =
  "/audio/session-atmosphere/studio-mix-grain-loop.mp3";

export interface SessionAtmosphereMix {
  background: number;
  grain: number;
  foley: number;
}

export const DEFAULT_SESSION_ATMOSPHERE_MIX: Readonly<SessionAtmosphereMix> = {
  background: 0.1,
  grain: 0.04,
  foley: 0.16,
};

type SessionAtmosphereBus = keyof SessionAtmosphereMix;

const GENERAL_FOLEY_URLS = [
  "/audio/session-atmosphere/clothing-shuffle.mp3",
  "/audio/session-atmosphere/throat-clear.mp3",
  "/audio/session-atmosphere/faint-swallow.mp3",
  "/audio/session-atmosphere/soft-foot-tap.mp3",
] as const;

export const SESSION_FOLEY_URLS = {
  coffeeSip: "/audio/session-atmosphere/coffee-sip.mp3",
  coffeeCupPlace: "/audio/session-atmosphere/coffee-cup-place.mp3",
} as const;

export type SessionAtmosphereCue = keyof typeof SESSION_FOLEY_URLS;

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableUnit(seed: string): number {
  return stableHash(seed) / 0xffffffff;
}

export function sessionAmbientFoleyDelayMs(
  seed: string,
  index: number,
): number {
  return Math.round(18_000 + stableUnit(`${seed}:delay:${index}`) * 24_000);
}

export function sessionAmbientFoleyUrl(seed: string, index: number): string {
  return GENERAL_FOLEY_URLS[
    stableHash(`${seed}:foley:${index}`) % GENERAL_FOLEY_URLS.length
  ]!;
}

export interface SessionAtmosphereController {
  playCue(cue: SessionAtmosphereCue): void;
  setMix(args: {
    volume: number;
    mix?: SessionAtmosphereMix;
  }): void;
  stop(): void;
}

function clampAudioLevel(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function normalizeSessionAtmosphereMix(
  mix?: SessionAtmosphereMix,
): SessionAtmosphereMix {
  return {
    background: clampAudioLevel(
      mix?.background ?? DEFAULT_SESSION_ATMOSPHERE_MIX.background,
    ),
    grain: clampAudioLevel(
      mix?.grain ?? DEFAULT_SESSION_ATMOSPHERE_MIX.grain,
    ),
    foley: clampAudioLevel(
      mix?.foley ?? DEFAULT_SESSION_ATMOSPHERE_MIX.foley,
    ),
  };
}

export function sessionAtmosphereBusVolume(args: {
  volume: number;
  mix?: SessionAtmosphereMix;
  bus: SessionAtmosphereBus;
  trim?: number;
}): number {
  const mix = normalizeSessionAtmosphereMix(args.mix);
  return clampAudioLevel(
    clampAudioLevel(args.volume) *
      mix[args.bus] *
      Math.max(0, Number.isFinite(args.trim) ? (args.trim ?? 1) : 1),
  );
}

export function startSessionAtmosphere(args: {
  seed: string;
  volume: number;
  backgroundUrl?: string | null;
  grainUrl?: string | null;
  mix?: SessionAtmosphereMix;
  shouldDeferFoley?: () => boolean;
}): SessionAtmosphereController {
  let volume = clampAudioLevel(args.volume);
  let mix = normalizeSessionAtmosphereMix(args.mix);
  const activeAudio = new Map<
    HTMLAudioElement,
    { bus: SessionAtmosphereBus; trim: number }
  >();
  let stopped = false;
  let timer: number | null = null;
  let foleyIndex = 0;
  let lastCueAt = 0;

  const play = (
    url: string,
    bus: SessionAtmosphereBus,
    trim = 1,
    loop = false,
  ): HTMLAudioElement | null => {
    if (stopped || typeof Audio === "undefined") return null;
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.loop = loop;
    audio.volume = sessionAtmosphereBusVolume({ volume, mix, bus, trim });
    activeAudio.set(audio, { bus, trim });
    if (!loop) {
      audio.addEventListener("ended", () => activeAudio.delete(audio), {
        once: true,
      });
    }
    void audio.play().catch(() => activeAudio.delete(audio));
    return audio;
  };

  if (args.backgroundUrl) play(args.backgroundUrl, "background", 1, true);
  if (args.grainUrl) play(args.grainUrl, "grain", 1, true);

  const scheduleFoley = (): void => {
    if (stopped || typeof window === "undefined") return;
    const index = foleyIndex;
    timer = window.setTimeout(
      () => {
        timer = null;
        if (stopped) return;
        if (args.shouldDeferFoley?.()) {
          timer = window.setTimeout(scheduleFoley, 4_000);
          return;
        }
        play(sessionAmbientFoleyUrl(args.seed, index), "foley");
        foleyIndex += 1;
        scheduleFoley();
      },
      sessionAmbientFoleyDelayMs(args.seed, index),
    );
  };
  scheduleFoley();

  return {
    playCue(cue) {
      const now = Date.now();
      if (now - lastCueAt < 650) return;
      lastCueAt = now;
      play(
        SESSION_FOLEY_URLS[cue],
        "foley",
        cue === "coffeeSip" ? 1.25 : 1.0625,
      );
    },
    setMix(next) {
      volume = clampAudioLevel(next.volume);
      mix = normalizeSessionAtmosphereMix(next.mix);
      for (const [audio, source] of activeAudio) {
        audio.volume = sessionAtmosphereBusVolume({
          volume,
          mix,
          bus: source.bus,
          trim: source.trim,
        });
      }
    },
    stop() {
      stopped = true;
      if (timer !== null && typeof window !== "undefined") {
        window.clearTimeout(timer);
      }
      timer = null;
      for (const audio of activeAudio.keys()) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      activeAudio.clear();
    },
  };
}

export function attachCoffeeCupFoley(
  root: HTMLElement,
  controller: SessionAtmosphereController,
): () => void {
  const sippingByCup = new WeakMap<HTMLElement, boolean>();
  const cupSelector = "[data-cup-frame]";

  const inspectCup = (cup: HTMLElement, announce: boolean): void => {
    const sipping = cup.dataset.cupSipping === "true";
    const previous = sippingByCup.get(cup);
    sippingByCup.set(cup, sipping);
    if (!announce || previous === undefined || previous === sipping) return;
    controller.playCue(sipping ? "coffeeSip" : "coffeeCupPlace");
  };

  root
    .querySelectorAll<HTMLElement>(cupSelector)
    .forEach((cup) => inspectCup(cup, false));
  if (typeof MutationObserver === "undefined") return () => undefined;
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (
        mutation.type === "attributes" &&
        mutation.target instanceof HTMLElement
      ) {
        inspectCup(mutation.target, true);
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches(cupSelector)) inspectCup(node, false);
        node
          .querySelectorAll<HTMLElement>(cupSelector)
          .forEach((cup) => inspectCup(cup, false));
      }
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-cup-sipping"],
  });
  return () => observer.disconnect();
}
