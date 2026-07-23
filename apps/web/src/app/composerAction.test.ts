import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  composerActionOnlySubmission,
  composerMainValueActivatesActionInput,
  normalizeComposerAction,
  serializeComposerAction,
  serializeComposerActionDraft,
  splitComposerAction,
} from "./composerAction.ts";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

describe("shared composer actions", () => {
  it("round-trips visible action text through the established canonical form", () => {
    assert.deepEqual(splitComposerAction("*leans closer* Tell me more."), {
      action: "leans closer",
      message: "Tell me more.",
    });
    assert.equal(
      serializeComposerAction("leans closer", "Tell me more."),
      "*leans closer* Tell me more.",
    );
    assert.equal(serializeComposerAction("nods", ""), "*nods*");
  });

  it("keeps asterisks out of the dedicated action field", () => {
    assert.equal(normalizeComposerAction("**waves**  slowly"), "waves slowly");
  });

  it("recognizes action-only sends without confusing action plus speech", () => {
    assert.equal(composerActionOnlySubmission("*bows head*"), "bows head");
    assert.equal(
      composerActionOnlySubmission("*bows head* I understand."),
      null,
    );
    assert.equal(composerActionOnlySubmission("I understand."), null);
  });

  it("preserves a trailing space while typing a multi-word action", () => {
    const afterSpace = serializeComposerActionDraft("leans ", "Tell me more.");
    assert.deepEqual(splitComposerAction(afterSpace), {
      action: "leans ",
      message: "Tell me more.",
    });
    assert.deepEqual(
      splitComposerAction(
        serializeComposerActionDraft("leans closer", "Tell me more."),
      ),
      {
        action: "leans closer",
        message: "Tell me more.",
      },
    );
    assert.equal(
      serializeComposerAction("leans ", "Tell me more."),
      "*leans* Tell me more.",
    );
    assert.match(
      pageSource,
      /onCanonicalValueChange\([\s\S]{0,100}serializeComposerActionDraft\(/u,
    );
  });

  it("activates action focus only for the exact two-asterisk trigger", () => {
    assert.equal(composerMainValueActivatesActionInput("**"), true);
    assert.equal(composerMainValueActivatesActionInput(" **"), false);
    assert.equal(composerMainValueActivatesActionInput("***"), false);
    assert.equal(composerMainValueActivatesActionInput("** hello"), false);
    assert.match(
      pageSource,
      /composerMainValueActivatesActionInput\(nextVisibleValue\)[\s\S]{0,600}focusActionInput\(\)/u,
    );
    assert.match(pageSource, /input\.focus\(\);[\s\S]{0,40}input\.select\(\);/u);
  });

  it("renders Action and Shh as separate shared composer controls", () => {
    assert.match(pageSource, /data-composer-action-container="true"/u);
    assert.match(pageSource, /data-composer-action-input="true"/u);
    assert.match(pageSource, /data-composer-shh="true"/u);
    assert.match(pageSource, /type="button"[\s\S]{0,180}onClick=\{onInterrupt\}/u);
    assert.match(pageSource, /interruptActive=\{composerReplyInterruptActive\}/u);
    assert.match(pageSource, /onInterrupt=\{handleTypingIndicatorPress\}/u);
    assert.match(pageSource, /actionInputEnabled=\{false\}/u);
  });

  it("keeps Zen action drafts private and submits action-only beats ephemerally", () => {
    assert.doesNotMatch(
      pageSource,
      /requestZenLiveActionReaction\("draft_action"\)/u,
    );
    assert.match(
      pageSource,
      /composerActionOnlySubmission\(rawDraft\)/u,
    );
    assert.match(
      pageSource,
      /await requestZenSubmittedActionReaction\(cue\)/u,
    );
    assert.match(
      pageSource,
      /return \[\.\.\.source, zenEphemeralUserActionMessage\]/u,
    );
  });
});
