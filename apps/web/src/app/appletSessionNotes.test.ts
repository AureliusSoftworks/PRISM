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

  it("places each committed note after the nearest transcript turn using first-typing time", () => {
    const transcript = [
      "# Transcript",
      "",
      "## Transcript",
      "",
      "### Turn 01 | Prism",
      "",
      "- Recorded: 2026-08-14T18:00:00.000Z",
      "",
      "First line.",
      "",
      "### Turn 02 | Hector",
      "",
      "- Recorded: 2026-08-14T18:01:00.000Z",
      "",
      "Second line.",
      "",
      "## Event log",
      "",
      "Done.",
    ].join("\n");
    const output = appendAppletSessionNoteToTranscript(transcript, {
      v: 1,
      surface: "coffee",
      sessionId: "coffee-1",
      body: "- watch Hector's reaction",
      captures: [
        {
          body: "watch Hector's reaction",
          startedAt: "2026-08-14T18:01:10.000Z",
          committedAt: "2026-08-14T18:01:40.000Z",
        },
      ],
      createdAt: "2026-08-14T18:01:40.000Z",
      updatedAt: "2026-08-14T18:01:40.000Z",
    });

    assert.match(
      output,
      /Second line\.\n\n> \*\*Developer note · 2026-08-14T18:01:10\.000Z\*\* — Watch Hector's reaction\.\n\n## Event log/u,
    );
    assert.match(
      output,
      /## Session notes\n\n- Watch Hector's reaction\./u,
    );
    assert.doesNotMatch(output, /Developer note · 2026-08-14T18:01:40/u);
  });

  it("uses the plus composer for live Coffee, Signal, Debate, and Story sessions", () => {
    assert.match(page, /surface="coffee"[\s\S]{0,100}sessionId=\{coffeeConversation\.id\}/u);
    assert.match(page, /surface="story"[\s\S]{0,100}sessionId=\{storySession\.id\}/u);
    assert.match(signal, /surface="signal"[\s\S]{0,100}sessionId=\{episode\.id\}/u);
    assert.match(debate, /surface="debate"[\s\S]{0,100}sessionId=\{activeSession\.id\}/u);
    assert.match(companion, /data-session-note-trigger="true"/u);
    assert.match(companion, /<Plus strokeWidth=\{2\.35\}/u);
    assert.match(companion, /aria-label="Session note"/u);
    assert.match(companion, /event\.currentTarget\.form\?\.requestSubmit\(\)/u);
    assert.match(companion, /method: "POST"/u);
    assert.match(companion, /entry,/u);
    assert.match(companion, /sessionNoteTypingStartedAtRef/u);
    assert.match(companion, /startedAt:/u);
    assert.match(companion, /nextDraft\.length > 0/u);
    assert.match(companion, /sessionNoteSavingRef\.current/u);
    assert.match(companion, /setSessionNoteDraft\(""\)/u);
    assert.match(
      companion,
      /First keystroke marks transcript · overlaps merge/u,
    );
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
    assert.match(page, /subscribeAppletSessionNoteSaved/u);
    assert.match(page, /data-kind="developer-note"/u);
    assert.match(page, /data-kind="session-notes"/u);
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

  it("keeps live applet presentation and recording running while notes are open", () => {
    assert.match(
      companion,
      /const pauseBackgroundForCompanionConversation =\s*open && !sessionNoteContext;/u,
    );
    assert.match(
      companion,
      /if \(!pauseBackgroundForCompanionConversation\) \{\s*setPrismSystemPause\(PRISM_COMPANION_SYSTEM_PAUSE_REASON, false\);\s*return;/u,
    );
    assert.match(
      companion,
      /\}, \[pauseBackgroundForCompanionConversation\]\);/u,
    );
  });
});
