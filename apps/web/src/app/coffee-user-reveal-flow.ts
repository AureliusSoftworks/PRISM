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
