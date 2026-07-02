import { PRISM_BOT_MARKDOWN_LINK_RE } from "./botMention.ts";

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
