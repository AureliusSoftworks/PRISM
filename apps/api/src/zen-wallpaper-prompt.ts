type ZenWallpaperPromptArgs = {
  initialUserPrompt: string;
  recentContext: string;
  botName: string | null;
  botSystemPrompt: string | null;
  styleNotes?: string | null;
  generationIndex?: number | null;
};

type VisualCueRule = {
  label: string;
  patterns: RegExp[];
};

const MAX_ZEN_WALLPAPER_CUES = 12;
export const ZEN_WALLPAPER_THEME_COUNT = 4;

type ZenWallpaperThemeLane = {
  label: string;
  instruction: string;
  fallbackCue: string;
};

const ZEN_WALLPAPER_THEME_LANES: ZenWallpaperThemeLane[] = [
  {
    label: "light signature",
    instruction:
      "lead with the chat's key light, value contrast, and color temperature; use one broad luminous beam, glow field, or shadow falloff as the main visual treatment",
    fallbackCue: "pearl dawn light",
  },
  {
    label: "material memory",
    instruction:
      "lead with tactile surfaces, grain, dust, fibers, vapor, or weathering; make texture and touch the main visual treatment, not large flat shapes",
    fallbackCue: "soft glass and paper grain",
  },
  {
    label: "spatial rhythm",
    instruction:
      "lead with calm geometry, repeated silhouettes, horizon lines, or architectural spacing; make the composition read through clear structure and depth",
    fallbackCue: "slow geometric depth",
  },
  {
    label: "emotional weather",
    instruction:
      "lead with motion, haze, atmosphere, and the emotional temperature of the exchange; make drifting air, mist, rain-soft glow, or slow arcs the main visual treatment",
    fallbackCue: "quiet mist and reflective air",
  },
];

const HUMOR_PATTERN = /\b(funny|humou?r|joke|jesters?|laughter|laugh|antics|capering|comedy|comic)\b/i;
const MELANCHOLY_PATTERN = /\b(melancholy|sad|sorrow|loss(?:es)?|tears?|lament(?:ation)?s?|wistful|lonely|grief|sighs?)\b/i;

const ZEN_WALLPAPER_CUE_RULES: VisualCueRule[] = [
  {
    label: "warm kitchen light",
    patterns: [
      /\bbak(?:e|ed|es|ing)\b/i,
      /\bkitchen\b/i,
      /\boven\b/i,
      /\bcookies?\b/i,
      /\bbread\b/i,
      /\bpie\b/i,
      /\brecipe\b/i,
    ],
  },
  {
    label: "flour-dust texture",
    patterns: [
      /\bflour\b/i,
      /\bdough\b/i,
      /\bbatter\b/i,
      /\bsugar\b/i,
      /\bcinnamon\b/i,
      /\bpastr(?:y|ies)\b/i,
    ],
  },
  {
    label: "cooling tray geometry",
    patterns: [
      /\bcooling rack\b/i,
      /\bcooling tray\b/i,
      /\bbaking sheet\b/i,
      /\bcookie sheet\b/i,
      /\btray\b/i,
      /\brack\b/i,
    ],
  },
  {
    label: "folded stationery",
    patterns: [
      /\bhandwritten\b/i,
      /\bletters?\b/i,
      /\bstationery\b/i,
      /\benvelope\b/i,
      /\bpostcards?\b/i,
      /\bnotes?\b/i,
      /\bcards?\b/i,
    ],
  },
  {
    label: "family keepsake warmth",
    patterns: [
      /\bfamily\b/i,
      /\bgrandm(?:a|other)\b/i,
      /\bgrandp(?:a|arent)\b/i,
      /\bchildhood\b/i,
      /\bhome\b/i,
      /\bkeepsake\b/i,
    ],
  },
  {
    label: "moonlight",
    patterns: [/\bluna\b/i, /\bmoon(?:lit|light|rise)?\b/i, /\blunar\b/i],
  },
  {
    label: "old city stone",
    patterns: [
      /\btallinn\b/i,
      /\bmedieval\b/i,
      /\bold city\b/i,
      /\bcobble(?:stone)?s?\b/i,
      /\bstone(?:work|s)?\b/i,
      /\bcastle\b/i,
    ],
  },
  {
    label: "tidal glass gradients",
    patterns: [
      /\bocean\b/i,
      /\bsea\b/i,
      /\btide(?:s|al)?\b/i,
      /\bshore(?:line)?\b/i,
      /\bcoast(?:al)?\b/i,
      /\bwave(?:s)?\b/i,
    ],
  },
  {
    label: "rain-washed light",
    patterns: [
      /\brain(?:y|fall)?\b/i,
      /\bstorm(?:y)?\b/i,
      /\bthunder\b/i,
      /\bcloud(?:s|y)?\b/i,
      /\bweather\b/i,
      /\bwindowpane\b/i,
    ],
  },
  {
    label: "leaf-shadow texture",
    patterns: [
      /\bforest\b/i,
      /\bwoods?\b/i,
      /\bgarden\b/i,
      /\bleaves?\b/i,
      /\bbranches?\b/i,
      /\bmoss\b/i,
    ],
  },
  {
    label: "starfield hush",
    patterns: [
      /\bstars?\b/i,
      /\bnight\b/i,
      /\bcosmos\b/i,
      /\bgalax(?:y|ies)\b/i,
      /\bconstellation(?:s)?\b/i,
      /\bsky\b/i,
    ],
  },
  {
    label: "ember glow",
    patterns: [
      /\bfire\b/i,
      /\bflame(?:s)?\b/i,
      /\bcandle(?:light|s)?\b/i,
      /\bember(?:s)?\b/i,
      /\bhearth\b/i,
    ],
  },
  {
    label: "quiet desk geometry",
    patterns: [
      /\bdesk\b/i,
      /\bworkspace\b/i,
      /\bnotebook\b/i,
      /\bjournal\b/i,
      /\bpaperwork\b/i,
      /\bworkflow\b/i,
    ],
  },
  {
    label: "map-line drift",
    patterns: [
      /\bmap(?:s)?\b/i,
      /\btravel(?:ing|led)?\b/i,
      /\bjourney\b/i,
      /\broad(?:s)?\b/i,
      /\btrain(?:s)?\b/i,
      /\bpath(?:s)?\b/i,
    ],
  },
  {
    label: "fiddle-string lines",
    patterns: [
      /\bfiddle\b/i,
      /\bviolin\b/i,
      /\bstrings?\b/i,
      /\bbow(?:ed|ing)?\b/i,
      /\binstrument\b/i,
      /\blullaby\b/i,
      /\bserenade\b/i,
      /\bmelod(?:y|ic)\b/i,
      /\bmusic(?:al)?\b/i,
    ],
  },
  {
    label: "capering motion",
    patterns: [
      /\bjester(?:s)?\b/i,
      /\bantics\b/i,
      /\bcaper(?:ing|s)?\b/i,
      /\bplayful\b/i,
      /\bdance(?:d|s|ing)?\b/i,
    ],
  },
  {
    label: "dawn mist",
    patterns: [
      /\bdawn\b/i,
      /\bmorning\b/i,
      /\bmist(?:y)?\b/i,
      /\bfog(?:gy)?\b/i,
      /\bhaze\b/i,
      /\bwhisper(?:ing|ed|s)?\b/i,
    ],
  },
  {
    label: "woven thread texture",
    patterns: [
      /\bweav(?:e|er|ing|es)\b/i,
      /\bthread(?:s|ed)?\b/i,
      /\btapestry\b/i,
      /\bfabric\b/i,
      /\bspinner\b/i,
    ],
  },
  {
    label: "fleeting storybook magic",
    patterns: [
      /\bfleeting\b/i,
      /\bmagic(?:al)?\b/i,
      /\bmystic\b/i,
      /\bghost(?:s|ly)?\b/i,
      /\bstorybook\b/i,
      /\bstor(?:y|ies)\b/i,
      /\btales?\b/i,
      /\benchant(?:ed|ment|ing)?\b/i,
    ],
  },
  {
    label: "soft signal geometry",
    patterns: [
      /\bcode\b/i,
      /\bapi\b/i,
      /\bserver\b/i,
      /\bmodel(?:s)?\b/i,
      /\blocal\b/i,
      /\bprivacy\b/i,
      /\bprompt(?:s)?\b/i,
    ],
  },
  {
    label: "warm vapor drift",
    patterns: [/\bcoffee\b/i, /\btea\b/i, /\bsteam\b/i, /\bvapor\b/i],
  },
  {
    label: "still water gradients",
    patterns: [/\bzen\b/i, /\bcalm\b/i, /\bquiet\b/i, /\breflective\b/i],
  },
];

function normalizeZenWallpaperContext(text: string): string {
  return text
    .replace(/\b(?:user|assistant|system|tool)\s*:/gi, " ")
    .replace(/\/([a-z][a-z0-9-]*)/gi, (_, command: string) =>
      ` ${String(command).replace(/-/g, " ")} `
    )
    .replace(/[‘’]/g, "'")
    .replace(/\b[a-z]'\s*/gi, " ")
    .replace(/\b[a-z]\b/gi, " ")
    .replace(/\.{2,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAnyPattern(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function pushUnique(items: string[], item: string): void {
  if (!items.includes(item)) items.push(item);
}

function formatCueList(cues: readonly string[]): string {
  if (cues.length === 0) return "";
  if (cues.length === 1) return cues[0] ?? "";
  if (cues.length === 2) return `${cues[0]} and ${cues[1]}`;
  return `${cues.slice(0, -1).join(", ")}, and ${cues[cues.length - 1]}`;
}

function normalizeGenerationIndex(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function selectThemeLane(generationIndex: number): ZenWallpaperThemeLane {
  return ZEN_WALLPAPER_THEME_LANES[
    generationIndex % ZEN_WALLPAPER_THEME_LANES.length
  ]!;
}

function selectPrimaryCue(
  cues: readonly string[],
  generationIndex: number,
  fallbackCue: string
): string {
  if (cues.length === 0) return fallbackCue;
  const themeOffset = generationIndex % ZEN_WALLPAPER_THEME_COUNT;
  const cueIndex = Math.min(
    cues.length - 1,
    Math.floor((themeOffset * cues.length) / ZEN_WALLPAPER_THEME_COUNT)
  );
  return cues[cueIndex] ?? fallbackCue;
}

function selectSupportingCues(
  cues: readonly string[],
  primaryCue: string
): string {
  const primaryIndex = Math.max(0, cues.indexOf(primaryCue));
  const rotatedCues = [
    ...cues.slice(primaryIndex + 1),
    ...cues.slice(0, primaryIndex),
  ];
  const supporting = rotatedCues.filter((cue) => cue !== primaryCue).slice(0, 3);
  return formatCueList(supporting);
}

export function clampZenWallpaperPromptText(
  text: string | null | undefined,
  maxLen: number
): string {
  const normalized = (text ?? "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLen - 3)).trimEnd()}...`;
}

function isDefaultPrismBotName(name: string): boolean {
  return name.length === 0 || name.toLowerCase() === "prism";
}

function composeZenWallpaperPersonaContext(args: ZenWallpaperPromptArgs): string | null {
  const botName = clampZenWallpaperPromptText(args.botName, 80);
  if (isDefaultPrismBotName(botName)) return null;

  const personaExcerpt = clampZenWallpaperPromptText(args.botSystemPrompt, 420);
  const personaCue = personaExcerpt
    ? ` Persona cue: ${personaExcerpt}`
    : "";
  return `Active bot/persona visual context: ${botName}.${personaCue} Use the persona's implied setting, objects, palette, materials, and mood when useful; depict the world or atmosphere rather than the character.`;
}

export function normalizeZenWallpaperPromptOverride(
  text: string | null | undefined,
  maxLen = 3000
): string {
  if (typeof text !== "string" || text.trim().length === 0) return "";
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen);
}

export function extractZenWallpaperVisualCues(
  text: string,
  maxCues = MAX_ZEN_WALLPAPER_CUES
): string[] {
  const normalized = normalizeZenWallpaperContext(text);
  const cues: string[] = [];
  for (const rule of ZEN_WALLPAPER_CUE_RULES) {
    if (hasAnyPattern(normalized, rule.patterns)) {
      pushUnique(cues, rule.label);
    }
    if (cues.length >= maxCues) return cues;
  }

  const hasHumor = HUMOR_PATTERN.test(normalized);
  const hasMelancholy = MELANCHOLY_PATTERN.test(normalized);
  if (hasHumor && hasMelancholy) {
    pushUnique(cues, "melancholy humor");
  } else if (hasHumor) {
    pushUnique(cues, "dry humor");
  } else if (hasMelancholy) {
    pushUnique(cues, "melancholy quiet");
  }

  return cues.slice(0, maxCues);
}

export function composeZenWallpaperPrompt(args: ZenWallpaperPromptArgs): string {
  const cues = extractZenWallpaperVisualCues(
    `${clampZenWallpaperPromptText(args.initialUserPrompt, 700)}\n${clampZenWallpaperPromptText(args.recentContext, 900)}`
  );
  const generationIndex = normalizeGenerationIndex(args.generationIndex);
  const lane = selectThemeLane(generationIndex);
  const themeNumber = (generationIndex % ZEN_WALLPAPER_THEME_COUNT) + 1;
  const primaryCue = selectPrimaryCue(cues, generationIndex, lane.fallbackCue);
  const supportingCueText = selectSupportingCues(cues, primaryCue);
  const styleNotes = clampZenWallpaperPromptText(args.styleNotes, 320);
  const personaContext = composeZenWallpaperPersonaContext(args);
  const styleOrPersonaDriven = Boolean(styleNotes || personaContext);

  return [
    "Widescreen ambient wallpaper for a calm Zen chat canvas; it may be abstract, scenic, symbolic, or representational when the chat or active persona calls for it.",
    styleOrPersonaDriven
      ? "Let the active style or persona choose the palette, materials, setting, and vividness; PRISM house colors are optional, not required."
      : "For default PRISM or fallback atmosphere, favor charcoal, pearl, mist-gray, soft gradients, atmospheric texture, gentle depth, and one restrained prismatic accent.",
    personaContext,
    `Wallpaper theme ${themeNumber}/${ZEN_WALLPAPER_THEME_COUNT} - ${lane.label}: ${lane.instruction}.`,
    cues.length > 0
      ? `Make ${primaryCue} the clearest chat-derived influence${supportingCueText ? `, supported by ${supportingCueText}` : ""}; show these as recognizable broad light, material, silhouette, setting, spatial, or weather decisions rather than barely-there noise.`
      : `No strong concrete motif was found in the chat, so make ${primaryCue} the clear influence through recognizable broad light, material, silhouette, setting, spatial, or weather decisions rather than barely-there noise.`,
    styleNotes
      ? `User atmosphere style notes: ${styleNotes}. Make this style visibly legible through materials, composition, and surface treatment; these notes may override palette and setting, but not safety, widescreen, or center-readability rules.`
      : null,
    "Keep the four-theme series cohesive as chat wallpapers: widescreen, full-bleed, readable, and center-safe, while making this specific theme distinct at a glance through dominant treatment, scale, color, and composition.",
    styleOrPersonaDriven
      ? "Do not force prismatic rainbow accents unless they naturally fit the chosen style, persona, or scene."
      : "Add prismatic rainbow accents only as restrained edge-light, refractions, haze, or thin spectral glints.",
    "Full-bleed edge-to-edge composition with atmosphere continuing past all four edges; no borders, frames, mats, letterboxing, pillarboxing, side gutters, or empty bars.",
    "Use a widescreen composition with the central prose region comparatively empty, low-detail, and softly readable; keep vivid or detailed elements toward the edges or as broad environmental depth.",
    "No readable text, letters, numbers, people, faces, bodies, characters, creatures, logos, icons, UI, screenshots, standalone symbols, pictograms, or emblems.",
  ].filter((part): part is string => Boolean(part)).join(" ");
}
