import {
  addAutoCenteredMansionLayoutV2Doors,
  type MansionLayoutBlockV2,
  type MansionLayoutEntityV2,
  type MansionLayoutRoomV2,
  type MansionLayoutV2,
  type MysteryVenueKindV1,
  type MysteryVenueArchetypeV1,
  type MysteryVenueEraV1,
  type MysteryVenueIntentV1,
  type MysteryVenuePhysicalScaleClassV1,
  type MysteryVenueProfileV1,
  type MysteryVenueProposalMatchV1,
  type MysteryVenueRoomSpatialV1,
  type MysteryVenueRoomRoleV1,
  type MysteryVenueTopologyV1,
} from "./mansionLayoutV2.ts";

export type MysteryVenueLengthIdV1 = "quick" | "standard" | "grand" | "custom";

export interface MysteryVenueLengthV1 {
  id: MysteryVenueLengthIdV1;
  rooms: number;
  suspects: number;
  tiers?: number;
}

export interface MysteryVenueProposalV1 {
  version: 1;
  id: string;
  nonce: string;
  title: string;
  description: string;
  atmosphere: string;
  source: "catalog" | "model" | "hybrid";
  intent: MysteryVenueIntentV1;
  match: MysteryVenueProposalMatchV1;
  /** Public, spoiler-free language ingredients used to reproduce the
   * server-owned geometry when the proposal is accepted. Not persisted. */
  creativeDraft?: MysteryVenueCreativeDraftV1;
  editableDraftNotice?: string;
  length: Required<MysteryVenueLengthV1>;
  profile: MysteryVenueProfileV1;
  layout: MansionLayoutV2;
  topologySilhouette: Array<{ tierLabel: string; roomNames: string[] }>;
}

export interface MysteryVenueCreativeRoomDraftV1 {
  templateId: string;
  name: string;
  emoji: string;
  role: MysteryVenueRoomRoleV1;
  anchors: string[];
}

/** Spoiler-safe model contribution. Geometry is intentionally absent. */
export interface MysteryVenueCreativeDraftV1 {
  title: string;
  archetype?: MysteryVenueArchetypeV1;
  era?: MysteryVenueEraV1;
  physicalScaleClass?: MysteryVenuePhysicalScaleClassV1;
  kind: MysteryVenueKindV1;
  kindLabel: string;
  placeNoun: string;
  topology: MysteryVenueTopologyV1;
  tierNoun: string;
  exteriorMode: MysteryVenueProfileV1["exteriorMode"];
  environmentSummary: string;
  atmosphere: string;
  connectorLabel: string;
  rooms: MysteryVenueCreativeRoomDraftV1[];
}

interface VenueSeedRoom {
  templateId: string;
  name: string;
  emoji: string;
  role: MysteryVenueRoomRoleV1;
  anchors: string[];
  spatial?: MysteryVenueRoomSpatialV1;
  preferredTier?: number;
}

interface VenueSeed {
  archetype: MysteryVenueArchetypeV1;
  era: MysteryVenueEraV1;
  physicalScaleClass: MysteryVenuePhysicalScaleClassV1;
  kind: MysteryVenueKindV1;
  kindLabel: string;
  noun: string;
  topology: MysteryVenueTopologyV1;
  tierNoun: string;
  exteriorMode: MysteryVenueProfileV1["exteriorMode"];
  title: string;
  summary: string;
  atmosphere: string;
  connector: string;
  rooms: VenueSeedRoom[];
}

const VENUE_KINDS = new Set<MysteryVenueKindV1>(["estate", "vessel", "habitat", "facility", "transport", "other"]);
const VENUE_TOPOLOGIES = new Set<MysteryVenueTopologyV1>(["estate", "spine", "radial", "pods", "linear"]);
const VENUE_ROLES = new Set<MysteryVenueRoomRoleV1>(["entry", "circulation", "social", "private", "operations", "service", "technical", "observation", "other"]);
const VENUE_EXTERIOR_MODES = new Set<MysteryVenueProfileV1["exteriorMode"]>(["grounds", "docked", "contained", "in-transit", "other"]);
const VENUE_ARCHETYPES = new Set<MysteryVenueArchetypeV1>([
  "private_estate", "vintage_yacht", "passenger_cruise_ship", "lunar_habitat",
  "underwater_facility", "night_train", "custom",
]);
const VENUE_ERAS = new Set<MysteryVenueEraV1>(["historic", "modern", "futuristic", "unspecified"]);
const VENUE_PHYSICAL_SCALES = new Set<MysteryVenuePhysicalScaleClassV1>(["compact", "standard", "grand"]);

function compactDraftText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim().slice(0, max) : "";
}

export function parseMysteryVenueCreativeDraftV1(value: unknown): MysteryVenueCreativeDraftV1 | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as Record<string, unknown>;
  const kind = compactDraftText(draft.kind, 30) as MysteryVenueKindV1;
  const topology = compactDraftText(draft.topology, 30) as MysteryVenueTopologyV1;
  const exteriorMode = compactDraftText(draft.exteriorMode, 30) as MysteryVenueProfileV1["exteriorMode"];
  const rawRooms = Array.isArray(draft.rooms) ? draft.rooms : [];
  const rooms = rawRooms.flatMap((entry, index): MysteryVenueCreativeRoomDraftV1[] => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Record<string, unknown>;
    const name = compactDraftText(candidate.name, 80);
    const role = compactDraftText(candidate.role, 30) as MysteryVenueRoomRoleV1;
    const anchors = (Array.isArray(candidate.anchors) ? candidate.anchors : [])
      .map((anchor) => compactDraftText(anchor, 80)).filter(Boolean).slice(0, 4);
    if (!name || !VENUE_ROLES.has(role) || anchors.length < 1) return [];
    return [{
      templateId: compactDraftText(candidate.templateId, 80) ||
        `venue:${name.toLocaleLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "") || index + 1}`,
      name,
      emoji: compactDraftText(candidate.emoji, 8) || "◇",
      role,
      anchors,
    }];
  });
  const result: MysteryVenueCreativeDraftV1 = {
    title: compactDraftText(draft.title, 120),
    ...(VENUE_ARCHETYPES.has(compactDraftText(draft.archetype, 40) as MysteryVenueArchetypeV1)
      ? { archetype: compactDraftText(draft.archetype, 40) as MysteryVenueArchetypeV1 }
      : {}),
    ...(VENUE_ERAS.has(compactDraftText(draft.era, 20) as MysteryVenueEraV1)
      ? { era: compactDraftText(draft.era, 20) as MysteryVenueEraV1 }
      : {}),
    ...(VENUE_PHYSICAL_SCALES.has(compactDraftText(draft.physicalScaleClass, 20) as MysteryVenuePhysicalScaleClassV1)
      ? { physicalScaleClass: compactDraftText(draft.physicalScaleClass, 20) as MysteryVenuePhysicalScaleClassV1 }
      : {}),
    kind,
    kindLabel: compactDraftText(draft.kindLabel, 80),
    placeNoun: compactDraftText(draft.placeNoun, 40),
    topology,
    tierNoun: compactDraftText(draft.tierNoun, 40),
    exteriorMode,
    environmentSummary: compactDraftText(draft.environmentSummary, 500),
    atmosphere: compactDraftText(draft.atmosphere, 500),
    connectorLabel: compactDraftText(draft.connectorLabel, 80),
    rooms,
  };
  return result.title && VENUE_KINDS.has(result.kind) && result.kindLabel && result.placeNoun &&
    VENUE_TOPOLOGIES.has(result.topology) && result.tierNoun &&
    VENUE_EXTERIOR_MODES.has(result.exteriorMode) && result.environmentSummary &&
    result.atmosphere && result.connectorLabel && result.rooms.length >= 5
    ? result
    : null;
}

const room = (
  templateId: string,
  name: string,
  emoji: string,
  role: MysteryVenueRoomRoleV1,
  ...anchors: string[]
): VenueSeedRoom => ({ templateId, name, emoji, role, anchors });

function mentionedArchetypes(text: string): MysteryVenueArchetypeV1[] {
  const found: MysteryVenueArchetypeV1[] = [];
  if (/\b(?:passenger|ocean|full[- ]?size|large|modern)?\s*(?:cruise ship|cruise liner|ocean liner)\b/u.test(text)) {
    found.push("passenger_cruise_ship");
  }
  if (/\b(?:yacht|schooner|private vessel)\b/u.test(text)) found.push("vintage_yacht");
  if (/\b(?:house|mansion|manor|estate|castle|chateau|villa)\b/u.test(text)) found.push("private_estate");
  if (/\b(?:moon|lunar|space|orbital|mars)\b/u.test(text)) found.push("lunar_habitat");
  if (/\b(?:underwater|subsea|seafloor)\b/u.test(text)) found.push("underwater_facility");
  if (/\b(?:train|rail|carriage|express)\b/u.test(text)) found.push("night_train");
  return [...new Set(found)];
}

export function deriveMysteryVenueIntentV1(description: string): MysteryVenueIntentV1 {
  const text = description.toLocaleLowerCase();
  const excludedText = [...text.matchAll(/\b(?:not|never|exclude|without)\s+(?:an?\s+|the\s+)?([^.;]+)/gu)]
    .map((match) => match[1] ?? "").join(" ");
  const excludedArchetypes = mentionedArchetypes(excludedText);
  const requested = mentionedArchetypes(text).find((archetype) => !excludedArchetypes.includes(archetype));
  const archetype = requested ?? (/\b(?:ship|liner|vessel)\b/u.test(text)
    ? "passenger_cruise_ship"
    : "custom");
  const era: MysteryVenueEraV1 = /\b(?:modern|contemporary|present[- ]day|current)\b/u.test(text)
    ? "modern"
    : /\b(?:vintage|historic|victorian|edwardian|old[- ]world)\b/u.test(text)
      ? "historic"
      : /\b(?:future|futuristic|sci[- ]?fi)\b/u.test(text)
        ? "futuristic"
        : "unspecified";
  const physicalScaleClass: MysteryVenuePhysicalScaleClassV1 =
    archetype === "passenger_cruise_ship" || /\b(?:full[- ]?size|large[- ]scale|massive|grand)\b/u.test(text)
      ? "grand"
      : /\b(?:small|compact|intimate)\b/u.test(text)
        ? "compact"
        : "standard";
  return { version: 1, archetype, era, physicalScaleClass, excludedArchetypes };
}

function draftArchetype(draft: MysteryVenueCreativeDraftV1): MysteryVenueArchetypeV1 {
  if (draft.archetype) return draft.archetype;
  return deriveMysteryVenueIntentV1([
    draft.kindLabel, draft.placeNoun, draft.title, draft.environmentSummary,
  ].join(" ")).archetype;
}

export function matchMysteryVenueCreativeDraftV1(
  intent: MysteryVenueIntentV1,
  draft: MysteryVenueCreativeDraftV1 | null,
): MysteryVenueProposalMatchV1 {
  if (!draft) {
    return {
      version: 1,
      status: intent.archetype === "custom" ? "confirmation_required" : "matched",
      reasons: intent.archetype === "custom"
        ? ["PRISM supplied a generic structured venue draft; confirm or edit it before acceptance."]
        : ["PRISM supplied a compatible catalog venue because model dressing was unavailable."],
    };
  }
  const candidateArchetype = draftArchetype(draft);
  const reasons: string[] = [];
  if (candidateArchetype !== intent.archetype) {
    reasons.push(`The generated ${candidateArchetype.replaceAll("_", " ")} does not match the requested ${intent.archetype.replaceAll("_", " ")}.`);
  }
  if (intent.excludedArchetypes.includes(candidateArchetype)) {
    reasons.push(`The generated venue uses an explicitly excluded ${candidateArchetype.replaceAll("_", " ")}.`);
  }
  if (intent.archetype === "passenger_cruise_ship" && (draft.kind !== "vessel" || draft.topology !== "spine")) {
    reasons.push("A passenger cruise ship must retain PRISM's vessel and deck-spine architecture.");
  }
  if (draft.physicalScaleClass && draft.physicalScaleClass !== intent.physicalScaleClass) {
    reasons.push("The generated physical scale does not match the frozen venue brief.");
  }
  if (draft.era && intent.era !== "unspecified" && draft.era !== intent.era) {
    reasons.push("The generated era does not match the frozen venue brief.");
  }
  return {
    version: 1,
    status: reasons.length > 0 ? "rejected" : "matched",
    reasons: reasons.length > 0 ? reasons : ["The generated dressing matches the frozen venue brief."],
  };
}

function venueSeed(description: string): VenueSeed {
  const text = description.toLocaleLowerCase();
  if (/\b(?:cruise ship|cruise liner|ocean liner|passenger ship|full[- ]?size ship)\b/u.test(text) ||
    (/\bship\b/u.test(text) && !/\b(?:yacht|schooner)\b/u.test(text))) {
    return {
      archetype: "passenger_cruise_ship", era: /\b(?:vintage|historic)\b/u.test(text) ? "historic" : "modern",
      physicalScaleClass: "grand",
      kind: "vessel", kindLabel: "Passenger Cruise Ship", noun: "ship", topology: "spine",
      tierNoun: "Deck", exteriorMode: "docked", connector: "ship lift",
      title: "The Meridian Passage",
      summary: "A full-size passenger cruise ship with public decks, working service spaces, and unopened decks beyond the investigation area.",
      atmosphere: "Ocean light crosses steel and glass while engines resonate through the deck beneath each footstep.",
      rooms: [
        room("venue:gangway", "Gangway Lobby", "⚓", "entry", "boarding checkpoint", "outboard gangway doors"),
        room("venue:engine", "Engine Control Room", "⚙️", "technical", "engine telemetry wall", "machinery access door"),
        room("venue:galley", "Main Galley", "🍽️", "service", "service line", "cold preparation counter"),
        room("venue:crew", "Crew Quarters", "🧳", "private", "bunk alcoves", "crew lockers"),
        room("venue:stores", "Provisions Store", "📦", "service", "supply racks", "cold room door"),
        room("venue:atrium", "Reception Atrium", "◇", "social", "reception desk", "deck directory"),
        room("venue:medical", "Medical Centre", "✚", "service", "treatment bay", "medicine cabinet"),
        room("venue:security", "Security Office", "🔒", "operations", "camera wall", "key control desk"),
        room("venue:cabin", "Passenger Cabin", "🛏️", "private", "window berth", "wardrobe"),
        room("venue:lounge", "Ocean Lounge", "🥂", "social", "panoramic windows", "cocktail bar"),
        room("venue:promenade", "Promenade Deck", "🌊", "observation", "port rail", "lifeboat station"),
        room("venue:bridge", "Navigation Bridge", "🧭", "operations", "helm console", "forward windows"),
        room("venue:observation", "Observation Lounge", "🔭", "observation", "forward glazing", "chart display"),
        room("venue:captain", "Captain's Dayroom", "🗺️", "private", "navigation desk", "private balcony"),
        room("venue:radio", "Communications Room", "📻", "operations", "radio console", "message rack"),
      ],
    };
  }
  if (/\b(?:yacht|schooner|private vessel|steamer)\b/u.test(text)) {
    return {
      archetype: "vintage_yacht", era: "historic", physicalScaleClass: "compact",
      kind: "vessel", kindLabel: "Vintage Yacht", noun: "yacht", topology: "spine",
      tierNoun: "Deck", exteriorMode: "in-transit", connector: "companionway",
      title: "The Midnight Passage",
      summary: "A vintage yacht underway beneath a star-filled sky, its guest decks hiding working machinery below.",
      atmosphere: "Salt air, low brass fittings, dark water, and the steady pulse of engines underfoot.",
      rooms: [
        room("venue:gangway", "Gangway", "⚓", "entry", "boarding rail", "mooring station"),
        room("venue:bridge", "Bridge", "🧭", "operations", "helm", "chart table"),
        room("venue:salon", "Grand Salon", "🥂", "social", "drinks cabinet", "panoramic windows"),
        room("venue:galley", "Galley", "🍽️", "service", "stove", "preparation counter"),
        room("venue:cabin", "Owner's Cabin", "🛏️", "private", "berth", "wardrobe"),
        room("venue:cabin", "Guest Cabin", "🛏️", "private", "berth", "porthole"),
        room("venue:engine", "Engine Room", "⚙️", "technical", "engine casing", "tool locker"),
        room("venue:radio", "Radio Room", "📻", "operations", "radio console", "message rack"),
        room("venue:promenade", "Promenade Deck", "🌌", "observation", "deck rail", "lifeboat cradle"),
        room("venue:crew", "Crew Quarters", "🧳", "private", "bunks", "footlockers"),
        room("venue:stores", "Dry Stores", "📦", "service", "supply shelves", "cold locker"),
      ],
    };
  }
  if (/moon|lunar|space|orbital|module|mars|station/u.test(text)) {
    return {
      archetype: "lunar_habitat", era: "futuristic", physicalScaleClass: "standard",
      kind: "habitat", kindLabel: "Lunar Habitat", noun: "habitat", topology: "radial",
      tierNoun: "Module", exteriorMode: "contained", connector: "transfer tube",
      title: "The Silent Horizon",
      summary: "A modular lunar habitat linked around a pressurized station hub beyond immediate rescue.",
      atmosphere: "Filtered air, powder-gray horizons, instrument glow, and a silence too complete to ignore.",
      rooms: [
        room("venue:airlock", "Main Airlock", "🚪", "entry", "suit rack", "pressure controls"),
        room("venue:hub", "Station Hub", "◉", "circulation", "transfer hatch", "status display"),
        room("venue:command", "Command Module", "🛰️", "operations", "flight console", "communications array"),
        room("venue:lab", "Lunar Laboratory", "🔬", "technical", "sample cabinet", "analysis bench"),
        room("venue:quarters", "Crew Quarters", "🛏️", "private", "sleep pod", "personal locker"),
        room("venue:life-support", "Life Support", "♻️", "technical", "scrubber bank", "water recycler"),
        room("venue:observatory", "Observation Cupola", "🌒", "observation", "view port", "telescope mount"),
        room("venue:galley", "Mess Module", "🥣", "social", "meal station", "folding table"),
        room("venue:power", "Power Module", "⚡", "technical", "reactor controls", "battery rack"),
        room("venue:rover", "Rover Bay", "🚙", "service", "rover cradle", "dust lock"),
      ],
    };
  }
  if (/underwater|subsea|ocean|abyss|marine|submerged|seafloor/u.test(text)) {
    return {
      archetype: "underwater_facility", era: "modern", physicalScaleClass: "standard",
      kind: "facility", kindLabel: "Underwater Facility", noun: "facility", topology: "pods",
      tierNoun: "Sector", exteriorMode: "contained", connector: "pressure lift",
      title: "The Pressure Line",
      summary: "A pressure-sealed research facility divided into connected pods on the ocean floor.",
      atmosphere: "Blue-black water presses against thick glass while pumps and hull plates answer one another.",
      rooms: [
        room("venue:docking", "Docking Collar", "⚓", "entry", "pressure hatch", "dive lockers"),
        room("venue:control", "Control Pod", "🎛️", "operations", "sonar console", "ballast controls"),
        room("venue:wet-lab", "Wet Laboratory", "🧪", "technical", "sample tank", "drain table"),
        room("venue:moon-pool", "Moon Pool", "🌊", "service", "dive platform", "equipment cage"),
        room("venue:quarters", "Habitation Pod", "🛏️", "private", "bunks", "personal lockers"),
        room("venue:observation", "Observation Dome", "🐋", "observation", "dome glass", "camera mount"),
        room("venue:life-support", "Life Support", "♻️", "technical", "oxygen bank", "pump manifold"),
        room("venue:mess", "Crew Mess", "☕", "social", "galley counter", "shared table"),
        room("venue:sub-bay", "Submersible Bay", "🛟", "service", "launch cradle", "tool rack"),
        room("venue:archive", "Research Archive", "🗃️", "operations", "data terminal", "specimen records"),
      ],
    };
  }
  if (/train|rail|carriage|express/u.test(text)) {
    return {
      archetype: "night_train", era: "historic", physicalScaleClass: "standard",
      kind: "transport", kindLabel: "Night Train", noun: "train", topology: "linear",
      tierNoun: "Car", exteriorMode: "in-transit", connector: "vestibule",
      title: "The Last Express",
      summary: "A night train whose linked cars form one narrow route through the mystery.",
      atmosphere: "Rain streaks the windows as lamps sway gently with the rails.",
      rooms: [
        room("venue:platform", "Rear Vestibule", "🚪", "entry", "platform gate", "luggage rack"),
        room("venue:dining", "Dining Car", "🍽️", "social", "service bar", "window tables"),
        room("venue:sleeper", "Sleeper Cabin", "🛏️", "private", "berth", "washstand"),
        room("venue:observation", "Observation Car", "🌃", "observation", "rear windows", "lounge chairs"),
        room("venue:baggage", "Baggage Car", "🧳", "service", "trunk stack", "freight door"),
        room("venue:engine", "Locomotive Cab", "🚂", "operations", "controls", "firebox"),
      ],
    };
  }
  if (description.trim() && !/house|mansion|manor|estate|castle|chateau|villa/u.test(text)) {
    return {
      archetype: "custom", era: "unspecified", physicalScaleClass: "standard",
      kind: "other", kindLabel: "Custom Setting", noun: "venue", topology: "pods",
      tierNoun: "Zone", exteriorMode: "other", connector: "transfer point",
      title: "A Curious Place",
      summary: description,
      atmosphere: "The setting feels inhabited, specific, and just isolated enough for a mystery.",
      rooms: [
        room("venue:entry", "Arrival Point", "🚪", "entry", "main access", "check-in point"),
        room("venue:hub", "Central Hub", "◉", "circulation", "directory", "main passage"),
        room("venue:commons", "Commons", "🛋️", "social", "shared seating", "refreshment station"),
        room("venue:operations", "Operations", "🎛️", "operations", "control desk", "records station"),
        room("venue:quarters", "Private Quarters", "🛏️", "private", "personal storage", "sleeping area"),
        room("venue:service", "Service Area", "🧰", "service", "supply rack", "maintenance panel"),
        room("venue:technical", "Utility Bay", "⚙️", "technical", "equipment bank", "access panel"),
        room("venue:gallery", "Observation Gallery", "🔭", "observation", "viewing area", "display case"),
      ],
    };
  }
  return {
    archetype: "private_estate", era: "historic", physicalScaleClass: "standard",
    kind: "estate", kindLabel: "Private Estate", noun: "estate", topology: "estate",
    tierNoun: "Floor", exteriorMode: "grounds", connector: "staircase",
    title: description.trim() ? "A Curious Place" : "The House at Prism's Edge",
    summary: description.trim() || "An isolated estate assembled around old rooms and newer secrets.",
    atmosphere: "Warm pools of light cut through a quiet house after dark.",
    rooms: [
      room("foyer", "Foyer", "◇", "entry", "front door", "coat stand"),
      room("parlor", "Parlor", "🛋️", "social", "fireplace", "curtains"),
      room("study", "Study", "📚", "operations", "desk", "bookshelves"),
      room("dining-room", "Dining Room", "🍽️", "social", "dining table", "sideboard"),
      room("kitchen", "Kitchen", "🍳", "service", "stove", "pantry shelves"),
      room("bedroom", "Guest Bedroom", "🛏️", "private", "bed", "wardrobe"),
      room("bathroom", "Bathroom", "🛁", "private", "washstand", "medicine cabinet"),
      room("library", "Library", "📖", "social", "reading chair", "bookcase"),
      room("conservatory", "Conservatory", "🌿", "observation", "glass doors", "planters"),
      room("cellar", "Cellar", "🕯️", "service", "storage rack", "work bench"),
    ],
  };
}

export function normalizeMysteryVenueLengthV1(value: MysteryVenueLengthV1): Required<MysteryVenueLengthV1> {
  const preset = value.id === "quick"
    ? { rooms: 5, suspects: 4, tiers: 1 }
    : value.id === "standard"
      ? { rooms: 10, suspects: 6, tiers: 2 }
      : value.id === "grand"
        ? { rooms: 15, suspects: 8, tiers: 3 }
        : null;
  const rooms = preset?.rooms ?? Math.max(5, Math.min(18, Math.round(value.rooms || 10)));
  const suspects = Math.max(4, Math.min(8, rooms - 1, Math.round(value.suspects || preset?.suspects || 6)));
  if (preset) return { id: value.id, rooms, suspects, tiers: preset.tiers };
  const tiers = Math.max(1, Math.min(3, Math.round(value.tiers || Math.ceil(rooms / 6))));
  return { id: "custom", rooms, suspects, tiers };
}

function expandedRooms(seed: VenueSeed, count: number): VenueSeedRoom[] {
  const result: VenueSeedRoom[] = [];
  const occurrences = new Map<string, number>();
  for (let index = 0; index < count; index += 1) {
    const source = seed.rooms[index % seed.rooms.length]!;
    const occurrence = (occurrences.get(source.templateId) ?? 0) + 1;
    occurrences.set(source.templateId, occurrence);
    const repeated = occurrence > 1;
    result.push({
      ...source,
      name: repeated ? `${source.name} ${occurrence}` : source.name,
    });
  }
  return result;
}

interface VenueTierRoomPlacement {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface VenueTierGeometry {
  corridors: MansionLayoutBlockV2[];
  rooms: VenueTierRoomPlacement[];
}

interface PlannedVenueRoom {
  source: VenueSeedRoom;
  tier: number;
  spatial?: MysteryVenueRoomSpatialV1;
}

function shipSpatial(
  templateId: string,
  tier: number,
  tiers: number,
): MysteryVenueRoomSpatialV1 {
  const deckBand = tiers === 1 ? "embarkation" as const
    : tier === 1 ? "lower" as const
      : tier === tiers ? "upper" as const
        : "embarkation" as const;
  if (templateId === "venue:bridge") {
    return { version: 1, longitudinal: "fore", transverse: "center", exposure: "window", deckBand: "upper" };
  }
  if (templateId === "venue:engine") {
    return { version: 1, longitudinal: "aft", transverse: "center", exposure: "interior", deckBand: "lower" };
  }
  if (templateId === "venue:gangway") {
    return { version: 1, longitudinal: "midships", transverse: "starboard", exposure: "open-deck", deckBand: "embarkation" };
  }
  if (templateId === "venue:promenade") {
    return { version: 1, longitudinal: "midships", transverse: "perimeter", exposure: "open-deck", deckBand: "upper" };
  }
  if (/cabin|captain|lounge|observation/u.test(templateId)) {
    return {
      version: 1,
      longitudinal: templateId === "venue:observation" ? "fore" : "midships",
      transverse: templateId === "venue:captain" ? "starboard" : "port",
      exposure: templateId === "venue:captain" ? "balcony" : "window",
      deckBand,
    };
  }
  if (/galley|stores|crew|laundry/u.test(templateId)) {
    return { version: 1, longitudinal: "aft", transverse: "center", exposure: "interior", deckBand };
  }
  return { version: 1, longitudinal: "midships", transverse: "center", exposure: "interior", deckBand };
}

function passengerCruiseRoomPlan(
  seed: VenueSeed,
  length: Required<MysteryVenueLengthV1>,
): PlannedVenueRoom[] {
  const byTemplate = new Map(seed.rooms.map((entry) => [entry.templateId, entry]));
  const source = (templateId: string, fallback = 0, overrides: Partial<VenueSeedRoom> = {}): VenueSeedRoom => ({
    ...(byTemplate.get(templateId) ?? seed.rooms[fallback % seed.rooms.length]!),
    ...overrides,
  });
  const plan: Array<[VenueSeedRoom, number]> = length.id === "quick"
    ? [
        [source("venue:gangway"), 1],
        [source("venue:atrium"), 1],
        [source("venue:promenade"), 1],
        [source("venue:lounge"), 1],
        [source("venue:security"), 1],
      ]
    : length.id === "grand" || length.tiers === 3
      ? [
          [source("venue:gangway"), 2],
          [source("venue:engine"), 1],
          [source("venue:galley"), 1],
          [source("venue:crew"), 1],
          [source("venue:stores"), 1],
          [source("venue:laundry", 2, {
            templateId: "venue:laundry", name: "Ship's Laundry", emoji: "🧺", role: "service",
            anchors: ["linen carts", "industrial washers"],
          }), 1],
          [source("venue:atrium"), 2],
          [source("venue:medical"), 2],
          [source("venue:security"), 2],
          [source("venue:cabin"), 2],
          [source("venue:promenade"), 3],
          [source("venue:bridge"), 3],
          [source("venue:observation"), 3],
          [source("venue:captain"), 3],
          [source("venue:radio"), 3],
        ]
      : [
          [source("venue:gangway"), 1],
          [source("venue:engine"), 1],
          [source("venue:galley"), 1],
          [source("venue:crew"), 1],
          [source("venue:stores"), 1],
          [source("venue:promenade"), 2],
          [source("venue:bridge"), 2],
          [source("venue:observation"), 2],
          [source("venue:cabin"), 2],
          [source("venue:security"), 2],
        ];
  const expanded = [...plan];
  while (expanded.length < length.rooms) {
    const original = seed.rooms[expanded.length % seed.rooms.length]!;
    expanded.push([{
      ...original,
      templateId: `${original.templateId}-${expanded.length + 1}`,
      name: `${original.name} ${expanded.length + 1}`,
    }, (expanded.length % length.tiers) + 1]);
  }
  return expanded.slice(0, length.rooms).map(([entry, tier]) => ({
    source: entry,
    tier,
    spatial: shipSpatial(entry.templateId, tier, length.tiers),
  }));
}

function passengerShipTierGeometry(plans: readonly PlannedVenueRoom[], tier: number): VenueTierGeometry {
  const roomsOnTier = plans.filter((entry) => entry.tier === tier);
  const promenadeIndex = roomsOnTier.findIndex((entry) => entry.source.templateId === "venue:promenade");
  const placements: VenueTierRoomPlacement[] = Array.from({ length: roomsOnTier.length });
  const candidates = [
    { x: 2, y: 3 }, { x: 6, y: 3 }, { x: 10, y: 3 },
    { x: 2, y: 7 }, { x: 6, y: 7 }, { x: 10, y: 7 },
  ];
  const used = new Set<string>();
  if (promenadeIndex >= 0) {
    placements[promenadeIndex] = { x: 3, y: 3, width: 7, height: 2 };
    for (const key of ["2:3", "6:3"]) used.add(key);
  }
  for (let index = 0; index < roomsOnTier.length; index += 1) {
    if (index === promenadeIndex) continue;
    const spatial = roomsOnTier[index]!.spatial;
    const targetX = spatial?.longitudinal === "fore" ? 10
      : spatial?.longitudinal === "aft" ? 2 : 6;
    const targetY = spatial?.transverse === "starboard" ? 7 : 3;
    const choice = candidates
      .filter((candidate) => !used.has(`${candidate.x}:${candidate.y}`))
      .sort((left, right) =>
        (Math.abs(left.x - targetX) * 2 + Math.abs(left.y - targetY)) -
        (Math.abs(right.x - targetX) * 2 + Math.abs(right.y - targetY))
      )[0]!;
    used.add(`${choice.x}:${choice.y}`);
    placements[index] = { ...choice, width: 2, height: 2 };
  }
  return {
    corridors: [{ kind: "corridor", id: `corridor:tier-${tier}`, floor: tier, x: 2, y: 5, width: 12, height: 2 }],
    rooms: placements,
  };
}

function denseVenueTierGeometry(tier: number, count: number): VenueTierGeometry {
  const narrow = count > 16;
  const roomWidth = narrow ? 1 : 2;
  const perSide = Math.ceil(count / 2);
  const occupiedWidth = perSide * roomWidth;
  const startX = Math.floor((16 - occupiedWidth) / 2);
  return {
    corridors: [{
      kind: "corridor",
      id: `corridor:tier-${tier}`,
      floor: tier,
      x: startX,
      y: 5,
      width: occupiedWidth,
      height: 2,
    }],
    rooms: Array.from({ length: count }, (_, index) => ({
      x: startX + Math.floor(index / 2) * roomWidth,
      y: index % 2 === 0 ? 3 : 7,
      width: roomWidth,
      height: 2,
    })),
  };
}

/** Five bounded physical families. Their public labels can vary freely, while
 * the server remains the sole owner of coordinates and connectivity. */
function venueTierGeometry(
  topology: MysteryVenueTopologyV1,
  tier: number,
  count: number,
): VenueTierGeometry {
  if (topology === "spine" && count <= 10) {
    return {
      corridors: [{ kind: "corridor", id: `corridor:tier-${tier}`, floor: tier, x: 1, y: 5, width: 14, height: 2 }],
      rooms: Array.from({ length: count }, (_, index) => ({
        x: 1 + Math.floor(index / 2) * 3,
        y: index % 2 === 0 ? 3 : 7,
        width: 2,
        height: 2,
      })),
    };
  }
  if (topology === "linear" && count <= 8) {
    return {
      corridors: [{ kind: "corridor", id: `corridor:tier-${tier}`, floor: tier, x: 0, y: 7, width: 16, height: 1 }],
      rooms: Array.from({ length: count }, (_, index) => ({ x: index * 2, y: 5, width: 2, height: 2 })),
    };
  }
  if (topology === "radial" && count <= 8) {
    const corridors: VenueTierGeometry["corridors"] = [
      { kind: "corridor", id: `corridor:tier-${tier}`, floor: tier, x: 7, y: 5, width: 2, height: 2 },
      { kind: "corridor", id: `corridor:tier-${tier}:north`, floor: tier, x: 7, y: 1, width: 2, height: 4 },
      { kind: "corridor", id: `corridor:tier-${tier}:south`, floor: tier, x: 7, y: 7, width: 2, height: 4 },
      { kind: "corridor", id: `corridor:tier-${tier}:west`, floor: tier, x: 3, y: 5, width: 4, height: 2 },
      { kind: "corridor", id: `corridor:tier-${tier}:east`, floor: tier, x: 9, y: 5, width: 4, height: 2 },
    ];
    const rooms = [
      { x: 5, y: 1 }, { x: 9, y: 1 }, { x: 5, y: 9 }, { x: 9, y: 9 },
      { x: 3, y: 3 }, { x: 3, y: 7 }, { x: 11, y: 3 }, { x: 11, y: 7 },
    ].slice(0, count).map(({ x, y }) => ({ x, y, width: 2, height: 2 }));
    return { corridors, rooms };
  }
  if (topology === "pods" && count <= 8) {
    const corridors: VenueTierGeometry["corridors"] = [
      { kind: "corridor", id: `corridor:tier-${tier}`, floor: tier, x: 7, y: 2, width: 2, height: 8 },
      { kind: "corridor", id: `corridor:tier-${tier}:port`, floor: tier, x: 2, y: 5, width: 5, height: 2 },
      { kind: "corridor", id: `corridor:tier-${tier}:starboard`, floor: tier, x: 9, y: 5, width: 5, height: 2 },
    ];
    const rooms = [
      { x: 2, y: 3 }, { x: 2, y: 7 }, { x: 0, y: 5 }, { x: 5, y: 3 },
      { x: 12, y: 3 }, { x: 12, y: 7 }, { x: 14, y: 5 }, { x: 9, y: 7 },
    ].slice(0, count).map(({ x, y }) => ({ x, y, width: 2, height: 2 }));
    return { corridors, rooms };
  }
  if (topology === "estate" && count <= 12) {
    return {
      corridors: [{ kind: "corridor", id: `corridor:tier-${tier}`, floor: tier, x: 7, y: 0, width: 2, height: 12 }],
      rooms: Array.from({ length: count }, (_, index) => ({
        x: index % 2 === 0 ? 5 : 9,
        y: Math.floor(index / 2) * 2,
        width: 2,
        height: 2,
      })),
    };
  }
  return denseVenueTierGeometry(tier, count);
}

function venueTierLabels(
  seed: VenueSeed,
  length: Required<MysteryVenueLengthV1>,
): string[] {
  if (seed.archetype !== "passenger_cruise_ship") {
    return Array.from({ length: length.tiers }, (_, index) => `${seed.tierNoun} ${index + 1}`);
  }
  if (length.tiers === 1) return ["Embarkation & Promenade Deck"];
  if (length.tiers === 2) return ["Embarkation & Service Deck", "Command & Promenade Deck"];
  return ["Lower Service Deck", "Embarkation Deck", "Promenade & Command Deck"];
}

function venuePresentation(seed: VenueSeed, physicalScaleClass: MysteryVenuePhysicalScaleClassV1) {
  if (seed.archetype === "passenger_cruise_ship") {
    return {
      version: 1 as const,
      familyId: "maritime-passenger-v1",
      mapStyle: "hull-deck-v1" as const,
      physicalScaleClass,
      entryAction: "Board the ship",
      compatibleExteriorFamilies: ["maritime-passenger-v1", "universal-abstract-v1"],
      compatibleAcousticFamilies: ["maritime-passenger-v1", "universal-abstract-v1"],
      mapOrientation: { fore: "right" as const, port: "top" as const, pitchDegrees: -2 },
    };
  }
  const familyId = seed.archetype === "vintage_yacht" ? "maritime-yacht-v1"
    : seed.archetype === "private_estate" ? "estate-v1"
      : `${seed.archetype.replaceAll("_", "-")}-v1`;
  const mapStyle = seed.topology === "estate" ? "estate-grid-v1" as const
    : seed.topology === "radial" ? "radial-module-v1" as const
      : seed.topology === "pods" ? "pod-network-v1" as const
        : seed.topology === "linear" ? "linear-carriage-v1" as const
          : "abstract-venue-v1" as const;
  return {
    version: 1 as const,
    familyId,
    mapStyle,
    physicalScaleClass,
    entryAction: seed.exteriorMode === "grounds" ? `Enter the ${seed.noun}` : `Enter the ${seed.noun}`,
    compatibleExteriorFamilies: [familyId, "universal-abstract-v1"],
    compatibleAcousticFamilies: [familyId, "universal-abstract-v1"],
    mapOrientation: { fore: "right" as const, port: "top" as const, pitchDegrees: 0 },
  };
}

const PASSENGER_HULL_OUTLINE = [
  { x: 0.04, y: 0.34 }, { x: 0.14, y: 0.16 }, { x: 0.67, y: 0.08 }, { x: 0.9, y: 0.22 }, { x: 0.97, y: 0.5 },
  { x: 0.9, y: 0.78 }, { x: 0.67, y: 0.92 }, { x: 0.14, y: 0.84 }, { x: 0.04, y: 0.66 },
];

export function createMysteryVenueProposalV1(args: {
  id: string;
  description?: string;
  length: MysteryVenueLengthV1;
  nonce?: string;
  creativeDraft?: MysteryVenueCreativeDraftV1 | null;
  intent?: MysteryVenueIntentV1;
}): MysteryVenueProposalV1 {
  const description = args.description?.trim() ?? "";
  const intent = args.intent ?? deriveMysteryVenueIntentV1(description);
  const catalogSeed = venueSeed(description);
  const creativeDraft = parseMysteryVenueCreativeDraftV1(args.creativeDraft);
  const draftMatch = matchMysteryVenueCreativeDraftV1(intent, creativeDraft);
  const acceptedDraft = draftMatch.status === "matched" ? creativeDraft : null;
  const seed: VenueSeed = acceptedDraft && intent.archetype === "custom"
    ? {
        archetype: "custom",
        era: intent.era,
        physicalScaleClass: intent.physicalScaleClass,
        kind: acceptedDraft.kind,
        kindLabel: acceptedDraft.kindLabel,
        noun: acceptedDraft.placeNoun,
        topology: acceptedDraft.topology,
        tierNoun: acceptedDraft.tierNoun,
        exteriorMode: acceptedDraft.exteriorMode,
        title: acceptedDraft.title,
        summary: acceptedDraft.environmentSummary,
        atmosphere: acceptedDraft.atmosphere,
        connector: acceptedDraft.connectorLabel,
        rooms: acceptedDraft.rooms,
      }
    : acceptedDraft
      ? {
          ...catalogSeed,
          archetype: intent.archetype,
          era: intent.era,
          physicalScaleClass: intent.physicalScaleClass,
          title: acceptedDraft.title,
          summary: acceptedDraft.environmentSummary,
          atmosphere: acceptedDraft.atmosphere,
          rooms: catalogSeed.rooms.map((serverRoom, index) => {
            const dressing = acceptedDraft.rooms[index];
            return dressing
              ? {
                  ...serverRoom,
                  name: dressing.name,
                  emoji: dressing.emoji,
                  role: dressing.role,
                  anchors: dressing.anchors,
                }
              : serverRoom;
          }),
        }
      : {
          ...catalogSeed,
          archetype: intent.archetype === "custom" ? catalogSeed.archetype : intent.archetype,
          era: intent.era === "unspecified" ? catalogSeed.era : intent.era,
          physicalScaleClass: intent.physicalScaleClass,
        };
  const length = normalizeMysteryVenueLengthV1(args.length);
  const tierLabels = venueTierLabels(seed, length);
  const entities: MansionLayoutEntityV2[] = [];
  const rooms: MansionLayoutRoomV2[] = [];
  const baseRoomsPerTier = Math.floor(length.rooms / length.tiers);
  const remainderRooms = length.rooms % length.tiers;
  const tierCounts = Array.from(
    { length: length.tiers },
    (_, index) => baseRoomsPerTier + (index < remainderRooms ? 1 : 0),
  );
  const plannedRooms: PlannedVenueRoom[] = seed.archetype === "passenger_cruise_ship"
    ? passengerCruiseRoomPlan(seed, length)
    : expandedRooms(seed, length.rooms).map((source, index) => {
        const tier = tierCounts.findIndex((_, tierIndex) =>
          index < tierCounts.slice(0, tierIndex + 1).reduce((sum, count) => sum + count, 0)
        ) + 1;
        return { source, tier };
      });
  const actualTierCounts = Array.from({ length: length.tiers }, (_, index) =>
    plannedRooms.filter((entry) => entry.tier === index + 1).length
  );
  const tierGeometries = actualTierCounts.map((count, index) =>
    seed.archetype === "passenger_cruise_ship"
      ? passengerShipTierGeometry(plannedRooms, index + 1)
      : venueTierGeometry(seed.topology, index + 1, count)
  );
  for (let tier = 1; tier <= length.tiers; tier += 1) {
    entities.push(...tierGeometries[tier - 1]!.corridors);
  }
  const tierRoomOffsets = new Map<number, number>();
  plannedRooms.forEach(({ source, tier, spatial }, index) => {
    const tierIndex = tierRoomOffsets.get(tier) ?? 0;
    tierRoomOffsets.set(tier, tierIndex + 1);
    const placement = tierGeometries[tier - 1]!.rooms[tierIndex]!;
    const venueRoom: MansionLayoutRoomV2 = {
      kind: "room",
      id: `room:venue-${index + 1}`,
      templateId: source.templateId,
      name: source.name,
      floor: tier,
      x: placement.x,
      y: placement.y,
      rotation: 0,
      suspectSlotId: index < length.suspects ? `slot:venue-${index + 1}` : null,
      emoji: source.emoji,
      imageId: null,
      bundledAssetPath: null,
      acceptedRoomAssetId: null,
      acceptedRoomArtAnchorSha256: null,
      venueContract: {
        version: 1,
        role: index === 0 ? "entry" : source.role,
        footprint: { width: placement.width, height: placement.height },
        ...(spatial ? { spatial } : {}),
      },
    };
    rooms.push(venueRoom);
    entities.push(venueRoom);
  });
  const presentation = venuePresentation(seed, intent.physicalScaleClass);
  const profile: MysteryVenueProfileV1 = {
    version: 1,
    kind: seed.kind,
    kindLabel: seed.kindLabel,
    placeNoun: seed.noun,
    topology: seed.topology,
    tierLabels,
    entryRoomId: rooms[0]!.id,
    exteriorMode: seed.exteriorMode,
    environmentSummary: seed.summary,
    intent,
    physicalScaleClass: intent.physicalScaleClass,
    presentation,
  };
  const verticalConnectors = seed.archetype === "passenger_cruise_ship"
    ? Array.from({ length: Math.max(0, length.tiers - 1) }, (_, index) => {
        const lowerTier = index + 1;
        const upperTier = index + 2;
        return [
          {
            id: `connector:forward-lift:${lowerTier}-${upperTier}`,
            kind: "lift" as const,
            lowerEntityId: `corridor:tier-${lowerTier}`,
            upperEntityId: `corridor:tier-${upperTier}`,
            label: "Forward lifts",
            shaftId: "shaft:forward-lifts",
            lowerPoint: { x: 0.78, y: 0.5 },
            upperPoint: { x: 0.78, y: 0.5 },
          },
          {
            id: `connector:aft-stairs:${lowerTier}-${upperTier}`,
            kind: "stairs" as const,
            lowerEntityId: `corridor:tier-${lowerTier}`,
            upperEntityId: `corridor:tier-${upperTier}`,
            label: "Aft stairs",
            shaftId: "shaft:aft-stairs",
            lowerPoint: { x: 0.24, y: 0.5 },
            upperPoint: { x: 0.24, y: 0.5 },
          },
        ];
      }).flat()
    : Array.from({ length: Math.max(0, length.tiers - 1) }, (_, index) => ({
        id: `connector:tier-${index + 1}-${index + 2}`,
        kind: seed.archetype === "vintage_yacht" ? "ladder" as const : "lift" as const,
        lowerEntityId: `corridor:tier-${index + 1}`,
        upperEntityId: `corridor:tier-${index + 2}`,
        label: seed.connector,
      }));
  let layout: MansionLayoutV2 = {
    version: 2,
    envelope: { columns: 16, rows: 12 },
    entities,
    doors: [],
    verticalConnectors,
    placementAnchors: rooms.flatMap((venueRoom, index) => {
      const source = plannedRooms[index]!.source;
      return source.anchors.map((name, anchorIndex) => ({
        id: `anchor:${index + 1}:${anchorIndex + 1}`,
        roomId: venueRoom.id,
        name,
        relation: "near" as const,
        point: { x: anchorIndex === 0 ? 0.3 : 0.7, y: anchorIndex === 0 ? 0.68 : 0.42 },
      }));
    }),
    lights: [],
    roomArtCandidates: [],
    venueProfile: profile,
    venuePresentation: seed.archetype === "passenger_cruise_ship"
      ? {
          version: 1,
          tierOutlines: Array.from({ length: length.tiers }, (_, index) => ({
            floor: index + 1,
            points: PASSENGER_HULL_OUTLINE.map((point) => ({ ...point })),
          })),
        }
      : undefined,
  };
  for (const entity of entities) layout = addAutoCenteredMansionLayoutV2Doors(layout, entity.id);
  return {
    version: 1,
    id: args.id,
    nonce: args.nonce ?? "0",
    title: seed.title,
    description: description || seed.summary,
    atmosphere: seed.atmosphere,
    source: acceptedDraft ? (intent.archetype === "custom" ? "model" : "hybrid") : "catalog",
    intent,
    match: acceptedDraft
      ? draftMatch
      : {
          version: 1,
          status: intent.archetype === "custom" ? "confirmation_required" : "matched",
          reasons: creativeDraft && draftMatch.status === "rejected"
            ? [...draftMatch.reasons, "PRISM replaced it with the compatible catalog venue shown here."]
            : draftMatch.reasons,
        },
    ...(acceptedDraft
      ? { creativeDraft: acceptedDraft }
      : { editableDraftNotice: creativeDraft && draftMatch.status === "rejected"
          ? "The generated venue did not match the frozen brief. PRISM replaced it with this compatible editable structured draft from the catalog."
          : "The model was unavailable or returned an invalid plan, so PRISM supplied this compatible editable structured draft from the catalog without generating art." }),
    length,
    profile,
    layout,
    topologySilhouette: tierLabels.map((tierLabel, index) => ({
      tierLabel,
      roomNames: rooms.filter((venueRoom) => venueRoom.floor === index + 1).map((venueRoom) => venueRoom.name),
    })),
  };
}
