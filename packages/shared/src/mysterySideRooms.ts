import {
  MANSION_LAYOUT_V2_COLUMNS,
  MANSION_LAYOUT_V2_ROWS,
  addAutoCenteredMansionLayoutV2Doors,
  mansionLayoutV2EntityRect,
  type MansionLayoutBlockV2,
  type MansionLayoutV2,
  type MysteryVenueArchetypeV1,
  type MysteryVenueKindV1,
} from "./mansionLayoutV2.ts";

/** Side rooms: the ordinary spaces of a venue that no case ever enters. They fill the
 * gaps between case rooms, take a door from the corridor, carry a believable name sized
 * to their footprint, and stay inert on the map. */
export type MysterySideRoomSizeV1 = "tiny" | "small" | "medium" | "large";
export const MYSTERY_SIDE_ROOM_SIZES_V1 = ["tiny", "small", "medium", "large"] as const;
export interface MysterySideRoomNameV1 { name: string; size: MysterySideRoomSizeV1 }
export interface MysterySideRoomCatalogEntryV1 { name: string; sizes: readonly MysterySideRoomSizeV1[] }

/** Cells to size class. A closet is one cell; a mess needs five or more. */
export function mysterySideRoomSizeForAreaV1(area: number): MysterySideRoomSizeV1 {
  if (area <= 1) return "tiny";
  if (area <= 2) return "small";
  if (area <= 4) return "medium";
  return "large";
}

const entry = (name: string, ...sizes: MysterySideRoomSizeV1[]): MysterySideRoomCatalogEntryV1 => ({ name, sizes });
const T: MysterySideRoomSizeV1 = "tiny", S: MysterySideRoomSizeV1 = "small", M: MysterySideRoomSizeV1 = "medium", L: MysterySideRoomSizeV1 = "large";

/** Believable non-case spaces per setting. Each name lists the footprints it can wear,
 * so a cafeteria never lands on a closet's cell. */
const CATALOG_BY_ARCHETYPE: Partial<Record<MysteryVenueArchetypeV1, readonly MysterySideRoomCatalogEntryV1[]>> = {
  passenger_cruise_ship: [
    entry("Linen Store", T, S), entry("Steward's Pantry", S), entry("Deck Locker", T), entry("Purser's Office", S, M),
    entry("Laundry", M, L), entry("Cold Store", S, M), entry("Crew Mess", M, L), entry("Galley Store", S),
    entry("Chart Room", S, M), entry("Boatswain's Store", S), entry("Engineers' Workshop", M, L), entry("Sick Bay Store", S),
    entry("Baggage Room", M, L), entry("Wine Store", S), entry("Electrical Locker", T), entry("Lamp Room", T),
    entry("Life Jacket Locker", T), entry("Stewards' Station", S), entry("Print Shop", M), entry("Photo Lab", S),
    entry("Crew Cabin", S, M), entry("Officers' Wardroom", M, L), entry("Paint Locker", T), entry("Ship's Stores", M, L),
  ],
  vintage_yacht: [
    entry("Sail Locker", S, M), entry("Rope Store", T), entry("Galley Pantry", S), entry("Crew Berth", S, M),
    entry("Chart Locker", T), entry("Engine Store", S), entry("Wine Locker", T), entry("Linen Press", T),
    entry("Bosun's Store", S), entry("Owner's Study", M), entry("Deck Store", S), entry("Lamp Locker", T),
    entry("Crew Mess", M, L), entry("Engine Room Store", M, L), entry("Tender Bay", M, L), entry("Cold Store", S, M),
    entry("Steward's Pantry", S), entry("Rigging Store", S, M),
  ],
  private_estate: [
    entry("Linen Closet", T), entry("Butler's Pantry", S), entry("Scullery", S, M), entry("Boot Room", S),
    entry("Silver Vault", T, S), entry("Sewing Room", S, M), entry("Housekeeper's Room", M), entry("Gun Room", S, M),
    entry("Cold Larder", S), entry("Lamp Room", T), entry("Coal Store", S), entry("Still Room", S),
    entry("Flower Room", S), entry("Servants' Hall", L), entry("Wine Cellar", M, L), entry("Box Room", T, S),
    entry("Footmen's Room", M), entry("Cloakroom", T, S), entry("Telephone Room", T), entry("Brushing Room", S),
    entry("Laundry", M, L), entry("Tack Room", S, M), entry("Estate Office", M), entry("Nursery Store", S),
  ],
  lunar_habitat: [
    entry("Suit Locker", S, M), entry("Scrubber Bay", M), entry("Sample Store", S), entry("Battery Room", S, M),
    entry("Hydroponics Store", S), entry("Comms Closet", T), entry("Water Reclamation", M, L), entry("Tool Crib", T, S),
    entry("Quarantine Cell", S), entry("EVA Prep", M), entry("Spares Store", S, M), entry("Ration Store", S),
    entry("Crew Bunk", S, M), entry("Regolith Lock", T), entry("Server Closet", T), entry("Workshop", M, L),
    entry("Medical Store", S, M), entry("Oxygen Plant", M, L), entry("Greenhouse Annex", M, L), entry("Rover Bay", L),
    entry("Fuel Cell Room", M), entry("Dust Lock", T, S), entry("Instrument Store", S, M), entry("Laundry Module", S, M),
    entry("Cold Storage", S, M), entry("Fabrication Bay", M, L), entry("Radiation Shelter", M, L), entry("Antenna Closet", T),
  ],
  underwater_facility: [
    entry("Pump Room", M, L), entry("Dive Locker", S, M), entry("Specimen Store", S), entry("Compressor Room", M),
    entry("Filter Gallery", M, L), entry("Battery Bank", S, M), entry("Tool Store", T, S), entry("Decompression Locker", S),
    entry("Cable Vault", T), entry("Wet Store", S), entry("Crew Bunk", S, M), entry("Galley Store", S),
    entry("Sonar Closet", T), entry("Workshop", M, L),
    entry("Airlock Store", S), entry("Desalination Room", M, L), entry("Cold Storage", S, M), entry("Moon Pool Store", M, L),
    entry("Generator Room", M, L), entry("Medical Store", S, M), entry("Hull Access", T, S), entry("Sample Freezer", S),
    entry("ROV Bay", L), entry("Laundry", S, M), entry("Valve Gallery", M), entry("Spares Locker", T, S),
  ],
  night_train: [
    entry("Luggage Van", M, L), entry("Attendant's Compartment", S), entry("Linen Cupboard", T), entry("Pantry Store", S),
    entry("Guard's Compartment", S), entry("Boiler Cupboard", T), entry("Mail Locker", S), entry("Ice Store", T, S),
    entry("Crockery Store", S), entry("Staff Compartment", S, M), entry("Lamp Cupboard", T), entry("Baggage Store", M, L),
    entry("Staff Sleeper", M, L), entry("Freight Bay", L), entry("Dining Car Pantry", M), entry("Kitchen Car Store", M, L),
    entry("Conductor's Office", S, M), entry("Boiler Room", M, L), entry("Coal Bunker", S, M), entry("Wine Cupboard", T, S),
  ],
};
const CATALOG_BY_KIND: Record<MysteryVenueKindV1, readonly MysterySideRoomCatalogEntryV1[]> = {
  estate: CATALOG_BY_ARCHETYPE.private_estate!,
  vessel: CATALOG_BY_ARCHETYPE.passenger_cruise_ship!,
  habitat: CATALOG_BY_ARCHETYPE.lunar_habitat!,
  facility: CATALOG_BY_ARCHETYPE.underwater_facility!,
  transport: CATALOG_BY_ARCHETYPE.night_train!,
  other: [
    entry("Storeroom", S, M), entry("Utility Closet", T), entry("Staff Room", M, L), entry("Supply Store", S, M),
    entry("Records Room", M), entry("Cleaning Cupboard", T), entry("Plant Room", M, L), entry("Workshop", M, L),
    entry("Cloakroom", T, S), entry("Locker Room", M), entry("Archive", M, L), entry("Break Room", M, L),
    entry("Mail Room", S), entry("Server Closet", T), entry("Linen Store", T, S), entry("Kitchenette", S),
    entry("Boiler Room", M, L), entry("Store", S, M), entry("Janitor's Closet", T), entry("Meeting Room", M, L),
    entry("Reception Store", S), entry("Filing Room", S, M), entry("Loading Bay", L), entry("Coat Store", T, S),
    entry("Electrical Room", S, M), entry("Print Room", S, M), entry("First Aid Room", S), entry("Security Office", S, M),
    entry("Housekeeping Store", S, M), entry("Furniture Store", M, L), entry("Comms Room", S), entry("Stationery Store", T, S),
    entry("Quiet Room", S, M), entry("Training Room", M, L), entry("Pantry", S), entry("Laundry", M, L),
    entry("Bicycle Store", M), entry("Shower Room", S, M), entry("Recycling Store", S), entry("Maintenance Office", S, M),
    entry("Cold Store", S, M), entry("Chair Store", S, M), entry("Battery Room", S), entry("Lift Motor Room", T, S),
  ],
};

export function mysterySideRoomCatalogV1(
  archetype: MysteryVenueArchetypeV1 | string | null | undefined,
  kind: MysteryVenueKindV1 | string | null | undefined,
): readonly MysterySideRoomCatalogEntryV1[] {
  const byArchetype = archetype ? CATALOG_BY_ARCHETYPE[archetype as MysteryVenueArchetypeV1] : undefined;
  if (byArchetype) return byArchetype;
  const byKind = kind ? CATALOG_BY_KIND[kind as MysteryVenueKindV1] : undefined;
  return byKind ?? CATALOG_BY_KIND.other;
}

/** Deterministic generator seeded from a string, so the same venue proposal names its
 * side rooms the same way on every machine. */
function seededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0 || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
}

/** Picks names for a run of side rooms: the venue's own suggestions first, then the
 * catalog, each name once while any remain, always matched to the footprint. */
export function createMysterySideRoomNamerV1(options: {
  seed: string;
  archetype?: MysteryVenueArchetypeV1 | string | null;
  kind?: MysteryVenueKindV1 | string | null;
  names?: readonly MysterySideRoomNameV1[] | null;
}): (area: number) => string {
  const random = seededRandom(options.seed);
  const shuffle = <T>(items: readonly T[]): T[] => {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [copy[index], copy[swap]] = [copy[swap]!, copy[index]!];
    }
    return copy;
  };
  const suggested = shuffle((options.names ?? []).filter((name) => name.name.trim()));
  const catalog = shuffle(mysterySideRoomCatalogV1(options.archetype, options.kind));
  const generic = shuffle(CATALOG_BY_KIND.other.filter((candidate) => !catalog.some((own) => own.name === candidate.name)));
  const used = new Set<string>();
  const counts = new Map<string, number>();
  const order: readonly MysterySideRoomSizeV1[] = MYSTERY_SIDE_ROOM_SIZES_V1;
  return (area: number): string => {
    const size = mysterySideRoomSizeForAreaV1(area);
    // Exact size first; then smaller classes (a pantry in a hall-sized block reads fine),
    // then larger ones, and only then a numbered repeat.
    const preference = [size, ...order.slice(0, order.indexOf(size)).reverse(), ...order.slice(order.indexOf(size) + 1)];
    let picked: string | null = null;
    for (const candidateSize of preference) {
      picked = suggested.find((name) => name.size === candidateSize && !used.has(name.name))?.name
        ?? catalog.find((candidate) => candidate.sizes.includes(candidateSize) && !used.has(candidate.name))?.name
        ?? null;
      if (picked) break;
    }
    if (!picked) {
      picked = generic.find((candidate) => candidate.sizes.includes(size) && !used.has(candidate.name))?.name
        ?? generic.find((candidate) => !used.has(candidate.name))?.name ?? null;
    }
    if (!picked) {
      const base = catalog.find((candidate) => candidate.sizes.includes(size))?.name ?? catalog[0]?.name ?? "Storeroom";
      const count = (counts.get(base) ?? 1) + 1;
      counts.set(base, count);
      picked = `${base} ${count}`;
    }
    used.add(picked);
    return picked;
  };
}

interface Rect { x: number; y: number; width: number; height: number }

/** One block asking for a name: a side room, or an enterable case room being renamed to
 * the venue's own vocabulary. `size` comes from its footprint so the name can fit it. */
export interface MysteryRoomNameRequestV1 {
  id: string;
  kind: "room" | "side";
  size: MysterySideRoomSizeV1;
  /** For a case room: the default template it stands in for, such as "rooftop-lounge". */
  templateId?: string;
  currentName?: string;
}

const NAME_PATTERN = /^[\p{L}\p{N} '’\-&.()/]+$/u;

/** Reads a model's naming reply. A name is kept only when it is plain text of a sensible
 * length and is not already used by another block or another name in the same reply;
 * anything missing or rejected falls back to the caller's own namer. */
export function normalizeMysteryRoomNameSuggestionsV1(
  value: unknown,
  requests: readonly MysteryRoomNameRequestV1[],
  takenNames: readonly string[],
  fallback: (request: MysteryRoomNameRequestV1) => string,
): Record<string, string> {
  const suggested = new Map<string, string>();
  const entries = value && typeof value === "object" && Array.isArray((value as { names?: unknown }).names)
    ? (value as { names: unknown[] }).names
    : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as { id?: unknown; name?: unknown };
    if (typeof candidate.id !== "string" || typeof candidate.name !== "string") continue;
    const name = candidate.name.replace(/\s+/gu, " ").trim();
    if (name.length < 3 || name.length > 60 || !NAME_PATTERN.test(name)) continue;
    suggested.set(candidate.id, name);
  }
  const used = new Set(takenNames.map((name) => name.trim().toLocaleLowerCase()).filter(Boolean));
  const resolved: Record<string, string> = {};
  for (const request of requests) {
    const proposed = suggested.get(request.id);
    let name = proposed && !used.has(proposed.toLocaleLowerCase()) ? proposed : fallback(request);
    if (used.has(name.trim().toLocaleLowerCase())) {
      // The fallback collided too; number it rather than repeat a name on the map.
      let attempt = 2;
      while (used.has(`${name} ${attempt}`.toLocaleLowerCase()) && attempt < 40) attempt += 1;
      name = `${name} ${attempt}`;
    }
    used.add(name.trim().toLocaleLowerCase());
    resolved[request.id] = name;
  }
  return resolved;
}

/** Fills the open cells between a floor's rooms and corridors with side rooms: small,
 * believably shaped blocks that take a door from any corridor they touch. Cells outside
 * the room cluster stay open, so a vessel's hull dressing is left to the projection. */
export function fillMysteryVenueSideRoomsV1(
  layout: MansionLayoutV2,
  options: {
    seed: string;
    archetype?: MysteryVenueArchetypeV1 | string | null;
    kind?: MysteryVenueKindV1 | string | null;
    names?: readonly MysterySideRoomNameV1[] | null;
    /** Keeps a level readable; the rest of the gap stays open. */
    maxPerFloor?: number;
  },
): MansionLayoutV2 {
  const namer = createMysterySideRoomNamerV1(options);
  const maxPerFloor = options.maxPerFloor ?? 12;
  const usedIds = new Set(layout.entities.map((entity) => entity.id));
  let next = layout;
  const added: MansionLayoutBlockV2[] = [];
  for (const floor of [...new Set(layout.entities.map((entity) => entity.floor))].sort((a, b) => a - b)) {
    const onFloor = layout.entities.filter((entity) => entity.floor === floor);
    const cluster = onFloor.filter((entity) => entity.kind === "room" || entity.kind === "corridor").map(mansionLayoutV2EntityRect);
    if (!cluster.length) continue;
    const bounds = {
      minX: Math.max(0, Math.min(...cluster.map((rect) => rect.x))),
      minY: Math.max(0, Math.min(...cluster.map((rect) => rect.y))),
      maxX: Math.min(MANSION_LAYOUT_V2_COLUMNS, Math.max(...cluster.map((rect) => rect.x + rect.width))),
      maxY: Math.min(MANSION_LAYOUT_V2_ROWS, Math.max(...cluster.map((rect) => rect.y + rect.height))),
    };
    const taken = new Set<string>();
    for (const entity of onFloor) {
      const rect = mansionLayoutV2EntityRect(entity);
      for (let y = rect.y; y < rect.y + rect.height; y += 1) for (let x = rect.x; x < rect.x + rect.width; x += 1) taken.add(`${x}:${y}`);
    }
    const free = (x: number, y: number): boolean =>
      x >= bounds.minX && x < bounds.maxX && y >= bounds.minY && y < bounds.maxY && !taken.has(`${x}:${y}`);
    const pieces: Rect[] = [];
    for (let y = bounds.minY; y < bounds.maxY; y += 1) {
      for (let x = bounds.minX; x < bounds.maxX; x += 1) {
        if (!free(x, y)) continue;
        // Grow right up to three cells, then down up to two, only over open cells.
        let width = 1;
        while (width < 3 && free(x + width, y)) width += 1;
        let height = 1;
        while (height < 2 && Array.from({ length: width }, (_, offset) => free(x + offset, y + height)).every(Boolean)) height += 1;
        for (let dy = 0; dy < height; dy += 1) for (let dx = 0; dx < width; dx += 1) taken.add(`${x + dx}:${y + dy}`);
        pieces.push({ x, y, width, height });
      }
    }
    // Larger pieces first so the roomier names land where they fit.
    pieces.sort((a, b) => b.width * b.height - a.width * a.height);
    for (const piece of pieces.slice(0, maxPerFloor)) {
      let id = `space:${floor}:${piece.x}:${piece.y}`;
      let attempt = 1;
      while (usedIds.has(id)) id = `space:${floor}:${piece.x}:${piece.y}:${attempt++}`;
      usedIds.add(id);
      const block: MansionLayoutBlockV2 = {
        kind: "infill", id, floor, x: piece.x, y: piece.y, width: piece.width, height: piece.height,
        name: namer(piece.width * piece.height),
      };
      added.push(block);
      next = { ...next, entities: [...next.entities, block] };
    }
  }
  for (const block of added) next = addAutoCenteredMansionLayoutV2Doors(next, block.id);
  return next;
}

/** A name for one hand-placed side room, sized to the block it was given. */
export function mysterySideRoomSuggestedNameV1(
  layout: MansionLayoutV2,
  block: Pick<MansionLayoutBlockV2, "width" | "height">,
  seed: string,
): string {
  const taken = new Set(layout.entities.flatMap((entity) => entity.kind === "infill" && entity.name ? [entity.name] : []));
  const namer = createMysterySideRoomNamerV1({
    seed,
    archetype: layout.venueProfile?.intent?.archetype ?? null,
    kind: layout.venueProfile?.kind ?? null,
  });
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const name = namer(block.width * block.height);
    if (!taken.has(name)) return name;
  }
  return "Storeroom";
}
