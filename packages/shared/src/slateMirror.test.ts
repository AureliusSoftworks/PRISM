import assert from "node:assert/strict";
import test from "node:test";
import {
  isSlateMirrorSampleEligible,
  slateMirrorSampleEligibility,
  type SlateMirrorSample,
  type SlateMirrorSampleSourceKind,
} from "./slateMirror.ts";

function candidate(
  sourceKind: SlateMirrorSampleSourceKind,
  overrides: Partial<
    Pick<SlateMirrorSample, "explicitlyIncluded" | "provenance">
  > = {},
): Pick<SlateMirrorSample, "explicitlyIncluded" | "provenance"> {
  return {
    explicitlyIncluded: true,
    provenance: {
      sourceKind,
      projectId: "project-1",
      sectionId: "section-1",
      sectionRevision: 7,
      anchor: null,
      originatingOperationId: null,
      writerOwnsRights: true,
      containsThirdPartyMaterial: false,
      humanRewriteConfirmed: false,
    },
    ...overrides,
  };
}

test("Mirror accepts writer-owned exercises and direct human prose", () => {
  for (const sourceKind of [
    "writer_owned_sample",
    "description_exercise",
    "dialogue_exercise",
    "interiority_action_exercise",
    "direct_human_prose",
  ] as const) {
    assert.deepEqual(slateMirrorSampleEligibility(candidate(sourceKind)), {
      eligible: true,
      reason: "eligible",
    });
  }
});

test("Mirror rejects directions, research, quotations, imports, and untouched AI prose", () => {
  for (const sourceKind of [
    "direction",
    "research",
    "quotation",
    "import",
    "untouched_ai_prose",
  ] as const) {
    assert.deepEqual(slateMirrorSampleEligibility(candidate(sourceKind)), {
      eligible: false,
      reason: "forbidden_source_kind",
    });
  }
});

test("Mirror requires explicit inclusion, rights, clean provenance, and confirmed rewrites", () => {
  assert.equal(
    isSlateMirrorSampleEligible({
      ...candidate("direct_human_prose"),
      explicitlyIncluded: false,
    }),
    false,
  );
  assert.equal(
    slateMirrorSampleEligibility({
      ...candidate("direct_human_prose"),
      provenance: {
        ...candidate("direct_human_prose").provenance,
        writerOwnsRights: false,
      },
    }).reason,
    "rights_not_confirmed",
  );
  assert.equal(
    slateMirrorSampleEligibility({
      ...candidate("direct_human_prose"),
      provenance: {
        ...candidate("direct_human_prose").provenance,
        containsThirdPartyMaterial: true,
      },
    }).reason,
    "contains_third_party_material",
  );
  assert.equal(
    slateMirrorSampleEligibility(candidate("substantially_rewritten_prose"))
      .reason,
    "human_rewrite_not_confirmed",
  );
  assert.equal(
    isSlateMirrorSampleEligible({
      ...candidate("substantially_rewritten_prose"),
      provenance: {
        ...candidate("substantially_rewritten_prose").provenance,
        humanRewriteConfirmed: true,
      },
    }),
    true,
  );
});
