import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPendingReplyVisible } from "./pendingReplyVisible.ts";

describe("isPendingReplyVisible", () => {
  it("is false when no reply is pending", () => {
    assert.equal(
      isPendingReplyVisible({
        pendingReply: false,
        pendingReplyConversationId: "conv-1",
        pendingReplyIsNewConversation: false,
        detailId: "conv-1",
      }),
      false,
    );
  });

  it("stays true for an existing conversation while its reply is in flight", () => {
    assert.equal(
      isPendingReplyVisible({
        pendingReply: true,
        pendingReplyConversationId: "conv-1",
        pendingReplyIsNewConversation: false,
        detailId: "conv-1",
      }),
      true,
    );
  });

  it("stays true on the optimistic pending shell for a new conversation", () => {
    assert.equal(
      isPendingReplyVisible({
        pendingReply: true,
        pendingReplyConversationId: null,
        pendingReplyIsNewConversation: true,
        detailId: "pending",
        selectedId: null,
      }),
      true,
    );
  });

  it("keeps spinning after progressive upgrades pending to a real conversation id", () => {
    assert.equal(
      isPendingReplyVisible({
        pendingReply: true,
        pendingReplyConversationId: null,
        pendingReplyIsNewConversation: true,
        detailId: "conv-new",
        selectedId: "conv-new",
      }),
      true,
    );
  });

  it("keeps spinning when the request id is updated to match the upgraded detail", () => {
    assert.equal(
      isPendingReplyVisible({
        pendingReply: true,
        pendingReplyConversationId: "conv-new",
        pendingReplyIsNewConversation: true,
        detailId: "conv-new",
        selectedId: "conv-new",
      }),
      true,
    );
  });

  it("does not spin for a different conversation than the in-flight request", () => {
    assert.equal(
      isPendingReplyVisible({
        pendingReply: true,
        pendingReplyConversationId: "conv-1",
        pendingReplyIsNewConversation: false,
        detailId: "conv-other",
        selectedId: "conv-other",
      }),
      false,
    );
  });
});
