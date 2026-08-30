import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  debateMysteryHouseStyleV2,
  type DebateMysteryRoomV2,
} from "@localai/shared";
import {
  WHODUNNIT_ACOUSTIC_ASSETS_V1,
  mysteryAcousticDeterministicVariantV1,
  mysteryAcousticPositionalGainV1,
  mysteryMansionAmbienceAssetV1,
  mysteryMansionAmbienceMixV1,
} from "./debateMysteryMansionAmbience.ts";

const appDir = new URL(".", import.meta.url);
const readSource = (name: string): string => readFileSync(new URL(name, appDir), "utf8");

test("Blackwood storm and Space Odyssey resolve different content-addressed beds", () => {
  const blackwood = debateMysteryHouseStyleV2(
    "Blackwood House, rain-lashed 1890s Gothic Revival at night.",
  );
  const space = debateMysteryHouseStyleV2(
    "Space Odyssey aboard an orbital spacecraft with airlocks and reactor decks.",
  );
  const blackwoodAsset = mysteryMansionAmbienceAssetV1(blackwood, null);
  const spaceAsset = mysteryMansionAmbienceAssetV1(space, null);
  assert.match(blackwoodAsset?.url ?? "", /rain-storm-v1\.ogg$/u);
  assert.match(spaceAsset?.url ?? "", /spacecraft-hull-v1\.ogg$/u);
  assert.notEqual(blackwoodAsset?.sha256, spaceAsset?.sha256);
});

test("room mix crossfades exposure and ducks under speech without changing the bed", () => {
  const houseStyle = debateMysteryHouseStyleV2("Blackwood Gothic rainstorm at night");
  const rooftop = { id: "roof", name: "Rooftop Lounge", floor: 3 } as DebateMysteryRoomV2;
  const cellar = { id: "cellar", name: "Stone Cellar", floor: 1 } as DebateMysteryRoomV2;
  const rooftopMix = mysteryMansionAmbienceMixV1({
    houseStyle, room: rooftop, maxFloor: 3, roomView: "room", speechActive: false, theoryBoardOpen: false,
  });
  const cellarMix = mysteryMansionAmbienceMixV1({
    houseStyle, room: cellar, maxFloor: 3, roomView: "room", speechActive: false, theoryBoardOpen: false,
  });
  const spokenMix = mysteryMansionAmbienceMixV1({
    houseStyle, room: rooftop, maxFloor: 3, roomView: "room", speechActive: true, theoryBoardOpen: false,
  });
  assert.ok(rooftopMix.background > cellarMix.background);
  assert.ok(spokenMix.background < rooftopMix.background);
  const bespokeMix = mysteryMansionAmbienceMixV1({
    houseStyle: { ...houseStyle, bespokeAmbienceRequested: true },
    room: rooftop, maxFloor: 3, roomView: "room", speechActive: false, theoryBoardOpen: false,
  });
  assert.notEqual(bespokeMix.background, rooftopMix.background);
  assert.equal(mysteryMansionAmbienceAssetV1(houseStyle, null)?.id,
    mysteryMansionAmbienceAssetV1(houseStyle, null)?.id);
});

test("shared Opus fixtures are small and match their registry hashes", () => {
  for (const asset of WHODUNNIT_ACOUSTIC_ASSETS_V1) {
    const bytes = readFileSync(new URL(`../../public${asset.url}`, import.meta.url));
    assert.ok(bytes.byteLength < 256 * 1024);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), asset.sha256);
  }
});

test("deterministic variation and positional attenuation are bounded", () => {
  assert.equal(
    mysteryAcousticDeterministicVariantV1("mansion-1", "timber-settle-4", 12),
    mysteryAcousticDeterministicVariantV1("mansion-1", "timber-settle-4", 12),
  );
  assert.ok(mysteryAcousticDeterministicVariantV1("mansion-1", "timber-settle-4", 12) < 12);
  assert.equal(mysteryAcousticPositionalGainV1(0, 4), 1);
  assert.equal(mysteryAcousticPositionalGainV1(4, 4), 0);
});

test("player wiring keeps ambience separate, stable across rooms, and visible in setup/tutorial", () => {
  const experience = readSource("DebateMysteryV2Experience.tsx");
  const setup = readSource("DebateExperience.tsx");
  const tutorial = readSource("modeTutorials.ts");
  assert.match(experience, /sessionKey=\{`whodunnit-v2-mansion-ambience:\$\{props\.session\.id\}:\$\{state\.config\.houseStyle\.id\}`\}/u);
  assert.match(experience, /\/api\/debates\/\$\{encodeURIComponent\(props\.session\.id\)\}\/mystery-mansion\/atmosphere/u);
  assert.match(experience, /backgroundFallbackUrl=\{mansionAmbienceAsset\?\.url \?\? null\}/u);
  assert.match(experience, /mixTransitionMs=\{WHODUNNIT_MANSION_AMBIENCE_TRANSITION_MS\}/u);
  assert.match(experience, /backgroundRecordable=\{false\}[\s\S]{0,80}ambientFoley=\{false\}/u);
  assert.doesNotMatch(experience, /whodunnit-v2-mansion-ambience:[^`]*currentRoom/u);
  assert.match(setup, /data-tutorial-target="whodunnit-v2-ambience-synthesis"/u);
  assert.match(setup, /"Personalize local ambience" : "Ambience"/u);
  assert.match(setup, /no online generator or new audio file/u);
  assert.match(setup, /Off still uses matching bundled ambience/u);
  assert.match(tutorial, /installed mansion brings its rooms and ambience with it/u);
  assert.match(tutorial, /Production offers only case-owned Evidence and Music/u);
  assert.match(tutorial, /Rooms and Ambience appear there only while creating a new mansion/u);
  assert.match(tutorial, /without an online request or new audio file/u);
  assert.match(tutorial, /global Audio—not this setup choice—is the silence control/u);
});

test("soundscape failures remain visible inside the installed mansion editor", () => {
  const library = readSource("InstalledMansionLibraryPanel.tsx");
  const setup = readSource("DebateExperience.tsx");
  assert.match(library, /runSoundscapeMutation/u);
  assert.match(library, /if \(!result\.ok\) setEditorError\(result\.error \?\? fallback\)/u);
  assert.match(library, /That mansion music could not be synthesized\./u);
  assert.match(library, /That mansion atmosphere could not be synthesized\./u);
  assert.match(setup, /return \{ ok: false, error: message \}/u);
});
