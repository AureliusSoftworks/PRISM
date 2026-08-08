import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const archiveModalSource = readFileSync(
  fileURLToPath(new URL("./DebateArchiveAssetsModal.tsx", import.meta.url)),
  "utf8",
);
const magentaSource = readFileSync(
  fileURLToPath(new URL("./DebateExhibitMagentaControls.tsx", import.meta.url)),
  "utf8",
);
const debateSource = readFileSync(
  fileURLToPath(new URL("./DebateExperience.tsx", import.meta.url)),
  "utf8",
);

describe("Debate archive Assets panel", () => {
  it("wires Archive Assets, soft re-synth, and magenta cleanup controls", () => {
    assert.match(archiveModalSource, /archiveAssetSynthSpinner/u);
    assert.match(archiveModalSource, /synthesizingExhibitIds/u);
    assert.match(archiveModalSource, /archiveExhibitBusyKey/u);
    assert.match(
      archiveModalSource,
      /hasSprite \? "Re-synthesize" : "Synthesize"/u,
    );
    assert.match(
      debateSource,
      /archiveExhibitBusyKey\(\s*session\.id,\s*exhibit\.id\s*\)/u,
    );
    assert.doesNotMatch(archiveModalSource, /Synthesizing…/u);
    assert.match(archiveModalSource, /kind: "magic"/u);
    assert.match(archiveModalSource, /DebateExhibitMagentaControls/u);
    assert.match(archiveModalSource, /data-tutorial-target="debate-archive-assets"/u);
    assert.match(magentaSource, /Reduce magenta/u);
    assert.match(magentaSource, /\/api\/assets\/.*magenta-pass/u);
    assert.match(magentaSource, /\/api\/assets\/for-image\//u);
    assert.match(debateSource, />\s*Assets\s*</u);
    assert.match(debateSource, /session\.exhibitCount/u);
    assert.match(debateSource, /synthesizeArchiveExhibitImage/u);
    assert.match(
      debateSource,
      /DebateExhibitMagentaControls[\s\S]*evidenceObjectDraft\.imageId/u,
    );
  });
});
