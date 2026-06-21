export const ZEN_PERSONA_DEFAULT_INK_COLOR = "transparent";

export interface ZenPersonaInkMessage {
  id: string;
  role: "user" | "assistant";
  botId?: string | null;
  botColor?: string | null;
}

export interface ZenPersonaInkSegment {
  messageId: string;
  botId: string | null;
  color: string;
  variant: "persona" | "default";
}

export function buildZenPersonaInkSegments(
  messages: readonly ZenPersonaInkMessage[]
): ZenPersonaInkSegment[] {
  return messages
    .filter((message) => message.role === "assistant")
    .map((message) => {
      const botId = message.botId?.trim() || null;
      const color = message.botColor?.trim() || ZEN_PERSONA_DEFAULT_INK_COLOR;
      return {
        messageId: message.id,
        botId,
        color,
        variant: botId ? "persona" : "default",
      };
    });
}

export function buildZenPersonaInkSegmentMap(
  messages: readonly ZenPersonaInkMessage[]
): ReadonlyMap<string, ZenPersonaInkSegment> {
  return new Map(
    buildZenPersonaInkSegments(messages).map((segment) => [
      segment.messageId,
      segment,
    ])
  );
}
