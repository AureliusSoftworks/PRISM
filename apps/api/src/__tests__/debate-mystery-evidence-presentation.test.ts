import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bindMysteryIncidentPlanV1,
  compileDeterministicDebateMystery,
  composeMysteryIncidentPlanV1,
  resolveDebateMysteryConfig,
} from "@localai/shared";
import {
  appendDistinctMysteryEvidenceFactV1,
  frozenEvidencePresentationIssueV1,
  restoreFrozenMysteryEvidenceDraftV1,
} from "../debate-mystery-evidence-presentation.ts";
import {
  assertMysteryObservationCopyV2,
  authoredFoundationCoreFromJson,
  applyMysteryIncidentPlanToFoundationV2,
  deterministicAuthoredMysteryExaminationsV2,
} from "../debate-mystery-v2.ts";

const keyBinding = {
  version: 1 as const,
  archetypeId: "key" as const,
  chosenIdentity: {
    displayName: "Silver Key",
    appearanceDescription: "A plain silver key recovered for examination.",
  },
  capabilitySnapshot: { whatItDoes: "Opens a lock.", capabilities: [], limitations: [] },
  visualSource: "prism" as const,
  contentSha256: "a".repeat(64),
  presentationEmoji: "🗝️",
};

const observation = `${keyBinding.chosenIdentity.appearanceDescription} The Silver Key fits the locked drawer from which the register vanished.`;
const presentation = [{
  id: "key",
  physicalSubject: "Silver Key",
  observation,
  identity: "Silver Key",
  appearanceDescription: keyBinding.chosenIdentity.appearanceDescription,
  emoji: "🗝️",
}];
const evidence = [{ id: "key", title: "Silver Key", emoji: "🗝️", description: observation }];
const wrongBody = `${keyBinding.chosenIdentity.appearanceDescription} A replacement register page places the purser’s last round later than adjacent entries.`;

function issue(description: string) {
  return frozenEvidencePresentationIssueV1({
    evidence: [{ ...evidence[0]!, description }],
    bindingsByEvidenceId: { key: keyBinding },
    presentation,
  });
}

const incidentPlan = bindMysteryIncidentPlanV1({
  plan: composeMysteryIncidentPlanV1({ spark: "A stolen register and fraud", difficulty: "classic", nonce: "evidence-contract" }),
  principalSeatId: "suspect-1", accompliceSeatId: "suspect-2",
});
const core = {
  title: "The Empty Purser's Drawer", victimName: "Mara Finch",
  victimDescription: "The purser whose register has vanished.",
  publicOpening: "I need to examine the empty drawer in the office.",
  motive: "Conceal an altered passenger account.", method: "The register was removed from a locked drawer.",
  prosecutorInternalReasoning: "I need to compare the drawer and the recovered key.",
  eyewitnessResolution: null, evidence,
};

describe("Whodunnit frozen evidence presentation", () => {
  it("enforces the complete observation in the foundation validator shared by initial authoring and repair", () => {
    const args = {
      value: core, evidenceIds: ["key"], incidentPlan,
      evidencePropBindingsById: { key: keyBinding }, evidencePresentation: presentation,
    };
    assert.deepEqual(authoredFoundationCoreFromJson(args).evidence, evidence);
    assert.throws(() => authoredFoundationCoreFromJson({
      ...args, value: { ...core, evidence: [{ ...evidence[0]!, description: wrongBody }] },
    }), /frozen physical presentation/u);
  });

  it("applies incident facts once across repeated foundation and finalization passes", () => {
    const scaffold = compileDeterministicDebateMystery({
      config: resolveDebateMysteryConfig({
        version: 1, preset: "compact", difficulty: "classic", artMode: "bundled",
        inspiration: "A missing register", nonce: "evidence-contract",
        suspectBotIds: ["bot-1", "bot-2", "bot-3", "bot-4"],
        prosecutorPartnerBotId: "bot-5", rivalDefenseBotId: "bot-6",
      }),
      suspects: [1, 2, 3, 4].map((index) => ({
        botId: `bot-${index}`, exportHash: `export-${index}`, name: `Actor ${index}`,
        color: null, glyph: null,
      })),
    });
    const first = applyMysteryIncidentPlanToFoundationV2({ foundation: core, incidentPlan, scaffold });
    const second = applyMysteryIncidentPlanToFoundationV2({ foundation: first, incidentPlan, scaffold });
    const third = applyMysteryIncidentPlanToFoundationV2({ foundation: second, incidentPlan, scaffold });
    assert.ok(incidentPlan.complications.length > 0);
    assert.deepEqual(second, first);
    assert.deepEqual(third, first);
    assert.equal(first.evidence[0]!.description.split(incidentPlan.complications[0]!.sealedTruth).length, 2);
  });
  it("rejects a retitled key whose record still describes a register", () => {
    const issue = frozenEvidencePresentationIssueV1({
      evidence: [{
        id: "key", title: "Silver Key", emoji: "🗝️",
        description: "A bridge security register records a visitor at midnight.",
      }],
      bindingsByEvidenceId: { key: keyBinding },
      presentation,
    });
    assert.match(issue ?? "", /frozen physical presentation/u);
  });

  it("rejects the original mismatch even with the exact key appearance prepended", () => {
    assert.match(issue(wrongBody) ?? "", /frozen physical presentation/u);
    assert.match(issue(`${observation} ${wrongBody}`) ?? "", /frozen physical presentation/u);
  });

  it("accepts a key's frozen relationship to the missing register without banning other objects", () => {
    assert.equal(issue(observation), null);
    assert.equal(issue(observation.replaceAll(" ", "\n ")), null);
  });

  it("rejects drift in the frozen physical subject, identity, glyph, and evidence membership", () => {
    const args = { evidence, presentation, bindingsByEvidenceId: { key: keyBinding } };
    for (const patch of [{ physicalSubject: "register" }, { identity: "Register" }, { emoji: "📋" }]) {
      assert.ok(frozenEvidencePresentationIssueV1({
        ...args, presentation: [{ ...presentation[0]!, ...patch }],
      }));
    }
    assert.ok(frozenEvidencePresentationIssueV1({ ...args, evidence: [] }));
    assert.ok(frozenEvidencePresentationIssueV1({ ...args, evidence: [evidence[0]!, evidence[0]!] }));
  });

  for (const cachedSection of ["foundation", "foundationCore"] as const) {
    it(`restores a mismatched ${cachedSection} before reusing examinations or Court drafts`, () => {
      const core = { evidence: structuredClone(evidence) };
      const stale = { evidence: [{ ...evidence[0]!, description: wrongBody }] };
      const draft = {
        foundation: cachedSection === "foundation"
          ? { ...stale, examinations: [{ id: "room:desk", text: wrongBody }] }
          : null,
        foundationCore: cachedSection === "foundationCore" ? stale : core,
        examinationsById: { "room:desk": wrongBody, "room:wall": "A bare wall." },
        suspectsBySeatId: { witness: { testimony: wrongBody } },
        prosecutionChoicesByWitnessSeatId: { witness: [wrongBody] },
        prosecutionChoices: [wrongBody],
        connectiveAdditions: { witness: { bridge: wrongBody } },
        provenanceBySection: { foundation: { approved: true } },
        recoveryBySection: { "examinations:1": { attemptCount: 3 } },
        contextCapsule: { sourceHash: "frozen-voices" },
        evidencePropBindingsById: { key: keyBinding },
      };
      const args = {
        draft,
        foundationCore: core,
        consequentialExaminationIds: ["room:desk"],
        bindingsByEvidenceId: { key: keyBinding },
        presentation,
      };
      assert.equal(restoreFrozenMysteryEvidenceDraftV1(args), true);
      assert.equal(draft.foundation, null);
      assert.deepEqual(draft.foundationCore, core);
      assert.deepEqual(draft.examinationsById, { "room:wall": "A bare wall." });
      assert.deepEqual(draft.suspectsBySeatId, {});
      assert.deepEqual(draft.prosecutionChoicesByWitnessSeatId, {});
      assert.equal(draft.prosecutionChoices, null);
      assert.deepEqual(draft.connectiveAdditions, {});
      assert.deepEqual(draft.provenanceBySection, {});
      assert.deepEqual(draft.recoveryBySection, {});
      assert.deepEqual(draft.contextCapsule, { sourceHash: "frozen-voices" });
      assert.deepEqual(draft.evidencePropBindingsById, { key: keyBinding });

      const correctedRecord = draft.foundationCore!.evidence[0]!;
      const targets = [{
        id: "room:desk", outcome: "consequential" as const,
        room: { id: "room", name: "Office", mansionAnchors: [] },
        hotspot: { id: "desk", label: "Desk", physicalAnchor: "desk" },
        requiredPublicFacts: [correctedRecord.title, correctedRecord.description],
      }];
      const rebuilt = deterministicAuthoredMysteryExaminationsV2({
        examinationIds: ["room:desk"], targets,
        persona: { name: "Investigator", frozenVoiceCues: ["quiet"], sourceHash: "voice" },
      });
      assert.doesNotThrow(() => assertMysteryObservationCopyV2({ entries: rebuilt, targets }));
      assert.match(rebuilt[0]!.text, /fits the locked drawer/u);
      assert.doesNotMatch(rebuilt[0]!.text, /replacement register page|purser’s last round/u);
      assert.throws(() => assertMysteryObservationCopyV2({
        entries: [{ id: "room:desk", text: wrongBody }], targets,
      }), /omitted a frozen public fact/u);
      const after = structuredClone(draft);
      assert.equal(restoreFrozenMysteryEvidenceDraftV1(args), false);
      assert.deepEqual(draft, after, "the repaired checkpoint is stable on another resume");
    });
  }

  it("keeps relevance normalization idempotent while retaining distinct facts", () => {
    const first = appendDistinctMysteryEvidenceFactV1(
      "The key was found beneath the desk.",
      "Its condition connects it to the missing register.",
    );
    const second = appendDistinctMysteryEvidenceFactV1(
      first,
      "Its condition connects it to the missing register.",
    );
    assert.equal(second, first);
    assert.match(second, /beneath the desk/u);
  });
});
