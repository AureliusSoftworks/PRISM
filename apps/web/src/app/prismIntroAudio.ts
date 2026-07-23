export type PrismIntroAudioPlaybackState =
  | "starting"
  | "playing"
  | "blocked"
  | "muted";

export interface PrismIntroAudioCue {
  src: string;
  volume: number;
}

export const PRISM_INTRO_MUSIC = {
  src: "/audio/prism-intro/prism-threshold-ethereal-loop-v1.mp3",
  volume: 0.18,
} as const satisfies PrismIntroAudioCue;

/**
 * The generated files arrived at very different mastered levels. These trims
 * make every scene cue read as a restrained layer beneath the music bed.
 */
export const PRISM_INTRO_SCENE_AUDIO = {
  border: {
    src: "/audio/prism-intro/01-border-coast.mp3",
    volume: 0.13,
  },
  threshold: {
    src: "/audio/prism-intro/02-threshold-door.mp3",
    volume: 0.23,
  },
  sanctum: {
    src: "/audio/prism-intro/03-sanctum-archive.mp3",
    volume: 0.17,
  },
  source: {
    src: "/audio/prism-intro/04-source-light.mp3",
    volume: 0.24,
  },
  refraction: {
    src: "/audio/prism-intro/05-refraction-bloom.mp3",
    volume: 1,
  },
  inhabitants: {
    src: "/audio/prism-intro/06-inhabitants-wake.mp3",
    volume: 0.36,
  },
  interplay: {
    src: "/audio/prism-intro/07-interplay-weave.mp3",
    volume: 0.15,
  },
  invitation: {
    src: "/audio/prism-intro/08-prism-online.mp3",
    volume: 0.035,
  },
} as const satisfies Readonly<Record<string, PrismIntroAudioCue>>;

export const PRISM_INTRO_AUDIO_RELEASE_MS = 320;
export const PRISM_INTRO_SCENE_RELEASE_MS = 180;

interface PrismIntroAudioElement {
  currentTime: number;
  loop: boolean;
  paused: boolean;
  preload: string;
  volume: number;
  addEventListener(
    type: "ended" | "error",
    listener: () => void,
    options?: { once?: boolean },
  ): void;
  load(): void;
  pause(): void;
  play(): Promise<void>;
  removeAttribute(name: "src"): void;
}

interface ActivePrismIntroAudio {
  audio: PrismIntroAudioElement;
  fadeTimer: ReturnType<typeof globalThis.setTimeout> | null;
  fading: boolean;
  released: boolean;
}

export interface PrismIntroAudioController {
  start(sceneId: string): void;
  showScene(sceneId: string): void;
  resume(sceneId: string): void;
  setEnabled(enabled: boolean, sceneId: string): void;
  release(): void;
}

interface PrismIntroAudioControllerOptions {
  createAudio?: (src: string) => PrismIntroAudioElement;
  onPlaybackStateChange?: (state: PrismIntroAudioPlaybackState) => void;
  releaseMs?: number;
  sceneReleaseMs?: number;
  now?: () => number;
  schedule?: (
    callback: () => void,
    delayMs: number,
  ) => ReturnType<typeof globalThis.setTimeout>;
  cancel?: (timer: ReturnType<typeof globalThis.setTimeout>) => void;
}

function clampIntroAudioVolume(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function prismIntroAudioFadeVolumeAt(
  startVolume: number,
  progress: number,
): number {
  const normalizedVolume = clampIntroAudioVolume(startVolume);
  const normalizedProgress = Math.max(
    0,
    Math.min(1, Number.isFinite(progress) ? progress : 1),
  );
  return normalizedVolume * Math.cos((normalizedProgress * Math.PI) / 2);
}

export function prismIntroSceneAudioFor(
  sceneId: string,
): PrismIntroAudioCue | null {
  return PRISM_INTRO_SCENE_AUDIO[
    sceneId as keyof typeof PRISM_INTRO_SCENE_AUDIO
  ] ?? null;
}

export function createPrismIntroAudioController(
  options: PrismIntroAudioControllerOptions = {},
): PrismIntroAudioController {
  const createAudio = options.createAudio ?? (
    typeof Audio === "undefined"
      ? null
      : (src: string): PrismIntroAudioElement => new Audio(src)
  );
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? globalThis.setTimeout;
  const cancel = options.cancel ?? globalThis.clearTimeout;
  const releaseMs = Math.max(
    0,
    Math.round(options.releaseMs ?? PRISM_INTRO_AUDIO_RELEASE_MS),
  );
  const sceneReleaseMs = Math.max(
    0,
    Math.round(options.sceneReleaseMs ?? PRISM_INTRO_SCENE_RELEASE_MS),
  );
  let released = false;
  let enabled = true;
  let musicSlot: ActivePrismIntroAudio | null = null;
  let sceneSlot: ActivePrismIntroAudio | null = null;
  let activeSceneId: string | null = null;
  let lastPlaybackState: PrismIntroAudioPlaybackState | null = null;

  const emitPlaybackState = (state: PrismIntroAudioPlaybackState): void => {
    if (lastPlaybackState === state) return;
    lastPlaybackState = state;
    options.onPlaybackStateChange?.(state);
  };

  const releaseSlot = (slot: ActivePrismIntroAudio): void => {
    if (slot.released) return;
    slot.released = true;
    slot.fading = false;
    if (slot.fadeTimer !== null) cancel(slot.fadeTimer);
    slot.fadeTimer = null;
    try {
      slot.audio.pause();
      slot.audio.currentTime = 0;
      slot.audio.removeAttribute("src");
      slot.audio.load();
    } catch {
      // A browser may have already released the media element.
    }
  };

  const fadeAndReleaseSlot = (
    slot: ActivePrismIntroAudio | null,
    fadeMs: number,
  ): void => {
    if (!slot || slot.released || slot.fading) return;
    slot.fading = true;
    const startVolume = slot.audio.volume;
    if (fadeMs <= 0 || slot.audio.paused || startVolume <= 0) {
      releaseSlot(slot);
      return;
    }
    const startedAt = now();
    const step = (): void => {
      if (slot.released) return;
      const progress = (now() - startedAt) / fadeMs;
      slot.audio.volume = prismIntroAudioFadeVolumeAt(startVolume, progress);
      if (progress >= 1) {
        releaseSlot(slot);
        return;
      }
      slot.fadeTimer = schedule(step, 16);
    };
    step();
  };

  const playSlot = (
    slot: ActivePrismIntroAudio,
    isCurrent: () => boolean,
  ): void => {
    if (slot.released || slot.fading || released || !enabled) return;
    void slot.audio.play().then(
      () => {
        if (!slot.released && !released && enabled && isCurrent()) {
          emitPlaybackState("playing");
        }
      },
      () => {
        if (!slot.released && !released && enabled && isCurrent()) {
          emitPlaybackState("blocked");
        }
      },
    );
  };

  const createSlot = (
    cue: PrismIntroAudioCue,
    loop: boolean,
  ): ActivePrismIntroAudio | null => {
    if (!createAudio || released || !enabled) return null;
    try {
      const audio = createAudio(cue.src);
      audio.preload = "auto";
      audio.loop = loop;
      audio.volume = clampIntroAudioVolume(cue.volume);
      return {
        audio,
        fadeTimer: null,
        fading: false,
        released: false,
      };
    } catch {
      emitPlaybackState("blocked");
      return null;
    }
  };

  const startMusic = (): void => {
    if (released || !enabled) return;
    if (!musicSlot) {
      musicSlot = createSlot(PRISM_INTRO_MUSIC, true);
      if (!musicSlot) {
        emitPlaybackState("blocked");
        return;
      }
      const createdSlot = musicSlot;
      createdSlot.audio.addEventListener("error", () => {
        if (musicSlot === createdSlot) musicSlot = null;
        releaseSlot(createdSlot);
        if (!released && enabled && musicSlot === null) {
          emitPlaybackState("blocked");
        }
      }, { once: true });
    }
    const slot = musicSlot;
    if (slot?.audio.paused) playSlot(slot, () => musicSlot === slot);
  };

  const showScene = (sceneId: string): void => {
    if (released || !enabled || activeSceneId === sceneId) return;
    const previousSlot = sceneSlot;
    sceneSlot = null;
    activeSceneId = sceneId;
    fadeAndReleaseSlot(previousSlot, sceneReleaseMs);
    const cue = prismIntroSceneAudioFor(sceneId);
    if (!cue) return;
    const slot = createSlot(cue, false);
    if (!slot) return;
    sceneSlot = slot;
    const releaseScene = (): void => {
      if (sceneSlot === slot) sceneSlot = null;
      releaseSlot(slot);
    };
    slot.audio.addEventListener("ended", releaseScene, { once: true });
    slot.audio.addEventListener("error", releaseScene, { once: true });
    playSlot(slot, () => sceneSlot === slot);
  };

  const start = (sceneId: string): void => {
    if (released || !enabled) return;
    emitPlaybackState("starting");
    startMusic();
    showScene(sceneId);
  };

  return {
    start,
    showScene,
    resume(sceneId) {
      if (released || !enabled) return;
      startMusic();
      if (activeSceneId !== sceneId) {
        showScene(sceneId);
      } else if (sceneSlot?.audio.paused) {
        const slot = sceneSlot;
        playSlot(slot, () => sceneSlot === slot);
      }
    },
    setEnabled(nextEnabled, sceneId) {
      if (released || enabled === nextEnabled) {
        if (enabled && nextEnabled) this.resume(sceneId);
        return;
      }
      enabled = nextEnabled;
      if (!enabled) {
        const previousMusic = musicSlot;
        const previousScene = sceneSlot;
        musicSlot = null;
        sceneSlot = null;
        activeSceneId = null;
        fadeAndReleaseSlot(previousMusic, releaseMs);
        fadeAndReleaseSlot(previousScene, sceneReleaseMs);
        emitPlaybackState("muted");
        return;
      }
      start(sceneId);
    },
    release() {
      if (released) return;
      released = true;
      enabled = false;
      const previousMusic = musicSlot;
      const previousScene = sceneSlot;
      musicSlot = null;
      sceneSlot = null;
      activeSceneId = null;
      fadeAndReleaseSlot(previousMusic, releaseMs);
      fadeAndReleaseSlot(previousScene, sceneReleaseMs);
    },
  };
}
