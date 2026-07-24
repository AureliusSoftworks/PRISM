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
const pageCssSource = readFileSync(
  new URL("./page.module.css", import.meta.url),
  "utf8",
);

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

  it("allows only Unicode letters and ordinary spaces in the Action field", () => {
    assert.equal(
      normalizeComposerAction("**Wåves 2×—slowly! 🤖**"),
      "Wåves slowly ",
    );
    assert.equal(
      normalizeComposerAction("  नमस्ते\t世界\ncafe\u0301"),
      "नमस्ते 世界 café",
    );
    assert.equal(
      serializeComposerAction("nods!!! 3 times", "Hello."),
      "*nods times* Hello.",
    );
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

  it("tabs directly between Action and the prompt after unhandled completions", () => {
    assert.match(
      pageSource,
      /onKeyDown=\{handleActionPromptTabHandoff\}/u,
    );
    assert.match(
      pageSource,
      /event\.defaultPrevented[\s\S]{0,220}event\.key !== "Tab"/u,
    );
    assert.match(
      pageSource,
      /target === actionInputRef\.current[\s\S]{0,180}focusPromptInput\(\)/u,
    );
    assert.match(
      pageSource,
      /target === textareaRef\.current[\s\S]{0,180}data-markdown-cm-host[\s\S]{0,180}focusActionInput\(\)/u,
    );
  });

  it("uppercases Action-field chrome only; canvas action copy stays sentence case", () => {
    assert.match(
      pageCssSource,
      /\.composerActionField > input \{[\s\S]{0,360}font-weight: 750;[\s\S]{0,120}letter-spacing: 0\.08em;[\s\S]{0,120}text-transform: uppercase;/u,
    );
    assert.match(
      pageCssSource,
      /\.zenActionCueText \{[\s\S]{0,220}text-transform: none;/u,
    );
    assert.match(
      pageCssSource,
      /\.zenActionCueActor,[\s\S]{0,220}\.zenActionComposerPreviewActor \{[\s\S]{0,280}text-transform: none;/u,
    );
    assert.match(
      pageCssSource,
      /\.zenActionComposerPreviewText \{[\s\S]{0,220}text-transform: none;/u,
    );
    assert.match(
      pageCssSource,
      /\.zenLiveBotPresenceText \{[\s\S]{0,850}text-transform: none;/u,
    );
    assert.equal(
      serializeComposerAction("smiles softly", "Hello."),
      "*smiles softly* Hello.",
    );
  });

  it("uses the Action label itself as the writing surface", () => {
    assert.match(pageSource, /placeholder="Action"/u);
    assert.doesNotMatch(pageSource, /<span>Action<\/span>/u);
    assert.doesNotMatch(pageSource, /placeholder="What you do…"/u);
    assert.match(
      pageCssSource,
      /\.composerActionField > input::placeholder \{[\s\S]{0,120}color: var\(--fg-muted\);/u,
    );
  });

  it("keeps Action spelling assistance aligned with the composer setting", () => {
    assert.match(pageSource, /spellCheck=\{writingAssistEnabled\}/u);
    assert.match(
      pageSource,
      /autoCorrect=\{writingAssistEnabled \? "on" : "off"\}/u,
    );
    assert.match(
      pageSource,
      /autoCapitalize=\{writingAssistEnabled \? "sentences" : "none"\}/u,
    );
  });

  it("presents a user's sent action above their accompanying Zen message", () => {
    assert.match(
      pageSource,
      /zenActionsEnabled === true &&[\s\S]{0,140}\(messageRole === "assistant" \|\| messageRole === "user"\)[\s\S]{0,120}resolveZenActionPresentation\(source\)/u,
    );
    assert.doesNotMatch(
      pageSource,
      /zenActionsEnabled === true &&\s*renderAsEphemeralLines === true/u,
    );
    assert.match(
      pageSource,
      /zenActionActorLabel=\{[\s\S]{0,100}msg\.role === "user" \? "You"/u,
    );
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
      /import\s*\{[\s\S]{0,300}\bresolveZenActionPreview,[\s\S]{0,300}\}\s*from "\.\/zenActions";/u,
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
