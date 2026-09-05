import assert from "node:assert/strict";
import test from "node:test";
import {
  SLATE_IMPORTED_MANUSCRIPT_TITLE,
  slateImportedSectionRequiresPassageScope,
  splitSlateImportedManuscript,
} from "./slateImportedManuscript.ts";

test("Slate splits imported prose only at repeated unambiguous headings", () => {
  const manuscript = [
    "\uFEFFChapter One: The Door",
    "",
    "The first chapter keeps every original byte.",
    "",
    "Chapter Two — The Road",
    "",
    "The second chapter remains exact.\n",
  ].join("\n");
  const sections = splitSlateImportedManuscript(manuscript);

  assert.deepEqual(
    sections.map((section) => section.title),
    ["Chapter One: The Door", "Chapter Two — The Road"],
  );
  assert.equal(sections.map((section) => section.prose).join(""), manuscript);
  assert.equal(sections[0]?.start, 0);
  assert.equal(sections[1]?.end, manuscript.length);
});

test("Slate preserves ambiguous or single-heading imports as one exact section", () => {
  const manuscript =
    "  Chapter One\n\nSnow fell.\n\nA heading mentioned in prose is not enough.\n";
  assert.deepEqual(splitSlateImportedManuscript(manuscript), [
    {
      title: SLATE_IMPORTED_MANUSCRIPT_TITLE,
      prose: manuscript,
      start: 0,
      end: manuscript.length,
    },
  ]);
});

test("Slate requires a passage for unsafe monolithic imported rewrites", () => {
  const chapters =
    "Chapter One\n\nThe door opened.\n\nChapter Two\n\nThe road answered.";
  assert.equal(
    slateImportedSectionRequiresPassageScope({
      kind: "imported",
      title: SLATE_IMPORTED_MANUSCRIPT_TITLE,
      prose: chapters,
      hasSelection: false,
    }),
    true,
  );
  assert.equal(
    slateImportedSectionRequiresPassageScope({
      kind: "imported",
      title: SLATE_IMPORTED_MANUSCRIPT_TITLE,
      prose: chapters,
      hasSelection: true,
    }),
    false,
  );
  assert.equal(
    slateImportedSectionRequiresPassageScope({
      kind: "imported",
      title: "Chapter One",
      prose: chapters,
      hasSelection: false,
    }),
    false,
  );
});
