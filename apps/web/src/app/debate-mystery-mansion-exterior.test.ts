import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";

import {
  DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1,
  debateMysteryMansionExteriorFallbackV1,
} from "./debateMysteryMansionExterior.ts";

describe("mansion exterior presentation", () => {
  it("ships every palette and scale family as a substantive bundled cover", () => {
    for (const family of Object.values(DEBATE_MYSTERY_MANSION_EXTERIOR_PATHS_V1)) {
      for (const [scaleClass, path] of Object.entries(family)) {
        assert.match(path, /^\/debate\/mystery\/exteriors\//u);
        assert.match(path, new RegExp(`-${scaleClass}-v1\\.webp$`, "u"));
        assert.ok(
          statSync(new URL(`../../public${path}`, import.meta.url)).size > 100_000,
          `${path} should contain reviewed cover art`,
        );
      }
    }
  });

  it("matches the mansion geography and keeps PRISM House as the neutral default", () => {
    assert.equal(
      debateMysteryMansionExteriorFallbackV1({ label: "Gothic old house" }, "compact"),
      "/debate/mystery/exteriors/gothic-old-house-compact-v1.webp",
    );
    assert.equal(
      debateMysteryMansionExteriorFallbackV1({ label: "Orbital observatory" }, "standard"),
      "/debate/mystery/exteriors/spacecraft-industrial-standard-v1.webp",
    );
    assert.equal(
      debateMysteryMansionExteriorFallbackV1({ label: "Jungle expedition" }, "grand"),
      "/debate/mystery/exteriors/jungle-wilderness-grand-v1.webp",
    );
    assert.equal(
      debateMysteryMansionExteriorFallbackV1({ label: "PRISM House" }, "standard"),
      "/debate/mystery/exteriors/prism-house-standard-v1.webp",
    );
  });

  it("presents the accepted exterior as the dominant Case Forge surface", () => {
    const experience = readFileSync(
      new URL("./DebateMysteryV2Experience.tsx", import.meta.url),
      "utf8",
    );
    const styles = readFileSync(new URL("./debateMysteryV2.module.css", import.meta.url), "utf8");
    assert.match(experience, /data-exterior-hero="true"/u);
    assert.match(experience, /debateMysteryMansionExteriorFallbackV1\(state\.config\.houseStyle, state\.config\.scaleClass\)/u);
    assert.match(experience, /sealedMysteryAssetApiUrl\([\s\S]*?DEBATE_MYSTERY_MANSION_EXTERIOR_SUBJECT_ID_V1/u);
    assert.match(styles, /\.forgeCard\[data-exterior-hero="true"\][\s\S]*?--forge-exterior-image/u);
  });
});
