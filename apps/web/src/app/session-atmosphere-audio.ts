import {
  BOTCAST_DEFAULT_STUDIO_ATMOSPHERE_MIX,
  BOTCAST_STUDIO_ATMOSPHERE_MIX_RELATIVE_MAX,
  type BotcastStudioAtmosphereMix,
} from "@localai/shared";
import {
  connectRoomAcoustics,
  type RoomAcousticsSend,
} from "./roomAcoustics.ts";

export const DEFAULT_STUDIO_ATMOSPHERE_URL =
  "/audio/session-atmosphere/default-studio-room-loop.mp3";

export type SessionAtmosphereMix = BotcastStudioAtmosphereMix;

export type SessionAtmosphereBackgroundTone = "neutral" | "warm-low";

export const DEFAULT_SESSION_ATMOSPHERE_MIX: Readonly<SessionAtmosphereMix> = {
  background: 0.1,
  grain: 0.04,
  foley: 0.16,
};

export const DEFAULT_SIGNAL_ATMOSPHERE_MIX =
  BOTCAST_DEFAULT_STUDIO_ATMOSPHERE_MIX;

export const SIGNAL_ATMOSPHERE_RELATIVE_MIX_MAX =
  BOTCAST_STUDIO_ATMOSPHERE_MIX_RELATIVE_MAX;
export const SIGNAL_ATMOSPHERE_RELATIVE_MIX_STEP = 0.05;

export interface SessionAmbientFoleyProfile {
  minDelayMs: number;
  maxDelayMs: number;
  trim: number;
}

export const DEFAULT_SESSION_AMBIENT_FOLEY_PROFILE = {
  minDelayMs: 18_000,
  maxDelayMs: 42_000,
  trim: 1,
} as const satisfies SessionAmbientFoleyProfile;

export function signalSessionAtmosphereActive(args: {
  audioEnabled: boolean;
  hasSelectedShow: boolean;
  preRollActive: boolean;
  episodePresent: boolean;
  replayPlaying: boolean;
  studioLayoutEditorOpen: boolean;
}): boolean {
  return Boolean(
    args.audioEnabled &&
      args.hasSelectedShow &&
      !args.preRollActive &&
      (args.episodePresent ||
        args.replayPlaying ||
        args.studioLayoutEditorOpen),
  );
}

/**
 * Provider ambience can be tens of decibels quieter than the bundled loops.
 * A strong preamp feeding a hard compressor brings both into the same safe
 * room-tone envelope before the ordinary per-bus mix is applied.
 */
export const SESSION_ATMOSPHERE_LOOP_PRE_GAIN = 50;
export const SESSION_ATMOSPHERE_LOOP_COMPRESSOR = {
  threshold: -35,
  knee: 0,
  ratio: 20,
  attack: 0.003,
  release: 0.25,
} as const;
export const SESSION_ATMOSPHERE_BACKGROUND_TONE = {
  lowShelfFrequencyHz: 180,
  lowShelfGainDb: 3,
  highShelfFrequencyHz: 1_600,
  highShelfGainDb: -12,
} as const;
export const SESSION_ATMOSPHERE_LOOP_END_TRIM_SECONDS = 1;
export const SESSION_ATMOSPHERE_LOOP_CROSSFADE_SECONDS = 0.75;

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
  profile: SessionAmbientFoleyProfile = DEFAULT_SESSION_AMBIENT_FOLEY_PROFILE,
): number {
  const minDelayMs = Math.max(1_000, Math.round(profile.minDelayMs));
  const maxDelayMs = Math.max(minDelayMs, Math.round(profile.maxDelayMs));
  return Math.round(
    minDelayMs +
      stableUnit(`${seed}:delay:${index}`) * (maxDelayMs - minDelayMs),
  );
}

export function sessionAmbientFoleyUrl(seed: string, index: number): string {
  return GENERAL_FOLEY_URLS[
    stableHash(`${seed}:foley:${index}`) % GENERAL_FOLEY_URLS.length
  ]!;
}

export interface SessionAtmosphereController {
  playCue(cue: SessionAtmosphereCue): void;
  setMix(args: { volume: number; mix?: SessionAtmosphereMix }): void;
  stop(): void;
}

interface SessionAtmosphereSourceLeveler {
  busGain: GainNode;
  disconnect(preserveRoomTail?: boolean): void;
}

interface SessionAtmosphereActiveSource {
  bus: SessionAtmosphereBus;
  trim: number;
  leveler: SessionAtmosphereSourceLeveler | null;
}

interface SessionAtmosphereActiveLoop extends SessionAtmosphereActiveSource {
  source: AudioBufferSourceNode;
  leveler: SessionAtmosphereSourceLeveler;
}

let sessionAtmosphereAudioContext: AudioContext | null = null;

function sessionAtmosphereContext(): AudioContext | null {
  if (
    typeof window === "undefined" ||
    typeof window.AudioContext !== "function"
  ) {
    return null;
  }
  if (
    !sessionAtmosphereAudioContext ||
    sessionAtmosphereAudioContext.state === "closed"
  ) {
    sessionAtmosphereAudioContext = new window.AudioContext();
  }
  if (sessionAtmosphereAudioContext.state === "suspended") {
    void sessionAtmosphereAudioContext.resume().catch(() => undefined);
  }
  return sessionAtmosphereAudioContext;
}

function levelSessionAtmosphereNode(
  context: AudioContext,
  source: AudioNode,
  normalizeLoop: boolean,
  bus: SessionAtmosphereBus,
  backgroundTone: SessionAtmosphereBackgroundTone,
  foleyRoomAcoustics?: RoomAcousticsSend,
): SessionAtmosphereSourceLeveler {
  if (!normalizeLoop) {
    const busGain = context.createGain();
    source.connect(busGain);
    const roomConnection = connectRoomAcoustics({
      context,
      input: busGain,
      destination: context.destination,
      send: bus === "foley" ? foleyRoomAcoustics : null,
    });
    return {
      busGain,
      disconnect(preserveRoomTail = false) {
        source.disconnect();
        if (preserveRoomTail) roomConnection.release();
        else roomConnection.disconnect();
      },
    };
  }
  const preGain = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const busGain = context.createGain();
  preGain.gain.value = SESSION_ATMOSPHERE_LOOP_PRE_GAIN;
  compressor.threshold.value = SESSION_ATMOSPHERE_LOOP_COMPRESSOR.threshold;
  compressor.knee.value = SESSION_ATMOSPHERE_LOOP_COMPRESSOR.knee;
  compressor.ratio.value = SESSION_ATMOSPHERE_LOOP_COMPRESSOR.ratio;
  compressor.attack.value = SESSION_ATMOSPHERE_LOOP_COMPRESSOR.attack;
  compressor.release.value = SESSION_ATMOSPHERE_LOOP_COMPRESSOR.release;
  source.connect(preGain);
  preGain.connect(compressor);
  if (bus === "background" && backgroundTone === "warm-low") {
    const lowShelf = context.createBiquadFilter();
    const highShelf = context.createBiquadFilter();
    lowShelf.type = "lowshelf";
    lowShelf.frequency.value =
      SESSION_ATMOSPHERE_BACKGROUND_TONE.lowShelfFrequencyHz;
    lowShelf.gain.value = SESSION_ATMOSPHERE_BACKGROUND_TONE.lowShelfGainDb;
    highShelf.type = "highshelf";
    highShelf.frequency.value =
      SESSION_ATMOSPHERE_BACKGROUND_TONE.highShelfFrequencyHz;
    highShelf.gain.value = SESSION_ATMOSPHERE_BACKGROUND_TONE.highShelfGainDb;
    compressor.connect(lowShelf);
    lowShelf.connect(highShelf);
    highShelf.connect(busGain);
    busGain.connect(context.destination);
    return {
      busGain,
      disconnect() {
        source.disconnect();
        preGain.disconnect();
        compressor.disconnect();
        lowShelf.disconnect();
        highShelf.disconnect();
        busGain.disconnect();
      },
    };
  }
  compressor.connect(busGain);
  busGain.connect(context.destination);
  return {
    busGain,
    disconnect() {
      source.disconnect();
      preGain.disconnect();
      compressor.disconnect();
      busGain.disconnect();
    },
  };
}

function levelSessionAtmosphereSource(
  audio: HTMLAudioElement,
  normalizeLoop: boolean,
  bus: SessionAtmosphereBus,
  backgroundTone: SessionAtmosphereBackgroundTone,
  foleyRoomAcoustics?: RoomAcousticsSend,
): SessionAtmosphereSourceLeveler | null {
  const context = sessionAtmosphereContext();
  if (!context) return null;
  try {
    return levelSessionAtmosphereNode(
      context,
      context.createMediaElementSource(audio),
      normalizeLoop,
      bus,
      backgroundTone,
      foleyRoomAcoustics,
    );
  } catch {
    // Keep ordinary HTMLAudio playback as a compatibility fallback.
    return null;
  }
}

function clampAudioLevel(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampAtmosphereMixLevel(value: number): number {
  return Math.max(
    0,
    Math.min(
      SIGNAL_ATMOSPHERE_RELATIVE_MIX_MAX,
      Number.isFinite(value) ? value : 0,
    ),
  );
}

export function signalAtmosphereRelativeMixLevel(
  bus: SessionAtmosphereBus,
  mix: SessionAtmosphereMix,
): number {
  return clampAtmosphereMixLevel(mix[bus] / DEFAULT_SIGNAL_ATMOSPHERE_MIX[bus]);
}

export function signalAtmosphereMixLevelFromRelative(
  bus: SessionAtmosphereBus,
  relativeLevel: number,
): number {
  return Number(
    (
      DEFAULT_SIGNAL_ATMOSPHERE_MIX[bus] *
      clampAtmosphereMixLevel(relativeLevel)
    ).toFixed(6),
  );
}

export function sessionAtmosphereLoopEndTime(
  durationSeconds: number,
  endTrimSeconds = SESSION_ATMOSPHERE_LOOP_END_TRIM_SECONDS,
): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const trim = Math.max(
    0,
    Number.isFinite(endTrimSeconds) ? endTrimSeconds : 0,
  );
  return durationSeconds > trim + 1 ? durationSeconds - trim : durationSeconds;
}

export function createSeamlessSessionAtmosphereLoopBuffer(
  context: BaseAudioContext,
  decoded: AudioBuffer,
  endTrimSeconds = SESSION_ATMOSPHERE_LOOP_END_TRIM_SECONDS,
  crossfadeSeconds = SESSION_ATMOSPHERE_LOOP_CROSSFADE_SECONDS,
): AudioBuffer {
  const sampleRate = decoded.sampleRate;
  const loopEndSeconds = sessionAtmosphereLoopEndTime(
    decoded.duration,
    endTrimSeconds,
  );
  const usableFrames = Math.max(
    1,
    Math.min(decoded.length, Math.floor(loopEndSeconds * sampleRate)),
  );
  const desiredCrossfadeFrames = Math.max(
    0,
    Math.round(
      (Number.isFinite(crossfadeSeconds) ? crossfadeSeconds : 0) * sampleRate,
    ),
  );
  const crossfadeFrames = Math.min(
    desiredCrossfadeFrames,
    Math.floor(usableFrames / 4),
  );
  const loopFrames =
    crossfadeFrames >= 2 ? usableFrames - crossfadeFrames : usableFrames;
  const output = context.createBuffer(
    decoded.numberOfChannels,
    loopFrames,
    sampleRate,
  );

  for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
    const inputChannel = decoded.getChannelData(channel);
    const outputChannel = output.getChannelData(channel);
    if (crossfadeFrames < 2) {
      outputChannel.set(inputChannel.subarray(0, loopFrames));
      continue;
    }
    // Rotate the overlap to the start: the buffer's last and first samples
    // remain adjacent source samples, while its old tail dissolves into its head.
    for (let frame = 0; frame < crossfadeFrames; frame += 1) {
      const headMix = frame / (crossfadeFrames - 1);
      outputChannel[frame] =
        inputChannel[loopFrames + frame]! * (1 - headMix) +
        inputChannel[frame]! * headMix;
    }
    outputChannel.set(
      inputChannel.subarray(crossfadeFrames, loopFrames),
      crossfadeFrames,
    );
  }

  return output;
}

function normalizeSessionAtmosphereMix(
  mix?: SessionAtmosphereMix,
): SessionAtmosphereMix {
  return {
    background: clampAtmosphereMixLevel(
      mix?.background ?? DEFAULT_SESSION_ATMOSPHERE_MIX.background,
    ),
    grain: clampAtmosphereMixLevel(
      mix?.grain ?? DEFAULT_SESSION_ATMOSPHERE_MIX.grain,
    ),
    foley: clampAtmosphereMixLevel(
      mix?.foley ?? DEFAULT_SESSION_ATMOSPHERE_MIX.foley,
    ),
  };
}

function sessionAtmosphereBusGain(args: {
  volume: number;
  mix?: SessionAtmosphereMix;
  bus: SessionAtmosphereBus;
  trim?: number;
}): number {
  const mix = normalizeSessionAtmosphereMix(args.mix);
  return (
    clampAudioLevel(args.volume) *
    mix[args.bus] *
    Math.max(0, Number.isFinite(args.trim) ? (args.trim ?? 1) : 1)
  );
}

export function sessionAtmosphereBusVolume(args: {
  volume: number;
  mix?: SessionAtmosphereMix;
  bus: SessionAtmosphereBus;
  trim?: number;
}): number {
  return clampAudioLevel(sessionAtmosphereBusGain(args));
}

export function startSessionAtmosphere(args: {
  seed: string;
  volume: number;
  backgroundUrl?: string | null;
  grainUrl?: string | null;
  mix?: SessionAtmosphereMix;
  backgroundTone?: SessionAtmosphereBackgroundTone;
  foleyRoomAcoustics?: RoomAcousticsSend;
  allowMixBoost?: boolean;
  shouldDeferFoley?: () => boolean;
  ambientFoley?: boolean;
  ambientFoleyProfile?: SessionAmbientFoleyProfile;
  onPlaybackError?: (error: unknown) => void;
}): SessionAtmosphereController {
  let volume = clampAudioLevel(args.volume);
  let mix = normalizeSessionAtmosphereMix(args.mix);
  const activeAudio = new Map<
    HTMLAudioElement,
    SessionAtmosphereActiveSource
  >();
  const activeLoops = new Set<SessionAtmosphereActiveLoop>();
  const pendingLoopLoads = new Set<AbortController>();
  let stopped = false;
  let timer: number | null = null;
  let foleyIndex = 0;
  const ambientFoleyProfile =
    args.ambientFoleyProfile ?? DEFAULT_SESSION_AMBIENT_FOLEY_PROFILE;

  const releaseAudio = (
    audio: HTMLAudioElement,
    preserveRoomTail = false,
  ): void => {
    const source = activeAudio.get(audio);
    source?.leveler?.disconnect(preserveRoomTail);
    activeAudio.delete(audio);
  };

  const applySourceVolume = (
    audio: HTMLAudioElement,
    source: {
      bus: SessionAtmosphereBus;
      trim: number;
      leveler: SessionAtmosphereSourceLeveler | null;
    },
  ): void => {
    const target = sessionAtmosphereBusGain({
      volume,
      mix,
      bus: source.bus,
      trim: source.trim,
    });
    if (source.leveler) {
      audio.volume = 1;
      source.leveler.busGain.gain.value = target;
    } else {
      audio.volume = clampAudioLevel(target);
    }
  };

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
    const source = {
      bus,
      trim,
      leveler:
        loop || args.allowMixBoost
          ? levelSessionAtmosphereSource(
              audio,
              loop,
              bus,
              args.backgroundTone ?? "neutral",
              args.foleyRoomAcoustics,
            )
          : null,
    } satisfies SessionAtmosphereActiveSource;
    activeAudio.set(audio, source);
    applySourceVolume(audio, source);
    if (!loop) {
      audio.addEventListener("ended", () => releaseAudio(audio, true), {
        once: true,
      });
    }
    void audio.play().catch((error: unknown) => {
      releaseAudio(audio);
      args.onPlaybackError?.(error);
    });
    return audio;
  };

  const playLoop = (
    url: string,
    bus: Extract<SessionAtmosphereBus, "background" | "grain">,
    trim = 1,
  ): void => {
    const context = sessionAtmosphereContext();
    if (
      !context ||
      typeof context.createBufferSource !== "function" ||
      typeof context.decodeAudioData !== "function" ||
      typeof fetch !== "function"
    ) {
      play(url, bus, trim, true);
      return;
    }

    const loadController = new AbortController();
    pendingLoopLoads.add(loadController);
    void (async () => {
      let activeLoop: SessionAtmosphereActiveLoop | null = null;
      try {
        const response = await fetch(url, {
          credentials: "include",
          signal: loadController.signal,
        });
        if (!response.ok) {
          throw new Error(`Unable to load atmosphere loop (${response.status})`);
        }
        const decoded = await context.decodeAudioData(
          await response.arrayBuffer(),
        );
        if (stopped || loadController.signal.aborted) return;
        const source = context.createBufferSource();
        source.buffer = createSeamlessSessionAtmosphereLoopBuffer(
          context,
          decoded,
        );
        source.loop = true;
        source.loopStart = 0;
        source.loopEnd = source.buffer.duration;
        activeLoop = {
          source,
          bus,
          trim,
          leveler: levelSessionAtmosphereNode(
            context,
            source,
            true,
            bus,
            args.backgroundTone ?? "neutral",
          ),
        };
        const target = sessionAtmosphereBusGain({ volume, mix, bus, trim });
        activeLoop.leveler.busGain.gain.value = target;
        activeLoops.add(activeLoop);
        source.start();
      } catch {
        if (activeLoop) {
          activeLoops.delete(activeLoop);
          activeLoop.leveler?.disconnect();
        }
        if (!stopped && !loadController.signal.aborted) {
          play(url, bus, trim, true);
        }
      } finally {
        pendingLoopLoads.delete(loadController);
      }
    })();
  };

  if (args.backgroundUrl) playLoop(args.backgroundUrl, "background");
  if (args.grainUrl) playLoop(args.grainUrl, "grain");

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
        play(
          sessionAmbientFoleyUrl(args.seed, index),
          "foley",
          Math.max(0, ambientFoleyProfile.trim),
        );
        foleyIndex += 1;
        scheduleFoley();
      },
      sessionAmbientFoleyDelayMs(args.seed, index, ambientFoleyProfile),
    );
  };
  if (args.ambientFoley !== false) scheduleFoley();

  return {
    playCue(cue) {
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
        applySourceVolume(audio, source);
      }
      for (const source of activeLoops) {
        source.leveler?.busGain.gain.setValueAtTime(
          sessionAtmosphereBusGain({
            volume,
            mix,
            bus: source.bus,
            trim: source.trim,
          }),
          source.source.context.currentTime,
        );
      }
    },
    stop() {
      stopped = true;
      if (timer !== null && typeof window !== "undefined") {
        window.clearTimeout(timer);
      }
      timer = null;
      for (const loadController of pendingLoopLoads) {
        loadController.abort();
      }
      pendingLoopLoads.clear();
      for (const source of activeLoops) {
        try {
          source.source.stop();
        } catch {
          // A source that failed during startup is already silent.
        }
        source.leveler?.disconnect();
      }
      activeLoops.clear();
      for (const audio of [...activeAudio.keys()]) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        releaseAudio(audio);
      }
    },
  };
}

export function coffeeCupFoleyCueForTransition(
  previous: boolean | undefined,
  sipping: boolean,
): SessionAtmosphereCue | null {
  if (previous === undefined || previous === sipping) return null;
  return sipping ? "coffeeSip" : "coffeeCupPlace";
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
    if (!announce) return;
    const cue = coffeeCupFoleyCueForTransition(previous, sipping);
    if (cue) controller.playCue(cue);
  };
  const inspectRemovedCup = (cup: HTMLElement): void => {
    const previous = sippingByCup.get(cup);
    sippingByCup.set(cup, false);
    const cue = coffeeCupFoleyCueForTransition(previous, false);
    if (cue) controller.playCue(cue);
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
      for (const node of mutation.removedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches(cupSelector)) inspectRemovedCup(node);
        node
          .querySelectorAll<HTMLElement>(cupSelector)
          .forEach(inspectRemovedCup);
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
