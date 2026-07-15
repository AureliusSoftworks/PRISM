import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { SlateRevision, SlateStructureItem } from "@localai/shared";
import {
  latestPendingSlateRevision,
  reorderSlateStructure,
  slateRevisionScopeForWorkspace,
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
});
