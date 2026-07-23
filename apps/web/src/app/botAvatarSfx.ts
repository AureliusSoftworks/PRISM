import {
  normalizeBotAudioVoiceProfileV1,
  normalizeBotAvatarSfxV1,
  type BotAudioVoiceProfileV1,
  type BotAvatarSfxV1,
  type NormalizedBotAudioVoiceProfileV1,
} from "@localai/shared";
import { prismAudioOutputNode } from "./signalAudioMasterCapture.ts";

export const GENERATED_BOT_THINKING_SFX_PROMPT = "Computer calculating";
export const PRISM_BOT_THINKING_SFX_FALLBACK_URLS = [
  "/audio/avatar/prism-calculating-01.mp3",
  "/audio/avatar/prism-calculating-02.mp3",
  "/audio/avatar/prism-calculating-03.mp3",
  "/audio/avatar/prism-calculating-04.mp3",
] as const;

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
};

let botAvatarSfxAudioContext: AudioContext | null = null;
const botAvatarSfxSpatialEngines = new WeakMap<
  HTMLMediaElement,
  BotAvatarSfxSpatialEngine
>();

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
  if (
    typeof window === "undefined" ||
    typeof window.AudioContext !== "function"
  ) {
    return null;
  }
  if (!botAvatarSfxAudioContext || botAvatarSfxAudioContext.state === "closed") {
    botAvatarSfxAudioContext = new window.AudioContext({
      latencyHint: "interactive",
    });
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

function startBotAvatarSfxSpatialTracking(
  engine: BotAvatarSfxSpatialEngine,
): void {
  if (engine.animationFrame !== null) return;
  const tick = (): void => {
    updateBotAvatarSfxSpatialPan(engine);
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
  if (!botAvatarSfxShouldPlay(sfx, state) || !sfx) {
    audio.pause();
    audio.currentTime = 0;
    releaseBotAvatarSfxSpatialEngine(audio);
    return loadedSource;
  }
  if (loadedSource !== sfx.audioDataUrl) {
    audio.pause();
    audio.src = sfx.audioDataUrl;
    audio.load();
    loadedSource = sfx.audioDataUrl;
  }
  audio.loop = true;
  const spatialEngine = isBrowserMediaElement(audio)
    ? botAvatarSfxSpatialEngineFor(audio)
    : null;
  if (isBrowserMediaElement(audio) && !spatialEngine) {
    audio.pause();
    audio.currentTime = 0;
    return loadedSource;
  }
  if (spatialEngine) {
    audio.volume = 1;
    spatialEngine.output.gain.value = sfx.volume;
    startBotAvatarSfxSpatialTracking(spatialEngine);
    if (spatialEngine.context.state === "suspended") {
      void spatialEngine.context.resume().catch(() => undefined);
    }
  } else {
    audio.volume = sfx.volume;
  }
  if (audio.paused) void audio.play().catch(() => undefined);
  return loadedSource;
}

export function stopBotAvatarSfxAudio(
  audio: BotAvatarSfxAudioTarget,
): void {
  audio.pause();
  audio.currentTime = 0;
  releaseBotAvatarSfxSpatialEngine(audio);
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
