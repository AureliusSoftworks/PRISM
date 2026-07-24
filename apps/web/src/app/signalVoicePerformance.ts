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

type SignalPerformanceMessage = Pick<
  BotcastMessage,
  "content" | "voicePerformanceText"
> &
  Partial<Pick<BotcastMessage, "stageActionText">>;

/**
 * Turns saved Eleven v3 audio directions into viewer-facing stage actions
 * without changing the canonical spoken text.
 */
export function signalVoicePerformancePresentation(
  message: SignalPerformanceMessage,
): SignalVoicePerformancePresentation | null {
  const content = message.content.replace(/\s+/gu, " ").trim();
  const stageAction = message.stageActionText?.replace(/\s+/gu, " ").trim();
  if (stageAction) {
    return {
      actions: [stageAction],
      leadingActions: [stageAction],
      trailingActions: [],
      transcriptText: content,
    };
  }
  const taggedText = message.voicePerformanceText?.replace(/\s+/gu, " ").trim();
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
  message: SignalPerformanceMessage,
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

export type SignalVoicePerformanceActionPresentation = {
  action: string;
  opacity: number;
  phase: "entering" | "holding" | "exiting";
};

/**
 * Keeps each saved action mounted for its whole share of the utterance while
 * the real speech clock eases it in, holds it, and fades it fully away.
 */
export function signalVoicePerformanceActionPresentationAtProgress(
  message: SignalPerformanceMessage,
  progress: number,
): SignalVoicePerformanceActionPresentation | null {
  const presentation = signalVoicePerformancePresentation(message);
  if (!presentation) return null;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const scaledProgress = clampedProgress * presentation.actions.length;
  const index = Math.min(
    presentation.actions.length - 1,
    Math.floor(scaledProgress),
  );
  const localProgress =
    clampedProgress === 1 ? 1 : Math.max(0, scaledProgress - index);
  const enteringUntil = 0.14;
  const exitingFrom = 0.72;
  const phase =
    localProgress < enteringUntil
      ? "entering"
      : localProgress > exitingFrom
        ? "exiting"
        : "holding";
  const opacity =
    phase === "entering"
      ? localProgress / enteringUntil
      : phase === "exiting"
        ? (1 - localProgress) / (1 - exitingFrom)
        : 1;
  return {
    action: presentation.actions[index]!,
    opacity: Number(Math.max(0, Math.min(1, opacity)).toFixed(3)),
    phase,
  };
}

export function signalVoicePerformanceTranscriptText(
  message: SignalPerformanceMessage,
): string {
  return signalVoicePerformancePresentation(message)?.transcriptText ?? message.content;
}
