import type {
  BotcastProducerCueDelivery,
  BotcastSpeakerRole,
  ReplayDirectionEventV2,
  ReplayThinkingDirectionPayloadV2,
} from "@localai/shared";
import { liveAvatarShouldShowThinking } from "./liveAvatarWorkPresentation.ts";

export const SIGNAL_COMPACT_THINKING_NOTICE_MIN_MS = 450;
export const SIGNAL_COMPACT_THINKING_NOTICE_MAX_MS = 1_400;

export type SignalCompactThinkingNotice = {
  participantId: string;
  sourceMessageId: string | null;
  presentationDurationMs: number;
  noticeDurationMs: number;
  label: string;
};

function signalThinkingDurationLabel(durationMs: number): string {
  if (durationMs < 1_000) return `${durationMs}ms`;
  const seconds = durationMs / 1_000;
  return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
}

/**
 * Turns a removed Signal thinking hold into a short, non-blocking provenance
 * notice. It never stretches the master timeline or replaces captured speech.
 */
export function signalCompactThinkingNoticeAt(args: {
  direction: readonly ReplayDirectionEventV2[] | null | undefined;
  atMs: number;
}): SignalCompactThinkingNotice | null {
  const atMs = Math.max(0, Number.isFinite(args.atMs) ? args.atMs : 0);
  const candidates = (args.direction ?? []).flatMap((event) => {
    if (
      event.kind !== "thinking" ||
      event.payload.timelineCompacted !== true ||
      event.payload.active === false
    ) {
      return [];
    }
    const participantId =
      typeof event.payload.participantId === "string"
        ? event.payload.participantId.trim()
        : "";
    const presentationDurationMs = Math.max(
      1,
      Math.round(Number(event.payload.presentationDurationMs) || 0),
    );
    if (!participantId || presentationDurationMs <= 1) return [];
    const noticeDurationMs = Math.min(
      SIGNAL_COMPACT_THINKING_NOTICE_MAX_MS,
      Math.max(
        SIGNAL_COMPACT_THINKING_NOTICE_MIN_MS,
        Math.round(presentationDurationMs * 0.12),
      ),
    );
    if (atMs < event.atMs || atMs >= event.atMs + noticeDurationMs) return [];
    const interrupted = event.payload.endReason === "interrupted";
    return [{
      event,
      notice: {
        participantId,
        sourceMessageId: event.sourceMessageId ?? null,
        presentationDurationMs,
        noticeDurationMs,
        label: `Thought for ${signalThinkingDurationLabel(presentationDurationMs)}${interrupted ? " before interruption" : ""} · condensed`,
      } satisfies SignalCompactThinkingNotice,
    }];
  });
  return candidates.sort((left, right) =>
    right.event.atMs - left.event.atMs ||
    right.event.sequence - left.event.sequence
  )[0]?.notice ?? null;
}

export function signalGenerationThinkingRole(args: {
  scheduledSpeakerRole: BotcastSpeakerRole | null;
  cueDelivery: BotcastProducerCueDelivery;
  hasProducerCue: boolean;
}): BotcastSpeakerRole | null {
  if (
    args.hasProducerCue &&
    (args.cueDelivery === "interrupt_guest" ||
      args.cueDelivery === "redirect_host")
  ) {
    return "host";
  }
  return args.scheduledSpeakerRole;
}

/** Mirrors the thinking state that is actually committed on the live stage. */
export function signalPresentedThinkingRole(args: {
  episodeLive: boolean;
  producerGuestThinking: boolean;
  producerGuestSipActive: boolean;
  generationBusy: boolean;
  voicePreparationPending: boolean;
  hasPreparedMessage: boolean;
  hasSpeakingMessage: boolean;
  nextSpeakerRole: BotcastSpeakerRole | null;
  generationThinkingRole: BotcastSpeakerRole | null;
  generationThinkingRunMatches: boolean;
}): BotcastSpeakerRole | null {
  if (!args.episodeLive) return null;
  if (args.producerGuestThinking) {
    return args.producerGuestSipActive ? null : "guest";
  }
  // A prepared message can lead its React speech state by one commit. `busy`
  // also remains true through voice preparation. Neither handoff belongs to
  // the next scheduled speaker's thinking interval.
  if (
    args.hasPreparedMessage ||
    args.voicePreparationPending ||
    !args.generationBusy ||
    args.hasSpeakingMessage
  ) {
    return null;
  }
  if (args.producerGuestSipActive && args.nextSpeakerRole === "guest") {
    return null;
  }
  return args.generationThinkingRunMatches
    ? args.generationThinkingRole
    : args.nextSpeakerRole;
}

/** Keeps a completed thinking interval linked through React's prepared-state handoff. */
export function signalThinkingFollowingMessageId(args: {
  liveSpeechMessageId: string | null;
  speakingMessageId: string | null;
  preparedMessageId: string | null;
}): string | null {
  return (
    args.liveSpeechMessageId?.trim() ||
    args.speakingMessageId?.trim() ||
    args.preparedMessageId?.trim() ||
    null
  );
}

/**
 * The role the *stage* should show as thinking, which is not the same thing as
 * the role written into the replay direction log.
 *
 * `signalPresentedThinkingRole` stays bound to model generation on purpose: a
 * compacted audio wait must never become a second recorded thinking interval.
 * But the audience does not care which subsystem is busy. Review 2fcad998 sat
 * through 188s of foreground holds inside a 254s episode — a single one of them
 * 46s long — and the producer typed "Pausing to think is fine, but we need to
 * show the thinking animation while producing."
 *
 * Voice preparation was the blank half. The camera already held a waiting shot
 * through it (`liveAutoWaitingForPresence`), so the stage framed a bot that was
 * visibly doing nothing. Producing audio is producing; show it.
 */
export function signalStageThinkingRole(args: {
  presentedThinkingRole: BotcastSpeakerRole | null;
  voicePreparationPending: boolean;
  voicePreparationRole: BotcastSpeakerRole | null;
}): BotcastSpeakerRole | null {
  const role =
    args.presentedThinkingRole ??
    (args.voicePreparationPending ? args.voicePreparationRole : null);
  if (role === null) return null;
  return liveAvatarShouldShowThinking({
    generating: args.presentedThinkingRole !== null,
    synthesizing:
      args.voicePreparationPending && args.voicePreparationRole !== null,
    speaking: false,
    playbackRecording: false,
  })
    ? role
    : null;
}

export function signalThinkingPresentationEndReason(args: {
  cuttingShow: boolean;
  hasError: boolean;
  hasFollowingMessage: boolean;
  episodeLive: boolean;
}): ReplayThinkingDirectionPayloadV2["endReason"] {
  if (args.cuttingShow) return "interrupted";
  if (args.hasError) return "failed";
  if (args.hasFollowingMessage || args.episodeLive) return "completed";
  return "cancelled";
}
