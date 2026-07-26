import {
  normalizeBotAudioVoiceProfileV1,
  normalizeBotAvatarSfxV1,
  type BotAudioVoiceProfileV1,
  type BotAvatarSfxV1,
  type NormalizedBotAudioVoiceProfileV1,
} from "@localai/shared";
import {
  prismAudioContext,
  prismAudioOutputNode,
} from "./replayAudioMasterCapture.ts";

export const GENERATED_BOT_THINKING_SFX_PROMPT = "Computer calculating";
export const PRISM_BOT_THINKING_SFX_FALLBACK_URLS = [
  "/audio/avatar/prism-calculating-01.mp3",
  "/audio/avatar/prism-calculating-02.mp3",
  "/audio/avatar/prism-calculating-03.mp3",
  "/audio/avatar/prism-calculating-04.mp3",
] as const;
export const BOT_AVATAR_SFX_LOOP_EDGE_TRIM_SECONDS = 0.08;
export const BOT_AVATAR_SFX_SHORT_LOOP_TRIM_RATIO = 0.1;
export const BOT_AVATAR_SFX_ATTACK_MS = 120;
export const BOT_AVATAR_SFX_RELEASE_MS = 240;

export type BotAvatarSfxState = "idle" | "blink" | "talking" | "thinking";
export type BotAvatarSfxPlayback = Pick<
  BotAvatarSfxV1,
  | "audioDataUrl"
  | "playWhileTalking"
  | "playWhileIdle"
  | "playWhileThinking"
  | "volume"
>;

export interface BotAvatarSfxAudioTarget {
  src: string;
  currentTime: number;
  readonly duration?: number;
  loop: boolean;
  volume: number;
  readonly paused: boolean;
  load(): void;
  pause(): void;
  play(): Promise<void>;
}

export interface BotAvatarSfxSpatialConnection {
  source: MediaElementAudioSourceNode;
  mono: GainNode;
  panner: StereoPannerNode;
  output: GainNode;
}

type BotAvatarSfxSpatialAudioContext = Pick<
  AudioContext,
  | "createMediaElementSource"
  | "createGain"
  | "createStereoPanner"
  | "destination"
>;

type BotAvatarSfxSpatialEngine = BotAvatarSfxSpatialConnection & {
  context: AudioContext;
  anchor: Element;
  animationFrame: number | null;
  connected: boolean;
  lastPan: number | null;
  loadedSource: string | null;
  desiredSource: string | null;
  desiredGain: number;
  desiredPlaying: boolean;
  gainEnvelope: BotAvatarSfxGainEnvelope | null;
  playRequest: number;
  releaseTimer: ReturnType<typeof globalThis.setTimeout> | null;
};

type BotAvatarSfxGainEnvelope = {
  kind: "attack" | "release";
  fromGain: number;
  toGain: number;
  startedAt: number;
  durationSeconds: number;
};

type BotAvatarSfxSampleRuntime = {
  desiredPlaying: boolean;
  desiredSource: string | null;
  fadeGeneration: number;
  fadeTimer: ReturnType<typeof globalThis.setTimeout> | null;
  lifecycleGeneration: number;
  loadedSource: string | null;
  loopFrame: number | null;
  targetVolume: number;
};

let botAvatarSfxAudioContext: AudioContext | null = null;
const botAvatarSfxSpatialEngines = new WeakMap<
  HTMLMediaElement,
  BotAvatarSfxSpatialEngine
>();
const botAvatarSfxSampleRuntimes = new WeakMap<
  HTMLMediaElement,
  BotAvatarSfxSampleRuntime
>();

function clampBotAvatarSfxGain(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampBotAvatarSfxProgress(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));
}

export function botAvatarSfxLoopBounds(
  durationSeconds: number,
): { startTime: number; endTime: number } | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const edgeTrim = Math.min(
    BOT_AVATAR_SFX_LOOP_EDGE_TRIM_SECONDS,
    durationSeconds * BOT_AVATAR_SFX_SHORT_LOOP_TRIM_RATIO,
  );
  return {
    startTime: edgeTrim,
    endTime: Math.max(edgeTrim, durationSeconds - edgeTrim),
  };
}

export function botAvatarSfxLoopRestartTime(
  currentTime: number,
  durationSeconds: number,
): number | null {
  const bounds = botAvatarSfxLoopBounds(durationSeconds);
  if (!bounds || !Number.isFinite(currentTime)) return null;
  return currentTime < bounds.startTime || currentTime >= bounds.endTime
    ? bounds.startTime
    : null;
}

export function botAvatarSfxAttackGainAt(
  fromGain: number,
  targetGain: number,
  progress: number,
): number {
  const from = clampBotAvatarSfxGain(fromGain);
  const target = clampBotAvatarSfxGain(targetGain);
  const shapedProgress = Math.sin(
    (clampBotAvatarSfxProgress(progress) * Math.PI) / 2,
  );
  return from + (target - from) * shapedProgress;
}

export function botAvatarSfxReleaseGainAt(
  fromGain: number,
  progress: number,
): number {
  return (
    clampBotAvatarSfxGain(fromGain) *
    Math.cos((clampBotAvatarSfxProgress(progress) * Math.PI) / 2)
  );
}

export function botAvatarSfxStereoPanForRect(
  rect: Pick<DOMRect, "left" | "width">,
  viewportWidth: number,
): number {
  if (
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(viewportWidth) ||
    viewportWidth <= 0
  ) {
    return 0;
  }
  const centerX = rect.left + rect.width / 2;
  return Math.max(-1, Math.min(1, (centerX / viewportWidth) * 2 - 1));
}

export function connectBotAvatarSfxSpatialAudio(
  context: BotAvatarSfxSpatialAudioContext,
  audio: HTMLMediaElement,
  destination: AudioNode = context.destination,
): BotAvatarSfxSpatialConnection {
  const source = context.createMediaElementSource(audio);
  const mono = context.createGain();
  mono.channelCount = 1;
  mono.channelCountMode = "explicit";
  mono.channelInterpretation = "speakers";
  const panner = context.createStereoPanner();
  const output = context.createGain();

  source.connect(mono);
  mono.connect(panner);
  panner.connect(output);
  output.connect(destination);

  return { source, mono, panner, output };
}

function isBrowserMediaElement(
  audio: BotAvatarSfxAudioTarget,
): audio is HTMLMediaElement {
  return (
    typeof HTMLMediaElement !== "undefined" &&
    audio instanceof HTMLMediaElement
  );
}

function botAvatarSfxContext(): AudioContext | null {
  if (!botAvatarSfxAudioContext || botAvatarSfxAudioContext.state === "closed") {
    botAvatarSfxAudioContext = prismAudioContext();
  }
  return botAvatarSfxAudioContext;
}

function connectBotAvatarSfxSpatialEngineNodes(
  engine: BotAvatarSfxSpatialEngine,
): void {
  if (engine.connected) return;
  engine.source.connect(engine.mono);
  engine.mono.connect(engine.panner);
  engine.panner.connect(engine.output);
  engine.output.connect(prismAudioOutputNode(engine.context));
  engine.connected = true;
}

function botAvatarSfxSpatialEngineFor(
  audio: HTMLMediaElement,
): BotAvatarSfxSpatialEngine | null {
  const existing = botAvatarSfxSpatialEngines.get(audio);
  if (existing) {
    existing.anchor =
      audio.closest('[data-zen-live-bot-body-layer="true"]') ??
      audio.parentElement ??
      audio;
    connectBotAvatarSfxSpatialEngineNodes(existing);
    return existing;
  }

  const context = botAvatarSfxContext();
  if (!context) return null;
  try {
    const connection = connectBotAvatarSfxSpatialAudio(
      context,
      audio,
      prismAudioOutputNode(context),
    );
    const engine: BotAvatarSfxSpatialEngine = {
      ...connection,
      context,
      anchor:
        audio.closest('[data-zen-live-bot-body-layer="true"]') ??
        audio.parentElement ??
        audio,
      animationFrame: null,
      connected: true,
      lastPan: null,
      loadedSource: null,
      desiredSource: null,
      desiredGain: 0,
      desiredPlaying: false,
      gainEnvelope: null,
      playRequest: 0,
      releaseTimer: null,
    };
    botAvatarSfxSpatialEngines.set(audio, engine);
    return engine;
  } catch {
    return null;
  }
}

function updateBotAvatarSfxSpatialPan(engine: BotAvatarSfxSpatialEngine): void {
  const nextPan = botAvatarSfxStereoPanForRect(
    engine.anchor.getBoundingClientRect(),
    window.innerWidth,
  );
  if (engine.lastPan !== null && Math.abs(engine.lastPan - nextPan) < 0.002) {
    return;
  }
  engine.lastPan = nextPan;
  engine.panner.pan.setTargetAtTime(
    nextPan,
    engine.context.currentTime,
    0.025,
  );
}

function updateBotAvatarSfxLoopTime(audio: BotAvatarSfxAudioTarget): void {
  const restartTime = botAvatarSfxLoopRestartTime(
    audio.currentTime,
    audio.duration ?? Number.NaN,
  );
  if (restartTime === null) return;
  try {
    audio.currentTime = restartTime;
  } catch {
    // Metadata can briefly become stale while a newly selected source loads.
  }
}

function startBotAvatarSfxSpatialTracking(
  engine: BotAvatarSfxSpatialEngine,
  audio: HTMLMediaElement,
): void {
  if (engine.animationFrame !== null) return;
  const tick = (): void => {
    updateBotAvatarSfxSpatialPan(engine);
    updateBotAvatarSfxLoopTime(audio);
    engine.animationFrame = window.requestAnimationFrame(tick);
  };
  tick();
}

function releaseBotAvatarSfxSpatialEngine(
  audio: BotAvatarSfxAudioTarget,
): void {
  if (!isBrowserMediaElement(audio)) return;
  const engine = botAvatarSfxSpatialEngines.get(audio);
  if (!engine) return;
  if (engine.animationFrame !== null) {
    window.cancelAnimationFrame(engine.animationFrame);
    engine.animationFrame = null;
  }
  engine.lastPan = null;
  if (!engine.connected) return;
  engine.source.disconnect();
  engine.mono.disconnect();
  engine.panner.disconnect();
  engine.output.disconnect();
  engine.connected = false;
}

function botAvatarSfxGainEnvelopeValue(
  envelope: BotAvatarSfxGainEnvelope,
  atTime: number,
): number {
  const progress =
    envelope.durationSeconds <= 0
      ? 1
      : (atTime - envelope.startedAt) / envelope.durationSeconds;
  return envelope.kind === "attack"
    ? botAvatarSfxAttackGainAt(
        envelope.fromGain,
        envelope.toGain,
        progress,
      )
    : botAvatarSfxReleaseGainAt(envelope.fromGain, progress);
}

function holdBotAvatarSfxSpatialGain(
  engine: BotAvatarSfxSpatialEngine,
): number {
  const now = engine.context.currentTime;
  const currentGain = engine.gainEnvelope
    ? botAvatarSfxGainEnvelopeValue(engine.gainEnvelope, now)
    : clampBotAvatarSfxGain(engine.output.gain.value);
  engine.output.gain.cancelScheduledValues(now);
  engine.output.gain.setValueAtTime(currentGain, now);
  engine.gainEnvelope = null;
  return currentGain;
}

function scheduleBotAvatarSfxSpatialGain(
  engine: BotAvatarSfxSpatialEngine,
  kind: BotAvatarSfxGainEnvelope["kind"],
  fromGain: number,
  toGain: number,
  durationMs: number,
): void {
  const now = engine.context.currentTime;
  const normalizedDurationMs = Math.max(0, Math.round(durationMs));
  const normalizedFrom = clampBotAvatarSfxGain(fromGain);
  const normalizedTo = clampBotAvatarSfxGain(toGain);
  engine.output.gain.cancelScheduledValues(now);
  if (normalizedDurationMs === 0 || normalizedFrom === normalizedTo) {
    engine.output.gain.setValueAtTime(normalizedTo, now);
    engine.gainEnvelope = null;
    return;
  }
  const durationSeconds = normalizedDurationMs / 1_000;
  const curve = Float32Array.from({ length: 32 }, (_, index) =>
    kind === "attack"
      ? botAvatarSfxAttackGainAt(
          normalizedFrom,
          normalizedTo,
          index / 31,
        )
      : botAvatarSfxReleaseGainAt(normalizedFrom, index / 31),
  );
  engine.output.gain.setValueAtTime(normalizedFrom, now);
  engine.output.gain.setValueCurveAtTime(curve, now, durationSeconds);
  engine.gainEnvelope = {
    kind,
    fromGain: normalizedFrom,
    toGain: normalizedTo,
    startedAt: now,
    durationSeconds,
  };
}

function clearBotAvatarSfxReleaseTimer(
  engine: BotAvatarSfxSpatialEngine,
): void {
  if (engine.releaseTimer === null) return;
  globalThis.clearTimeout(engine.releaseTimer);
  engine.releaseTimer = null;
}

function installBotAvatarSfxSource(
  audio: HTMLMediaElement,
  engine: BotAvatarSfxSpatialEngine,
  source: string,
): void {
  engine.playRequest += 1;
  audio.pause();
  audio.currentTime = 0;
  audio.src = source;
  audio.load();
  engine.loadedSource = source;
}

function startBotAvatarSfxSpatialPlayback(
  audio: HTMLMediaElement,
  engine: BotAvatarSfxSpatialEngine,
): void {
  if (!engine.desiredPlaying || !engine.desiredSource) return;
  clearBotAvatarSfxReleaseTimer(engine);
  connectBotAvatarSfxSpatialEngineNodes(engine);
  audio.loop = true;
  audio.volume = 1;
  updateBotAvatarSfxLoopTime(audio);
  startBotAvatarSfxSpatialTracking(engine, audio);
  const fromGain = holdBotAvatarSfxSpatialGain(engine);
  if (engine.context.state === "suspended") {
    void engine.context.resume().catch(() => undefined);
  }
  if (!audio.paused) {
    scheduleBotAvatarSfxSpatialGain(
      engine,
      "attack",
      fromGain,
      engine.desiredGain,
      BOT_AVATAR_SFX_ATTACK_MS,
    );
    return;
  }
  engine.output.gain.setValueAtTime(0, engine.context.currentTime);
  const playRequest = ++engine.playRequest;
  void audio.play().then(
    () => {
      if (
        playRequest !== engine.playRequest ||
        !engine.desiredPlaying ||
        engine.loadedSource !== engine.desiredSource
      ) {
        return;
      }
      updateBotAvatarSfxLoopTime(audio);
      scheduleBotAvatarSfxSpatialGain(
        engine,
        "attack",
        0,
        engine.desiredGain,
        BOT_AVATAR_SFX_ATTACK_MS,
      );
    },
    () => {
      if (playRequest !== engine.playRequest) return;
      engine.desiredPlaying = false;
      audio.pause();
      audio.currentTime = 0;
      holdBotAvatarSfxSpatialGain(engine);
      engine.output.gain.setValueAtTime(0, engine.context.currentTime);
      releaseBotAvatarSfxSpatialEngine(audio);
    },
  );
}

function finishBotAvatarSfxSpatialRelease(
  audio: HTMLMediaElement,
  engine: BotAvatarSfxSpatialEngine,
): void {
  engine.releaseTimer = null;
  engine.playRequest += 1;
  holdBotAvatarSfxSpatialGain(engine);
  engine.output.gain.setValueAtTime(0, engine.context.currentTime);
  audio.pause();
  audio.currentTime = 0;
  if (engine.desiredPlaying && engine.desiredSource) {
    if (engine.loadedSource !== engine.desiredSource) {
      installBotAvatarSfxSource(audio, engine, engine.desiredSource);
    }
    startBotAvatarSfxSpatialPlayback(audio, engine);
    return;
  }
  releaseBotAvatarSfxSpatialEngine(audio);
}

function releaseBotAvatarSfxSpatialPlayback(
  audio: HTMLMediaElement,
  engine: BotAvatarSfxSpatialEngine,
): void {
  engine.playRequest += 1;
  if (engine.releaseTimer !== null) return;
  const fromGain = holdBotAvatarSfxSpatialGain(engine);
  if (audio.paused || fromGain <= 0) {
    finishBotAvatarSfxSpatialRelease(audio, engine);
    return;
  }
  scheduleBotAvatarSfxSpatialGain(
    engine,
    "release",
    fromGain,
    0,
    BOT_AVATAR_SFX_RELEASE_MS,
  );
  engine.releaseTimer = globalThis.setTimeout(
    () => finishBotAvatarSfxSpatialRelease(audio, engine),
    BOT_AVATAR_SFX_RELEASE_MS,
  );
}

function syncBrowserBotAvatarSfxAudio(
  audio: HTMLMediaElement,
  sfx: BotAvatarSfxPlayback | null | undefined,
  state: BotAvatarSfxState,
  loadedSource: string | null,
): string | null {
  const shouldPlay = botAvatarSfxShouldPlay(sfx, state);
  const existingEngine = botAvatarSfxSpatialEngines.get(audio);
  if (!shouldPlay || !sfx) {
    if (!existingEngine) {
      audio.pause();
      audio.currentTime = 0;
      return loadedSource;
    }
    existingEngine.desiredPlaying = false;
    existingEngine.desiredSource = null;
    releaseBotAvatarSfxSpatialPlayback(audio, existingEngine);
    return loadedSource;
  }

  const engine = botAvatarSfxSpatialEngineFor(audio);
  if (!engine) {
    audio.pause();
    audio.currentTime = 0;
    return sfx.audioDataUrl;
  }
  const previousDesiredGain = engine.desiredGain;
  engine.desiredPlaying = true;
  engine.desiredSource = sfx.audioDataUrl;
  engine.desiredGain = clampBotAvatarSfxGain(sfx.volume);

  if (engine.loadedSource !== engine.desiredSource) {
    if (!audio.paused && engine.loadedSource !== null) {
      releaseBotAvatarSfxSpatialPlayback(audio, engine);
      return engine.desiredSource;
    }
    installBotAvatarSfxSource(audio, engine, engine.desiredSource);
    startBotAvatarSfxSpatialPlayback(audio, engine);
    return engine.desiredSource;
  }

  if (engine.releaseTimer !== null) {
    clearBotAvatarSfxReleaseTimer(engine);
    const fromGain = holdBotAvatarSfxSpatialGain(engine);
    scheduleBotAvatarSfxSpatialGain(
      engine,
      "attack",
      fromGain,
      engine.desiredGain,
      BOT_AVATAR_SFX_ATTACK_MS,
    );
  } else if (audio.paused) {
    startBotAvatarSfxSpatialPlayback(audio, engine);
  } else if (previousDesiredGain !== engine.desiredGain) {
    holdBotAvatarSfxSpatialGain(engine);
    engine.output.gain.setValueAtTime(
      engine.desiredGain,
      engine.context.currentTime,
    );
  }
  startBotAvatarSfxSpatialTracking(engine, audio);
  return engine.desiredSource;
}

export function prismBotThinkingSfxFallbackIndex(seed: string): number {
  let hash = 2_166_136_261;
  const normalizedSeed = seed.trim() || "prism";
  for (let index = 0; index < normalizedSeed.length; index += 1) {
    hash ^= normalizedSeed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0) % PRISM_BOT_THINKING_SFX_FALLBACK_URLS.length;
}

export function prismBotThinkingSfxFallback(
  seed: string,
): BotAvatarSfxPlayback {
  return {
    audioDataUrl:
      PRISM_BOT_THINKING_SFX_FALLBACK_URLS[
        prismBotThinkingSfxFallbackIndex(seed)
      ],
    playWhileTalking: false,
    playWhileIdle: false,
    playWhileThinking: true,
    volume: 0.45,
  };
}

export function effectiveBotAvatarSfxPlayback(
  profile: BotAudioVoiceProfileV1 | null | undefined,
  fallbackSeed: string,
): BotAvatarSfxPlayback | null {
  const normalized = normalizeBotAudioVoiceProfileV1(profile);
  if (normalized.avatarSfxMuted === true) return null;
  return normalized.avatarSfx ?? prismBotThinkingSfxFallback(fallbackSeed);
}

export function botAvatarSfxShouldPlay(
  sfx: BotAvatarSfxPlayback | null | undefined,
  state: BotAvatarSfxState,
): boolean {
  if (!sfx?.audioDataUrl || sfx.volume <= 0) return false;
  if (state === "talking") return sfx.playWhileTalking;
  if (state === "thinking") return sfx.playWhileThinking;
  return sfx.playWhileIdle;
}

export function syncBotAvatarSfxAudio(
  audio: BotAvatarSfxAudioTarget,
  sfx: BotAvatarSfxPlayback | null | undefined,
  state: BotAvatarSfxState,
  loadedSource: string | null,
): string | null {
  if (isBrowserMediaElement(audio)) {
    return syncBrowserBotAvatarSfxAudio(audio, sfx, state, loadedSource);
  }
  if (!botAvatarSfxShouldPlay(sfx, state) || !sfx) {
    audio.pause();
    audio.currentTime = 0;
    return loadedSource;
  }
  if (loadedSource !== sfx.audioDataUrl) {
    audio.pause();
    audio.src = sfx.audioDataUrl;
    audio.load();
    loadedSource = sfx.audioDataUrl;
  }
  audio.loop = true;
  audio.volume = sfx.volume;
  updateBotAvatarSfxLoopTime(audio);
  if (audio.paused) void audio.play().catch(() => undefined);
  return loadedSource;
}

export function stopBotAvatarSfxAudio(
  audio: BotAvatarSfxAudioTarget,
): void {
  if (isBrowserMediaElement(audio)) {
    const engine = botAvatarSfxSpatialEngines.get(audio);
    if (engine) {
      engine.desiredPlaying = false;
      engine.desiredSource = null;
      releaseBotAvatarSfxSpatialPlayback(audio, engine);
      return;
    }
  }
  audio.pause();
  audio.currentTime = 0;
}

function botAvatarSfxSampleRuntimeFor(
  audio: HTMLMediaElement,
): BotAvatarSfxSampleRuntime {
  const existing = botAvatarSfxSampleRuntimes.get(audio);
  if (existing) return existing;
  const runtime: BotAvatarSfxSampleRuntime = {
    desiredPlaying: false,
    desiredSource: null,
    fadeGeneration: 0,
    fadeTimer: null,
    lifecycleGeneration: 0,
    loadedSource: null,
    loopFrame: null,
    targetVolume: 0,
  };
  botAvatarSfxSampleRuntimes.set(audio, runtime);
  return runtime;
}

function startBotAvatarSfxSampleLoopTracking(
  audio: HTMLMediaElement,
  runtime: BotAvatarSfxSampleRuntime,
): void {
  if (runtime.loopFrame !== null || typeof window === "undefined") return;
  const tick = (): void => {
    updateBotAvatarSfxLoopTime(audio);
    if (!runtime.desiredPlaying && audio.paused) {
      runtime.loopFrame = null;
      return;
    }
    runtime.loopFrame = window.requestAnimationFrame(tick);
  };
  tick();
}

function fadeBotAvatarSfxSampleVolume(
  audio: HTMLMediaElement,
  runtime: BotAvatarSfxSampleRuntime,
  kind: "attack" | "release",
  fromVolume: number,
  targetVolume: number,
  durationMs: number,
): Promise<boolean> {
  if (runtime.fadeTimer !== null) {
    globalThis.clearTimeout(runtime.fadeTimer);
    runtime.fadeTimer = null;
  }
  const fadeGeneration = ++runtime.fadeGeneration;
  const startedAt = Date.now();
  const normalizedDuration = Math.max(0, Math.round(durationMs));
  return new Promise((resolve) => {
    const step = (): void => {
      if (fadeGeneration !== runtime.fadeGeneration) {
        resolve(false);
        return;
      }
      const progress =
        normalizedDuration === 0
          ? 1
          : (Date.now() - startedAt) / normalizedDuration;
      audio.volume =
        kind === "attack"
          ? botAvatarSfxAttackGainAt(
              fromVolume,
              targetVolume,
              progress,
            )
          : botAvatarSfxReleaseGainAt(fromVolume, progress);
      if (progress >= 1) {
        runtime.fadeTimer = null;
        resolve(true);
        return;
      }
      runtime.fadeTimer = globalThis.setTimeout(step, 16);
    };
    step();
  });
}

export async function playBotAvatarSfxSampleAudio(
  audio: HTMLMediaElement,
  sfx: BotAvatarSfxPlayback,
): Promise<void> {
  const runtime = botAvatarSfxSampleRuntimeFor(audio);
  const lifecycleGeneration = ++runtime.lifecycleGeneration;
  runtime.desiredPlaying = true;
  runtime.desiredSource = sfx.audioDataUrl;
  runtime.targetVolume = clampBotAvatarSfxGain(sfx.volume);
  if (
    runtime.loadedSource !== runtime.desiredSource &&
    !audio.paused &&
    audio.volume > 0
  ) {
    const released = await fadeBotAvatarSfxSampleVolume(
      audio,
      runtime,
      "release",
      audio.volume,
      0,
      BOT_AVATAR_SFX_RELEASE_MS,
    );
    if (
      !released ||
      lifecycleGeneration !== runtime.lifecycleGeneration ||
      !runtime.desiredPlaying
    ) {
      return;
    }
    audio.pause();
    audio.currentTime = 0;
  }
  if (lifecycleGeneration !== runtime.lifecycleGeneration) return;
  if (runtime.loadedSource !== runtime.desiredSource) {
    audio.pause();
    audio.currentTime = 0;
    audio.src = runtime.desiredSource;
    audio.load();
    runtime.loadedSource = runtime.desiredSource;
  }
  audio.loop = true;
  const fromVolume = audio.paused ? 0 : audio.volume;
  audio.volume = fromVolume;
  updateBotAvatarSfxLoopTime(audio);
  startBotAvatarSfxSampleLoopTracking(audio, runtime);
  await audio.play();
  if (
    lifecycleGeneration !== runtime.lifecycleGeneration ||
    !runtime.desiredPlaying ||
    runtime.loadedSource !== runtime.desiredSource
  ) {
    return;
  }
  updateBotAvatarSfxLoopTime(audio);
  void fadeBotAvatarSfxSampleVolume(
    audio,
    runtime,
    "attack",
    fromVolume,
    runtime.targetVolume,
    BOT_AVATAR_SFX_ATTACK_MS,
  );
}

export function stopBotAvatarSfxSampleAudio(
  audio: HTMLMediaElement,
): void {
  const runtime = botAvatarSfxSampleRuntimeFor(audio);
  const lifecycleGeneration = ++runtime.lifecycleGeneration;
  runtime.desiredPlaying = false;
  runtime.desiredSource = null;
  const finish = (): void => {
    if (lifecycleGeneration !== runtime.lifecycleGeneration) return;
    audio.pause();
    audio.currentTime = 0;
  };
  if (audio.paused || audio.volume <= 0) {
    finish();
    return;
  }
  void fadeBotAvatarSfxSampleVolume(
    audio,
    runtime,
    "release",
    audio.volume,
    0,
    BOT_AVATAR_SFX_RELEASE_MS,
  ).then((released) => {
    if (released) finish();
  });
}

export function setBotAvatarSfxSampleVolume(
  audio: HTMLMediaElement,
  volume: number,
): void {
  const runtime = botAvatarSfxSampleRuntimeFor(audio);
  runtime.targetVolume = clampBotAvatarSfxGain(volume);
  if (runtime.desiredPlaying && !audio.paused) {
    runtime.fadeGeneration += 1;
    if (runtime.fadeTimer !== null) {
      globalThis.clearTimeout(runtime.fadeTimer);
      runtime.fadeTimer = null;
    }
    audio.volume = runtime.targetVolume;
  }
}

export function audioBlobAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the audio file."));
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read the audio file."));
      }
    };
    reader.readAsDataURL(blob);
  });
}

function avatarSfxResponseError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return fallback;
  }
  const record = payload as Record<string, unknown>;
  return typeof record.error === "string" && record.error.trim()
    ? record.error.trim()
    : fallback;
}

export async function requestElevenLabsAvatarSfxLoop(
  prompt: string,
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Blob> {
  const response = await fetchImpl(
    new URL("/api/avatar/sfx/generate", origin),
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    },
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      avatarSfxResponseError(
        payload,
        `ElevenLabs could not create the loop (${response.status}).`,
      ),
    );
  }
  const blob = await response.blob();
  if (!blob.type.startsWith("audio/")) {
    throw new Error("ElevenLabs returned an unsupported audio file.");
  }
  return blob;
}

export function botAudioVoiceProfileWithThinkingSfx(
  profile: BotAudioVoiceProfileV1,
  audioDataUrl: string,
): NormalizedBotAudioVoiceProfileV1 {
  const thinkingSfx = normalizeBotAvatarSfxV1({
    v: 1,
    source: "elevenlabs",
    audioDataUrl,
    fileName: "ElevenLabs thinking loop.mp3",
    prompt: GENERATED_BOT_THINKING_SFX_PROMPT,
    playWhileTalking: false,
    playWhileIdle: false,
    playWhileThinking: true,
    volume: 0.45,
  });
  if (!thinkingSfx) {
    throw new Error("PRISM could not read the generated thinking loop.");
  }
  return normalizeBotAudioVoiceProfileV1({
    ...normalizeBotAudioVoiceProfileV1(profile),
    avatarSfx: thinkingSfx,
    avatarSfxMuted: false,
  });
}

export async function generateBotThinkingSfxProfile(
  profile: BotAudioVoiceProfileV1,
  origin: string,
  fetchImpl: typeof fetch = fetch,
): Promise<NormalizedBotAudioVoiceProfileV1> {
  const blob = await requestElevenLabsAvatarSfxLoop(
    GENERATED_BOT_THINKING_SFX_PROMPT,
    origin,
    fetchImpl,
  );
  return botAudioVoiceProfileWithThinkingSfx(
    profile,
    await audioBlobAsDataUrl(blob),
  );
}
