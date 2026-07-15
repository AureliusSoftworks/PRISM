/** Canonical PRISM brand language shared by product copy and visual marks. */
export const PRISM_BRAND_COPY = {
  coreBelief: "You are the light. Prism reveals the spectrum.",
  slogan: "One light. Many colors.",
  foundationalTruth:
    "The prism does not create the colors. It reveals what was already inside the light.",
} as const;

/**
 * One hue per letter of PRISM. These colors belong to signature brand marks;
 * active bots and applets retain their own contextual accent colors.
 */
export const PRISM_BRAND_COLORS = {
  p: "#ff4d6d",
  r: "#ff9f1c",
  i: "#b7e63a",
  s: "#2fd3e3",
  m: "#7b5cff",
} as const;

/** The three complementary marks in the responsive PRISM identity system. */
export const PRISM_BRAND_MARKS = {
  primary: "refraction-emblem",
  signature: "wordmark",
  compact: "triangle",
} as const;
