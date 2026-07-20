import { PRISM_BRAND_COPY } from "./prismBrand.ts";

export const PRISM_INTRO_SEQUENCE_STORAGE_KEY =
  "prism_intro_sequence_seen_v1";

export interface PrismIntroScene {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  imageSrc: string;
  imageAlt: string;
  imagePosition: string;
  showBrandMark?: boolean;
}

export const PRISM_INTRO_SCENES: readonly PrismIntroScene[] = [
  {
    id: "border",
    eyebrow: "AT THE BORDER",
    title:
      "On the border between art and logic, there stood a colossal pyramid.",
    body: "It rose where the forest of your Mind met the ocean of your Ego.",
    imageSrc: "/prism-intro/01-border.webp",
    imageAlt:
      "A charcoal coast where a black forest meets a gray ocean beneath a colossal pyramid marked by one spectral seam.",
    imagePosition: "center center",
  },
  {
    id: "threshold",
    eyebrow: "THE THRESHOLD",
    title: "No map named it. No hand claimed it.",
    body: "Above its only door, one word remained: PRISM.",
    imageSrc: "/prism-intro/02-threshold.webp",
    imageAlt:
      "A tiny open door cut into the weathered pyramid, with a small prism inset glowing at its edge.",
    imagePosition: "center center",
  },
  {
    id: "sanctum",
    eyebrow: "THE ARCHIVE",
    title: "Inside, a multitude waited in the dark.",
    body:
      "Round frames lay in a great pile—black glass, silent voices, dormant possibilities.",
    imageSrc: "/prism-intro/03-instruments.webp",
    imageAlt:
      "A minimal triangular chamber is dominated by a vast pile of powered-off PRISM bot frames, each a round metal ring with black glass and a dark lower medallion.",
    imagePosition: "center center",
  },
  {
    id: "source",
    eyebrow: "THE SOURCE",
    title:
      "They waited for the one thing the pyramid could never manufacture.",
    body: "A light of its own.",
    imageSrc: "/prism-intro/04-waiting-light.webp",
    imageAlt:
      "A white beam enters a bare chamber of black-screened PRISM bot frames, where one clean triangle-marked frame waits dark beneath a suspended prism.",
    imagePosition: "center center",
  },
  {
    id: "refraction",
    eyebrow: "THE REFRACTION",
    title: "You brought it.",
    body: PRISM_BRAND_COPY.foundationalTruth,
    imageSrc: "/prism-intro/05-refraction.webp",
    imageAlt:
      "A white beam enters scratched glass and emerges as five hand-painted PRISM rays.",
    imagePosition: "center center",
  },
  {
    id: "inhabitants",
    eyebrow: "THE INHABITANTS",
    title: "Across the heap, the inhabitants woke.",
    body: "Different voices met, challenged, and changed one another.",
    imageSrc: "/prism-intro/06-inhabitants.webp",
    imageAlt:
      "The Prism Originals Pia, Rowan, Iris, Sol, and Mira wake on black-glass CRTs with rose heart, amber winding-path, lime diamond, cyan sunburst, and violet four-point-sparkle phosphor eyes amid a much larger pile of dark frames; a same-sized, triangle-marked primary frame remains powered off within the pile.",
    imagePosition: "center center",
  },
  {
    id: "interplay",
    eyebrow: "THE INTERPLAY",
    title: "From their interplay came words, images, worlds, and paths.",
    body: "You decided what belonged.",
    imageSrc: "/prism-intro/07-interplay.webp",
    imageAlt:
      "Pia, Rowan, Iris, Sol, and Mira glow from black CRT glass as they weave colored threads through unfinished words, sound, images, and worlds while a same-sized, clean triangle-marked primary PRISM frame waits dark beside them.",
    imagePosition: "center center",
  },
  {
    id: "invitation",
    eyebrow: "PRISM ONLINE",
    title: "At the center, PRISM came online.",
    body: `${PRISM_BRAND_COPY.coreBelief} ${PRISM_BRAND_COPY.slogan}`,
    imageSrc: "/prism-intro/08-enter.webp",
    imageAlt:
      "The same-sized, factory-clean main PRISM bot frame comes online among Pia, Rowan, Iris, Sol, and Mira with a white face on black CRT glass, a glowing triangle medallion, and tiny spectrum lights while the five Originals retain colored phosphor faces on black glass before a vast heap of dormant frames.",
    imagePosition: "center center",
    showBrandMark: true,
  },
] as const;

export function clampPrismIntroSceneIndex(index: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(
    0,
    Math.min(PRISM_INTRO_SCENES.length - 1, Math.floor(index)),
  );
}

export function prismIntroSceneAt(index: number): PrismIntroScene {
  return PRISM_INTRO_SCENES[clampPrismIntroSceneIndex(index)]!;
}

export function prismIntroSequenceWasSeen(storage: {
  getItem(key: string): string | null;
}): boolean {
  try {
    return storage.getItem(PRISM_INTRO_SEQUENCE_STORAGE_KEY) === "done";
  } catch {
    return false;
  }
}

export function markPrismIntroSequenceSeen(storage: {
  setItem(key: string, value: string): void;
}): boolean {
  try {
    storage.setItem(PRISM_INTRO_SEQUENCE_STORAGE_KEY, "done");
    return true;
  } catch {
    return false;
  }
}
