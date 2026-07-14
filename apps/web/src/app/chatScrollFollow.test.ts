import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  chatScrollIsNearBottom,
  chatScrollShouldStartFollow,
  chatScrollTopAfterLayoutChange,
  chatScrollUserOwnsViewportAfterNativeScroll,
  type ChatScrollMetrics,
} from "./chatScrollFollow.ts";

const metrics = (
  scrollTop: number,
  scrollHeight: number,
  clientHeight = 600,
): ChatScrollMetrics => ({ scrollTop, scrollHeight, clientHeight });

const rawPageSource = readFileSync(
  new URL("./page.tsx", import.meta.url),
  "utf8",
);

function pageFunctionBody(name: string): string {
  const start = rawPageSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} should exist`);
  const nextFunction = rawPageSource.indexOf("\n  function ", start + 1);
  return rawPageSource.slice(
    start,
    nextFunction === -1 ? undefined : nextFunction,
  );
}

describe("Product Chat scroll follow", () => {
  it("follows a second assistant response when the reader is at the live edge", () => {
    assert.equal(
      chatScrollTopAfterLayoutChange(metrics(800, 1_400), metrics(1_300, 1_900), {
        followArmed: true,
        userOwnsViewport: false,
      }),
      1_300,
    );
  });

  it("preserves the bottom gap while a long response streams and reflows", () => {
    assert.equal(
      chatScrollTopAfterLayoutChange(metrics(740, 1_400), metrics(1_240, 1_900), {
        followArmed: true,
        userOwnsViewport: false,
      }),
      1_240,
    );
  });

  it("reconciles an undo against the new native scroll range", () => {
    assert.equal(
      chatScrollTopAfterLayoutChange(metrics(900, 1_500), metrics(420, 1_020), {
        followArmed: true,
        userOwnsViewport: false,
      }),
      420,
    );
  });

  it("never moves a reader who intentionally scrolled upward", () => {
    assert.equal(
      chatScrollTopAfterLayoutChange(metrics(260, 1_500), metrics(760, 2_000), {
        followArmed: true,
        userOwnsViewport: true,
      }),
      null,
    );
    assert.equal(
      chatScrollShouldStartFollow(metrics(260, 1_500), {
        followArmed: true,
        userOwnsViewport: false,
      }),
      false,
    );
  });

  it("stays stable through rapid deletion followed by insertion", () => {
    const before = metrics(880, 1_500);
    const afterDeletion = metrics(480, 1_100);
    const deletedTop = chatScrollTopAfterLayoutChange(before, afterDeletion, {
      followArmed: true,
      userOwnsViewport: false,
    });
    assert.equal(deletedTop, 480);

    assert.equal(
      chatScrollTopAfterLayoutChange(
        { ...afterDeletion, scrollTop: deletedTop ?? afterDeletion.scrollTop },
        metrics(980, 1_600),
        { followArmed: true, userOwnsViewport: false },
      ),
      980,
    );
  });

  it("releases manual ownership only after native scrolling reaches the bottom", () => {
    assert.equal(chatScrollIsNearBottom(metrics(650, 1_400)), false);
    assert.equal(
      chatScrollUserOwnsViewportAfterNativeScroll(
        metrics(650, 1_400),
        true,
        false,
      ),
      true,
    );
    assert.equal(
      chatScrollUserOwnsViewportAfterNativeScroll(
        metrics(790, 1_400),
        true,
        false,
      ),
      false,
    );
    assert.equal(
      chatScrollUserOwnsViewportAfterNativeScroll(
        metrics(800, 1_400),
        true,
        true,
      ),
      true,
    );
  });

  it("wires resize and DOM changes through the same layout reconciliation", () => {
    assert.match(
      rawPageSource,
      /new ResizeObserver\(scheduleTailSpaceSync\)/,
    );
    assert.match(
      rawPageSource,
      /new MutationObserver\(scheduleTailSpaceSync\)/,
    );
    assert.match(
      rawPageSource,
      /reconcileChatScrollAfterLayoutChange\(detail\.id\)/,
    );
  });

  it("keeps the pre-undo viewport snapshot and ownership through server refresh", () => {
    const undoBody = pageFunctionBody("undoLatestMessageFromSlashCommand");
    const resetStart = rawPageSource.indexOf(
      "const hardResetChatArchiveStateForConversation",
    );
    assert.notEqual(resetStart, -1);
    const resetEnd = rawPageSource.indexOf(
      "const latestDetailMessageId",
      resetStart,
    );
    const resetBody = rawPageSource.slice(resetStart, resetEnd);

    assert.match(undoBody, /recordChatScrollMetrics\(/);
    assert.match(undoBody, /queueChatScrollLayoutReconciliation\(/);
    assert.match(
      undoBody,
      /hardResetChatArchiveStateForConversation\([\s\S]*preserveScrollState: true/,
    );
    assert.match(resetBody, /if \(!options\.preserveScrollState\)/);
  });
});
