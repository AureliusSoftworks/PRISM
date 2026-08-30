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
  WHODUNNIT_CASE_FORGE_MUSIC_MIX,
  WHODUNNIT_TITLE_CARD_MUSIC_MIX,
  mysteryCasePreludeMusicMix,
  mysteryCasePreludeMusicSessionActive,
  mysteryInvestigationMusicMix,
  mysteryInvestigationMusicProgramV1,
  mysteryInvestigationMusicSessionActive,
} from "./debateMysteryMusic.ts";

const appDirectory = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(appDirectory, "DebateMysteryV2Experience.tsx"),
  "utf8",
);
const shellSource = readFileSync(
  resolve(appDirectory, "DebateExperience.tsx"),
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

  it("carries the established case theme through Case Forge and the ready title card", () => {
    assert.equal(mysteryCasePreludeMusicSessionActive("case_forge"), true);
    assert.equal(mysteryCasePreludeMusicSessionActive("title_card"), true);
    assert.equal(mysteryCasePreludeMusicSessionActive("case_opening"), false);
    assert.equal(mysteryCasePreludeMusicSessionActive("investigation"), false);
    assert.equal(mysteryCasePreludeMusicSessionActive("theory"), false);
    assert.equal(mysteryCasePreludeMusicSessionActive("trial"), false);
    assert.equal(mysteryCasePreludeMusicSessionActive("verdict"), false);
    assert.equal(
      mysteryCasePreludeMusicMix("case_forge"),
      WHODUNNIT_CASE_FORGE_MUSIC_MIX,
    );
    assert.equal(
      mysteryCasePreludeMusicMix("title_card"),
      WHODUNNIT_TITLE_CARD_MUSIC_MIX,
    );
    assert.ok(
      WHODUNNIT_TITLE_CARD_MUSIC_MIX.background >
        WHODUNNIT_CASE_FORGE_MUSIC_MIX.background,
    );
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
    assert.equal(
      mysteryInvestigationMusicMix({
        theoryBoardOpen: false,
        roomComplete: true,
      }),
      WHODUNNIT_INVESTIGATION_MUSIC_SILENT_MIX,
    );
    assert.equal(
      mysteryInvestigationMusicMix({
        theoryBoardOpen: false,
        roomComplete: false,
      }),
      WHODUNNIT_INVESTIGATION_MUSIC_MIX,
    );
    assert.ok(WHODUNNIT_INVESTIGATION_MUSIC_TRANSITION_MS >= 120);
    assert.ok(WHODUNNIT_INVESTIGATION_MUSIC_FADE_MS >= 320);
  });

  it("uses deterministic musical cells with longer ambience-only rests", () => {
    const first = mysteryInvestigationMusicProgramV1({ seed: "blackwood", elapsedMs: 0 });
    const same = mysteryInvestigationMusicProgramV1({ seed: "blackwood", elapsedMs: 0 });
    assert.deepEqual(first, same);
    assert.equal(first.phase, "cell");
    assert.ok(first.cellDurationMs >= 8_000 && first.cellDurationMs <= 16_000);
    assert.ok(first.restDurationMs >= 45_000 && first.restDurationMs <= 85_000);
    assert.ok(first.restDurationMs > first.cellDurationMs);
    const rest = mysteryInvestigationMusicProgramV1({
      seed: "blackwood",
      elapsedMs: first.cellDurationMs + 1,
    });
    assert.equal(rest.phase, "rest");
    assert.equal(rest.audible, false);
    const accent = mysteryInvestigationMusicProgramV1({
      seed: "blackwood",
      elapsedMs: first.cellDurationMs + 1,
      accentActive: true,
    });
    assert.equal(accent.phase, "accent");
    assert.equal(accent.audible, true);
    assert.ok(WHODUNNIT_INVESTIGATION_MUSIC_MIX.background <= 0.07);
    assert.ok(mysteryInvestigationMusicMix({
      theoryBoardOpen: false,
      accentActive: true,
    }).background <= 0.09);
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
    assert.match(source, /data-music-program=\{investigationMusicProgram\.phase\}/u);
    assert.match(source, /active=\{props\.audioEnabled\}/u);
    assert.match(source, /roomIntroductionActive,\s*roomComplete,\s*programAudible/u);
    assert.match(source, /programAudible: investigationMusicProgram\.audible/u);
    assert.match(source, /backgroundRecordable=\{false\}/u);
    assert.match(source, /ambientFoley=\{false\}/u);
    assert.match(
      source,
      /mixTransitionMs=\{WHODUNNIT_INVESTIGATION_MUSIC_TRANSITION_MS\}/u,
    );
    assert.match(source, /lifecycleTransitionMs=\{WHODUNNIT_INVESTIGATION_MUSIC_FADE_MS\}/u);
  });

  it("mounts one replay-safe prelude layer only on the visible Forge and title surfaces", () => {
    assert.match(shellSource, /mysteryCasePreludeMusicSessionActive\(activeSession\.formatState\.playPhase\)/u);
    assert.match(shellSource, /sessionKey=\{`whodunnit-v2-prelude:\$\{activeSession\.id\}`\}/u);
    assert.match(shellSource, /mystery-mansion\/theme/u);
    assert.match(shellSource, /backgroundFallbackUrl=\{WHODUNNIT_INVESTIGATION_MUSIC_URL\}/u);
    assert.match(shellSource, /active=\{props\.audioEnabled && props\.audioVolume > 0\}/u);
    assert.match(shellSource, /mix=\{mysteryCasePreludeMusicMix\(mysteryPreludeMusicPhase\)\}/u);
    assert.match(shellSource, /backgroundRecordable=\{false\}/u);
    assert.match(shellSource, /ambientFoley=\{false\}/u);
  });

  it("documents the furniture-music cadence and silent non-investigation boundaries", () => {
    assert.match(
      tutorialSource,
      /short deterministic cells emerge between long ambience-only rests/u,
    );
    assert.match(tutorialSource, /routine pickups, navigation, and hovering never trigger it/u);
    assert.match(tutorialSource, /fades for the Theory Board and courtroom/u);
    assert.match(tutorialSource, /begins quietly while Case Forge builds the case/u);
    assert.match(tutorialSource, /remains through the ready title card/u);
  });
});
