import {
  BOTCAST_IMMERSIVE_VOICE_TAGS,
  type BotcastMessage,
} from "@localai/shared";

const SIGNAL_VOICE_TAG_PATTERN = /\[([^\]\n]{1,48})\]/giu;

export interface SignalVoicePerformancePresentation {
  actions: string[];
  leadingActions: string[];
  trailingActions: string[];
  transcriptText: string;
}

/**
 * Turns saved Eleven v3 audio directions into viewer-facing stage actions
 * without changing the canonical spoken text.
 */
export function signalVoicePerformancePresentation(
  message: Pick<BotcastMessage, "content" | "voicePerformanceText">,
): SignalVoicePerformancePresentation | null {
  const taggedText = message.voicePerformanceText?.replace(/\s+/gu, " ").trim();
  const content = message.content.replace(/\s+/gu, " ").trim();
  if (!taggedText || !content) return null;

  const allowed = new Set<string>(BOTCAST_IMMERSIVE_VOICE_TAGS);
  const matches = [...taggedText.matchAll(SIGNAL_VOICE_TAG_PATTERN)].filter(
    (match) => allowed.has((match[1] ?? "").trim().toLowerCase()),
  );
  if (matches.length === 0) return null;

  const spokenText = taggedText
    .replace(SIGNAL_VOICE_TAG_PATTERN, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (spokenText !== content) return null;

  const leadingActions: string[] = [];
  const trailingActions: string[] = [];
  for (const match of matches) {
    const action = (match[1] ?? "").trim().toLowerCase();
    const before = taggedText
      .slice(0, match.index ?? 0)
      .replace(SIGNAL_VOICE_TAG_PATTERN, " ")
      .trim();
    if (!before) leadingActions.push(action);
    else trailingActions.push(action);
  }
  const actions = [...leadingActions, ...trailingActions];
  return {
    actions,
    leadingActions,
    trailingActions,
    transcriptText: [
      leadingActions.map((action) => `*${action}*`).join(" "),
      content,
      trailingActions.map((action) => `*${action}*`).join(" "),
    ].filter(Boolean).join(" "),
  };
}

export function signalVoicePerformanceActionAtProgress(
  message: Pick<BotcastMessage, "content" | "voicePerformanceText">,
  progress: number,
): string | null {
  const presentation = signalVoicePerformancePresentation(message);
  if (!presentation) return null;
  if (presentation.actions.length === 1) return presentation.actions[0] ?? null;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const index = Math.min(
    presentation.actions.length - 1,
    Math.floor(clampedProgress * presentation.actions.length),
  );
  return presentation.actions[index] ?? null;
}

export function signalVoicePerformanceTranscriptText(
  message: Pick<BotcastMessage, "content" | "voicePerformanceText">,
): string {
  return signalVoicePerformancePresentation(message)?.transcriptText ?? message.content;
}
