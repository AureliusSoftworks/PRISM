import type {
  BotMoodKey,
  ZenLiveActionMoodHint,
  ZenLiveActionReactionResponse,
} from "@localai/shared";

export type ZenLiveBotActionState = {
  action: string;
  moodHint: ZenLiveActionMoodHint;
  responseKind: "show_action" | "interrupt_candidate" | "idle";
  confidence: number;
  botId: string | null;
  clientSequenceId: string;
  source: "draft_action" | "idle";
  createdAtMs: number;
  interruptReason?: string;
};

export function zenLiveActionMoodToBotMood(
  moodHint: ZenLiveActionMoodHint | undefined
): BotMoodKey {
  switch (moodHint) {
    case "amused":
      return "joyful";
    case "warm":
    case "attentive":
      return "warm";
    case "stern":
      return "guarded";
    case "confused":
    case "waiting":
      return "neutral";
    case "neutral":
    default:
      return "neutral";
  }
}

export function zenLiveActionPlateFace(moodHint: ZenLiveActionMoodHint | undefined): {
  text: string;
  rotateDeg: number;
} {
  switch (moodHint) {
    case "amused":
      return { text: ":)", rotateDeg: 90 };
    case "warm":
      return { text: ":]", rotateDeg: 90 };
    case "confused":
      return { text: ":?", rotateDeg: 90 };
    case "stern":
      return { text: ":[", rotateDeg: 90 };
    case "waiting":
      return { text: ":|", rotateDeg: 90 };
    case "attentive":
      return { text: ":o", rotateDeg: 90 };
    case "neutral":
    default:
      return { text: ":|", rotateDeg: 90 };
  }
}

export function responseIsStaleZenLiveAction(
  response: Pick<ZenLiveActionReactionResponse, "clientSequenceId" | "botId">,
  expectedSequenceId: string,
  activeBotId: string | null
): boolean {
  return (
    response.clientSequenceId !== expectedSequenceId ||
    (response.botId ?? null) !== activeBotId
  );
}

export function normalizeZenLiveBotActionState(
  response: ZenLiveActionReactionResponse,
  source: "draft_action" | "idle",
  createdAtMs: number
): ZenLiveBotActionState | null {
  const action = response.botAction?.replace(/\s+/g, " ").trim();
  if (!action || response.kind === "silent") return null;
  return {
    action,
    moodHint: response.moodHint,
    responseKind: response.kind,
    confidence: response.confidence,
    botId: response.botId ?? null,
    clientSequenceId: response.clientSequenceId,
    source,
    createdAtMs,
    ...(response.interruptReason ? { interruptReason: response.interruptReason } : {}),
  };
}
