import type { ZenLiveBotMouthShape } from "./zenLiveMouth";

export interface BotHubVoicePreviewMouthSnapshot {
  botId: string | null;
  talking: boolean;
  mouthShape: ZenLiveBotMouthShape;
}

const IDLE_BOT_HUB_VOICE_PREVIEW_MOUTH: BotHubVoicePreviewMouthSnapshot = {
  botId: null,
  talking: false,
  mouthShape: "closed",
};

let currentSnapshot = IDLE_BOT_HUB_VOICE_PREVIEW_MOUTH;
const listeners = new Set<() => void>();

export function botHubVoicePreviewMouthSnapshot(): BotHubVoicePreviewMouthSnapshot {
  return currentSnapshot;
}

export function botHubVoicePreviewMouthServerSnapshot(): BotHubVoicePreviewMouthSnapshot {
  return IDLE_BOT_HUB_VOICE_PREVIEW_MOUTH;
}

export function subscribeBotHubVoicePreviewMouth(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Publishes only semantic mouth changes. The audio clock may call this every
 * animation frame, but unchanged visemes never schedule a React render.
 */
export function publishBotHubVoicePreviewMouth(
  next: BotHubVoicePreviewMouthSnapshot,
): boolean {
  const normalized: BotHubVoicePreviewMouthSnapshot = next.talking
    ? next
    : {
        botId: next.botId,
        talking: false,
        mouthShape: "closed",
      };
  if (
    currentSnapshot.botId === normalized.botId &&
    currentSnapshot.talking === normalized.talking &&
    currentSnapshot.mouthShape === normalized.mouthShape
  ) {
    return false;
  }
  currentSnapshot = normalized;
  for (const listener of listeners) listener();
  return true;
}

export function resetBotHubVoicePreviewMouth(): void {
  if (currentSnapshot === IDLE_BOT_HUB_VOICE_PREVIEW_MOUTH) return;
  currentSnapshot = IDLE_BOT_HUB_VOICE_PREVIEW_MOUTH;
  for (const listener of listeners) listener();
}

export function resetBotHubVoicePreviewMouthForTests(): void {
  currentSnapshot = IDLE_BOT_HUB_VOICE_PREVIEW_MOUTH;
  listeners.clear();
}
