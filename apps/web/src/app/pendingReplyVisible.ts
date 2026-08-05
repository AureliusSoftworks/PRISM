/**
 * Whether the active Chat/Zen/Sandbox reply request should light the
 * effort-glyph "thinking" spin for the currently viewed conversation.
 *
 * Progressive streams upgrade optimistic `detail.id` from `"pending"` to the
 * real conversation id while the LLM is still generating. Keep the spin on
 * through that mid-request upgrade so thinking-enabled effort glyphs stay
 * visibly rotating for the whole call.
 */
export function isPendingReplyVisible(args: {
  pendingReply: boolean;
  pendingReplyConversationId: string | null;
  pendingReplyIsNewConversation: boolean;
  detailId: string | null | undefined;
  selectedId?: string | null;
}): boolean {
  if (!args.pendingReply) return false;

  const detailId = args.detailId ?? null;
  if (
    args.pendingReplyConversationId !== null &&
    detailId === args.pendingReplyConversationId
  ) {
    return true;
  }

  if (!args.pendingReplyIsNewConversation) return false;

  // Optimistic new-conversation shell before the server assigns an id.
  if (detailId === "pending") return true;

  // Mid-stream upgrade: progressive/psychic delivery replaced "pending" with
  // the real conversation id while the request is still in flight.
  if (
    detailId !== null &&
    detailId !== "pending" &&
    (args.pendingReplyConversationId === null ||
      args.pendingReplyConversationId === detailId) &&
    (args.selectedId === null ||
      args.selectedId === undefined ||
      args.selectedId === detailId)
  ) {
    return true;
  }

  return false;
}
