import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  WHODUNNIT_LEGACY_EXTRA_PROP_FALLBACKS_V1,
  WHODUNNIT_NEUTRAL_EVIDENCE_FALLBACK_V1,
  WHODUNNIT_PROP_ARCHETYPE_IDS_V1,
  WHODUNNIT_PROP_ARCHETYPES_V1,
  inferWhodunnitPropArchetypeV1,
  isWhodunnitPropArchetypeIdV1,
} from "./whodunnitProps.ts";

const EXPECTED_IDS = [
  "key",
  "code",
  "remote",
  "container",
  "valuables",
  "ledger",
  "receipt",
  "letter",
  "timepiece",
  "fiber",
  "fragment",
  "toxin",
  "firearm",
  "blade",
  "blunt_object",
  "long_implement",
] as const;

function bundledBytes(publicPath: string): Buffer {
  return readFileSync(new URL(
    `../../../apps/web/public${publicPath}`,
    import.meta.url,
  ));
}

test("Whodunnit prop registry freezes exactly 16 stable functional IDs", () => {
  assert.deepEqual(WHODUNNIT_PROP_ARCHETYPE_IDS_V1, EXPECTED_IDS);
  assert.deepEqual(Object.keys(WHODUNNIT_PROP_ARCHETYPES_V1), EXPECTED_IDS);
  assert.equal(new Set(WHODUNNIT_PROP_ARCHETYPE_IDS_V1).size, 16);
  assert.equal(isWhodunnitPropArchetypeIdV1("blade"), true);
  assert.equal(isWhodunnitPropArchetypeIdV1("unidentified_evidence"), false);
});

test("every archetype has a distinct bundled square alpha WebP fallback", () => {
  const paths = Object.values(WHODUNNIT_PROP_ARCHETYPES_V1).map(
    (entry) => entry.prismFallback.publicPath,
  );
  assert.equal(new Set(paths).size, 16);
  for (const path of paths) {
    const bytes = bundledBytes(path);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF", path);
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WEBP", path);
    assert.ok(bytes.indexOf(Buffer.from("ALPH")) >= 0, `${path} must retain alpha`);
    const entry = Object.values(WHODUNNIT_PROP_ARCHETYPES_V1).find(
      (candidate) => candidate.prismFallback.publicPath === path,
    )!;
    assert.match(entry.prismFallback.contentSha256, /^[a-f0-9]{64}$/u);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      entry.prismFallback.contentSha256,
      path,
    );
  }
});

test("neutral and extra legacy rasters stay outside the 16-archetype count", () => {
  assert.equal(
    Object.values(WHODUNNIT_PROP_ARCHETYPES_V1).some(
      (entry) => entry.prismFallback.assetKey === WHODUNNIT_NEUTRAL_EVIDENCE_FALLBACK_V1.assetKey,
    ),
    false,
  );
  assert.deepEqual(WHODUNNIT_LEGACY_EXTRA_PROP_FALLBACKS_V1, {
    "brass-letter-opener": "blade",
    "ceremonial-dagger": "blade",
    "concealed-safe-closed": "container",
    "concealed-safe-open": "container",
    "delicate-gold-key": "key",
    "heavy-decanter": "blunt_object",
    "lead-pipe": "long_implement",
  });
  bundledBytes(WHODUNNIT_NEUTRAL_EVIDENCE_FALLBACK_V1.publicPath);
});

test("legacy case labels map deterministically into functional archetypes", () => {
  const fixtures = [
    ["Creased receipt", "receipt"],
    ["Silver key", "key"],
    ["Garage remote", "remote"],
    ["Safe code", "code"],
    ["Frayed thread", "fiber"],
    ["Stained glass fragment", "fragment"],
    ["Stopped pocket watch", "timepiece"],
    ["Scorched letter", "letter"],
    ["Unknown poison", "toxin"],
    ["Revolver", "firearm"],
    ["Ceremonial dagger", "blade"],
    ["Brass letter opener", "blade"],
    ["Old Iron Claymore", "blade"],
    ["Red Lightsaber", "blade"],
    ["Rick's Portal Gun", "key"],
    ["Marble paperweight", "blunt_object"],
    ["Heavy decanter", "blunt_object"],
    ["Fireplace poker", "long_implement"],
    ["Length of lead pipe", "long_implement"],
    ["Private ledger", "ledger"],
    ["Heirloom jewels", "valuables"],
    ["Locked jewelry box", "container"],
  ] as const;
  for (const [label, expected] of fixtures) {
    assert.equal(inferWhodunnitPropArchetypeV1(label, true), expected, label);
  }
  assert.equal(inferWhodunnitPropArchetypeV1("Unidentified evidence"), null);
});
