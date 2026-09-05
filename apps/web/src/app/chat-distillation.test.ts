import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");

describe("Chat distillation ritual", () => {
  it("replaces the paired sidebar actions with one labeled distillation action", () => {
    assert.match(page, /data-glyph-tooltip=\{actionLabel\}[\s\S]{0,800}conversationSweepButtonLabel\}>Distill</u);
    assert.equal(
      (page.match(/\{renderConversationSweepButton\(\)\}/gu) ?? []).length,
      2,
    );
    assert.doesNotMatch(
      page,
      /DELETE_ALL_KEY|deleteAllConversations|renderConversationDeleteAllButton|Delete all chats/u,
    );
    assert.doesNotMatch(
      styles,
      /conversationDeleteAllButton|data-delete-armed-all|data-delete-holding/u,
    );
    assert.match(page, /\/api\/conversations\/distill/u);
  });

  it("enables Distill for bot, Prism, and orphan direct Chat rows", () => {
    assert.match(
      page,
      /hasSweepEligibleConversations[\s\S]{0,300}conversation\.mode === "chat" \|\| conversation\.mode === "zen"\)[\s\S]{0,100}!conversation\.incognito/u,
    );
    assert.doesNotMatch(
      page,
      /hasSweepEligibleConversations[\s\S]{0,350}Boolean\(conversation\.botId\)/u,
    );
  });

  it("shows only the matching persona or Prism continuity beneath a new-chat hero", () => {
    assert.match(
      page,
      /heroBot[\s\S]{0,180}summary\.personaKind === "bot"[\s\S]{0,100}summary\.botId === heroBot\.id[\s\S]{0,100}summary\.personaKind === "prism"/u,
    );
    assert.match(page, /data-chat-distillation-continuity="true"/u);
    assert.match(page, /Carried forward/u);
  });

  it("discloses archival recovery without calling Distill a permanent deletion", () => {
    assert.match(page, /private archival distillations and are never reused/u);
    assert.match(page, /immediate Undo lasts 15 seconds/u);
    assert.match(page, /recoverable for 30 days/u);
  });

  it("keeps a magical light and dark styling contract", () => {
    assert.match(styles, /\.conversationSweepButton\s*\{[\s\S]{0,900}min-width:\s*94px/u);
    assert.match(styles, /@keyframes chatDistillationAura/u);
    assert.match(styles, /\.themeLight \.conversationSweepButton/u);
    assert.match(styles, /\.chatDistillationContinuity\s*\{/u);
    assert.match(styles, /\.themeLight \.chatDistillationContinuity/u);
  });
});
