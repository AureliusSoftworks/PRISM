import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

describe("Avatar Studio corporality preview", () => {
  it("auditions the current Corporality blend through runtime Foley playback", () => {
    const page = readFileSync(
      fileURLToPath(new URL("./page.tsx", import.meta.url)),
      "utf8",
    );
    assert.match(
      page,
      /data-tutorial-target="avatar-corporality-fart-preview"[\s\S]{0,600}playPreparedCoffeeActionSfx\(\{\s*kind: "fart",\s*voiceVolume: 1,\s*corporality: corporalityValue,\s*voiceEffectsEnabled: false,/u,
    );
    assert.match(page, />\s*Fart\s*<\/button>/u);

    const tutorial = readFileSync(
      fileURLToPath(new URL("./modeTutorials.ts", import.meta.url)),
      "utf8",
    );
    assert.match(
      tutorial,
      /use Fart beside Corporality to hear the current blend/u,
    );
  });

  it("ships every fart clip used by the three Corporality bins", () => {
    for (const bin of ["artificial", "organic", "ethereal"]) {
      for (const variant of ["01", "02", "03"]) {
        const clip = fileURLToPath(
          new URL(
            `../../public/audio/action-reactions/corporality/${bin}/fart-${variant}.mp3`,
            import.meta.url,
          ),
        );
        assert.ok(statSync(clip).size > 0, `${bin} fart ${variant} is empty`);
      }
    }
  });
});
