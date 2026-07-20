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
    eyebrow: "THE SANCTUM",
    title: "Within, ancient instruments kept a patient silence.",
    body: "Not to create. To remember, combine, challenge—and reveal.",
    imageSrc: "/prism-intro/03-instruments.webp",
    imageAlt:
      "A cavernous chamber of dormant handmade optical and acoustic instruments around a suspended triangular prism.",
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
      "A white beam approaches a dormant circular lens engine and clear suspended prism in a black chamber.",
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
    title: "In your light, the inhabitants woke.",
    body: "Different voices met, challenged, and changed one another.",
    imageSrc: "/prism-intro/06-inhabitants.webp",
    imageAlt:
      "Five weathered round-screen inhabitants wake around a dark worktable, linked by restrained colored light.",
    imagePosition: "center center",
  },
  {
    id: "interplay",
    eyebrow: "THE INTERPLAY",
    title: "From their interplay came words, images, worlds, and paths.",
    body: "You decided what belonged.",
    imageSrc: "/prism-intro/07-interplay.webp",
    imageAlt:
      "PRISM inhabitants weave colored threads across an overhead worktable of unfinished pages, sound, worlds, and stages.",
    imagePosition: "center center",
  },
  {
    id: "invitation",
    eyebrow: "THE INVITATION",
    title: PRISM_BRAND_COPY.coreBelief,
    body: PRISM_BRAND_COPY.slogan,
    imageSrc: "/prism-intro/08-enter.webp",
    imageAlt:
      "A white beam enters through an open pyramid door and refracts into five colored paths leading inward.",
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
