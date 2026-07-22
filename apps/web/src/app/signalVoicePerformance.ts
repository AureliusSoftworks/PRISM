import {
  type BotcastMessage,
} from "@localai/shared";
import {
  extractStageDirectionCues,
  extractStageDirections,
  getBotMentionDisplayLength,
} from "./botMention.ts";

const SIGNAL_VOICE_TAG_PATTERN =
  /(?<![\\[])\[([^\[\]\n]{1,48})\](?!\])(?!\s*\()/giu;

export interface SignalVoicePerformancePresentation {
  actions: string[];
  leadingActions: string[];
  trailingActions: string[];
  cues: SignalVoicePerformanceCue[];
  transcriptText: string;
}

export interface SignalVoicePerformanceCue {
  action: string;
  revealAtProgress: number;
}

type SignalPerformanceMessage = Pick<
  BotcastMessage,
  "content" | "voicePerformanceText"
> &
  Partial<Pick<BotcastMessage, "stageActionText">>;

function normalizeSignalTranscriptText(value: string): string {
  return extractStageDirections(value).mainText.replace(/\s+/gu, " ").trim();
}

function signalCueProgress(displayLength: number, transcriptLength: number): number {
  if (transcriptLength <= 0) return 0;
  return Math.max(0, Math.min(1, displayLength / transcriptLength));
}

/**
 * Turns saved Eleven v3 audio directions into viewer-facing stage actions
 * without changing the canonical spoken text.
 */
export function signalVoicePerformancePresentation(
  message: SignalPerformanceMessage,
): SignalVoicePerformancePresentation | null {
  const content = normalizeSignalTranscriptText(message.content);
  const stageAction = message.stageActionText?.replace(/\s+/gu, " ").trim();
  if (stageAction) {
    return {
      actions: [stageAction],
      leadingActions: [stageAction],
      trailingActions: [],
      cues: [{ action: stageAction, revealAtProgress: 0 }],
      transcriptText: content,
    };
  }
  const taggedText = message.voicePerformanceText?.replace(/\s+/gu, " ").trim();
  const transcriptLength = getBotMentionDisplayLength(content);
  const authoredCues: SignalVoicePerformanceCue[] = extractStageDirectionCues(
    message.content,
  ).map((cue) => ({
    action: cue.action.replace(/\s+/gu, " ").trim(),
    revealAtProgress: signalCueProgress(
      cue.revealAtDisplayLength,
      transcriptLength,
    ),
  }));
  const matches = taggedText
    ? [...taggedText.matchAll(SIGNAL_VOICE_TAG_PATTERN)]
    : [];
  const taggedTranscript = taggedText
    ? normalizeSignalTranscriptText(
        taggedText.replace(SIGNAL_VOICE_TAG_PATTERN, " "),
      )
    : "";
  const performanceCues: SignalVoicePerformanceCue[] =
    taggedText && taggedTranscript === content
      ? matches.map((match) => {
          const action = (match[1] ?? "").trim().toLowerCase();
          const before = normalizeSignalTranscriptText(
            taggedText
              .slice(0, match.index ?? 0)
              .replace(SIGNAL_VOICE_TAG_PATTERN, " "),
          );
          return {
            action,
            revealAtProgress: signalCueProgress(
              getBotMentionDisplayLength(before),
              transcriptLength,
            ),
          };
        })
      : [];
  const cues = [
    ...authoredCues,
    ...performanceCues.filter(
      (candidate) =>
        !authoredCues.some(
          (authored) =>
            Math.abs(
              authored.revealAtProgress - candidate.revealAtProgress,
            ) < 0.0001,
        ),
    ),
  ].sort((left, right) => left.revealAtProgress - right.revealAtProgress);
  if (cues.length === 0) return null;
  const actions = cues.map((cue) => cue.action);
  const leadingActions = cues
    .filter((cue) => cue.revealAtProgress <= 0)
    .map((cue) => cue.action);
  const trailingActions = cues
    .filter((cue) => cue.revealAtProgress >= 1)
    .map((cue) => cue.action);
  return {
    actions,
    leadingActions,
    trailingActions,
    cues,
    transcriptText: content,
  };
}

function signalVoicePerformanceCueAtProgress(
  presentation: SignalVoicePerformancePresentation,
  progress: number,
): SignalVoicePerformanceCue | null {
  const clampedProgress = Math.max(0, Math.min(1, progress));
  let current: SignalVoicePerformanceCue | null = null;
  for (const cue of presentation.cues) {
    if (cue.revealAtProgress > clampedProgress) break;
    current = cue;
  }
  return current;
}

export function signalVoicePerformanceActionAtProgress(
  message: SignalPerformanceMessage,
  progress: number,
): string | null {
  const presentation = signalVoicePerformancePresentation(message);
  if (!presentation) return null;
  return signalVoicePerformanceCueAtProgress(presentation, progress)?.action ?? null;
}

export type SignalVoicePerformanceActionPresentation = {
  action: string;
  opacity: number;
  phase: "entering" | "holding" | "exiting";
};

/**
 * Keeps the latest reached action mounted until another authored cue replaces
 * it. The caller supplies transcript reveal progress, so actions change at the
 * same point the cleaned dialogue reaches them.
 */
export function signalVoicePerformanceActionPresentationAtProgress(
  message: SignalPerformanceMessage,
  progress: number,
): SignalVoicePerformanceActionPresentation | null {
  const presentation = signalVoicePerformancePresentation(message);
  if (!presentation) return null;
  const cue = signalVoicePerformanceCueAtProgress(presentation, progress);
  if (!cue) return null;
  return {
    action: cue.action,
    opacity: 1,
    phase: "holding",
  };
}

export function signalVoicePerformanceTranscriptText(
  message: SignalPerformanceMessage,
): string {
  return extractStageDirectionCues(message.content).length > 0
    ? normalizeSignalTranscriptText(message.content)
    : message.content;
}
