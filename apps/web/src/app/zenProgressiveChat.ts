export interface ZenProgressiveSegmentEvent {
  type: "segment";
  conversationId: string;
  assistantMessageId: string;
  voiceSegmentId: string;
  segmentIndex: number;
  text: string;
  provider: "local" | "openai" | "anthropic";
  model: string;
  botId: string | null;
  moodKey: "joyful" | "warm" | "neutral" | "guarded" | "strained";
  createdAt: string;
  finalSegment: boolean;
}

export interface ZenProgressiveEndEvent {
  type: "progressive_end";
  conversationId: string;
  assistantMessageId: string;
  deliveredSegments: number;
  interrupted: boolean;
}

export interface ZenProgressiveCompleteEvent<T> {
  type: "complete";
  envelope: T;
}

export interface ZenProgressiveErrorEvent {
  type: "error";
  error: string;
  code?: string;
}

export type ZenProgressiveChatEvent<T> =
  | ZenProgressiveSegmentEvent
  | ZenProgressiveEndEvent
  | ZenProgressiveCompleteEvent<T>
  | ZenProgressiveErrorEvent;

export function parseZenProgressiveChatEvent<T>(
  line: string,
): ZenProgressiveChatEvent<T> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  if (record.type === "complete" && record.envelope) {
    return {
      type: "complete",
      envelope: record.envelope as T,
    };
  }
  if (record.type === "error" && typeof record.error === "string") {
    return {
      type: "error",
      error: record.error,
      ...(typeof record.code === "string" ? { code: record.code } : {}),
    };
  }
  if (
    record.type === "progressive_end" &&
    typeof record.conversationId === "string" &&
    typeof record.assistantMessageId === "string" &&
    typeof record.deliveredSegments === "number"
  ) {
    return {
      type: "progressive_end",
      conversationId: record.conversationId,
      assistantMessageId: record.assistantMessageId,
      deliveredSegments: record.deliveredSegments,
      interrupted: record.interrupted === true,
    };
  }
  if (
    record.type !== "segment" ||
    typeof record.conversationId !== "string" ||
    typeof record.assistantMessageId !== "string" ||
    typeof record.voiceSegmentId !== "string" ||
    typeof record.segmentIndex !== "number" ||
    typeof record.text !== "string" ||
    (record.provider !== "local" &&
      record.provider !== "openai" &&
      record.provider !== "anthropic") ||
    typeof record.model !== "string" ||
    typeof record.createdAt !== "string" ||
    (record.moodKey !== "joyful" &&
      record.moodKey !== "warm" &&
      record.moodKey !== "neutral" &&
      record.moodKey !== "guarded" &&
      record.moodKey !== "strained")
  ) {
    return null;
  }
  return {
    type: "segment",
    conversationId: record.conversationId,
    assistantMessageId: record.assistantMessageId,
    voiceSegmentId: record.voiceSegmentId,
    segmentIndex: Math.max(0, Math.round(record.segmentIndex)),
    text: record.text,
    provider: record.provider,
    model: record.model,
    botId: typeof record.botId === "string" ? record.botId : null,
    moodKey: record.moodKey,
    createdAt: record.createdAt,
    finalSegment: record.finalSegment === true,
  };
}

export async function readZenProgressiveChatStream<T>(args: {
  response: Response;
  onSegment: (event: ZenProgressiveSegmentEvent) => void;
  onEnd?: (event: ZenProgressiveEndEvent) => void;
}): Promise<T> {
  const reader = args.response.body?.getReader();
  if (!reader) throw new Error("Progressive Zen response body is unavailable.");
  const decoder = new TextDecoder();
  let buffer = "";
  let envelope: T | null = null;

  const consumeLine = (line: string): void => {
    if (!line.trim()) return;
    const event = parseZenProgressiveChatEvent<T>(line);
    if (!event) throw new Error("Progressive Zen response was malformed.");
    if (event.type === "segment") {
      args.onSegment(event);
    } else if (event.type === "progressive_end") {
      args.onEnd?.(event);
    } else if (event.type === "complete") {
      envelope = event.envelope;
    } else {
      throw new Error(event.error);
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex >= 0) {
      consumeLine(buffer.slice(0, newlineIndex));
      buffer = buffer.slice(newlineIndex + 1);
      newlineIndex = buffer.indexOf("\n");
    }
    if (done) break;
  }
  consumeLine(buffer);
  if (envelope === null) {
    throw new Error("Progressive Zen response ended before completion.");
  }
  return envelope;
}

