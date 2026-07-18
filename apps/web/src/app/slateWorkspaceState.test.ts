import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  SlateContinuityConcernCard,
  SlateRevision,
  SlateReturnSession,
  SlateReturnSessionSynopsis,
  SlateSectionDetail,
  SlateStructureItem,
} from "@localai/shared";
import {
  latestPendingSlateRevision,
  mergeSavedSlateSection,
  reorderSlateStructure,
  slateConcernResolveRequestForDirection,
  slateContinuityConcernSectionId,
  slateRevisionActionForDirection,
  slateExportScopeForWorkspace,
  slateReturnNextCardSectionId,
  slateReturnSplashDismissalId,
  slateReturnSplashShouldShow,
  slateRevisionScopeForWorkspace,
  slateSectionEditableFingerprint,
  slateSectionForStructure,
  slateProjectOffsetsForSectionSelection,
  slateProjectSourceIsReady,
  slateProjectSparkForCreation,
  slateProjectTitleForCreation,
} from "./slateWorkspaceState.ts";

const structure: SlateStructureItem[] = ["one", "two", "three"].map((id) => ({
  id,
  kind: "scene",
  title: id,
  summary: "",
  direction: "",
  status: id === "two" ? "drafted" : "planned",
  locked: false,
}));

describe("Slate workspace state", () => {
  it("requires content from the active source lane", () => {
    assert.equal(
      slateProjectSourceIsReady({
        sourceMode: "spark",
        spark: "A lighthouse goes dark.",
        existingMaterial: "",
      }),
      true,
    );
    assert.equal(
      slateProjectSourceIsReady({
        sourceMode: "material",
        spark: "",
        existingMaterial: "Chapter One\nThe sea rose.",
      }),
      true,
    );
    assert.equal(
      slateProjectSourceIsReady({
        sourceMode: "material",
        spark: "A spark that must be ignored.",
        existingMaterial: "\n",
      }),
      false,
    );
  });

  it("preserves imported prose as the creation spark when no separate spark exists", () => {
    const pasted = `Chapter One\n\n${"The snow remembered. ".repeat(500)}`;
    assert.equal(
      slateProjectSparkForCreation({
        sourceMode: "spark",
        spark: "A shorter spark",
        existingMaterial: pasted,
      }),
      "A shorter spark",
    );
    assert.equal(
      slateProjectSparkForCreation({
        sourceMode: "material",
        spark: "A spark that must be ignored",
        existingMaterial: pasted,
      }),
      pasted.trim().slice(0, 8_000),
    );
    assert.equal(slateProjectTitleForCreation(""), "Untitled Story");
    assert.equal(slateProjectTitleForCreation("  My Book  "), "My Book");
  });

  it("turns one natural-language direction into the internal revision action", () => {
    assert.equal(
      slateRevisionActionForDirection({
        direction: "Tighten this without losing the menace.",
        selectionLength: 200,
      }),
      "condense",
    );
    assert.equal(
      slateRevisionActionForDirection({ direction: "", selectionLength: 120 }),
      "deepen",
    );
    assert.equal(
      slateRevisionActionForDirection({ direction: "", selectionLength: 0 }),
      "rewrite",
    );
  });

  it("keeps export scope intentional without exposing manuscript metadata", () => {
    const section = {
      id: "scene-one",
      kind: "scene",
      prose: "A lantern wakes.",
    } as SlateSectionDetail;
    assert.deepEqual(
      slateExportScopeForWorkspace({
        choice: "book",
        section,
        selectionStart: 0,
        selectionEnd: 0,
      }),
      { kind: "book" },
    );
    assert.deepEqual(
      slateExportScopeForWorkspace({
        choice: "selection",
        section,
        selectionStart: 2,
        selectionEnd: 9,
      }),
      { kind: "selection", sectionId: "scene-one", start: 2, end: 9 },
    );
    assert.deepEqual(
      slateExportScopeForWorkspace({
        choice: "focused",
        section,
        selectionStart: 0,
        selectionEnd: 0,
      }),
      { kind: "scene", sectionId: "scene-one" },
    );
    assert.deepEqual(
      slateExportScopeForWorkspace({
        choice: "focused",
        section: { ...section, id: "act-one", kind: "act" },
        selectionStart: 0,
        selectionEnd: 0,
      }),
      { kind: "act", sectionId: "act-one" },
    );
    assert.deepEqual(
      slateExportScopeForWorkspace({
        choice: "focused",
        section: { ...section, id: "chapter-one", kind: "chapter" },
        selectionStart: 0,
        selectionEnd: 0,
      }),
      { kind: "chapter", sectionId: "chapter-one" },
    );
    assert.equal(
      slateExportScopeForWorkspace({
        choice: "selection",
        section,
        selectionStart: 0,
        selectionEnd: section.prose.length + 1,
      }),
      null,
    );
  });

  it("rearranges structure cards without mutating the source list", () => {
    const next = reorderSlateStructure(structure, "two", -1);
    assert.deepEqual(next.map((item) => item.id), ["two", "one", "three"]);
    assert.deepEqual(structure.map((item) => item.id), ["one", "two", "three"]);
    assert.deepEqual(reorderSlateStructure(structure, "one", -1), structure);
  });

  it("chooses selection, drafted scene, then project revision scope", () => {
    assert.equal(
      slateRevisionScopeForWorkspace({
        selectionStart: 4,
        selectionEnd: 12,
        selectedStructureItem: structure[1]!,
      }),
      "selection",
    );
    assert.equal(
      slateRevisionScopeForWorkspace({
        selectionStart: 0,
        selectionEnd: 0,
        selectedStructureItem: structure[1]!,
      }),
      "scene",
    );
    assert.equal(
      slateRevisionScopeForWorkspace({
        selectionStart: 0,
        selectionEnd: 0,
        selectedStructureItem: structure[0]!,
      }),
      "project",
    );
  });

  it("reopens the newest unresolved revision proposal", () => {
    const base = {
      projectId: "project",
      action: "rewrite" as const,
      scope: "project" as const,
      structureItemId: null,
      selectionStart: null,
      selectionEnd: null,
      direction: "",
      originalText: "before",
      proposedText: "after",
      provider: "local" as const,
      model: "llama3.2",
      createdAt: "2026-07-15T00:00:00.000Z",
      resolvedAt: null,
    };
    const revisions: SlateRevision[] = [
      { ...base, id: "new", status: "pending" },
      { ...base, id: "old", status: "accepted" },
    ];
    assert.equal(latestPendingSlateRevision(revisions)?.id, "new");
  });

  it("maps structure cards to their persistent focused sections", () => {
    const section = {
      id: "section-two",
      structureItemId: "two",
    } as SlateSectionDetail;
    assert.equal(slateSectionForStructure([section], "two")?.id, "section-two");
    assert.equal(slateSectionForStructure([section], "missing"), null);
  });

  it("keeps human edits typed while an earlier autosave was in flight", () => {
    const base: SlateSectionDetail = {
      id: "section",
      projectId: "project",
      seriesId: "series",
      parentSectionId: null,
      structureItemId: "two",
      kind: "scene",
      ordinal: 1,
      title: "Scene two",
      summary: "",
      direction: "",
      locked: false,
      status: "drafted",
      revision: 2,
      proseLength: 5,
      contentHash: "old",
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
      prose: "first",
      lockedRanges: [],
    };
    const saveSnapshot = { ...base, prose: "second", proseLength: 6 };
    const newerLocal = { ...saveSnapshot, prose: "second and third", proseLength: 16 };
    const saved = {
      ...saveSnapshot,
      revision: 3,
      contentHash: "saved",
      updatedAt: "2026-07-15T00:01:00.000Z",
    };
    const merged = mergeSavedSlateSection(
      newerLocal,
      saved,
      slateSectionEditableFingerprint(saveSnapshot),
    );
    assert.equal(merged.revision, 3);
    assert.equal(merged.prose, "second and third");
    assert.equal(merged.proseLength, 16);
  });

  it("translates focused-section selections to legacy manuscript offsets", () => {
    const section = (id: string, prose: string): SlateSectionDetail => ({
      id,
      projectId: "project",
      seriesId: "series",
      parentSectionId: null,
      structureItemId: id,
      kind: "scene",
      ordinal: id === "one" ? 0 : 1,
      title: id,
      summary: "",
      direction: "",
      locked: false,
      status: "drafted",
      revision: 1,
      proseLength: prose.length,
      contentHash: id,
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
      prose,
      lockedRanges: [],
    });
    const sections = [section("one", "First."), section("two", "  Second scene.  ")];
    assert.deepEqual(
      slateProjectOffsetsForSectionSelection(sections, "two", 2, 8),
      { start: 21, end: 27 },
    );
  });

  it("shows each current return session once for its selected project", () => {
    const session = {
      id: "return-one",
      projectId: "project-one",
      isCurrent: true,
    } as SlateReturnSession;
    assert.equal(
      slateReturnSplashShouldShow({
        session,
        selectedProjectId: "project-one",
        dismissedSessionId: null,
      }),
      true,
    );
    const dismissedSessionId = slateReturnSplashDismissalId(
      session,
      "project-one",
    );
    assert.equal(dismissedSessionId, "return-one");
    assert.equal(
      slateReturnSplashShouldShow({
        session,
        selectedProjectId: "project-one",
        dismissedSessionId,
      }),
      false,
    );
    assert.equal(
      slateReturnSplashShouldShow({
        session: { ...session, id: "return-two" },
        selectedProjectId: "project-one",
        dismissedSessionId,
      }),
      true,
    );
    assert.equal(
      slateReturnSplashShouldShow({
        session: { ...session, isCurrent: false },
        selectedProjectId: "project-one",
        dismissedSessionId: null,
      }),
      false,
    );
    assert.equal(slateReturnSplashDismissalId(session, "project-two"), null);
  });

  it("focuses only the section implied by the return session's next card", () => {
    const returnSection = (id: string, status: "planned" | "drafted") => ({
      id,
      title: id,
      summary: "",
      direction: "",
      kind: "scene" as const,
      status,
      ordinal: 0,
      wordCount: 0,
    });
    const synopsis: Pick<
      SlateReturnSessionSynopsis,
      "nextCard" | "threads" | "nextPlannedSection" | "mostRecentSection"
    > = {
      nextCard: {
        kind: "due_thread",
        priority: 1,
        title: "A thread is due",
        body: "The lantern promise needs attention.",
        actionLabel: "See the thread",
        target: { kind: "thread", id: "thread-one" },
      },
      threads: {
        due: [
          {
            id: "thread-one",
            label: "The lantern promise",
            status: "due",
            dueSectionId: "scene-two",
          },
        ],
        open: [],
      },
      nextPlannedSection: returnSection("scene-three", "planned"),
      mostRecentSection: returnSection("scene-one", "drafted"),
    };
    const sections = [
      { id: "scene-one" },
      { id: "scene-two" },
      { id: "scene-three" },
    ];
    assert.equal(
      slateReturnNextCardSectionId({
        synopsis,
        sections,
        currentSectionId: "scene-one",
      }),
      "scene-two",
    );
    assert.equal(
      slateReturnNextCardSectionId({
        synopsis: {
          ...synopsis,
          nextCard: {
            ...synopsis.nextCard,
            kind: "canon_risk",
            target: { kind: "concern", id: "concern-one" },
          },
        },
        sections,
        currentSectionId: "scene-one",
      }),
      "scene-one",
    );
    assert.equal(
      slateReturnNextCardSectionId({
        synopsis: {
          ...synopsis,
          nextCard: {
            ...synopsis.nextCard,
            kind: "draft_section",
            target: { kind: "project", id: "project-one" },
          },
        },
        sections,
        currentSectionId: null,
      }),
      "scene-three",
    );
  });

  it("focuses the first available passage for the single Continuity concern", () => {
    const concern = {
      passages: [
        { sectionId: "missing" },
        { sectionId: "scene-two" },
      ],
    } as SlateContinuityConcernCard;
    assert.equal(
      slateContinuityConcernSectionId({
        concern,
        sections: [{ id: "scene-one" }, { id: "scene-two" }],
        currentSectionId: "scene-one",
      }),
      "scene-two",
    );
  });

  it("submits writer direction without exposing internal resolution choices", () => {
    const concern = {
      suggestedAction: { kind: "update_canon", label: "Confirm what's true" },
    } as SlateContinuityConcernCard;
    assert.deepEqual(
      slateConcernResolveRequestForDirection(
        concern,
        "  This is a rumor Mara believes.  ",
      ),
      { direction: "This is a rumor Mara believes." },
    );
    assert.equal(slateConcernResolveRequestForDirection(concern, "   "), null);
    assert.deepEqual(
      slateConcernResolveRequestForDirection(
        {
          ...concern,
          suggestedAction: { kind: "revise_prose", label: "Preview a fix" },
        },
        "",
      ),
      { resolutionKind: "revise_prose" },
    );
  });
});
