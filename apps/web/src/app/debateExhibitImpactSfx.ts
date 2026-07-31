import { routeAudioElementToPrismOutput } from "./replayAudioMasterCapture.ts";

export type DebateExhibitImpactMaterial =
  | "wood"
  | "glass"
  | "metal"
  | "ceramic"
  | "plastic"
  | "rubber"
  | "stone"
  | "cardboard"
  | "fabric"
  | "ice";

export type DebateExhibitImpactMoment = "packet_add" | "table_place";

export const DEBATE_EXHIBIT_IMPACT_URLS = {
  wood: "/audio/debate/exhibits/impact-wood.mp3",
  glass: "/audio/debate/exhibits/impact-glass.mp3",
  metal: "/audio/debate/exhibits/impact-metal.mp3",
  ceramic: "/audio/debate/exhibits/impact-ceramic.mp3",
  plastic: "/audio/debate/exhibits/impact-plastic.mp3",
  rubber: "/audio/debate/exhibits/impact-rubber.mp3",
  stone: "/audio/debate/exhibits/impact-stone.mp3",
  cardboard: "/audio/debate/exhibits/impact-cardboard.mp3",
  fabric: "/audio/debate/exhibits/impact-fabric.mp3",
  ice: "/audio/debate/exhibits/impact-ice.mp3",
} as const satisfies Record<DebateExhibitImpactMaterial, string>;

/** Packet add is a light seal; table place is a fuller set-down. */
export const DEBATE_EXHIBIT_IMPACT_TRIM = {
  packet_add: 0.62,
  table_place: 0.88,
} as const satisfies Record<DebateExhibitImpactMoment, number>;

const DEFAULT_MATERIAL: DebateExhibitImpactMaterial = "wood";

const ADJECTIVE_MATERIAL: Record<string, DebateExhibitImpactMaterial> = {
  wooden: "wood",
  weathered: "wood",
  burnt: "wood",
  brass: "metal",
  golden: "metal",
  silver: "metal",
  rusty: "metal",
  polished: "metal",
  electric: "metal",
  frozen: "ice",
  cold: "ice",
  ivory: "stone",
  emerald: "stone",
  heavy: "stone",
  velvet: "fabric",
  soggy: "fabric",
  muddy: "fabric",
  cracked: "ceramic",
  broken: "glass",
};

const OBJECT_MATERIAL: Record<string, DebateExhibitImpactMaterial> = {
  "alarm clock": "plastic",
  apple: "wood",
  briefcase: "cardboard",
  button: "plastic",
  camera: "plastic",
  candle: "wood",
  compass: "metal",
  crowbar: "metal",
  diary: "cardboard",
  feather: "fabric",
  flashlight: "plastic",
  "freight train": "metal",
  glove: "fabric",
  hammer: "metal",
  hat: "fabric",
  hourglass: "glass",
  key: "metal",
  lantern: "metal",
  letter: "cardboard",
  locket: "metal",
  map: "cardboard",
  marble: "stone",
  mask: "fabric",
  matchbook: "cardboard",
  medal: "metal",
  mug: "ceramic",
  notebook: "cardboard",
  orangutan: "fabric",
  paintbrush: "wood",
  "paper crane": "cardboard",
  "pocket watch": "metal",
  potato: "wood",
  radio: "plastic",
  receipt: "cardboard",
  record: "plastic",
  ring: "metal",
  rope: "fabric",
  shoe: "rubber",
  spoon: "metal",
  suitcase: "cardboard",
  teacup: "ceramic",
  ticket: "cardboard",
  "toy rocket": "plastic",
  umbrella: "fabric",
  wallet: "fabric",
  whistle: "metal",
};

function normalizeExhibitText(value: string): string {
  return value.replace(/\s+/gu, " ").trim().toLowerCase();
}

/**
 * Infer a playable impact material from exhibit wording.
 * Object nouns win over adjectives; unknown items fall back to wood.
 */
export function resolveDebateExhibitImpactMaterial(args: {
  adjective?: string | null;
  object?: string | null;
  title?: string | null;
}): DebateExhibitImpactMaterial {
  const object = normalizeExhibitText(args.object ?? "");
  if (object && OBJECT_MATERIAL[object]) {
    return OBJECT_MATERIAL[object]!;
  }

  const adjective = normalizeExhibitText(args.adjective ?? "");
  if (adjective && ADJECTIVE_MATERIAL[adjective]) {
    return ADJECTIVE_MATERIAL[adjective]!;
  }

  const haystack = normalizeExhibitText(
    [args.adjective, args.object, args.title].filter(Boolean).join(" "),
  );
  if (/\b(?:glass|crystal|mirror|hourglass)\b/u.test(haystack)) return "glass";
  if (/\b(?:ice|frost|frozen)\b/u.test(haystack)) return "ice";
  if (/\b(?:steel|iron|brass|copper|metal|key|lock)\b/u.test(haystack))
    return "metal";
  if (/\b(?:ceramic|porcelain|china|mug|cup|teacup)\b/u.test(haystack))
    return "ceramic";
  if (/\b(?:rubber|silicone|shoe)\b/u.test(haystack)) return "rubber";
  if (/\b(?:stone|marble|granite|rock)\b/u.test(haystack)) return "stone";
  if (/\b(?:paper|cardboard|letter|receipt|ticket|map|diary)\b/u.test(haystack))
    return "cardboard";
  if (/\b(?:cloth|fabric|velvet|glove|hat|rope|feather)\b/u.test(haystack))
    return "fabric";
  if (/\b(?:plastic|polymer|toy|camera|radio)\b/u.test(haystack))
    return "plastic";
  if (/\b(?:wood|wooden|timber)\b/u.test(haystack)) return "wood";
  return DEFAULT_MATERIAL;
}

export function debateExhibitImpactUrl(
  material: DebateExhibitImpactMaterial,
): string {
  return DEBATE_EXHIBIT_IMPACT_URLS[material];
}

export function debateExhibitImpactForExhibit(
  exhibit: {
    adjective?: string | null;
    object?: string | null;
    title?: string | null;
  },
  moment: DebateExhibitImpactMoment,
): {
  material: DebateExhibitImpactMaterial;
  url: string;
  trim: number;
  events: readonly string[];
} {
  const material = resolveDebateExhibitImpactMaterial(exhibit);
  return {
    material,
    url: debateExhibitImpactUrl(material),
    trim: DEBATE_EXHIBIT_IMPACT_TRIM[moment],
    events:
      moment === "packet_add"
        ? (["evidence_packet_add", "exhibit_seal"] as const)
        : (["evidence_table_place", "exhibit_present"] as const),
  };
}

/** Setup-time playback when the live atmosphere bus is not running. */
export async function playDebateExhibitImpactSfx(args: {
  exhibit: {
    adjective?: string | null;
    object?: string | null;
    title?: string | null;
  };
  moment: DebateExhibitImpactMoment;
  volume?: number;
  enabled?: boolean;
}): Promise<boolean> {
  if (args.enabled === false) return false;
  const volume = Math.max(0, Math.min(1, args.volume ?? 0.55));
  if (volume <= 0) return false;
  const impact = debateExhibitImpactForExhibit(args.exhibit, args.moment);
  const audio = new Audio(impact.url);
  audio.volume = Math.max(0, Math.min(1, volume * impact.trim));
  const outputCleanup = routeAudioElementToPrismOutput(audio);
  try {
    await audio.play();
    return true;
  } catch {
    return false;
  } finally {
    const release = (): void => {
      outputCleanup?.();
      audio.removeEventListener("ended", release);
      audio.removeEventListener("error", release);
    };
    audio.addEventListener("ended", release);
    audio.addEventListener("error", release);
  }
}
