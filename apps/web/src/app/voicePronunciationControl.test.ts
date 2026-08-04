import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { LOCAL_VOICE_SPEECHPRINT_CAPABILITIES } from "@localai/shared";

const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const atlasSource = readFileSync(
  new URL("./PronunciationAtlas.tsx", import.meta.url),
  "utf8",
);
const atlasCssSource = readFileSync(
  new URL("./PronunciationAtlas.module.css", import.meta.url),
  "utf8",
);
const atlasRaster = new URL(
  "../../public/voice/pronunciation-atlas-earth-v1.png",
  import.meta.url,
);

describe("cross-accent local voice pronunciation controls", () => {
  it("uses the Foundry adjustment console for bots and Default PRISM", () => {
    assert.match(pageSource, /value: "pronunciation", label: "Accent"/u);
    assert.match(pageSource, /<PronunciationAtlas/u);
    assert.match(pageSource, /data-bot-pronunciation-atlas-summary="true"/u);
  });

  it("offers the same control for the Zen player voice", () => {
    assert.match(pageSource, /label="Zen Pronunciation Atlas"/u);
    assert.match(pageSource, /playerAudioVoiceProfile: nextProfile/u);
  });

  it("compares the authored source against the current phoneme stack", () => {
    assert.match(pageSource, /pronunciationBase: "follow-voice"/u);
    assert.match(atlasSource, />\s*Source\s*</u);
    assert.match(atlasSource, />\s*Current\s*</u);
  });

  it("offers Russian-influenced English through the shared Speechprint catalog", () => {
    assert.equal(
      LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.find(
        (capability) => capability.id === "russian-influenced-english",
      )?.label,
      "Russian-influenced English",
    );
    assert.match(atlasSource, /LOCAL_VOICE_SPEECHPRINT_CAPABILITIES\.map/u);
  });

  it("offers Italian, Australian, and Canadian pronunciation without map nodes", () => {
    for (const id of [
      "italian-influenced-english",
      "australian-english",
      "canadian-english",
    ]) {
      assert.ok(
        LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.some(
          (capability) => capability.id === id,
        ),
      );
    }
    assert.doesNotMatch(atlasSource, /PRONUNCIATION_ATLAS_ANCHORS\.map/u);
    assert.doesNotMatch(atlasCssSource, /\.anchor\b/u);
  });

  it("uses the generated Earth raster instead of procedural land polygons", () => {
    assert.doesNotMatch(atlasSource, /<path d=/u);
    assert.match(
      atlasCssSource,
      /url\("\/voice\/pronunciation-atlas-earth-v1\.png"\)/u,
    );
    assert.equal(existsSync(atlasRaster), true);
    const rasterBytes = readFileSync(atlasRaster);
    const rasterWidth = rasterBytes.readUInt32BE(16);
    const rasterHeight = rasterBytes.readUInt32BE(20);
    assert.equal(rasterWidth, rasterHeight * 2);
    assert.equal(rasterBytes[25], 6, "atlas raster should retain RGBA alpha");
  });
});
