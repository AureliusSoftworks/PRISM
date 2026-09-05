import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

const experience = readFileSync(new URL("./DebateExperience.tsx", import.meta.url), "utf8");
const installedLibrary = readFileSync(new URL("./InstalledMansionLibraryPanel.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("./debateMystery.module.css", import.meta.url), "utf8");
const tutorials = readFileSync(new URL("./modeTutorials.ts", import.meta.url), "utf8");
const client = readFileSync(new URL("./mansionPackageClient.ts", import.meta.url), "utf8");

describe("portable mansion setup experience", () => {
  it("supports desktop file opening, drag/drop, protected preview, install, and lifecycle actions", () => {
    const setupSource = `${experience}\n${installedLibrary}`;
    assert.match(experience, /accept="\.mansion,application\/vnd\.prism\.mansion"/u);
    assert.match(experience, /onDrop=\{dropMansionPackage\}/u);
    assert.match(experience, /data-tutorial-target="whodunnit-mansion-import"/u);
    assert.match(experience, /Unlock preview/u);
    assert.match(experience, /Install and use/u);
    assert.match(setupSource, /Export Mansion/u);
    assert.match(setupSource, /Music and atmosphere/u);
    assert.match(setupSource, /SanctumAudioPlayer/u);
    assert.match(setupSource, /Synthesize music/u);
    assert.match(setupSource, /Instrument-only noir phrases/u);
    assert.match(setupSource, /Synthesize atmosphere/u);
    assert.match(setupSource, /world bed continues across rooms/u);
    assert.doesNotMatch(installedLibrary, />\s*Refract\s*</u);
    assert.match(setupSource, /Use this version/u);
    assert.match(setupSource, /Undo previous version/u);
    assert.doesNotMatch(setupSource, /Play theme/u);
    assert.match(setupSource, /Remove from PRISM/u);
    assert.match(setupSource, /license\.allowsRedistribution === false/u);
    assert.match(client, /x-prism-package-password/u);
    assert.match(client, /URL\.revokeObjectURL/u);
  });

  it("shows the promised preview facts and teaches offline, warning-aware reuse", () => {
    for (const phrase of [
      "Creator signature included",
      "PRISM spoiler seal",
      "package",
      "expanded",
      "Generated with",
      "Content notes",
      "Installation stays offline",
    ]) assert.match(experience, new RegExp(phrase, "u"));
    assert.match(tutorials, /Mansion packages are optional/u);
    assert.match(tutorials, /creator, protection, compatibility, size, provenance, license, content notes/u);
    assert.match(styles, /\.mansionPackagePreview/u);
    assert.match(styles, /\.installedMansionGrid/u);
  });
});
