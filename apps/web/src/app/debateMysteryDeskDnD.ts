export const DEBATE_MYSTERY_DESK_DRAG_MIME = "application/x-prism-desk-reference";
const DEBATE_MYSTERY_DESK_TEXT_PREFIX = "prism-mystery-desk:";

export type DebateMysteryDeskReferenceKind = "lead" | "evidence" | "testimony";

export interface DebateMysteryDeskDragPayload {
  kind: DebateMysteryDeskReferenceKind;
  id: string;
}

export interface DebateMysteryDeskPosition {
  x: number;
  y: number;
}

export interface DebateMysteryDeskPlacement<
  TReference extends DebateMysteryDeskDragPayload = DebateMysteryDeskDragPayload,
> extends DebateMysteryDeskPosition {
  reference: TReference;
  z: number;
}

function isDeskReferenceKind(value: unknown): value is DebateMysteryDeskReferenceKind {
  return value === "lead" || value === "evidence" || value === "testimony";
}

export function encodeDebateMysteryDeskDragPayload(
  payload: DebateMysteryDeskDragPayload,
): string {
  return `${DEBATE_MYSTERY_DESK_TEXT_PREFIX}${JSON.stringify(payload)}`;
}

export function decodeDebateMysteryDeskDragPayload(
  raw: string,
): DebateMysteryDeskDragPayload | null {
  const encoded = raw.startsWith(DEBATE_MYSTERY_DESK_TEXT_PREFIX)
    ? raw.slice(DEBATE_MYSTERY_DESK_TEXT_PREFIX.length)
    : raw;
  try {
    const parsed = JSON.parse(encoded) as { kind?: unknown; id?: unknown };
    if (!isDeskReferenceKind(parsed.kind) || typeof parsed.id !== "string" || !parsed.id.trim()) {
      return null;
    }
    return { kind: parsed.kind, id: parsed.id };
  } catch {
    // Accept the first Desk implementation's kind:id payload while an already
    // mounted view is crossing a hot reload boundary.
    const separator = raw.indexOf(":");
    const kind = separator > 0 ? raw.slice(0, separator) : "";
    const id = separator > 0 ? raw.slice(separator + 1) : "";
    return isDeskReferenceKind(kind) && id ? { kind, id } : null;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

/** Convert a browser drop into a stable, resize-safe position on the Desk. */
export function debateMysteryDeskPositionFromClient(args: {
  clientX: number;
  clientY: number;
  left: number;
  top: number;
  width: number;
  height: number;
  horizontalPaddingPx?: number;
  verticalPaddingPx?: number;
}): DebateMysteryDeskPosition {
  const width = Math.max(1, args.width);
  const height = Math.max(1, args.height);
  const horizontalPadding = Math.min(width / 2, Math.max(0, args.horizontalPaddingPx ?? 72));
  const verticalPadding = Math.min(height / 2, Math.max(0, args.verticalPaddingPx ?? 64));
  const minimumX = horizontalPadding / width * 100;
  const maximumX = 100 - minimumX;
  const minimumY = verticalPadding / height * 100;
  const maximumY = 100 - minimumY;
  return {
    x: Number(clamp((args.clientX - args.left) / width * 100, minimumX, maximumX).toFixed(2)),
    y: Number(clamp((args.clientY - args.top) / height * 100, minimumY, maximumY).toFixed(2)),
  };
}

/** A keyboard/click placement still lands like a physical stack, not a slot. */
export function debateMysteryDeskFallbackPosition(index: number): DebateMysteryDeskPosition {
  const positions: DebateMysteryDeskPosition[] = [
    { x: 18, y: 34 },
    { x: 39, y: 32 },
    { x: 61, y: 35 },
    { x: 82, y: 32 },
    { x: 27, y: 72 },
    { x: 50, y: 69 },
    { x: 73, y: 72 },
  ];
  const base = positions[Math.abs(index) % positions.length]!;
  const layer = Math.floor(Math.abs(index) / positions.length);
  return {
    x: clamp(base.x + (layer % 3 - 1) * 2.2, 10, 90),
    y: clamp(base.y + (layer % 2 ? 2 : -2), 18, 82),
  };
}

/** One reducer owns click placement, first drop, and subsequent repositioning. */
export function placeDebateMysteryDeskReference<
  TReference extends DebateMysteryDeskDragPayload,
>(
  current: readonly DebateMysteryDeskPlacement<TReference>[],
  reference: TReference,
  position: DebateMysteryDeskPosition | null,
): DebateMysteryDeskPlacement<TReference>[] {
  const existingIndex = current.findIndex((placement) =>
    placement.reference.kind === reference.kind && placement.reference.id === reference.id);
  const z = current.reduce((highest, placement) => Math.max(highest, placement.z), 0) + 1;
  if (existingIndex >= 0) {
    return current.map((placement, index) => index === existingIndex
      ? { ...placement, reference, ...(position ?? {}), z }
      : placement);
  }
  const fallback = position ?? debateMysteryDeskFallbackPosition(current.length);
  return [...current, { reference, ...fallback, z }];
}
