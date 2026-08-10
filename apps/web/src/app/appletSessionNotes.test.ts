import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  appendAppletSessionNoteToTranscript,
  formatAppletSessionNoteCollectionBody,
  sentenceCaseAppletSessionNoteEntry,
} from "./appletSessionNotes.ts";

const companion = readFileSync(
  new URL("./PrismCompanion.tsx", import.meta.url),
  "utf8",
);
const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const signal = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const debate = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const companionStyles = readFileSync(
  new URL("./prismCompanion.module.css", import.meta.url),
  "utf8",
);

describe("applet session notes", () => {
  it("appends collected sentence-cased bullets as one final transcript section", () => {
    assert.equal(
      appendAppletSessionNoteToTranscript(
        "# Transcript\n\nHello\n",
        "- first thought\n- keep NASA casing!",
      ),
      "# Transcript\n\nHello\n\n## Session notes\n\n- First thought.\n- Keep NASA casing!\n",
    );
    assert.equal(
      appendAppletSessionNoteToTranscript("# Transcript\n", "  "),
      "# Transcript",
    );
    assert.equal(
      sentenceCaseAppletSessionNoteEntry(
        "  remember   the ending. ask again  ",
      ),
      "Remember the ending. Ask again.",
    );
    assert.equal(
      formatAppletSessionNoteCollectionBody("old multi-line\nnote"),
      "- Old multi-line note.",
    );
    assert.equal(
      formatAppletSessionNoteCollectionBody(
        "- This is a test Hello world!\n- This is a test.\n- Hello world!",
      ),
      "- This is a test Hello world!",
    );
    assert.equal(
      formatAppletSessionNoteCollectionBody(
        "- This is a test.\n- Hello world!",
      ),
      "- This is a test.\n- Hello world!",
    );
  });

  it("uses the plus composer for live Coffee, Signal, and Debate sessions", () => {
    assert.match(page, /surface="coffee"[\s\S]{0,100}sessionId=\{coffeeConversation\.id\}/u);
    assert.match(signal, /surface="signal"[\s\S]{0,100}sessionId=\{episode\.id\}/u);
    assert.match(debate, /surface="debate"[\s\S]{0,100}sessionId=\{activeSession\.id\}/u);
    assert.match(companion, /data-session-note-trigger="true"/u);
    assert.match(companion, /<Plus strokeWidth=\{2\.35\}/u);
    assert.match(companion, /aria-label="Session note"/u);
    assert.match(companion, /event\.currentTarget\.form\?\.requestSubmit\(\)/u);
    assert.match(companion, /method: "POST"/u);
    assert.match(companion, /entry,/u);
    assert.match(companion, /sessionNoteSavingRef\.current/u);
    assert.match(companion, /setSessionNoteDraft\(""\)/u);
    assert.match(companion, /Overlaps merge in the transcript/u);
    assert.match(companion, /Add note/u);
    assert.match(companion, /keyboardShortcutMatchesEvent\(keyboardShortcut, event\)/u);
    assert.match(companion, /setOpen\(false\)/u);
    assert.match(
      companion,
      /if \(sessionNoteContextRef\.current\) \{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);\s*return;/u,
    );
    assert.match(
      companion,
      /if \(sessionNoteContext\) \{[\s\S]*isPrismCompanionModifierKey\(event, platform\)[\s\S]*startPrismWield\(pointer\)/u,
    );
    assert.match(companion, /onPointerDown=\{beginDrag\}/u);
    assert.match(companion, /onPointerMove=\{moveDrag\}/u);
    assert.match(companion, /onPointerUp=\{endDrag\}/u);
    assert.match(
      companion,
      /const dropTargetId = drag\.moved && !sessionNoteContextRef\.current/u,
    );
    assert.match(
      companionStyles,
      /\.anchor\[data-session-note="true"\]\[data-wielding="true"\] \.sessionNotePlus \{[\s\S]*width: 30px/u,
    );
  });

  it("loads the note into every live-session transcript output", () => {
    for (const source of [page, signal, debate]) {
      assert.match(source, /appletSessionNoteRequestPath/u);
      assert.match(source, /appendAppletSessionNoteToTranscript/u);
    }
    assert.match(page, /downloadCoffeeReplayTranscriptWithNote/u);
  });

  it("keeps the applet crisp behind a local dark focus orb", () => {
    const openBackdrop = companionStyles.match(
      /\.backdrop\[data-open="true"\]\s*\{([\s\S]*?)\}/u,
    )?.[1];

    assert.ok(openBackdrop);
    assert.doesNotMatch(openBackdrop, /brightness|blur\(/u);
    assert.match(openBackdrop, /background:\s*transparent/u);
    assert.match(companionStyles, /\.focusOrb\s*\{[\s\S]*radial-gradient/u);
    assert.match(companionStyles, /\.focusOrb\s*\{[\s\S]*filter:\s*blur\(26px\)/u);
    assert.match(companion, /className=\{styles\.focusOrb\}/u);
  });
});
