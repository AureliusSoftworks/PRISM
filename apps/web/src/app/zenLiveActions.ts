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

const TRAILING_SPEECH_BRIDGE_RE =
  /(?:[,:;]?\s*(?:and\s+)?(?:says?|saying|asks?|asking|replies?|replying|responds?|responding|tells?|telling|whispers?|whispering|murmurs?|murmuring|adds?|adding|speaks?|speaking|sings?|singing|croons?|crooning)\b\s*(?:softly|warmly|quietly|gently|candidly|brightly|kindly|slowly|under\s+.*)?[.!?\u2026;:,]*)+$/iu;
const ZEN_LIVE_ACTION_ANGRY_BRACKET_GLYPH = "\u02d0[";

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

export type ZenLiveActionMouthShape =
  | "open-wide"
  | "closed"
  | "open-small"
  | "open-round";

export type ZenLiveBotCanvasSide = "left" | "right";

export function zenLiveBotCanvasSideFromCenterX(
  centerX: number,
  viewportWidth: number
): ZenLiveBotCanvasSide {
  if (!Number.isFinite(centerX) || !Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return "left";
  }
  return centerX < viewportWidth / 2 ? "left" : "right";
}

export function zenLiveBotFaceScaleYForCanvasSide(
  side: ZenLiveBotCanvasSide
): string {
  return side === "left" ? "-1" : "1";
}

function normalizeZenLiveActionMouthShape(
  mouthShape: boolean | ZenLiveActionMouthShape | undefined
): ZenLiveActionMouthShape {
  if (mouthShape === true) return "open-wide";
  if (mouthShape === false || mouthShape === undefined) return "closed";
  return mouthShape;
}

function zenLiveActionOpenMouthGlyph(
  eyes: ":" | ";",
  mouthShape: ZenLiveActionMouthShape
): string | null {
  if (mouthShape === "open-wide") return `${eyes}0`;
  if (mouthShape === "open-small") return `${eyes}o`;
  if (mouthShape === "open-round") return `${eyes}O`;
  return null;
}

export function zenLiveActionPlateFace(
  moodHint: ZenLiveActionMoodHint | undefined,
  mouthShape: boolean | ZenLiveActionMouthShape = false
): {
  text: string;
  rotateDeg: number;
} {
  const resolvedMouthShape = normalizeZenLiveActionMouthShape(mouthShape);
  const openMouth = zenLiveActionOpenMouthGlyph(":", resolvedMouthShape);
  switch (moodHint) {
    case "amused":
      return { text: openMouth ?? ":)", rotateDeg: 90 };
    case "warm":
      return { text: openMouth ?? ":]", rotateDeg: 90 };
    case "confused":
      return { text: openMouth ?? ":?", rotateDeg: 90 };
    case "stern":
      return { text: openMouth ?? ZEN_LIVE_ACTION_ANGRY_BRACKET_GLYPH, rotateDeg: 90 };
    case "attentive":
      return { text: openMouth ?? ":]", rotateDeg: 90 };
    case "waiting":
    case "neutral":
    default:
      return { text: openMouth ?? ":|", rotateDeg: 90 };
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

export function sanitizeZenLiveBotActionText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  let action = value.replace(/\s+/g, " ").trim();
  action = action.replace(/^\*+|\*+$/gu, "").trim();
  action = action.replace(/^[("'\u201c\u2018]+|[)"'\u201d\u2019]+$/gu, "").trim();
  action = action.replace(
    /\s*(?:"[^"]*(?:"|$)|\u201c[^\u201d]*(?:\u201d|$)|\u2018[^\u2019]*(?:\u2019|$))/gu,
    " "
  ).trim();
  action = action.replace(TRAILING_SPEECH_BRIDGE_RE, "").trim();
  action = action.replace(/[.!?\u2026;:,]+$/u, "").trim();
  return action || null;
}

export function resolveZenLiveBotPresenceActionText({
  action,
  replyAction,
  isTalking,
  userActionVisible,
  hasBot,
}: {
  action: unknown;
  replyAction?: unknown;
  isTalking: boolean;
  userActionVisible: boolean;
  hasBot: boolean;
}): string | null {
  void hasBot;
  const replyActionText = isTalking ? sanitizeZenLiveBotActionText(replyAction) : null;
  if (replyActionText) return replyActionText;
  const actionText = sanitizeZenLiveBotActionText(action);
  if (actionText) return actionText;
  if (isTalking) return "replying";
  if (userActionVisible) return "notices";
  return null;
}

export function isZenLiveBotPresenceActionVerbose(value: unknown): boolean {
  const action = sanitizeZenLiveBotActionText(value);
  return Boolean(action && (Array.from(action).length > 42 || /[,;:]/u.test(action)));
}

export function normalizeZenLiveBotActionState(
  response: ZenLiveActionReactionResponse,
  source: "draft_action" | "idle",
  createdAtMs: number
): ZenLiveBotActionState | null {
  const action = sanitizeZenLiveBotActionText(response.botAction);
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
