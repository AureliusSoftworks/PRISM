import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyWhodunnitPropBindingsToScaffoldV1,
  selectWhodunnitEvidencePropBindingsV1,
  type WhodunnitPersonalPropCandidateV1,
} from "../debate-mystery-prop-selection.ts";

function personal(
  overrides: Partial<WhodunnitPersonalPropCandidateV1> = {},
): WhodunnitPersonalPropCandidateV1 {
  return {
    assetSetId: "set-key",
    imageId: "image-key",
    assetKind: "item",
    localRelPath: "generated-images/user/item.png",
    exactIdentity: "Rick's Portal Gun",
    whatItDoes: "Opens a portal that grants access between two places.",
    primaryArchetype: "key",
    capabilities: [{ id: "opens_portals", description: "Opens a traversable portal." }],
    limitations: ["Needs a stable destination."],
    settingTags: ["research station"],
    genreTags: ["science fiction"],
    confidence: 0.97,
    contentSha256: "a".repeat(64),
    createdAt: "2026-08-30T00:00:00.000Z",
    ...overrides,
  };
}

const keyNeed = {
  evidenceId: "evidence-key",
  title: "Silvered key",
  object: "key",
  observation: "The key was recovered beneath the console.",
  isCanonicalWeapon: false,
};

describe("Whodunnit prop binding selection", () => {
  it("rejects a portal gun from a grounded lakeside cabin", () => {
    const selected = selectWhodunnitEvidencePropBindingsV1({
      needs: [keyNeed],
      setting: "A grounded contemporary lakeside cabin with no speculative technology.",
      personalEnabled: true,
      personalCandidates: [personal()],
      mansionVariants: [],
    });
    assert.equal(selected.bindingsByEvidenceId[keyNeed.evidenceId]?.visualSource, "prism");
  });

  it("accepts a portal gun as a key in a compatible science-fiction setting", () => {
    const selected = selectWhodunnitEvidencePropBindingsV1({
      needs: [keyNeed],
      setting: "A science fiction portal research station in deep space.",
      personalEnabled: true,
      personalCandidates: [personal()],
      mansionVariants: [],
    });
    const binding = selected.bindingsByEvidenceId[keyNeed.evidenceId];
    assert.equal(binding?.archetypeId, "key");
    assert.equal(binding?.chosenIdentity.displayName, "Rick's Portal Gun");
    assert.equal(binding?.visualSource, "asset_library");
  });

  it("accepts a lightsaber as a blade and caps distinct personal substitutions at two", () => {
    const needs = [
      keyNeed,
      { evidenceId: "blade", title: "Hunting knife", object: "hunting knife", observation: "The hunting knife was recovered.", isCanonicalWeapon: true },
      { evidenceId: "receipt", title: "Creased receipt", object: "receipt", observation: "The receipt records a purchase.", isCanonicalWeapon: false },
    ];
    const selected = selectWhodunnitEvidencePropBindingsV1({
      needs,
      setting: "A science fiction portal research station in deep space.",
      personalEnabled: true,
      personalCandidates: [
        personal(),
        personal({ assetSetId: "set-blade", imageId: "image-blade", exactIdentity: "Red Lightsaber", whatItDoes: "Cuts and pierces with an energy blade.", primaryArchetype: "blade", capabilities: [{ id: "cuts", description: "Cuts through solid material." }] }),
        personal({ assetSetId: "set-receipt", imageId: "image-receipt", exactIdentity: "Orbital Dock Receipt", whatItDoes: "Documents a purchase and timestamp.", primaryArchetype: "receipt", capabilities: [{ id: "documents_purchase", description: "Records a purchase." }], genreTags: ["science fiction"] }),
      ],
      mansionVariants: [],
    });
    assert.equal(selected.bindingsByEvidenceId.blade?.archetypeId, "blade");
    assert.equal(selected.bindingsByEvidenceId.blade?.chosenIdentity.displayName, "Red Lightsaber");
    assert.equal(Object.keys(selected.privatePersonalSourceByEvidenceId).length, 2);
    assert.equal(selected.bindingsByEvidenceId.receipt?.visualSource, "prism");
  });

  it("uses a complete mansion variant before the PRISM fallback", () => {
    const selected = selectWhodunnitEvidencePropBindingsV1({
      needs: [keyNeed],
      setting: "A science fiction observatory.",
      personalEnabled: false,
      personalCandidates: [],
      mansionVariants: [{
        archetypeId: "key",
        displayName: "Holocard Key",
        appearanceDescription: "A brass-edged astronomical access card.",
        packageAssetId: "theme-key",
        contentSha256: "b".repeat(64),
      }],
    });
    assert.equal(selected.bindingsByEvidenceId[keyNeed.evidenceId]?.chosenIdentity.displayName, "Holocard Key");
    assert.equal(selected.bindingsByEvidenceId[keyNeed.evidenceId]?.visualSource, "mansion");
  });

  it("keeps canonical weapon truth validator-consistent when binding a prop identity", () => {
    const selected = selectWhodunnitEvidencePropBindingsV1({
      needs: [{ evidenceId: "weapon", title: "Hunting knife", object: "hunting knife", observation: "The hunting knife was hidden beneath the desk.", isCanonicalWeapon: true }],
      setting: "A science fiction station.",
      personalEnabled: true,
      personalCandidates: [personal({ assetSetId: "set-blade", imageId: "image-blade", exactIdentity: "Red Lightsaber", whatItDoes: "Cuts and pierces with an energy blade.", primaryArchetype: "blade", capabilities: [{ id: "cuts", description: "Cuts through solid material." }] })],
      mansionVariants: [],
    });
    const rebound = applyWhodunnitPropBindingsToScaffoldV1({
      method: "a fatal blow from a hunting knife",
      publicOpening: "The first report names a hunting knife as the weapon.",
      weapon: { descriptor: "hunting knife" },
      evidence: [{ id: "weapon", adjective: "recovered", object: "hunting knife", title: "Recovered hunting knife", observation: "The hunting knife was hidden beneath the desk.", keywords: ["knife"], isCanonicalWeapon: true }],
    }, selected.bindingsByEvidenceId);
    assert.equal(rebound.evidence[0]?.title, "Red Lightsaber");
    assert.match(rebound.evidence[0]?.observation ?? "", /It cuts and pierces/u);
    assert.equal(rebound.method, "a fatal blow from a Red Lightsaber");
    assert.equal(rebound.publicOpening, "The first report names a Red Lightsaber as the weapon.");
    assert.equal(rebound.weapon.descriptor, "Red Lightsaber");
    assert.equal(
      rebound.evidence.find((item) => item.isCanonicalWeapon)?.object,
      rebound.weapon.descriptor,
    );
  });
});
