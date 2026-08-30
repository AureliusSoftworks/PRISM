import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const readSibling = (name: string): string =>
  readFileSync(new URL(name, import.meta.url), "utf8");

describe("Whodunnit room audio routing", () => {
  const replaySource = readSibling("replayAudioMasterCapture.ts");
  const experienceSource = readSibling("DebateMysteryV2Experience.tsx");
  const travelSource = readSibling("debateMysteryMansionTravel.ts");
  const speechSource = readSibling("debateMysterySfx.ts");
  const impactSource = readSibling("debateExhibitImpactSfx.ts");

  it("adds an optional acoustics return beneath the shared world master", () => {
    assert.match(replaySource, /roomAcoustics\?: RoomAcousticsSend \| null/u);
    assert.match(replaySource, /connectRoomAcoustics\(\{[\s\S]*destination: output/u);
    assert.match(replaySource, /cleanup\.release = \(\): void => \{[\s\S]*roomConnection\?\.release\(\)/u);
  });

  it("sends prepared and procedural interviews through the active room", () => {
    assert.match(experienceSource, /roomAcoustics:[\s\S]{0,180}currentRoomAcoustics\?\.voice/u);
    assert.match(speechSource, /roomAcoustics: args\.roomAcoustics/u);
  });

  it("sends physical Foley but keeps investigation music and ambience dry", () => {
    assert.match(travelSource, /roomAcoustics: acoustics\[cue\.acousticRole\]\.foley/u);
    assert.match(travelSource, /cleanup\?\.release\(\)/u);
    assert.match(travelSource, /entry\.cleanup\?\.\(\)/u);
    assert.match(impactSource, /roomAcoustics: args\.roomAcoustics/u);
    for (const match of experienceSource.matchAll(/<SessionAtmosphereLayer/gu)) {
      const end = experienceSource.indexOf("/>", match.index);
      assert.ok(end > match.index);
      assert.doesNotMatch(experienceSource.slice(match.index, end), /roomAcoustics=/u);
    }
  });
});
