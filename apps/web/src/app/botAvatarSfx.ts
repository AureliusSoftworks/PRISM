import type { BotAvatarSfxV1 } from "@localai/shared";

export type BotAvatarSfxState = "idle" | "blink" | "talking" | "thinking";

export function botAvatarSfxShouldPlay(
  sfx: BotAvatarSfxV1 | null | undefined,
  state: BotAvatarSfxState,
): boolean {
  if (!sfx?.audioDataUrl || sfx.volume <= 0) return false;
  if (state === "talking") return sfx.playWhileTalking;
  if (state === "thinking") return sfx.playWhileThinking;
  return sfx.playWhileIdle;
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
