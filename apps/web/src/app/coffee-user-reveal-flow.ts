import { PRISM_BOT_MARKDOWN_LINK_RE, tokenizeBotMentionSource } from "./botMention.ts";

export type CoffeeUserRevealFlowState =
  | "idle"
  | "playerComposing"
  | "botThinking"
  | "cooldown"
  | "userTableTyping"
  | "tableTyping";

export function coffeeShouldQueueAssistantRevealAfterUserTyping(
  state: CoffeeUserRevealFlowState
): boolean {
  return state === "userTableTyping";
}

export function coffeeShouldWaitForPendingBotRevealBeforeNextTurn(
  state: CoffeeUserRevealFlowState
): boolean {
  return state === "tableTyping";
}

export function coffeeArrivalAutoplayCanScheduleNow(state: CoffeeUserRevealFlowState): boolean {
  return state === "idle" || state === "playerComposing";
}

export function coffeeArrivalAutoplayRetryDelayMs(
  state: CoffeeUserRevealFlowState,
  requestedDelayMs = 850
): number {
  if (coffeeArrivalAutoplayCanScheduleNow(state)) return 0;
  const boundedDelayMs = Number.isFinite(requestedDelayMs)
    ? Math.max(120, Math.round(requestedDelayMs))
    : 850;
  if (state === "tableTyping" || state === "cooldown" || state === "userTableTyping") {
    return Math.min(420, boundedDelayMs);
  }
  return Math.min(900, Math.max(320, boundedDelayMs));
}

export function coffeePendingSubmittedUserLineVisible(args: {
  state: CoffeeUserRevealFlowState;
  userRevealText: string;
  sessionFinished: boolean;
}): boolean {
  return (
    args.state !== "userTableTyping" &&
    !args.sessionFinished &&
    args.userRevealText.trim().length > 0
  );
}

export function coffeeShouldIgnoreStaleTurnResponse(response: {
  stale?: boolean;
  speakerBotId?: string | null;
}): boolean {
  return response.stale === true || !response.speakerBotId;
}

export function coffeeTableTalkAutoplayDeferralMs(args: {
  conversationId: string;
  draft: string;
  lastTypedAtMs: number;
  lastTypedConversationId: string | null;
  nowMs: number;
  graceMs: number;
}): number {
  if (args.lastTypedConversationId !== args.conversationId) return 0;
  if (args.draft.trim().length > 0) return Math.max(0, args.graceMs);
  if (args.lastTypedAtMs <= 0) return 0;
  return Math.max(0, args.graceMs - (args.nowMs - args.lastTypedAtMs));
}

export function coffeeDirectedMentionBotIds(
  text: string,
  seatedBotIds: Iterable<string>
): string[] {
  const allowed = new Set([...seatedBotIds].map((id) => id.trim()).filter(Boolean));
  if (allowed.size === 0 || text.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const re = new RegExp(PRISM_BOT_MARKDOWN_LINK_RE.source, "gi");
  for (const match of text.matchAll(re)) {
    const encodedId = match[2] ?? "";
    let botId = encodedId;
    try {
      botId = decodeURIComponent(encodedId).trim();
    } catch {
      botId = encodedId.trim();
    }
    if (!botId || !allowed.has(botId) || seen.has(botId)) continue;
    seen.add(botId);
    out.push(botId);
  }
  return out;
}

export function coffeeVisibleDirectedMentionBotIds(
  text: string,
  seatedBotIds: Iterable<string>,
  revealedDisplayLength: number
): string[] {
  const allowed = new Set([...seatedBotIds].map((id) => id.trim()).filter(Boolean));
  if (allowed.size === 0 || text.length === 0 || revealedDisplayLength <= 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  let displayCursor = 0;
  for (const segment of tokenizeBotMentionSource(text)) {
    if (segment.kind === "mention") {
      const displayLen = segment.displayName.length;
      if (
        revealedDisplayLength > displayCursor &&
        segment.botId &&
        allowed.has(segment.botId) &&
        !seen.has(segment.botId)
      ) {
        seen.add(segment.botId);
        out.push(segment.botId);
      }
      displayCursor += displayLen;
      continue;
    }
    displayCursor += segment.text.length;
  }
  return out;
}
