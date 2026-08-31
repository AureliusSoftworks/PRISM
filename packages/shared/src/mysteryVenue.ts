import {
  addAutoCenteredMansionLayoutV2Doors,
  type MansionLayoutBlockV2,
  type MansionLayoutEntityV2,
  type MansionLayoutRoomV2,
  type MansionLayoutV2,
  type MysteryVenueKindV1,
  type MysteryVenueProfileV1,
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
  source: "catalog" | "model";
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
}

interface VenueSeed {
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

function venueSeed(description: string): VenueSeed {
  const text = description.toLocaleLowerCase();
  if (/yacht|cruise|ship|liner|boat|steamer|schooner/u.test(text)) {
    return {
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
  if (value.id === "quick") return { id: "quick", rooms: 5, suspects: 4, tiers: 1 };
  if (value.id === "standard") return { id: "standard", rooms: 10, suspects: 6, tiers: 2 };
  if (value.id === "grand") return { id: "grand", rooms: 15, suspects: 8, tiers: 3 };
  const rooms = Math.max(5, Math.min(18, Math.round(value.rooms || 10)));
  const suspects = Math.max(4, Math.min(8, Math.round(value.suspects || 6)));
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

export function createMysteryVenueProposalV1(args: {
  id: string;
  description?: string;
  length: MysteryVenueLengthV1;
  nonce?: string;
  creativeDraft?: MysteryVenueCreativeDraftV1 | null;
}): MysteryVenueProposalV1 {
  const description = args.description?.trim() ?? "";
  const catalogSeed = venueSeed(description);
  const creativeDraft = parseMysteryVenueCreativeDraftV1(args.creativeDraft);
  const seed: VenueSeed = creativeDraft
    ? {
        kind: creativeDraft.kind,
        kindLabel: creativeDraft.kindLabel,
        noun: creativeDraft.placeNoun,
        topology: creativeDraft.topology,
        tierNoun: creativeDraft.tierNoun,
        exteriorMode: creativeDraft.exteriorMode,
        title: creativeDraft.title,
        summary: creativeDraft.environmentSummary,
        atmosphere: creativeDraft.atmosphere,
        connector: creativeDraft.connectorLabel,
        rooms: creativeDraft.rooms,
      }
    : catalogSeed;
  const length = normalizeMysteryVenueLengthV1(args.length);
  const tierLabels = Array.from({ length: length.tiers }, (_, index) => `${seed.tierNoun} ${index + 1}`);
  const seeds = expandedRooms(seed, length.rooms);
  const entities: MansionLayoutEntityV2[] = [];
  const rooms: MansionLayoutRoomV2[] = [];
  const baseRoomsPerTier = Math.floor(length.rooms / length.tiers);
  const remainderRooms = length.rooms % length.tiers;
  const tierCounts = Array.from(
    { length: length.tiers },
    (_, index) => baseRoomsPerTier + (index < remainderRooms ? 1 : 0),
  );
  const tierGeometries = tierCounts.map((count, index) => venueTierGeometry(seed.topology, index + 1, count));
  for (let tier = 1; tier <= length.tiers; tier += 1) {
    entities.push(...tierGeometries[tier - 1]!.corridors);
  }
  seeds.forEach((source, index) => {
    const tier = tierCounts.findIndex((_, tierIndex) =>
      index < tierCounts.slice(0, tierIndex + 1).reduce((sum, count) => sum + count, 0)
    ) + 1;
    const priorRooms = tierCounts.slice(0, tier - 1).reduce((sum, count) => sum + count, 0);
    const placement = tierGeometries[tier - 1]!.rooms[index - priorRooms]!;
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
      },
    };
    rooms.push(venueRoom);
    entities.push(venueRoom);
  });
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
  };
  let layout: MansionLayoutV2 = {
    version: 2,
    envelope: { columns: 16, rows: 12 },
    entities,
    doors: [],
    verticalConnectors: Array.from({ length: Math.max(0, length.tiers - 1) }, (_, index) => ({
      id: `connector:tier-${index + 1}-${index + 2}`,
      kind: seed.kind === "vessel" ? "ladder" as const : "lift" as const,
      lowerEntityId: `corridor:tier-${index + 1}`,
      upperEntityId: `corridor:tier-${index + 2}`,
      label: seed.connector,
    })),
    placementAnchors: rooms.flatMap((venueRoom, index) => {
      const source = seeds[index]!;
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
  };
  for (const entity of entities) layout = addAutoCenteredMansionLayoutV2Doors(layout, entity.id);
  return {
    version: 1,
    id: args.id,
    nonce: args.nonce ?? "0",
    title: seed.title,
    description: description || seed.summary,
    atmosphere: seed.atmosphere,
    source: creativeDraft ? "model" : "catalog",
    ...(creativeDraft
      ? { creativeDraft }
      : { editableDraftNotice: "The model was unavailable or returned an invalid plan, so PRISM supplied an editable structured draft without generating art." }),
    length,
    profile,
    layout,
    topologySilhouette: tierLabels.map((tierLabel, index) => ({
      tierLabel,
      roomNames: rooms.filter((venueRoom) => venueRoom.floor === index + 1).map((venueRoom) => venueRoom.name),
    })),
  };
}
