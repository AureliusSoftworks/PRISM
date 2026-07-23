import {
  normalizeBotAudioVoiceProfileV1,
  normalizeBotAvatarSfxV1,
  type BotAudioVoiceProfileV1,
  type BotAvatarSfxV1,
  type NormalizedBotAudioVoiceProfileV1,
} from "@localai/shared";

export const GENERATED_BOT_THINKING_SFX_PROMPT = "Computer calculating";

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
  if (audio.paused) void audio.play().catch(() => undefined);
  return loadedSource;
}

export function stopBotAvatarSfxAudio(
  audio: BotAvatarSfxAudioTarget,
): void {
  audio.pause();
  audio.currentTime = 0;
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
