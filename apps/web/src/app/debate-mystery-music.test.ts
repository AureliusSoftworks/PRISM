import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  WHODUNNIT_INVESTIGATION_MUSIC_FADE_MS,
  WHODUNNIT_INVESTIGATION_MUSIC_MIX,
  WHODUNNIT_INVESTIGATION_MUSIC_SILENT_MIX,
  WHODUNNIT_INVESTIGATION_MUSIC_TRANSITION_MS,
  WHODUNNIT_INVESTIGATION_MUSIC_URL,
  mysteryInvestigationMusicMix,
  mysteryInvestigationMusicSessionActive,
} from "./debateMysteryMusic.ts";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(appDirectory, "DebateMysteryExperience.tsx"),
  "utf8",
);
const tutorialSource = readFileSync(
  resolve(appDirectory, "modeTutorials.ts"),
  "utf8",
);

describe("Whodunnit investigation music", () => {
  it("is active only while the mansion investigation can be played", () => {
    assert.equal(mysteryInvestigationMusicSessionActive("compiling"), false);
    assert.equal(mysteryInvestigationMusicSessionActive("investigation"), true);
    assert.equal(mysteryInvestigationMusicSessionActive("theory"), false);
    assert.equal(mysteryInvestigationMusicSessionActive("trial"), false);
    assert.equal(mysteryInvestigationMusicSessionActive("verdict"), false);
  });

  it("keeps its level during interviews and fades silently for first-visit introductions and the Theory Board", () => {
    assert.equal(
      mysteryInvestigationMusicMix({
        theoryBoardOpen: false,
      }),
      WHODUNNIT_INVESTIGATION_MUSIC_MIX,
    );
    assert.equal(
      mysteryInvestigationMusicMix({
        theoryBoardOpen: true,
      }),
      WHODUNNIT_INVESTIGATION_MUSIC_SILENT_MIX,
    );
    assert.equal(
      mysteryInvestigationMusicMix({
        theoryBoardOpen: false,
        roomIntroductionActive: true,
      }),
      WHODUNNIT_INVESTIGATION_MUSIC_SILENT_MIX,
    );
    assert.ok(WHODUNNIT_INVESTIGATION_MUSIC_TRANSITION_MS >= 120);
    assert.ok(WHODUNNIT_INVESTIGATION_MUSIC_FADE_MS >= 320);
  });

  it("ships the compact three-minute stereo music asset", () => {
    const assetPath = resolve(
      appDirectory,
      "../../public",
      WHODUNNIT_INVESTIGATION_MUSIC_URL.slice(1),
    );
    const asset = statSync(assetPath);
    assert.ok(asset.size > 4_000_000);
    assert.ok(asset.size < 5_000_000);
  });

  it("uses the shared local-only music layer and the global audio controls", () => {
    assert.match(source, /<SessionAtmosphereLayer/u);
    assert.match(source, /mysteryInvestigationMusicSessionActive\(state\.playPhase\)/u);
    assert.match(source, /active=\{Boolean\([\s\S]*props\.audioEnabled[\s\S]*props\.audioVolume/u);
    assert.match(source, /backgroundRecordable=\{false\}/u);
    assert.match(source, /ambientFoley=\{false\}/u);
    assert.match(
      source,
      /mixTransitionMs=\{WHODUNNIT_INVESTIGATION_MUSIC_TRANSITION_MS\}/u,
    );
    assert.match(source, /lifecycleTransitionMs=\{WHODUNNIT_INVESTIGATION_MUSIC_FADE_MS\}/u);
  });

  it("documents the first-visit silence, steady interviews, and silent non-investigation boundaries", () => {
    assert.match(
      tutorialSource,
      /The Midnight Clue underscores the mansion investigation at one steady level—after any first-visit introduction and even during interviews/u,
    );
    assert.match(tutorialSource, /fades for the Theory Board and courtroom/u);
  });
});
