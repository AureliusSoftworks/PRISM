export interface RelationshipDepthReturnInterruptionOptions {
  cancelQueuedAndFollowupWork: () => void;
  cancelStarterWork: () => void;
  clearStarterReplyCache: () => void;
  pendingReplyVisible: boolean;
  stopPendingReply: () => void;
  pendingReplySettled?: Promise<void> | null;
  waitForPendingReplyRender: () => Promise<void>;
  stopResponseAudio: () => void;
  finishResponseReveal: () => void;
}

/**
 * Makes a relationship-depth return safe before the reverse transition starts.
 * Pending network work settles first; only then do audio and the progressive
 * reveal stop, so neither can leak into the restored room.
 */
export async function interruptRelationshipDepthReturn({
  cancelQueuedAndFollowupWork,
  cancelStarterWork,
  clearStarterReplyCache,
  pendingReplyVisible,
  stopPendingReply,
  pendingReplySettled,
  waitForPendingReplyRender,
  stopResponseAudio,
  finishResponseReveal,
}: RelationshipDepthReturnInterruptionOptions): Promise<void> {
  cancelQueuedAndFollowupWork();
  cancelStarterWork();
  clearStarterReplyCache();

  if (pendingReplyVisible) {
    stopPendingReply();
    await pendingReplySettled;
    await waitForPendingReplyRender();
  }

  stopResponseAudio();
  finishResponseReveal();
}
