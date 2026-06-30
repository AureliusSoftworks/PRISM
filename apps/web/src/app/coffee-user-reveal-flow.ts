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
