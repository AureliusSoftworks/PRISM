import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const helperSource = readFileSync(
  new URL("./revealSynthesizedAssetInFinder.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const debateSource = readFileSync(
  new URL("./DebateExperience.tsx", import.meta.url),
  "utf8",
);
const signalSource = readFileSync(
  new URL("./BotcastExperience.tsx", import.meta.url),
  "utf8",
);
const coffeeSource = readFileSync(
  new URL("./CoffeeGroupIdentitySection.tsx", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../../../api/src/server.ts", import.meta.url),
  "utf8",
);

describe("reveal synthesized asset in Finder", () => {
  it("gates the helper and API route to the exact dev branch", () => {
    assert.match(
      helperSource,
      /REVEAL_SYNTHESIZED_ASSET_IN_FINDER_ENABLED = prismBranchIsDev\(\s*process\.env\.NEXT_PUBLIC_PRISM_BRANCH/u,
    );
    assert.match(
      helperSource,
      /label:\s*"Reveal in Finder"/u,
    );
    assert.match(helperSource, /feedback:\s*"Shown in Finder"/u);
    assert.match(helperSource, /body:\s*"\{\}"/u);
    assert.match(helperSource, /window\.alert\(message\)/u);
    assert.match(
      serverSource,
      /route\("POST", "\/api\/images\/:id\/reveal-in-finder"/u,
    );
    assert.match(
      serverSource,
      /if \(!prismBranchIsDev\(\)\) \{\s*throw new HttpError\(404, "Not found\."\);/u,
    );
    assert.match(
      serverSource,
      /Only synthesized assets can be revealed/u,
    );
    assert.match(serverSource, /revealLocalFileInFolder\(absolutePath\)/u);
    assert.doesNotMatch(serverSource, /absolutePath.*json\(/u);
  });

  it("wires right-click chrome across Debate, Signal, Images, and Coffee", () => {
    assert.match(
      debateSource,
      /onRevealSynthesizedAssetContextMenu\(\s*event,\s*asset\.id/u,
    );
    assert.match(
      signalSource,
      /onRevealSynthesizedAssetContextMenu\(\s*event,\s*asset\.id/u,
    );
    assert.match(
      pageSource,
      /img\.hasLocalFile &&\s*img\.provider !== "upload"[\s\S]{0,200}onRevealSynthesizedAssetContextMenu/u,
    );
    assert.match(
      coffeeSource,
      /onRevealSynthesizedAssetContextMenu\(\s*event,\s*atmosphere\.imageId/u,
    );
  });
});
