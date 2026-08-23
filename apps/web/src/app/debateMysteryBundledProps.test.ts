import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEBATE_MYSTERY_BUNDLED_PROP_ASSETS,
  debateMysteryBundledEvidenceAssetPath,
  debateMysteryBundledInventoryAssetPath,
  debateMysteryBundledLockTargetAssetPath,
} from "./debateMysteryBundledProps.ts";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));
const publicDirectory = path.resolve(appDirectory, "../../public");

function webpDimensions(file: Buffer): { width: number; height: number } {
  for (let offset = 12; offset + 18 <= file.length;) {
    const tag = file.toString("ascii", offset, offset + 4);
    const size = file.readUInt32LE(offset + 4);
    if (tag === "VP8 ") {
      return {
        width: file.readUInt16LE(offset + 14) & 0x3fff,
        height: file.readUInt16LE(offset + 16) & 0x3fff,
      };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error("Expected a lossy VP8 WebP frame");
}

describe("bundled Whodunnit prop art", () => {
  it("ships a compact square alpha asset for every manifest entry", () => {
    const assets = Object.values(DEBATE_MYSTERY_BUNDLED_PROP_ASSETS);
    assert.equal(assets.length, 24);
    let totalBytes = 0;
    for (const assetPath of assets) {
      const filePath = path.join(publicDirectory, assetPath.replace(/^\//u, ""));
      const file = readFileSync(filePath);
      totalBytes += statSync(filePath).size;
      assert.deepEqual(webpDimensions(file), { width: 512, height: 512 }, assetPath);
      assert.ok(file.indexOf(Buffer.from("ALPH")) >= 0, `${assetPath} should retain alpha`);
    }
    assert.ok(totalBytes < 750_000, `bundled prop pack is unexpectedly large: ${totalBytes}`);
  });

  it("maps authored evidence and access items without title-string guesswork", () => {
    assert.equal(
      debateMysteryBundledEvidenceAssetPath({
        id: "evidence-locked-jewelry-box",
        object: "jewelry box",
        title: "Locked jewelry box",
      }),
      "/debate/mystery/evidence/locked-jewelry-box.webp",
    );
    assert.equal(
      debateMysteryBundledEvidenceAssetPath({
        id: "evidence-heirloom-jewels",
        object: "jewels",
        title: "Heirloom jewels",
      }),
      "/debate/mystery/evidence/opened-jewelry-box-heirlooms.webp",
    );
    assert.equal(
      debateMysteryBundledInventoryAssetPath({
        id: "access-safe-code",
        title: "Safe code",
      }),
      "/debate/mystery/evidence/safe-code.webp",
    );
  });

  it("covers every randomized weapon and clue object, then fails soft to neutral art", () => {
    const expected = new Map([
      ["an unknown poison", "unknown-poison"],
      ["a marble paperweight", "marble-paperweight"],
      ["a heavy decanter", "heavy-decanter"],
      ["a fireplace poker", "fireplace-poker"],
      ["a brass letter opener", "brass-letter-opener"],
      ["a revolver", "revolver"],
      ["a hunting knife", "hunting-knife"],
      ["a ceremonial dagger", "ceremonial-dagger"],
      ["a length of lead pipe", "lead-pipe"],
      ["receipt", "creased-receipt"],
      ["key", "silver-key"],
      ["thread", "frayed-thread"],
      ["glass", "stained-glass"],
      ["pocket watch", "stopped-pocket-watch"],
      ["letter", "scorched-letter"],
    ]);
    for (const [object, asset] of expected) {
      assert.equal(
        debateMysteryBundledEvidenceAssetPath({ id: `test-${asset}`, object, title: object }),
        `/debate/mystery/evidence/${asset}.webp`,
      );
    }
    assert.equal(
      debateMysteryBundledEvidenceAssetPath({ id: "future", object: "unseen thing", title: "Unseen thing" }),
      "/debate/mystery/evidence/unidentified-evidence.webp",
    );
  });

  it("uses the safe states only for safe lock targets", () => {
    assert.equal(
      debateMysteryBundledLockTargetAssetPath("concealed safe"),
      "/debate/mystery/evidence/concealed-safe-closed.webp",
    );
    assert.equal(
      debateMysteryBundledLockTargetAssetPath("concealed safe", true),
      "/debate/mystery/evidence/concealed-safe-open.webp",
    );
    assert.equal(debateMysteryBundledLockTargetAssetPath("private room"), null);
  });
});
