import type { BotAvatarSfxV1 } from "@localai/shared";

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
