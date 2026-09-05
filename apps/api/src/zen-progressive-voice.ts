import { randomId } from "./security.ts";
import type { ProviderName } from "./providers.ts";
import type { BotMoodKey } from "@localai/shared";

const ZEN_PROGRESSIVE_VOICE_SEGMENT_TTL_MS = 5 * 60_000;
const ZEN_PROGRESSIVE_VOICE_SEGMENT_LIMIT = 512;

export interface ZenProgressiveVoiceSegment {
  id: string;
  userId: string;
  text: string;
  provider: ProviderName;
  botId: string | null;
  moodKey: BotMoodKey;
  createdAtMs: number;
}

const segments = new Map<string, ZenProgressiveVoiceSegment>();

function pruneZenProgressiveVoiceSegments(nowMs: number): void {
  for (const [id, segment] of segments) {
    if (nowMs - segment.createdAtMs > ZEN_PROGRESSIVE_VOICE_SEGMENT_TTL_MS) {
      segments.delete(id);
    }
  }
  while (segments.size >= ZEN_PROGRESSIVE_VOICE_SEGMENT_LIMIT) {
    const oldestId = segments.keys().next().value as string | undefined;
    if (!oldestId) break;
    segments.delete(oldestId);
  }
}

export function registerZenProgressiveVoiceSegment(args: {
  userId: string;
  text: string;
  provider: ProviderName;
  botId: string | null;
  moodKey: BotMoodKey;
  nowMs?: number;
}): ZenProgressiveVoiceSegment {
  const nowMs = args.nowMs ?? Date.now();
  pruneZenProgressiveVoiceSegments(nowMs);
  const segment: ZenProgressiveVoiceSegment = {
    id: `zen-voice-${randomId(18)}`,
    userId: args.userId,
    text: args.text,
    provider: args.provider,
    botId: args.botId,
    moodKey: args.moodKey,
    createdAtMs: nowMs,
  };
  segments.set(segment.id, segment);
  return segment;
}

export function readZenProgressiveVoiceSegment(
  userId: string,
  id: unknown,
  nowMs = Date.now(),
): ZenProgressiveVoiceSegment | null {
  if (typeof id !== "string" || !id.trim()) return null;
  const segment = segments.get(id.trim());
  if (!segment || segment.userId !== userId) return null;
  if (nowMs - segment.createdAtMs > ZEN_PROGRESSIVE_VOICE_SEGMENT_TTL_MS) {
    segments.delete(segment.id);
    return null;
  }
  return segment;
}

export function clearZenProgressiveVoiceSegmentsForTests(): void {
  segments.clear();
}

