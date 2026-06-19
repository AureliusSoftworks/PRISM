export const PRISM_DEFAULT_STORY_THEME_ID = "prism_default";
export const STORY_THEME_PUBLIC_BASE_PATH = "/story-themes";

export type StoryAssetKind =
  | "sprite_reference"
  | "sprite_fallback"
  | "background_reference"
  | "cutscene_reference"
  | "projection_fallback"
  | "map_style_reference"
  | "item_glyph_style";

export type StorySpritePose = "idle" | "speaking" | "thinking" | "action";

export type StoryItemGlyphCategory =
  | "weapon"
  | "potion"
  | "key"
  | "clue"
  | "document"
  | "relic"
  | "tool"
  | "collectible";

export interface StoryThemeAsset {
  id: string;
  themeId: string;
  kind: StoryAssetKind;
  label: string;
  url: string;
  width: number;
  height: number;
  format: "png";
  transparent: boolean;
  immutable: true;
  deletable: false;
  editable: false;
  exportable: false;
  promptRole: string;
  tags: readonly string[];
  spritePoses?: readonly StorySpritePose[];
}

export interface StoryThemeManifest {
  id: string;
  label: string;
  version: 1;
  builtin: true;
  immutable: true;
  deletable: false;
  editable: false;
  exportable: false;
  description: string;
  assetBasePath: string;
  sprite: {
    poses: readonly StorySpritePose[];
    blankFaceRequired: true;
    asciiFaceOverlay: true;
    faceZone: {
      unit: "normalized";
      x: number;
      y: number;
      width: number;
      height: number;
    };
  };
  itemGlyphCategories: readonly StoryItemGlyphCategory[];
  style: {
    summary: string;
    positivePrompt: string;
    negativePrompt: string;
    spritePromptRules: string;
    backgroundPromptRules: string;
    cutscenePromptRules: string;
    projectionRules: string;
    mapPromptRules: string;
    itemGlyphRules: string;
  };
  assets: readonly StoryThemeAsset[];
}

export const STORY_SPRITE_POSES: readonly StorySpritePose[] = [
  "idle",
  "speaking",
  "thinking",
  "action",
];

export const STORY_ITEM_GLYPH_CATEGORIES: readonly StoryItemGlyphCategory[] = [
  "weapon",
  "potion",
  "key",
  "clue",
  "document",
  "relic",
  "tool",
  "collectible",
];

const PRISM_DEFAULT_ASSET_BASE_PATH = `${STORY_THEME_PUBLIC_BASE_PATH}/${PRISM_DEFAULT_STORY_THEME_ID}`;

function prismDefaultAsset(
  asset: Omit<
    StoryThemeAsset,
    | "themeId"
    | "format"
    | "immutable"
    | "deletable"
    | "editable"
    | "exportable"
  >
): StoryThemeAsset {
  return {
    ...asset,
    themeId: PRISM_DEFAULT_STORY_THEME_ID,
    format: "png",
    immutable: true,
    deletable: false,
    editable: false,
    exportable: false,
  };
}

export const PRISM_DEFAULT_STORY_THEME: StoryThemeManifest = {
  id: PRISM_DEFAULT_STORY_THEME_ID,
  label: "PRISM",
  version: 1,
  builtin: true,
  immutable: true,
  deletable: false,
  editable: false,
  exportable: false,
  description:
    "The bundled PRISM visual novel baseline: middle-light projected storybook scenes, blank-face sprites, white tintable sprite accents, restrained rainbow accents, and glyph-first items.",
  assetBasePath: PRISM_DEFAULT_ASSET_BASE_PATH,
  sprite: {
    poses: STORY_SPRITE_POSES,
    blankFaceRequired: true,
    asciiFaceOverlay: true,
    faceZone: {
      unit: "normalized",
      x: 0.38,
      y: 0.11,
      width: 0.24,
      height: 0.18,
    },
  },
  itemGlyphCategories: STORY_ITEM_GLYPH_CATEGORIES,
  style: {
    summary:
      "Soft visual-novel storybook art with translucent projected lighting, readable silhouettes, a balanced grayscale middle-light atmosphere, white tintable sprite accents, and precise PRISM color accents.",
    positivePrompt:
      "PRISM visual novel storybook illustration, cinematic but restrained, readable silhouette design, soft ink edges, translucent projected lighting, balanced middle-light grayscale atmosphere that works over light or dark app themes, white tintable sprite accent zones, subtle rainbow prism accents, no text in the image",
    negativePrompt:
      "named artist style, celebrity likeness, photorealism, harsh collage, pure black scene base, pure white scene base, inconsistent rendering, busy unreadable silhouettes, text, captions, logos, watermarks, UI controls baked into the image, colored sprite accents that should be tintable white, detailed facial features on blank-face sprites",
    spritePromptRules:
      "Create consistent blank-face androgynous android character sprites with clean silhouette language, transparent background, no detailed eyes, nose, mouth, or facial expression. Leave a clear face zone for runtime ASCII overlays. Use white accent panels and white glow strips so CSS can tint the accents to the bot color. Use the four pose roles only: idle, speaking, thinking, action.",
    backgroundPromptRules:
      "Create full-screen 16:9 location references with strong foreground, midground, and background separation. Keep the center readable for dialogue staging, use a middle-light grayscale base instead of separate light and dark variants, and leave edges compatible with opacity and vignette projection masks.",
    cutscenePromptRules:
      "Create full-screen 16:9 cinematic cutscene references with dramatic composition, clear silhouettes, and no baked text. The frame must remain readable after a dark edge vignette and partial transparency.",
    projectionRules:
      "Backgrounds are rendered by the app as projected imagery over the PRISM shell. Do not rely on generated alpha; use UI opacity, masks, and vignette treatment at runtime.",
    mapPromptRules:
      "Maps are procedural and seeded in code. Use scribbled regional contours, simple route marks, discovery nodes, and PRISM accent glows as the visual reference.",
    itemGlyphRules:
      "Use themed glyph cards for ordinary items. Generate raster item images only for special key assets in later Story Mode phases.",
  },
  assets: [
    prismDefaultAsset({
      id: "sprite_reference_sheet",
      kind: "sprite_reference",
      label: "Sprite reference sheet",
      url: `${PRISM_DEFAULT_ASSET_BASE_PATH}/sprite_reference_sheet.png`,
      width: 2048,
      height: 1536,
      transparent: true,
      promptRole:
        "Reference sheet for bot sprite generation: four blank-face poses with consistent proportions and face-overlay placement.",
      tags: ["sprite", "reference", "blank-face", "pose-sheet"],
      spritePoses: STORY_SPRITE_POSES,
    }),
    prismDefaultAsset({
      id: "sprite_fallback_silhouette",
      kind: "sprite_fallback",
      label: "Sprite fallback android",
      url: `${PRISM_DEFAULT_ASSET_BASE_PATH}/sprite_fallback_silhouette.png`,
      width: 1024,
      height: 1536,
      transparent: true,
      promptRole:
        "Runtime fallback blank-face android sprite while bot-specific sprite generation is missing, blocked, or backfilling.",
      tags: ["sprite", "fallback", "blank-face", "android"],
      spritePoses: ["idle"],
    }),
    prismDefaultAsset({
      id: "background_reference_exterior",
      kind: "background_reference",
      label: "Exterior background reference",
      url: `${PRISM_DEFAULT_ASSET_BASE_PATH}/background_reference_exterior.png`,
      width: 1920,
      height: 1080,
      transparent: false,
      promptRole:
        "Reference for open or exterior story locations using PRISM projection-friendly composition.",
      tags: ["background", "reference", "exterior", "location"],
    }),
    prismDefaultAsset({
      id: "background_reference_interior",
      kind: "background_reference",
      label: "Interior background reference",
      url: `${PRISM_DEFAULT_ASSET_BASE_PATH}/background_reference_interior.png`,
      width: 1920,
      height: 1080,
      transparent: false,
      promptRole:
        "Reference for enclosed story locations with readable staging space and restrained PRISM accents.",
      tags: ["background", "reference", "interior", "location"],
    }),
    prismDefaultAsset({
      id: "background_reference_liminal",
      kind: "background_reference",
      label: "Liminal background reference",
      url: `${PRISM_DEFAULT_ASSET_BASE_PATH}/background_reference_liminal.png`,
      width: 1920,
      height: 1080,
      transparent: false,
      promptRole:
        "Reference for strange, dark, or threshold locations without becoming visually noisy.",
      tags: ["background", "reference", "liminal", "location"],
    }),
    prismDefaultAsset({
      id: "cutscene_reference",
      kind: "cutscene_reference",
      label: "Cutscene reference",
      url: `${PRISM_DEFAULT_ASSET_BASE_PATH}/cutscene_reference.png`,
      width: 1920,
      height: 1080,
      transparent: false,
      promptRole:
        "Reference for timed or click-to-continue full-screen cutscenes with cinematic framing.",
      tags: ["cutscene", "reference", "cinematic"],
    }),
    prismDefaultAsset({
      id: "projection_fallback",
      kind: "projection_fallback",
      label: "Projection fallback",
      url: `${PRISM_DEFAULT_ASSET_BASE_PATH}/projection_fallback.png`,
      width: 1920,
      height: 1080,
      transparent: false,
      promptRole:
        "Generic projected-scene fallback for loading or missing Story backgrounds.",
      tags: ["projection", "fallback", "placeholder"],
    }),
    prismDefaultAsset({
      id: "map_style_reference",
      kind: "map_style_reference",
      label: "Map style reference",
      url: `${PRISM_DEFAULT_ASSET_BASE_PATH}/map_style_reference.png`,
      width: 1920,
      height: 1080,
      transparent: false,
      promptRole:
        "Reference for seeded procedural Story maps; not a reusable map image.",
      tags: ["map", "reference", "procedural", "scribbled"],
    }),
  ],
};

const BUILTIN_STORY_THEMES: readonly StoryThemeManifest[] = [
  PRISM_DEFAULT_STORY_THEME,
];

const BUILTIN_STORY_THEME_ASSET_KEYS = new Set(
  BUILTIN_STORY_THEMES.flatMap((theme) =>
    theme.assets.map((asset) => `${asset.themeId}:${asset.id}`)
  )
);

export function getBuiltinStoryThemes(): readonly StoryThemeManifest[] {
  return BUILTIN_STORY_THEMES;
}

export function getStoryThemeById(id: string): StoryThemeManifest | undefined {
  const normalized = id.trim();
  return BUILTIN_STORY_THEMES.find((theme) => theme.id === normalized);
}

export function isBuiltinStoryThemeAsset(
  asset: Pick<StoryThemeAsset, "themeId" | "id">
): boolean {
  return BUILTIN_STORY_THEME_ASSET_KEYS.has(`${asset.themeId}:${asset.id}`);
}
