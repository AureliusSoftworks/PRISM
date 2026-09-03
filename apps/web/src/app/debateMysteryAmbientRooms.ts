import type { DebateMysteryAmbientSpaceV1, MansionLayoutBlockV2 } from "@localai/shared";

type Rect = { x: number; y: number; width: number; height: number };
export type MysteryAmbientRoom = DebateMysteryAmbientSpaceV1;

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.width - 0.001 && a.x + a.width > b.x + 0.001 &&
  a.y < b.y + b.height - 0.001 && a.y + a.height > b.y + 0.001;

/** Decorative map geometry only: never becomes a case room or a travel target. */
export function mysteryAmbientRooms(args: {
  floor: number;
  spaces: readonly DebateMysteryAmbientSpaceV1[] | null;
  /** Authored legacy-estate blocks are final geometry, not subdivision bands. */
  authoredInfill?: readonly MansionLayoutBlockV2[];
  occupied: readonly Rect[];
  roomFootprints: readonly Rect[];
}): MysteryAmbientRoom[] {
  const authored = args.authoredInfill?.filter((block) =>
    block.kind === "infill" && block.floor === args.floor,
  ) ?? [];
  if (authored.length > 0) {
    // Infill is already part of occupied. Do not overlap-filter it against
    // itself, split it into cells, or leak editor metadata into map targets.
    return authored.map(({ id, floor, x, y, width, height }) => ({
      id, floor, x, y, width, height, pattern: "closed-volume",
    }));
  }
  const dimensions = args.roomFootprints
    .map((room) => Math.min(room.width, room.height))
    .filter((size) => Number.isFinite(size) && size > 0)
    .sort((a, b) => a - b);
  if (dimensions.length === 0) return [];
  const side = Math.max(0.5, dimensions[Math.floor(dimensions.length / 2)]! / 2);
  const occupied = args.occupied.filter((rect) =>
    [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0,
  );
  if (occupied.length === 0) return [];

  // Older mansion maps have no projection. Dress a single room-depth perimeter
  // and internal gaps around their existing geometry, in that map's own units.
  const sources = args.spaces ?? [{
    id: `ambient:legacy:${args.floor}`,
    floor: args.floor,
    x: Math.min(...occupied.map((rect) => rect.x)) - side,
    y: Math.min(...occupied.map((rect) => rect.y)) - side,
    width: Math.max(...occupied.map((rect) => rect.x + rect.width)) - Math.min(...occupied.map((rect) => rect.x)) + side * 2,
    height: Math.max(...occupied.map((rect) => rect.y + rect.height)) - Math.min(...occupied.map((rect) => rect.y)) + side * 2,
    pattern: "closed-volume" as const,
  }];
  const rooms: MysteryAmbientRoom[] = [];
  for (const space of sources) {
    if (space.floor !== args.floor || ![space.x, space.y, space.width, space.height].every(Number.isFinite) || space.width <= 0 || space.height <= 0) continue;
    const columns = Math.min(32, Math.max(1, Math.round(space.width / side)));
    const rows = Math.min(24, Math.max(1, Math.round(space.height / side)));
    const width = space.width / columns;
    const height = space.height / rows;
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const rect = { x: space.x + column * width, y: space.y + row * height, width, height };
        if (occupied.some((entity) => overlaps(rect, entity)) || rooms.some((room) => overlaps(rect, room))) continue;
        const wideRoom = { ...rect, width: width * 2 };
        if ((column + row) % 4 === 1 && column + 1 < columns &&
          !occupied.some((entity) => overlaps(wideRoom, entity)) &&
          !rooms.some((room) => overlaps(wideRoom, room))) rect.width = wideRoom.width;
        rooms.push({ ...space, ...rect, id: `${space.id}:room:${column}:${row}` });
        if (rooms.length >= 192) return rooms;
      }
    }
  }
  return rooms;
}
