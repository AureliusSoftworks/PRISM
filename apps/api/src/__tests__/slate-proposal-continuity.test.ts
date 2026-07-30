import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LlmProvider } from "../providers.ts";
import {
  auditSlateProposalContinuity,
  selectSlateProposalContinuityEvidence,
  validateSlateProposalContinuityAudit,
} from "../slate-proposal-continuity.ts";

const sections = [
  {
    id: "scene-1",
    title: "Low Water",
    ordinal: 0,
    revision: 2,
    prose:
      "The bell's clapper had been removed. Mara carried it out herself and sealed the glass shell.\n\nRain worried the empty reservoir.",
  },
  {
    id: "scene-2",
    title: "The Unmaking",
    ordinal: 1,
    revision: 1,
    prose:
      "Mara followed Ivo below the spillway.\n\nThey returned at dusk without speaking.",
  },
  {
    id: "scene-3",
    title: "The Fourth Ring",
    ordinal: 2,
    revision: 0,
    prose: "",
  },
];

describe("Slate proposal Continuity audit", () => {
  it("retrieves exact cross-scene object-state evidence deterministically", () => {
    const evidence = selectSlateProposalContinuityEvidence({
      sections,
      focusedSectionId: "scene-3",
      candidateText:
        "Inside the glass shell, the brass clapper hung ready. Mara pulled its cord.",
    });
    assert.equal(evidence[0]?.sectionId, "scene-1");
    assert.match(evidence[0]?.quote ?? "", /clapper had been removed/u);
    assert.deepEqual(
      evidence,
      selectSlateProposalContinuityEvidence({
        sections: [...sections].reverse(),
        focusedSectionId: "scene-3",
        candidateText:
          "Inside the glass shell, the brass clapper hung ready. Mara pulled its cord.",
      }),
    );
  });

  it("rejects ungrounded and low-confidence model findings", () => {
    const candidateText =
      "Inside the glass shell, the brass clapper hung ready.";
    const evidence = selectSlateProposalContinuityEvidence({
      sections,
      focusedSectionId: "scene-3",
      candidateText,
    });
    const result = validateSlateProposalContinuityAudit({
      raw: JSON.stringify({
        conflicts: [
          {
            summary: "Unsupported",
            explanation: "The quote was invented.",
            acceptedQuote: "The bell exploded.",
            proposalQuote: "the brass clapper hung ready",
            confidence: 0.99,
          },
          {
            summary: "Too uncertain",
            explanation: "This might be inconsistent.",
            acceptedQuote: "The bell's clapper had been removed.",
            proposalQuote: "the brass clapper hung ready",
            confidence: 0.7,
          },
        ],
      }),
      candidateText,
      evidence,
      provider: "openai",
      model: "test",
    });
    assert.equal(result.status, "clear");
    assert.deepEqual(result.conflicts, []);
  });

  it("keeps accepted same-section context outside an exact passage replacement", () => {
    const focusedProse =
      "Mara sealed the only door and put the iron key in her pocket.\n\nShe considered turning back.\n\nBeyond the replacement, the door remained sealed.";
    const replacementStart = focusedProse.indexOf("She considered");
    const replacementEnd =
      replacementStart + "She considered turning back.".length;
    const evidence = selectSlateProposalContinuityEvidence({
      sections: [
        {
          id: "focused-scene",
          title: "The Locked Room",
          ordinal: 0,
          revision: 4,
          prose: focusedProse,
        },
      ],
      focusedSectionId: "focused-scene",
      focusedReplacementRange: {
        start: replacementStart,
        end: replacementEnd,
      },
      candidateText:
        "The door stood open, and Mara realized the key was gone.",
    });
    assert.ok(evidence.length > 0);
    assert.ok(evidence.every((item) => item.sectionId === "focused-scene"));
    assert.ok(
      evidence.some((item) => /sealed the only door/iu.test(item.quote)),
    );
    assert.ok(
      evidence.every(
        (item) =>
          item.end <= replacementStart || item.start >= replacementEnd,
      ),
    );
  });

  it("accepts only exact, high-confidence conflict evidence", async () => {
    const provider = {
      name: "openai",
      diagnosticModel: "test-auditor",
      async generateResponse() {
        return JSON.stringify({
          conflicts: [
            {
              summary: "Removed clapper reappears without explanation",
              explanation:
                "Accepted prose removes and seals the clapper, while the proposal hangs it inside again.",
              acceptedQuote: "The bell's clapper had been removed.",
              proposalQuote: "the brass clapper hung ready",
              confidence: 0.99,
            },
          ],
        });
      },
    } as unknown as LlmProvider;
    const candidateText =
      "Inside the glass shell, the brass clapper hung ready. Mara pulled its cord.";
    const evidence = selectSlateProposalContinuityEvidence({
      sections,
      focusedSectionId: "scene-3",
      candidateText,
    });
    const result = await auditSlateProposalContinuity({
      provider,
      model: "test",
      candidateKind: "composer_proposal",
      candidateText,
      evidence,
    });
    assert.equal(result.status, "conflict");
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0]?.evidence.sectionId, "scene-1");
  });
});
