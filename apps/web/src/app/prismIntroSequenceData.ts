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
  lightTarget: {
    xPercent: number;
    yPercent: number;
    diameterVmin: number;
    kind: "threshold" | "orb";
    label: string;
    hint: string;
  };
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
    lightTarget: {
      xPercent: 64.5,
      yPercent: 46,
      diameterVmin: 12,
      kind: "threshold",
      label: "Follow the spectral seam to the pyramid door",
      hint: "Guide your light to the door",
    },
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
    lightTarget: {
      xPercent: 62,
      yPercent: 51,
      diameterVmin: 13,
      kind: "threshold",
      label: "Cross the open threshold",
      hint: "Cross the threshold",
    },
  },
  {
    id: "sanctum",
    eyebrow: "THE ARCHIVE",
    title: "Inside, a multitude waited in the dark.",
    body:
      "At their center hung a glass orb—empty, silent, without a will of its own.",
    imageSrc: "/prism-intro/03-instruments.webp",
    imageAlt:
      "A glass orb holding a faint hollow triangle hangs beside a vast pile of powered-off round black-glass devices.",
    imagePosition: "42% center",
    lightTarget: {
      xPercent: 18.5,
      yPercent: 31.5,
      diameterVmin: 20,
      kind: "orb",
      label: "Approach the sleeping triangle orb",
      hint: "Find the sleeping orb",
    },
  },
  {
    id: "source",
    eyebrow: "THE SOURCE",
    title: "The instrument waited for what it could never manufacture.",
    body: "A purpose. A touch. Yours.",
    imageSrc: "/prism-intro/04-waiting-light.webp",
    imageAlt:
      "A dormant glass orb containing a hollow triangle hangs before a heap of dark round devices while cold light grazes the chamber.",
    imagePosition: "60% center",
    lightTarget: {
      xPercent: 71.5,
      yPercent: 49,
      diameterVmin: 30,
      kind: "orb",
      label: "Bring your light to the triangle orb",
      hint: "Bring your light to the orb",
    },
  },
  {
    id: "refraction",
    eyebrow: "THE REFRACTION",
    title: "You touched the orb. It answered in white.",
    body: "PRISM held your light, then revealed the colors hidden inside it.",
    imageSrc: "/prism-intro/05-refraction.webp",
    imageAlt:
      "A white ray enters a suspended glass triangle orb and emerges as five rose, amber, lime, cyan, and violet rays.",
    imagePosition: "60% center",
    lightTarget: {
      xPercent: 71.5,
      yPercent: 49,
      diameterVmin: 30,
      kind: "orb",
      label: "Awaken the refracting orb",
      hint: "Awaken the spectrum",
    },
  },
  {
    id: "inhabitants",
    eyebrow: "THE INHABITANTS",
    title: "Across the heap, five inhabitants woke.",
    body: "Rose, amber, lime, cyan, and violet—one light, finding five voices.",
    imageSrc: "/prism-intro/06-inhabitants.webp",
    imageAlt:
      "A white triangle orb fans rose, amber, lime, cyan, and violet light upward into the waking black-glass faces of Pia, Rowan, Iris, Sol, and Mira amid a much larger dormant heap.",
    imagePosition: "center center",
    lightTarget: {
      xPercent: 58,
      yPercent: 68,
      diameterVmin: 17,
      kind: "orb",
      label: "Let the orb awaken the five inhabitants",
      hint: "Let the light find its voices",
    },
  },
  {
    id: "interplay",
    eyebrow: "THE INTERPLAY",
    title: "They met, challenged, and changed one another.",
    body: "From their interplay came words, images, worlds, and paths.",
    imageSrc: "/prism-intro/07-interplay.webp",
    imageAlt:
      "Pia, Rowan, Iris, Sol, and Mira gather around a white triangle orb as colored motes, waveforms, and sketch traces mingle above a creative table.",
    imagePosition: "center center",
    lightTarget: {
      xPercent: 50,
      yPercent: 59,
      diameterVmin: 15,
      kind: "orb",
      label: "Join the inhabitants around the living orb",
      hint: "Enter the interplay",
    },
  },
  {
    id: "invitation",
    eyebrow: "ENTER PRISM",
    title: "The threshold opened.",
    body: `${PRISM_BRAND_COPY.coreBelief} ${PRISM_BRAND_COPY.slogan}`,
    imageSrc: "/prism-intro/08-enter.webp",
    imageAlt:
      "A radiant glass orb containing an open white triangle waits in the foreground while five colorful inhabitants watch from a creative table behind it.",
    imagePosition: "65% center",
    lightTarget: {
      xPercent: 80,
      yPercent: 55,
      diameterVmin: 34,
      kind: "orb",
      label: "Enter PRISM through the radiant orb",
      hint: "Enter PRISM",
    },
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
