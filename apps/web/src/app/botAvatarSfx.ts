import {
  BOT_AVATAR_SFX_DEFAULT_VOLUME,
  BOT_AVATAR_SFX_MAX_BYTES,
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
import {
  isPrismFullscreenBlockingAudioMuted,
  setPrismFullscreenBlockingAudioStopHandler,
} from "./prismFullscreenBlockingAudio.ts";

export const GENERATED_BOT_THINKING_SFX_PROMPT = "Computer calculating";
export const PRISM_BOT_THINKING_SFX_FALLBACK_URLS = [
  "/audio/avatar/prism-calculating-01.mp3",
  "/audio/avatar/prism-calculating-02.mp3",
  "/audio/avatar/prism-calculating-03.mp3",
  "/audio/avatar/prism-calculating-04.mp3",
] as const;
/**
 * Edge trim for baked/normalized loops. Newly generated avatar-editor clips
 * live between silent guard pads of this length; playback skips those pads so
 * the full audible loop body plays out — no artificial early cut.
 */
export const BOT_AVATAR_SFX_LOOP_EDGE_TRIM_SECONDS = 0.24;
export const BOT_AVATAR_SFX_SHORT_LOOP_TRIM_RATIO = 0.12;
export const BOT_AVATAR_SFX_LOOP_CROSSFADE_SECONDS = 0.22;
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
  loopEndedListener: (() => void) | null;
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
  loopEndedListener: (() => void) | null;
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
/** Strong refs so fullscreen loaders can silence every active avatar loop. */
const botAvatarSfxActiveMedia = new Set<HTMLMediaElement>();

function trackBotAvatarSfxMedia(audio: HTMLMediaElement): void {
  botAvatarSfxActiveMedia.add(audio);
}

function untrackBotAvatarSfxMedia(audio: HTMLMediaElement): void {
  botAvatarSfxActiveMedia.delete(audio);
}

function clampBotAvatarSfxGain(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampBotAvatarSfxProgress(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 1));
}

export function botAvatarSfxLoopBounds(
  durationSeconds: number,
  options?: {
    edgeTrimSeconds?: number;
    shortLoopTrimRatio?: number;
  },
): { startTime: number; endTime: number } | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const maxEdgeTrim = Number.isFinite(options?.edgeTrimSeconds)
    ? Math.max(0, options!.edgeTrimSeconds!)
    : BOT_AVATAR_SFX_LOOP_EDGE_TRIM_SECONDS;
  const shortRatio = Number.isFinite(options?.shortLoopTrimRatio)
    ? Math.max(0, options!.shortLoopTrimRatio!)
    : BOT_AVATAR_SFX_SHORT_LOOP_TRIM_RATIO;
  const edgeTrim = Math.min(
    maxEdgeTrim,
    durationSeconds * shortRatio,
  );
  return {
    startTime: edgeTrim,
    endTime: Math.max(edgeTrim, durationSeconds - edgeTrim),
  };
}

export function botAvatarSfxPlaybackLoopBounds(
  durationSeconds: number,
): { startTime: number; endTime: number } | null {
  // Same bounds as bake pads — never cut into the audible loop body early.
  return botAvatarSfxLoopBounds(durationSeconds);
}

export function botAvatarSfxLoopRestartTime(
  currentTime: number,
  durationSeconds: number,
): number | null {
  const bounds = botAvatarSfxPlaybackLoopBounds(durationSeconds);
  if (!bounds || !Number.isFinite(currentTime)) return null;
  return currentTime < bounds.startTime || currentTime >= bounds.endTime
    ? bounds.startTime
    : null;
}

/**
 * Bake the trimmed loop boundary into a decoded buffer. This is deliberately
 * independent of the ElevenLabs `loop` prompt flag: generated audio can still
 * arrive with a hard tail, so the provider output is treated as raw material.
 * Crossfade lands on the guard-pad boundary; playback plays the full body.
 */
export function createSeamlessBotAvatarSfxLoopBuffer(
  context: BaseAudioContext,
  decoded: AudioBuffer,
  crossfadeSeconds = BOT_AVATAR_SFX_LOOP_CROSSFADE_SECONDS,
): AudioBuffer {
  const bounds = botAvatarSfxLoopBounds(decoded.duration);
  const sampleRate = decoded.sampleRate;
  const startFrame = Math.min(
    Math.max(0, decoded.length - 1),
    Math.max(0, Math.floor((bounds?.startTime ?? 0) * sampleRate)),
  );
  const endFrame = Math.min(
    decoded.length,
    Math.max(
      startFrame + 1,
      Math.floor((bounds?.endTime ?? decoded.duration) * sampleRate),
    ),
  );
  const regionFrames = Math.max(1, endFrame - startFrame);
  const desiredCrossfadeFrames = Math.max(
    0,
    Math.round(
      (Number.isFinite(crossfadeSeconds) ? crossfadeSeconds : 0) * sampleRate,
    ),
  );
  const crossfadeFrames = Math.min(
    desiredCrossfadeFrames,
    Math.floor(regionFrames / 4),
  );
  const loopFrames =
    crossfadeFrames >= 2 ? regionFrames - crossfadeFrames : regionFrames;
  const output = context.createBuffer(
    decoded.numberOfChannels,
    loopFrames,
    sampleRate,
  );

  for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
    const inputChannel = decoded.getChannelData(channel);
    const outputChannel = output.getChannelData(channel);
    if (crossfadeFrames < 2) {
      outputChannel.set(
        inputChannel.subarray(startFrame, startFrame + loopFrames),
      );
      continue;
    }
    for (let frame = 0; frame < crossfadeFrames; frame += 1) {
      const headMix = frame / (crossfadeFrames - 1);
      outputChannel[frame] =
        inputChannel[startFrame + loopFrames + frame]! * (1 - headMix) +
        inputChannel[startFrame + frame]! * headMix;
    }
    outputChannel.set(
      inputChannel.subarray(
        startFrame + crossfadeFrames,
        startFrame + loopFrames,
      ),
      crossfadeFrames,
    );
  }

  return output;
}

function writeBotAvatarSfxWaveText(
  view: DataView,
  offset: number,
  value: string,
): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function encodeBotAvatarSfxWave(buffer: AudioBuffer): ArrayBuffer {
  const channelCount = Math.max(1, buffer.numberOfChannels);
  const blockAlign = channelCount * 2;
  const dataBytes = buffer.length * blockAlign;
  const output = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(output);
  writeBotAvatarSfxWaveText(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeBotAvatarSfxWaveText(view, 8, "WAVE");
  writeBotAvatarSfxWaveText(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeBotAvatarSfxWaveText(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  const channels = Array.from({ length: channelCount }, (_, channel) =>
    buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1)),
  );
  for (let frame = 0; frame < buffer.length; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = channels[channel]?.[frame] ?? 0;
      const safeSample = Number.isFinite(sample)
        ? Math.max(-1, Math.min(1, sample))
        : 0;
      view.setInt16(
        44 + (frame * channelCount + channel) * 2,
        Math.round(safeSample * 0x7fff),
        true,
      );
    }
  }
  return output;
}

function addBotAvatarSfxLoopGuardPadding(
  context: BaseAudioContext,
  loopBuffer: AudioBuffer,
): AudioBuffer {
  const paddingFrames = Math.max(
    1,
    Math.round(BOT_AVATAR_SFX_LOOP_EDGE_TRIM_SECONDS * loopBuffer.sampleRate),
  );
  const padded = context.createBuffer(
    loopBuffer.numberOfChannels,
    loopBuffer.length + paddingFrames * 2,
    loopBuffer.sampleRate,
  );
  for (
    let channel = 0;
    channel < loopBuffer.numberOfChannels;
    channel += 1
  ) {
    padded
      .getChannelData(channel)
      .set(loopBuffer.getChannelData(channel), paddingFrames);
  }
  return padded;
}

/**
 * Normalize a newly generated loop before it enters a voice profile.
 * Unsupported decode environments return the original blob so the editor
 * still works everywhere and the playback guard can handle the source.
 */
export async function normalizeBotAvatarSfxLoopBlob(blob: Blob): Promise<Blob> {
  if (
    typeof OfflineAudioContext === "undefined" ||
    typeof blob.arrayBuffer !== "function"
  ) {
    return blob;
  }
  try {
    const context = new OfflineAudioContext(2, 1, 44_100);
    const decoded = await context.decodeAudioData(
      (await blob.arrayBuffer()).slice(0),
    );
    const loopBuffer = createSeamlessBotAvatarSfxLoopBuffer(context, decoded);
    // Keep the playback guard's edge trim meaningful: the baked loop lives
    // between silent guard pads, so playback drops the pads and lands exactly
    // on the crossfaded loop boundary.
    const paddedLoopBuffer = addBotAvatarSfxLoopGuardPadding(
      context,
      loopBuffer,
    );
    const normalized = new Blob([encodeBotAvatarSfxWave(paddedLoopBuffer)], {
      type: "audio/wav",
    });
    return normalized.size <= BOT_AVATAR_SFX_MAX_BYTES ? normalized : blob;
  } catch {
    return blob;
  }
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
      loopEndedListener: null,
    };
    botAvatarSfxSpatialEngines.set(audio, engine);
    engine.loopEndedListener = (): void => {
      if (!engine.desiredPlaying || engine.releaseTimer !== null) return;
      const restarted = updateBotAvatarSfxLoopTime(audio);
      if (restarted && audio.paused) {
        void audio.play().catch(() => undefined);
      }
    };
    audio.addEventListener("ended", engine.loopEndedListener);
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

function updateBotAvatarSfxLoopTime(audio: BotAvatarSfxAudioTarget): boolean {
  const restartTime = botAvatarSfxLoopRestartTime(
    audio.currentTime,
    audio.duration ?? Number.NaN,
  );
  if (restartTime === null) return false;
  try {
    audio.currentTime = restartTime;
    return true;
  } catch {
    // Metadata can briefly become stale while a newly selected source loads.
    return false;
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
  // Do not use native looping: it loops at the encoded file boundary, before
  // the trimmed restart boundary can be applied. The RAF guard below and the
  // `ended` listener above own the loop instead.
  audio.loop = false;
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
  trackBotAvatarSfxMedia(audio);
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
    volume: BOT_AVATAR_SFX_DEFAULT_VOLUME,
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
  if (isPrismFullscreenBlockingAudioMuted()) return false;
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
  // Non-browser test/runtime targets use the same explicit trimmed-loop
  // contract as real media elements.
  audio.loop = false;
  audio.volume = sfx.volume;
  updateBotAvatarSfxLoopTime(audio);
  if (audio.paused) void audio.play().catch(() => undefined);
  return loadedSource;
}

export function stopBotAvatarSfxAudio(
  audio: BotAvatarSfxAudioTarget,
): void {
  if (isBrowserMediaElement(audio)) {
    untrackBotAvatarSfxMedia(audio);
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

/** Silence every tracked avatar SFX loop (fullscreen bake / invent loaders). */
export function stopAllBotAvatarSfxAudio(): void {
  for (const audio of [...botAvatarSfxActiveMedia]) {
    stopBotAvatarSfxAudio(audio);
  }
}

setPrismFullscreenBlockingAudioStopHandler(stopAllBotAvatarSfxAudio);

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
    loopEndedListener: null,
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

function installBotAvatarSfxSampleLoopGuard(
  audio: HTMLMediaElement,
  runtime: BotAvatarSfxSampleRuntime,
): void {
  if (
    runtime.loopEndedListener !== null ||
    typeof audio.addEventListener !== "function"
  ) {
    return;
  }
  runtime.loopEndedListener = (): void => {
    if (!runtime.desiredPlaying) return;
    const restarted = updateBotAvatarSfxLoopTime(audio);
    if (restarted && audio.paused) {
      void audio.play().catch(() => undefined);
    }
  };
  audio.addEventListener("ended", runtime.loopEndedListener);
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
  installBotAvatarSfxSampleLoopGuard(audio, runtime);
  // Keep native looping off so the encoded file's final frames can never be
  // emitted. The shared loop guard restarts at the trimmed start boundary.
  audio.loop = false;
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
    volume: BOT_AVATAR_SFX_DEFAULT_VOLUME,
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
    await audioBlobAsDataUrl(await normalizeBotAvatarSfxLoopBlob(blob)),
  );
}
