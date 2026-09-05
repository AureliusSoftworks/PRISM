import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildDebateMysteryMansionSfxPromptV1 } from "../debate-mystery-mansion-sfx.ts";
import { buildDebateMysteryMansionThemePromptV1 } from "../debate-mystery-mansion-theme.ts";
import { buildDebateMysteryMansionAtmospherePromptV1 } from "../debate-mystery-mansion-atmosphere.ts";

const serverSource = readFileSync(
  new URL("../server.ts", import.meta.url),
  "utf8",
);
const panelSource = readFileSync(
  new URL("../../../web/src/app/InstalledMansionLibraryPanel.tsx", import.meta.url),
  "utf8",
);
const experienceSource = readFileSync(
  new URL("../../../web/src/app/DebateExperience.tsx", import.meta.url),
  "utf8",
);

const houseStyle = {
  label: "Blackwood House",
  promptContract: "Damp Edwardian brick, oak panelling, brass fittings.",
  acousticThemePaletteId: "manor" as const,
};

const GUARDRAIL =
  "One short dry user-interface sound effect, close and clean, quick start, natural tail, no music bed, no voices, no room reverb wash.";

const MUSIC_GUARDRAIL =
  "Maintain a dialogue-safe level, soft attacks, generous midrange space, infrequent motifs, unresolved crime-scene tension, and quiet dramatic restraint from beginning to end.";
const ATMOSPHERE_GUARDRAIL =
  "Use stable low energy, softened high frequencies, sparse neutral detail, broad speech space, and a smooth unchanged loop boundary.";

const musicPrompt = (direction?: string | null): string =>
  buildDebateMysteryMansionThemePromptV1({ title: "Blackwood House", direction });
const atmospherePrompt = (direction?: string | null): string =>
  buildDebateMysteryMansionAtmospherePromptV1({
    acousticThemePaletteId: "manor",
    styleId: "edwardian",
    weather: "rain",
    timeOfDay: "night",
    direction,
  });

describe("venue soundscape Refract direction", () => {
  it("keeps undirected music and atmosphere prompts byte-identical", () => {
    for (const direction of [undefined, null, "", "   "]) {
      assert.equal(musicPrompt(direction), musicPrompt(), `music: ${JSON.stringify(direction)}`);
      assert.equal(
        atmospherePrompt(direction),
        atmospherePrompt(),
        `atmosphere: ${JSON.stringify(direction)}`,
      );
    }
  });

  it("keeps each closing guardrail last across all three lanes", () => {
    const music = musicPrompt("Lean on the cello, colder.");
    assert.match(music, /Creative direction for this pass: Lean on the cello, colder\./u);
    assert.ok(
      music.indexOf("Creative direction for this pass:") < music.indexOf(MUSIC_GUARDRAIL),
    );
    assert.ok(music.trimEnd().endsWith(MUSIC_GUARDRAIL), "music restraint stays last");

    const atmosphere = atmospherePrompt("Heavier rain, further away.");
    assert.match(atmosphere, /Creative direction for this pass: Heavier rain, further away\./u);
    assert.ok(
      atmosphere.indexOf("Creative direction for this pass:") <
        atmosphere.indexOf(ATMOSPHERE_GUARDRAIL),
    );
    assert.ok(
      atmosphere.trimEnd().endsWith(ATMOSPHERE_GUARDRAIL),
      "atmosphere loop rule stays last",
    );
  });

  it("accepts a direction on the music and atmosphere routes", () => {
    assert.match(serverSource, /new Set\(\["responseMode", "direction"\]\)/u);
    assert.match(
      serverSource,
      /stageDebateMysteryMansionThemeV1\(\{[\s\S]{0,220}?direction: normalizePrismRefractDirection\(body\.direction\),/u,
    );
    assert.match(
      serverSource,
      /stageDebateMysteryMansionAtmosphereV1\(\{[\s\S]{0,220}?direction: normalizePrismRefractDirection\(body\.direction\),/u,
    );
  });

  it("gives music and atmosphere their own direction boxes", () => {
    assert.match(panelSource, /id="installed-mansion-music-direction"/u);
    assert.match(panelSource, /id="installed-mansion-atmosphere-direction"/u);
    assert.match(
      panelSource,
      /onGenerateTheme\(mansion, musicDirection\)/u,
    );
    assert.match(
      panelSource,
      /onGenerateAtmosphere\(mansion, atmosphereDirection\)/u,
    );
    assert.match(panelSource, /setMusicDirection\(""\)/u);
    assert.match(panelSource, /setAtmosphereDirection\(""\)/u);
    assert.match(
      experienceSource,
      /onGenerateTheme=\{\(mansion, direction\) => mutateSavedMansionTheme\(mansion, "generate", direction\)\}/u,
    );
    assert.match(
      experienceSource,
      /onGenerateAtmosphere=\{\(mansion, direction\) => mutateSavedMansionAtmosphere\(mansion, "generate", direction\)\}/u,
    );
  });
});

describe("venue effect Refract direction", () => {
  it("keeps an undirected prompt byte-identical to the canonical one", () => {
    const canonical = buildDebateMysteryMansionSfxPromptV1({
      cueId: "paper-pickup",
      houseStyle,
    });
    for (const direction of [undefined, null, "", "   "]) {
      assert.equal(
        buildDebateMysteryMansionSfxPromptV1({
          cueId: "paper-pickup",
          houseStyle,
          direction,
        }),
        canonical,
        `a ${JSON.stringify(direction)} direction must not change the prompt`,
      );
    }
  });

  it("places the direction before the sentence that bounds the clip", () => {
    const prompt = buildDebateMysteryMansionSfxPromptV1({
      cueId: "folder",
      houseStyle,
      direction: "Heavier card stock, a little dust.",
    });
    assert.match(prompt, /Creative direction for this pass: Heavier card stock, a little dust\./u);
    const directionIndex = prompt.indexOf("Creative direction for this pass:");
    const guardrailIndex = prompt.indexOf(GUARDRAIL);
    assert.ok(directionIndex > 0, "the direction must appear");
    assert.ok(guardrailIndex > 0, "the guardrail sentence must survive");
    assert.ok(
      directionIndex < guardrailIndex,
      "the guardrail must come last so a direction cannot talk the model out of a short dry one-shot",
    );
    // The cue keeps its own job ahead of any player direction.
    assert.ok(prompt.indexOf("Closing a folder") < directionIndex || prompt.startsWith("A "));
  });

  it("collapses and bounds a rambling direction", () => {
    const prompt = buildDebateMysteryMansionSfxPromptV1({
      cueId: "pencil",
      houseStyle,
      direction: `  soft\n\n  graphite   ${"very ".repeat(200)}`,
    });
    const direction = prompt.slice(
      prompt.indexOf("Creative direction for this pass: "),
      prompt.indexOf(GUARDRAIL),
    );
    assert.ok(!/\n/u.test(direction), "newlines are collapsed");
    assert.ok(direction.length <= 300 + "Creative direction for this pass: ".length + 1);
    assert.match(prompt, /Creative direction for this pass: soft graphite/u);
  });

  it("accepts the direction on the synthesis route without widening the body", () => {
    assert.match(
      serverSource,
      /key !== "responseMode" && key !== "direction"/u,
    );
    assert.match(
      serverSource,
      /direction: normalizePrismRefractDirection\(body\.direction\),/u,
    );
  });

  it("lets a single cue carry its own prompt, with the section as fallback", () => {
    assert.match(
      panelSource,
      /const \[effectCueDirections, setEffectCueDirections\] = useState<Partial<Record<WhodunnitSfxCueIdV1, string>>>\(\{\}\)/u,
    );
    assert.match(panelSource, /data-cue-direction=\{cueId\}/u);
    // A cue's own prompt wins; blank falls back to the section box.
    assert.match(
      panelSource,
      /\(effectCueDirections\[cueId\] \?\? ""\)\.trim\(\) \? effectCueDirections\[cueId\]! : effectsDirection/u,
    );
    // The row button and "Resynthesize every effect" share one chokepoint, so
    // they can never disagree about which prompt a cue was drawn from.
    assert.match(
      panelSource,
      /await onGenerateSfx\(editingMansion, cueId, directionForCue\(cueId\)\)/u,
    );
    assert.doesNotMatch(
      panelSource,
      /onGenerateSfx\(editingMansion, cueId, effectsDirection\)/u,
    );
    // The map must clear with the other directions or it follows you to the
    // next venue you open.
    assert.match(panelSource, /setEffectCueDirections\(\{\}\)/u);
    // The section helper may not claim cues that carry their own prompt.
    assert.match(panelSource, /cuesWithOwnDirection\.length > 0/u);
    assert.match(
      panelSource,
      /except the \$\{cuesWithOwnDirection\.length\} with their own prompt below/u,
    );
    // A waiting candidate is a decision, not a request, so no prompt shows.
    assert.match(panelSource, /\{cue\.candidate \? null : \(\s*<input/u);
    assert.match(
      readFileSync(new URL("../../../web/src/app/debateMystery.module.css", import.meta.url), "utf8"),
      /\.installedMansionCueDirection\[data-overriding="true"\]/u,
    );
  });

  it("feeds one section direction to every synthesis control", () => {
    assert.match(panelSource, /id="installed-mansion-effects-direction"/u);
    assert.match(
      panelSource,
      /const \[effectsDirection, setEffectsDirection\] = useState\(""\)/u,
    );
    // Per-cue, "synthesize the rest", and "resynthesize every effect" all run
    // through this one helper, so the box governs each of them unless that cue
    // carries its own prompt.
    assert.match(
      panelSource,
      /await onGenerateSfx\(editingMansion, cueId, directionForCue\(cueId\)\)/u,
    );
    assert.match(panelSource, /: effectsDirection;/u);
    assert.match(panelSource, /setEffectsDirection\(""\)/u);
    assert.match(
      experienceSource,
      /onGenerateSfx=\{\(mansion, cueId, direction\) => mutateSavedMansionSfx\(mansion, cueId, "generate", direction\)\}/u,
    );
    assert.match(
      experienceSource,
      /\{ responseMode: props\.responseMode, direction \}/u,
    );
  });
});
