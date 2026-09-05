import type {
  BotcastMessage,
  BotcastReplayEvent,
  BotcastSpeakerRole,
} from "./botcast.js";

export const SIGNAL_PICKLES_MAGIC_WORD = "PICKLES";
export const SIGNAL_PICKLES_SLOW_SIP_DURATION_MS = 5_200;

export interface SignalPicklesSipCue {
  role: BotcastSpeakerRole;
  messageId: string;
  atMs: number;
  durationMs: number;
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function signalPicklesMagicEnabled(producerBrief: string): boolean {
  return /\bPICKLES\b/iu.test(producerBrief);
}

export function signalProducerBriefWithoutPickles(
  producerBrief: string,
): string {
  return producerBrief
    .replace(/\bPICKLES\b(?:\s*[,;:]\s*)?/giu, " ")
    .replace(/\s+([,.;:!?])/gu, "$1")
    .replace(/(?:^|\s)[,;:](?=\s|$)/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function signalPicklesTriggerMessageCount(episodeId: string): number {
  return 3 + (stableHash(`signal-pickles-trigger:${episodeId}`) % 4);
}

export function signalPicklesLineIndex(
  episodeId: string,
  kind: "interjection" | "reaction",
  count: number,
): number {
  if (count <= 1) return 0;
  return stableHash(`signal-pickles-${kind}:${episodeId}`) % count;
}

export function signalPicklesSipCueFromEvent(
  event: Pick<BotcastReplayEvent, "kind" | "payload">,
): SignalPicklesSipCue | null {
  if (
    event.kind !== "audio_cue" ||
    event.payload.kind !== "coffee_sip" ||
    event.payload.source !== "pickles"
  ) {
    return null;
  }
  const role = event.payload.role;
  const messageId = event.payload.messageId;
  const atMs = Number(event.payload.atMs);
  const durationMs = Number(event.payload.durationMs);
  if (
    (role !== "host" && role !== "guest") ||
    typeof messageId !== "string" ||
    !messageId.trim() ||
    !Number.isFinite(atMs) ||
    atMs < 0 ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    return null;
  }
  return {
    role,
    messageId: messageId.trim(),
    atMs: Math.round(atMs),
    durationMs: Math.round(durationMs),
  };
}

export function signalPicklesSipCueForMessage(
  events: readonly BotcastReplayEvent[],
  messageId: string,
): SignalPicklesSipCue | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const cue = signalPicklesSipCueFromEvent(events[index]!);
    if (cue?.messageId === messageId) return cue;
  }
  return null;
}

export function signalPicklesSipAt(
  events: readonly BotcastReplayEvent[],
  elapsedMs: number,
): SignalPicklesSipCue | null {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return null;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const cue = signalPicklesSipCueFromEvent(events[index]!);
    if (
      cue &&
      elapsedMs >= cue.atMs &&
      elapsedMs < cue.atMs + cue.durationMs
    ) {
      return cue;
    }
  }
  return null;
}

export function signalPicklesReactionPending(args: {
  events: readonly BotcastReplayEvent[];
  messages: readonly BotcastMessage[];
}): SignalPicklesSipCue | null {
  let cue: SignalPicklesSipCue | null = null;
  for (let index = args.events.length - 1; index >= 0; index -= 1) {
    cue = signalPicklesSipCueFromEvent(args.events[index]!);
    if (cue) break;
  }
  if (!cue) return null;
  const sipMessageIndex = args.messages.findIndex(
    (message) => message.id === cue.messageId,
  );
  if (sipMessageIndex < 0 || sipMessageIndex !== args.messages.length - 1) {
    return null;
  }
  return cue;
}
