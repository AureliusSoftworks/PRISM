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
const atlasMap = new URL(
  "../../public/voice/pronunciation-atlas-earth-equirectangular-v2.svg",
  import.meta.url,
);

describe("cross-accent local voice pronunciation controls", () => {
  it("uses the Foundry adjustment console for bots and Default PRISM", () => {
    assert.match(pageSource, /value: "pronunciation", label: "1 Accent"/u);
    assert.match(pageSource, /value: "local", label: "2 Local"/u);
    assert.match(pageSource, /value: "premium", label: "3 Premium"/u);
    assert.match(pageSource, /data-bot-voice-local-stage="true"/u);
    assert.match(pageSource, /data-bot-voice-premium-stage="true"/u);
    assert.match(pageSource, /data-bot-voice-identity-stage=/u);
    assert.match(pageSource, /<PronunciationAtlas/u);
    assert.match(pageSource, /data-adjustment-target=/u);
    assert.match(atlasSource, /label = "Accent map"/u);
    assert.doesNotMatch(
      pageSource,
      /activeAdjustmentTarget === "pronunciation" \? null : activeAdjustmentOptions/,
    );
  });

  it("offers the same control for the Zen player voice", () => {
    assert.match(pageSource, /label="Zen accent map"/u);
    assert.match(pageSource, /playerAudioVoiceProfile: nextProfile/u);
  });

  it("compares the authored source against the current phoneme stack", () => {
    assert.match(pageSource, /pronunciationBase: "follow-voice"/u);
    assert.match(atlasSource, />\s*Original\s*</u);
    assert.match(atlasSource, />\s*With accent\s*</u);
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

  it("offers international and regional American pronunciation without map nodes", () => {
    for (const id of [
      "italian-influenced-english",
      "australian-english",
      "canadian-english",
      "new-york-english",
      "southern-us-english",
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

  it("offers broadly local coverage across every inhabited continent", () => {
    for (const id of [
      "latin-american-spanish-influenced-english",
      "mexican-spanish-influenced-english",
      "north-african-arabic-influenced-english",
      "nigerian-english",
      "east-african-english",
      "south-african-english",
      "pakistani-english",
      "cantonese-influenced-english",
      "filipino-english",
      "indonesian-influenced-english",
      "new-zealand-english",
      "pacific-island-english",
    ]) {
      assert.ok(
        LOCAL_VOICE_SPEECHPRINT_CAPABILITIES.some(
          (capability) => capability.id === id,
        ),
        id,
      );
    }
  });

  it("uses one full-frame georeferenced Earth mask instead of procedural land polygons", () => {
    assert.doesNotMatch(atlasSource, /<path d=/u);
    assert.match(
      atlasCssSource,
      /url\("\/voice\/pronunciation-atlas-earth-equirectangular-v2\.svg"\)/u,
    );
    assert.match(atlasCssSource, /\.map\s*\{[\s\S]*?inset:\s*0;/u);
    assert.equal(existsSync(atlasMap), true);
    const mapSource = readFileSync(atlasMap, "utf8");
    assert.match(mapSource, /Natural Earth 1:50m land, public domain/u);
    assert.match(mapSource, /Projection: equirectangular/u);
    assert.match(mapSource, /viewBox="0 0 1774 887"/u);
    assert.match(mapSource, /preserveAspectRatio="none"/u);
  });

  it("commits and persists the exact dropped map point", () => {
    assert.doesNotMatch(atlasSource, /const snapped/u);
    assert.match(atlasSource, /pronunciationAtlasPointForSelection/u);
    assert.match(pageSource, /pronunciationMapPoint: selection\.point/u);
  });

  it("offers nearby accent choices and a single stage-level audition dock", () => {
    assert.match(atlasSource, /Nearby choices/u);
    assert.match(atlasSource, /pronunciationAtlasNearbyCandidates/u);
    assert.match(pageSource, /className=\{styles\.botAvatarVoiceTestDock\}/u);
    assert.match(pageSource, /English[\s\S]*Premium[\s\S]*Babble[\s\S]*Bottish/u);
    assert.match(pageSource, /Nothing is added to chat\./u);
  });
});
