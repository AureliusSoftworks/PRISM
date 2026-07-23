import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { describe, it } from "node:test";

import {
  PRISM_INTRO_SCENES,
  PRISM_INTRO_SEQUENCE_STORAGE_KEY,
  clampPrismIntroSceneIndex,
  markPrismIntroSequenceSeen,
  prismIntroSceneAt,
  prismIntroSequenceWasSeen,
} from "./prismIntroSequenceData.ts";

const componentSource = readFileSync(
  new URL("./PrismIntroSequence.tsx", import.meta.url),
  "utf8",
);
const cssSource = readFileSync(
  new URL("./PrismIntroSequence.module.css", import.meta.url),
  "utf8",
);
const layoutSource = readFileSync(
  new URL("./layout.tsx", import.meta.url),
  "utf8",
);
const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

function lossyWebpDimensions(image: Buffer): {
  width: number;
  height: number;
} {
  assert.equal(image.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(image.subarray(8, 12).toString("ascii"), "WEBP");
  assert.equal(image.subarray(12, 16).toString("ascii"), "VP8 ");
  assert.deepEqual([...image.subarray(23, 26)], [0x9d, 0x01, 0x2a]);
  return {
    width: image.readUInt16LE(26) & 0x3fff,
    height: image.readUInt16LE(28) & 0x3fff,
  };
}

describe("PRISM intro sequence", () => {
  it("preserves the eight-beat threshold poem and brings PRISM online last", () => {
    assert.deepEqual(
      PRISM_INTRO_SCENES.map((scene) => scene.id),
      [
        "border",
        "threshold",
        "sanctum",
        "source",
        "refraction",
        "inhabitants",
        "interplay",
        "invitation",
      ],
    );
    assert.match(PRISM_INTRO_SCENES[0]!.title, /border between art and logic/u);
    assert.equal(PRISM_INTRO_SCENES[4]!.title, "You brought it.");
    assert.match(
      PRISM_INTRO_SCENES.at(-1)?.title ?? "",
      /PRISM came online/u,
    );
    assert.equal(
      PRISM_INTRO_SCENES.at(-1)?.body,
      "You are the light. Prism reveals the spectrum. One light. Many colors.",
    );
    assert.match(PRISM_INTRO_SCENES[2]!.title, /multitude waited/u);
    assert.match(
      PRISM_INTRO_SCENES[2]!.imageAlt,
      /powered-off PRISM bot frames/u,
    );
    assert.match(
      PRISM_INTRO_SCENES[5]!.imageAlt,
      /Pia, Rowan, Iris, Sol, and Mira/u,
    );
    assert.match(
      PRISM_INTRO_SCENES[5]!.imageAlt,
      /rose heart, amber winding-path, lime diamond, cyan sunburst, and violet four-point-sparkle phosphor eyes/u,
    );
    assert.match(
      PRISM_INTRO_SCENES[5]!.imageAlt,
      /black-glass CRTs/u,
    );
    assert.match(
      PRISM_INTRO_SCENES[5]!.imageAlt,
      /primary frame remains powered off/u,
    );
    assert.match(PRISM_INTRO_SCENES[5]!.imageAlt, /same-sized/u);
    assert.match(
      PRISM_INTRO_SCENES[6]!.imageAlt,
      /Pia, Rowan, Iris, Sol, and Mira/u,
    );
    assert.match(PRISM_INTRO_SCENES[6]!.imageAlt, /black CRT glass/u);
    assert.match(PRISM_INTRO_SCENES[6]!.imageAlt, /same-sized/u);
    assert.match(
      PRISM_INTRO_SCENES[6]!.imageAlt,
      /five narrow rose, amber, lime, cyan, and violet rays converge/u,
    );
    assert.match(
      PRISM_INTRO_SCENES[6]!.imageAlt,
      /remains dark for one final moment/u,
    );
    assert.match(
      PRISM_INTRO_SCENES[7]!.imageAlt,
      /Pia, Rowan, Iris, Sol, and Mira/u,
    );
    assert.match(
      PRISM_INTRO_SCENES[7]!.imageAlt,
      /Five narrow colored rays/u,
    );
    assert.match(
      PRISM_INTRO_SCENES[7]!.imageAlt,
      /converge on the triangle medallion/u,
    );
    assert.match(
      PRISM_INTRO_SCENES[7]!.imageAlt,
      /comes online with a white face on black CRT glass/u,
    );
    assert.equal(
      PRISM_INTRO_SCENES[6]!.body,
      "You decided what belonged. Their five colors carried your light toward the one still dark.",
    );
  });

  it("clamps navigation without ever producing an empty scene", () => {
    assert.equal(clampPrismIntroSceneIndex(-8), 0);
    assert.equal(clampPrismIntroSceneIndex(2.9), 2);
    assert.equal(
      clampPrismIntroSceneIndex(Number.POSITIVE_INFINITY),
      0,
    );
    assert.equal(prismIntroSceneAt(999).id, "invitation");
  });

  it("treats storage as helpful rather than required", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem(key: string) {
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        values.set(key, value);
      },
    };

    assert.equal(prismIntroSequenceWasSeen(storage), false);
    assert.equal(markPrismIntroSequenceSeen(storage), true);
    assert.equal(
      values.get(PRISM_INTRO_SEQUENCE_STORAGE_KEY),
      "done",
    );
    assert.equal(prismIntroSequenceWasSeen(storage), true);

    assert.equal(
      prismIntroSequenceWasSeen({
        getItem() {
          throw new Error("blocked");
        },
      }),
      false,
    );
    assert.equal(
      markPrismIntroSequenceSeen({
        setItem() {
          throw new Error("blocked");
        },
      }),
      false,
    );
  });

  it("ships optimized local artwork at the authored widescreen size", () => {
    for (const scene of PRISM_INTRO_SCENES) {
      assert.match(scene.imageSrc, /^\/prism-intro\/[\w-]+\.webp$/u);
      assert.doesNotMatch(scene.imageSrc, /^https?:/u);
      const assetUrl = new URL(`../../public${scene.imageSrc}`, import.meta.url);
      const asset = readFileSync(assetUrl);
      assert.deepEqual(lossyWebpDimensions(asset), {
        width: 1672,
        height: 941,
      });
      assert.ok(
        statSync(assetUrl).size < 600_000,
        `${scene.id} should stay below the local slideshow size budget`,
      );
    }
  });

  it("is a user-paced, keyboard-operable modal with restored focus", () => {
    assert.match(componentSource, /createPortal\(/u);
    assert.match(componentSource, /role="dialog"/u);
    assert.match(componentSource, /aria-modal="true"/u);
    assert.match(
      componentSource,
      /function prismIntroLocalStorage[\s\S]*try \{[\s\S]*return window\.localStorage;[\s\S]*catch/u,
    );
    assert.match(componentSource, /element\.setAttribute\("inert", ""\)/u);
    assert.match(componentSource, /id=\{visualDescriptionId\}/u);
    assert.match(componentSource, /previouslyFocused\.focus/u);
    assert.match(componentSource, /event\.key === "Escape"/u);
    assert.match(componentSource, /onClose\("skipped"\)/u);
    assert.match(componentSource, /onClose\("completed"\)/u);
    assert.match(componentSource, /event\.key === "ArrowRight"/u);
    assert.match(componentSource, /event\.key === "ArrowLeft"/u);
    assert.match(componentSource, /event\.key !== "Tab"/u);
    assert.match(componentSource, /active === rootRef\.current/u);
    assert.match(componentSource, /new window\.Image\(\)/u);
    assert.doesNotMatch(componentSource, /setInterval|autoAdvance/iu);
    assert.match(
      cssSource,
      /@media \(max-width: 760px\) and \(max-height: 520px\)/u,
    );
  });

  it("removes cinematic motion when the player requests reduced motion", () => {
    assert.match(cssSource, /@media \(prefers-reduced-motion: reduce\)/u);
    assert.match(
      cssSource,
      /\.sceneImage,[\s\S]*animation:\s*none;[\s\S]*transform:\s*none;/u,
    );
  });

  it("mounts globally, starts from account onboarding, and replays from About", () => {
    assert.match(layoutSource, /<PrismIntroSequenceProvider>/u);
    assert.match(pageSource, /requestFirstRunPrismIntro\(\{[\s\S]*?force: true/u);
    assert.match(pageSource, /onboardingState\.stage !== "intro"/u);
    assert.doesNotMatch(pageSource, /shouldShowFirstLaunchWelcome/u);
    assert.match(pageSource, /shouldShowPreAuthChecklist/u);
    assert.match(pageSource, /data-prism-intro-replay="true"/u);
    assert.match(pageSource, />Watch the introduction</u);
    assert.match(pageSource, /onClick=\{watchPrismIntroduction\}/u);
    assert.match(pageSource, />Run guided setup again</u);
  });
});
