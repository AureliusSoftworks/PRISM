import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  MANSION_LAYOUT_V2_COLUMNS,
  MANSION_LAYOUT_V2_ROWS,
  MANSION_MAP_BOARD_V1,
  MANSION_OVERHEAD_FRAME_V1,
  debateMysteryRoomFootprint,
  mansionOverheadPlacementIsValidV1,
  type DebateSessionV1,
  type MansionLayoutV2,
} from "@localai/shared";
import sharp from "sharp";
import { getDebateSession } from "./debate.ts";
import { renderRoomLightDetectionReferenceV1 } from "./debate-mystery-room-lights.ts";
import { commitDebateMysterySceneRepairV1 } from "./debate-mystery-v2.ts";
import { editImage, generateImage } from "./image-provider.ts";
import { OpenAiProvider } from "./providers.ts";
import { encryptBytes } from "./security.ts";
import { HttpError } from "./utils.http.ts";

/** The venue's exterior seen straight down, the way its establishing shot would
 * look from a drone overhead: roof or top deck plus surroundings, never rooms.
 * One image per venue, warped so the structure sits over the room tiles with a
 * margin and the surroundings spill past the map. Stored as a mansion asset. */
export const MANSION_DECK_PLAN_ROLE_V1 = "map" as const;
export const MANSION_DECK_PLAN_MODEL_V1 = "overhead_v1";
export const MANSION_OVERHEAD_LOGICAL_ID_V1 = "overhead";
const OVERHEAD_PREVIOUS_LOGICAL_ID_V1 = "overhead:previous";
/** How far the structure reaches past the rooms, in envelope cells. */
const STRUCTURE_MARGIN_CELLS = 0.8;
/** When the board holds a long hull back from covering the rooms, it may be stretched
 * this much across its beam to make up part of the difference; more than this and the
 * water would start to look pulled. */
const MAX_BEAM_STRETCH = 1.35;
/** The structure may run this far past the visible board on an axis; the map's edge
 * fade hides the tips, and it keeps a hull that barely fits from shrinking. */
const BOARD_OVERSHOOT = 0.04;
/** The image itself must reach this far past the visible board on both axes, so the
 * tilted plane never shows the plate's edge or the fill color around it. */
const BOARD_FILL = 1.08;
const GENERATION_SIZE = "1536x1024";
/** The stored frame covers MANSION_OVERHEAD_FRAME_V1 (32 by 16 cells) at 2:1. */
const STORED_WIDTH = 1600;
const STORED_HEIGHT = 800;
const MAX_STORED_BYTES = 6 * 1024 * 1024;
const VISION_MODEL = "gpt-4o";
/** Where the prompt asks the structure to sit; used when the locator cannot answer. */
const DEFAULT_STRUCTURE_BOX: Box = { x0: 0.05, y0: 0.2, x1: 0.95, y1: 0.8 };
/** A vessel's deckhouse usually occupies the middle of the hull. */
const DEFAULT_CORE_BOX: Box = { x0: 0.3, y0: 0.3, x1: 0.75, y1: 0.7 };

interface Box { x0: number; y0: number; x1: number; y1: number }
/** The envelope cells the map shows: its left and top cell and how many columns and
 * rows are in view. The client measures this from the same fit it draws with. */
export interface MansionMapBoardCellsV1 { left: number; top: number; columns: number; rows: number }
/** `structure` is the whole hull or roof; `core` is the part the rooms live in. */
interface StructureBoxes { structure: Box; core: Box }
interface Rect { x: number; y: number; width: number; height: number }

function entityFootprint(entity: MansionLayoutV2["entities"][number]): Rect {
  if (entity.kind !== "room") return { x: entity.x, y: entity.y, width: entity.width, height: entity.height };
  const footprint = debateMysteryRoomFootprint(entity.templateId);
  const rotated = entity.rotation === 90;
  return { x: entity.x, y: entity.y, width: rotated ? footprint.height : footprint.width, height: rotated ? footprint.width : footprint.height };
}

function allFootprints(layout: MansionLayoutV2): Rect[] {
  return layout.entities.map(entityFootprint);
}

/** Where the structure must land in the stored frame: every floor's rooms, grown
 * by the margin, in frame pixels. */
function structureTargetRect(layout: MansionLayoutV2): Rect {
  const blocks = allFootprints(layout);
  const cell = STORED_WIDTH / MANSION_OVERHEAD_FRAME_V1.columns;
  const minX = Math.min(...blocks.map((block) => block.x)) - STRUCTURE_MARGIN_CELLS;
  const minY = Math.min(...blocks.map((block) => block.y)) - STRUCTURE_MARGIN_CELLS;
  const maxX = Math.max(...blocks.map((block) => block.x + block.width)) + STRUCTURE_MARGIN_CELLS;
  const maxY = Math.max(...blocks.map((block) => block.y + block.height)) + STRUCTURE_MARGIN_CELLS;
  return {
    x: (minX - MANSION_OVERHEAD_FRAME_V1.left) * cell,
    y: (minY - MANSION_OVERHEAD_FRAME_V1.top) * cell,
    width: Math.max(cell, (maxX - minX) * cell),
    height: Math.max(cell, (maxY - minY) * cell),
  };
}

/** Saves the player's hand placement of the overhead plate (rotation, zoom, pan) into
 * the venue layout through the scene-repair commit, so the field-tool Undo can take
 * it back. A null placement returns the plate to where the warp put it. */
export function saveDebateMysteryMapOverheadPlacementV1(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  input: Record<string, unknown>,
): DebateSessionV1 {
  const session = getDebateSession(db, userId, sessionId);
  const state = session.formatState;
  if (state.format !== "whodunnit" || state.version !== 2) throw new HttpError(409, "Open a Whodunnit investigation first.");
  if (!state.config.mansionSnapshot?.layoutV2) throw new HttpError(409, "This archived venue has no editable layout.");
  const placement = input.placement ?? null;
  if (placement !== null && !mansionOverheadPlacementIsValidV1(placement)) {
    throw new HttpError(400, "That overhead placement is out of range.");
  }
  return commitDebateMysterySceneRepairV1(db, userId, sessionId, {
    action: "place_map_plan",
    overheadPlacement: placement === null
      ? null
      : { rotation: placement.rotation, scale: placement.scale, x: placement.x, y: placement.y },
    expectedRevision: typeof input.expectedRevision === "number" ? input.expectedRevision : undefined,
  });
}

/** Reads the board the client measured, or nothing when the request carried none. */
export function parseMansionMapBoardCellsV1(value: unknown): MansionMapBoardCellsV1 | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const number = (entry: unknown): number | null =>
    typeof entry === "number" && Number.isFinite(entry) && Math.abs(entry) <= 1000 ? entry : null;
  const left = number(record.left);
  const top = number(record.top);
  const columns = number(record.columns);
  const rows = number(record.rows);
  if (left === null || top === null || columns === null || rows === null || columns <= 0 || rows <= 0) return undefined;
  return { left, top, columns, rows };
}

function boardCellsToRect(board: MansionMapBoardCellsV1): Rect {
  const cell = STORED_WIDTH / MANSION_OVERHEAD_FRAME_V1.columns;
  return {
    x: (board.left - MANSION_OVERHEAD_FRAME_V1.left) * cell,
    y: (board.top - MANSION_OVERHEAD_FRAME_V1.top) * cell,
    width: board.columns * cell,
    height: board.rows * cell,
  };
}

/** An estimate of the part of the frame the map shows, for requests that did not
 * measure it. The map fits each floor's blocks and its tier outline into the
 * MANSION_MAP_BOARD_V1 drawing with its padding and centers them; the union of
 * every floor's view is what the shared plate has to cover. */
function visibleBoardRect(layout: MansionLayoutV2): Rect {
  const { width: boardWidth, height: boardHeight, padding } = MANSION_MAP_BOARD_V1;
  let union: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  for (const floor of new Set(layout.entities.map((entity) => entity.floor))) {
    const points: Array<{ x: number; y: number }> = [];
    for (const entity of layout.entities) {
      if (entity.floor !== floor) continue;
      const rect = entityFootprint(entity);
      points.push({ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height });
    }
    for (const point of layout.venuePresentation?.tierOutlines.find((outline) => outline.floor === floor)?.points ?? []) {
      points.push({ x: point.x * MANSION_LAYOUT_V2_COLUMNS, y: point.y * MANSION_LAYOUT_V2_ROWS });
    }
    if (!points.length) continue;
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxX = Math.max(...points.map((point) => point.x));
    const maxY = Math.max(...points.map((point) => point.y));
    const unitsPerCell = Math.min(
      (boardWidth - padding * 2) / Math.max(1, maxX - minX),
      (boardHeight - padding * 2) / Math.max(1, maxY - minY),
    );
    const columns = boardWidth / unitsPerCell;
    const rows = boardHeight / unitsPerCell;
    const view = {
      minX: (minX + maxX) / 2 - columns / 2,
      minY: (minY + maxY) / 2 - rows / 2,
      maxX: (minX + maxX) / 2 + columns / 2,
      maxY: (minY + maxY) / 2 + rows / 2,
    };
    union = union
      ? { minX: Math.min(union.minX, view.minX), minY: Math.min(union.minY, view.minY), maxX: Math.max(union.maxX, view.maxX), maxY: Math.max(union.maxY, view.maxY) }
      : view;
  }
  const view = union ?? { minX: 0, minY: 0, maxX: MANSION_LAYOUT_V2_COLUMNS, maxY: MANSION_LAYOUT_V2_ROWS };
  return boardCellsToRect({ left: view.minX, top: view.minY, columns: view.maxX - view.minX, rows: view.maxY - view.minY });
}

function styleDirection(styleJson: string): string {
  try {
    const style = JSON.parse(styleJson) as Record<string, unknown>;
    return [style.label, style.promptContract]
      .filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
      .join(". ").replace(/\s+/gu, " ").trim().slice(0, 1_200);
  } catch {
    return "A restrained, coherent PRISM mystery venue.";
  }
}

/** What the roof or top deck and the surroundings look like for each venue kind,
 * plus how the structure should sit in the frame to match the map's compass. */
function overheadSurfaces(kind: string | undefined): { top: string; around: string; composition: string } {
  switch (kind) {
    case "vessel":
      return {
        top: "its uppermost weather deck: planking, the deckhouse roofs, funnels, lifeboats in their davits, railings, hatches, vents, and masts casting short shadows",
        around: "open water with light ripples and a faint wake, no shoreline",
        composition: "the hull spans nearly the full width of the frame, centered, with the bow pointing to the right, the stern to the left, and the port side toward the top",
      };
    case "habitat":
      return { top: "its outer hull and modules: panels, airlocks, antennae, solar arrays", around: "the terrain or void it sits in", composition: "the structure spans nearly the full width of the frame, centered" };
    case "facility":
      return { top: "its roofs: flat roofing, vents, ducts, skylights, service walkways", around: "yards, fences, parking, and access roads", composition: "the structure spans nearly the full width of the frame, centered" };
    case "transport":
      return { top: "its roof: panels, hatches, vents, running gear at the edges", around: "the roadway, rail bed, or ground it travels over", composition: "the vehicle spans nearly the full width of the frame, centered, front to the right" };
    case "estate":
    default:
      return { top: "its roofs: tiles or slate, ridges, chimneys, skylights, dormers, gutters", around: "grounds: lawn, gravel drive, hedges, paths, trees casting short shadows", composition: "the building spans nearly the full width of the frame, centered, with its main entrance facade toward the bottom edge" };
  }
}

function overheadPrompt(layout: MansionLayoutV2, style: string, hasReference: boolean): string {
  const venue = layout.venueProfile;
  const placeNoun = venue?.placeNoun ?? "mansion";
  const surfaces = overheadSurfaces(venue?.kind);
  return [
    hasReference
      ? `This image shows the ${placeNoun} from the case. Paint this same ${placeNoun} seen from directly above, a true top-down view, in exactly the same illustrated style, palette, materials, era, proportions, and details as this image. It must read as the same artwork continued, not as a photograph.`
      : `An illustrated top-down view of a ${placeNoun}, painted in this style: ${style}. Not a photograph.`,
    `Show only its exterior, ${surfaces.top}, fully opaque. Never show interior rooms, cutaways, floor plans, or see-through walls.`,
    `Compose it so ${surfaces.composition}, and ${surfaces.around} fills the rest of the frame.`,
    hasReference ? style : "",
    "Soft, even daylight from above and a muted, low-contrast palette so it can sit quietly beneath a map. No tilt, no perspective.",
    "No people, figures, vehicles, evidence, readable text, labels, numbers, arrows, legends, borders, or UI.",
  ].filter(Boolean).join(" ");
}

const BOX_SCHEMA = {
  type: "object", additionalProperties: false, required: ["x0", "y0", "x1", "y1"],
  properties: {
    x0: { type: "number", minimum: 0, maximum: 1 }, y0: { type: "number", minimum: 0, maximum: 1 },
    x1: { type: "number", minimum: 0, maximum: 1 }, y1: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;

function normalizeBox(value: Partial<Box> | null | undefined, minWidth: number, minHeight: number): Box | null {
  if (!value) return null;
  const x0 = Math.min(value.x0 ?? 0, value.x1 ?? 1); const x1 = Math.max(value.x0 ?? 0, value.x1 ?? 1);
  const y0 = Math.min(value.y0 ?? 0, value.y1 ?? 1); const y1 = Math.max(value.y0 ?? 0, value.y1 ?? 1);
  return [x0, y0, x1, y1].every(Number.isFinite) && x1 - x0 >= minWidth && y1 - y0 >= minHeight ? { x0, y0, x1, y1 } : null;
}

/** Asks the vision model where the whole structure sits and where the part that
 * holds the rooms sits: a vessel's deckhouse, a building's main roof mass. Uses
 * the same coordinate ruler the light detector burns in. */
async function locateStructure(apiKey: string, bytes: Buffer, placeNoun: string, kind: string | undefined, signal?: AbortSignal): Promise<StructureBoxes> {
  const coreNoun = kind === "vessel" ? "deckhouse or superstructure, the built-up block of cabins and decks amidships, excluding the open bow and stern decks"
    : kind === "transport" ? "passenger body, excluding the nose and tail"
    : "main roof mass, excluding porches, terraces, and outbuildings";
  try {
    const { png } = await renderRoomLightDetectionReferenceV1(bytes);
    const provider = new OpenAiProvider({ apiKey });
    const response = await provider.generateResponse(
      [{
        role: "user",
        content: [
          `This image shows a ${placeNoun} from directly above. Return two tight bounding boxes: structure is the whole hull or roof, excluding water, wake, shadows, grounds, and sky; core is the ${coreNoun}, which lies inside structure.`,
          "The image carries a coordinate ruler: labelled lines with their exact normalized values and unlabelled half-step ticks between them. x runs 0 at the far left to 1 at the far right; y runs 0 at the top to 1 at the bottom. Read every coordinate off that ruler.",
        ].join(" "),
        images: [{ mimeType: "image/png", data: png.toString("base64") }],
      }],
      {
        model: VISION_MODEL,
        maxTokens: 300,
        jsonSchema: { type: "object", additionalProperties: false, required: ["structure", "core"], properties: { structure: BOX_SCHEMA, core: BOX_SCHEMA } },
        jsonSchemaName: "overhead_structure_boxes",
        usagePurpose: "image_generation",
        allowFinalLocalFallback: false,
        signal,
        generationWork: { workflow: "debate_mystery_scene_repair", stage: "observe_scene_geometry", privacyMode: "online", outputClass: "critical" },
      },
    );
    const parsed = JSON.parse(response) as Partial<StructureBoxes>;
    const structure = normalizeBox(parsed.structure, 0.3, 0.15) ?? DEFAULT_STRUCTURE_BOX;
    const core = normalizeBox(parsed.core, 0.15, 0.1);
    const coreInside = core && core.x0 >= structure.x0 - 0.05 && core.x1 <= structure.x1 + 0.05 && core.y0 >= structure.y0 - 0.05 && core.y1 <= structure.y1 + 0.05;
    return { structure, core: coreInside ? core! : structure };
  } catch {
    // Fall through to the composition the prompt asked for.
  }
  return { structure: DEFAULT_STRUCTURE_BOX, core: kind === "vessel" || kind === "transport" ? DEFAULT_CORE_BOX : DEFAULT_STRUCTURE_BOX };
}

/** Slides `offset` so the span from `start` to `end` (with the offset applied) lies
 * inside `min` to `max`; a span longer than the range is centered on it instead. */
function keepOnBoard(offset: number, start: number, end: number, min: number, max: number): number {
  if (end - start >= max - min) return (min + max) / 2 - (start + end) / 2;
  if (offset + start < min) return min - start;
  if (offset + end > max) return max - end;
  return offset;
}

/** Scales the generated image so the roof, or a vessel's deckhouse, covers the room
 * cluster, the way the rooms sit in the structure; then, if that would push any of
 * the structure off the visible board, holds the scale back so the whole thing stays
 * on the board (tips allowed a little past the edge fade) and stretches the free axis
 * by a bounded amount to recover part of the cover. Whatever those two wanted, the
 * image is never smaller than the board: water or grounds fill the frame edge to
 * edge, and a structure the locator boxed too small grows with it. The core is
 * centered on the rooms, slid only as far as needed to keep the structure on the
 * board, and the result is laid into the stored frame, continued as a mirror
 * wherever the warped image does not reach. */
async function warpToFrame(bytes: Buffer, boxes: StructureBoxes, coreCovers: boolean, target: Rect, board: Rect): Promise<Buffer> {
  const metadata = await sharp(bytes).rotate().metadata();
  const sourceWidth = metadata.width ?? 1536;
  const sourceHeight = metadata.height ?? 1024;
  const hull = boxes.structure;
  const core = coreCovers ? boxes.core : boxes.structure;
  const hullWidth = Math.max(1, (hull.x1 - hull.x0) * sourceWidth);
  const hullHeight = Math.max(1, (hull.y1 - hull.y0) * sourceHeight);
  const coreWidth = Math.max(1, (core.x1 - core.x0) * sourceWidth);
  const coreHeight = Math.max(1, (core.y1 - core.y0) * sourceHeight);
  const coverScale = Math.max(target.width / coreWidth, target.height / coreHeight);
  const boardScaleX = (board.width * (1 + BOARD_OVERSHOOT)) / hullWidth;
  const boardScaleY = (board.height * (1 + BOARD_OVERSHOOT)) / hullHeight;
  const fillScale = Math.max((board.width * BOARD_FILL) / sourceWidth, (board.height * BOARD_FILL) / sourceHeight);
  const scale = Math.max(fillScale, Math.min(coverScale, boardScaleX, boardScaleY));
  const heldBack = scale < coverScale;
  const recover = Math.min(MAX_BEAM_STRETCH, coverScale / scale);
  const stretchX = heldBack && boardScaleY < boardScaleX ? Math.max(1, Math.min(recover, boardScaleX / scale)) : 1;
  const stretchY = heldBack && boardScaleX <= boardScaleY ? Math.max(1, Math.min(recover, boardScaleY / scale)) : 1;
  const resizedWidth = Math.max(1, Math.round(sourceWidth * scale * stretchX));
  const resizedHeight = Math.max(1, Math.round(sourceHeight * scale * stretchY));
  const coreCenter = { x: ((core.x0 + core.x1) / 2) * resizedWidth, y: ((core.y0 + core.y1) / 2) * resizedHeight };
  const offsetX = Math.round(keepOnBoard(
    target.x + target.width / 2 - coreCenter.x,
    hull.x0 * resizedWidth,
    hull.x1 * resizedWidth,
    board.x,
    board.x + board.width,
  ));
  const offsetY = Math.round(keepOnBoard(
    target.y + target.height / 2 - coreCenter.y,
    hull.y0 * resizedHeight,
    hull.y1 * resizedHeight,
    board.y,
    board.y + board.height,
  ));
  const resized = await sharp(bytes).rotate().resize(resizedWidth, resizedHeight, { fit: "fill" }).png().toBuffer();
  // Frame the image does not reach continues it as a mirror, so water or grounds run
  // on instead of a flat color. Two passes: sharp extracts before it extends.
  const padLeft = Math.max(0, offsetX);
  const padTop = Math.max(0, offsetY);
  const padRight = Math.max(0, STORED_WIDTH - (offsetX + resizedWidth));
  const padBottom = Math.max(0, STORED_HEIGHT - (offsetY + resizedHeight));
  const extended = padLeft || padTop || padRight || padBottom
    ? await sharp(resized).extend({ left: padLeft, top: padTop, right: padRight, bottom: padBottom, extendWith: "mirror" }).png().toBuffer()
    : resized;
  return sharp(extended)
    .extract({ left: padLeft - offsetX, top: padTop - offsetY, width: STORED_WIDTH, height: STORED_HEIGHT })
    .webp({ quality: 88 })
    .toBuffer();
}

/** Generates, places, and stores the venue's overhead view. The previous view is
 * kept under a previous logical id so a field-repair Undo can restore it. */
export async function generateDebateMysteryDeckPlanV1(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  bundleId: string;
  layout: MansionLayoutV2;
  /** The venue's exterior establishing shot or thumbnail; the overhead is this structure seen from above. */
  exteriorBytes: Buffer | null;
  /** The cells the map shows, measured by the client; estimated from the layout when absent. */
  board?: MansionMapBoardCellsV1;
  apiKey: string;
  model?: string | null;
  signal?: AbortSignal;
}): Promise<{ assetId: string; boxes: StructureBoxes }> {
  const row = args.db.prepare(
    "SELECT style_json FROM debate_mystery_mansion_bundles WHERE id = ? AND user_id = ?",
  ).get(args.bundleId, args.userId) as { style_json: string } | undefined;
  if (!row) throw new HttpError(404, "That saved mansion was not found.");
  if (args.layout.entities.length === 0) throw new HttpError(409, "This venue has no structure to draw.");
  const style = styleDirection(row.style_json);
  const prompt = overheadPrompt(args.layout, style, Boolean(args.exteriorBytes));
  const request = { model: args.model?.trim() || undefined, size: GENERATION_SIZE, quality: "high", signal: args.signal };
  const generated = args.exteriorBytes
    ? await editImage(prompt, args.exteriorBytes, args.apiKey, request)
    : await generateImage(prompt, args.apiKey, { ...request, background: "opaque" });
  let bytes = generated.imageBytes;
  if (!bytes && generated.url) {
    const response = await fetch(generated.url);
    if (!response.ok) throw new HttpError(502, `The overhead view could not be downloaded (${response.status}).`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (!bytes?.length) throw new HttpError(502, "The overhead view came back empty.");
  const placeNoun = args.layout.venueProfile?.placeNoun ?? "mansion";
  const kind = args.layout.venueProfile?.kind;
  const boxes = await locateStructure(args.apiKey, bytes, placeNoun, kind, args.signal);
  // The rooms live in the deckhouse or main roof mass, so that is what covers the
  // tiles; the widescreen board then has room for the bow and stern as well.
  const coreCovers = kind === "vessel" || kind === "transport";
  const board = args.board ? boardCellsToRect(args.board) : visibleBoardRect(args.layout);
  const plan = await warpToFrame(bytes, boxes, coreCovers, structureTargetRect(args.layout), board);
  if (plan.byteLength > MAX_STORED_BYTES) throw new HttpError(502, "The overhead view is outside the protected storage boundary.");
  const sha256 = createHash("sha256").update(plan).digest("hex");
  const encrypted = encryptBytes(plan, args.userKey);
  const assetId = randomUUID();
  const now = new Date().toISOString();
  const active = MANSION_OVERHEAD_LOGICAL_ID_V1;
  const previous = OVERHEAD_PREVIOUS_LOGICAL_ID_V1;
  args.db.exec("BEGIN IMMEDIATE");
  try {
    args.db.prepare(
      `INSERT INTO debate_mystery_mansion_assets
         (id, user_id, ciphertext, cipher_iv, cipher_tag, sha256, byte_size,
          mime_type, width, height, duration_ms, provider, model, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'image/webp', ?, ?, NULL, 'openai', ?, ?, ?)
       ON CONFLICT(user_id, sha256) DO UPDATE SET updated_at = excluded.updated_at`,
    ).run(assetId, args.userId, encrypted.ciphertext, encrypted.iv, encrypted.tag, sha256, plan.byteLength,
      STORED_WIDTH, STORED_HEIGHT, generated.model ?? MANSION_DECK_PLAN_MODEL_V1, now, now);
    const stored = args.db.prepare(
      "SELECT id FROM debate_mystery_mansion_assets WHERE user_id = ? AND sha256 = ?",
    ).get(args.userId, sha256) as { id: string };
    args.db.prepare(
      `DELETE FROM debate_mystery_mansion_asset_refs WHERE bundle_id = ? AND user_id = ? AND role = ? AND logical_id = ?`,
    ).run(args.bundleId, args.userId, MANSION_DECK_PLAN_ROLE_V1, previous);
    args.db.prepare(
      `UPDATE debate_mystery_mansion_asset_refs SET logical_id = ?, created_at = ?
        WHERE bundle_id = ? AND user_id = ? AND role = ? AND logical_id = ?`,
    ).run(previous, now, args.bundleId, args.userId, MANSION_DECK_PLAN_ROLE_V1, active);
    args.db.prepare(
      `INSERT INTO debate_mystery_mansion_asset_refs (bundle_id, user_id, asset_id, role, logical_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(bundle_id, role, logical_id) DO UPDATE SET asset_id = excluded.asset_id, created_at = excluded.created_at`,
    ).run(args.bundleId, args.userId, stored.id, MANSION_DECK_PLAN_ROLE_V1, active, now);
    args.db.prepare("UPDATE debate_mystery_mansion_bundles SET updated_at = ? WHERE id = ? AND user_id = ?").run(now, args.bundleId, args.userId);
    args.db.exec("COMMIT");
    return { assetId: stored.id, boxes };
  } catch (error) {
    if (args.db.isTransaction) args.db.exec("ROLLBACK");
    throw error;
  }
}

/** Field-repair Undo: the previous overhead view comes back, or the venue
 * returns to having none. Bytes no longer referenced anywhere are removed. */
export function undoDebateMysteryMansionDeckPlanV1(db: DatabaseSync, userId: string, bundleId: string): void {
  const active = MANSION_OVERHEAD_LOGICAL_ID_V1;
  const previous = OVERHEAD_PREVIOUS_LOGICAL_ID_V1;
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      `DELETE FROM debate_mystery_mansion_asset_refs WHERE bundle_id = ? AND user_id = ? AND role = ? AND logical_id = ?`,
    ).run(bundleId, userId, MANSION_DECK_PLAN_ROLE_V1, active);
    db.prepare(
      `UPDATE debate_mystery_mansion_asset_refs SET logical_id = ?, created_at = ?
        WHERE bundle_id = ? AND user_id = ? AND role = ? AND logical_id = ?`,
    ).run(active, now, bundleId, userId, MANSION_DECK_PLAN_ROLE_V1, previous);
    db.prepare(
      `DELETE FROM debate_mystery_mansion_assets
        WHERE user_id = ? AND mime_type LIKE 'image/%' AND NOT EXISTS (
          SELECT 1 FROM debate_mystery_mansion_asset_refs AS refs
           WHERE refs.user_id = debate_mystery_mansion_assets.user_id
             AND refs.asset_id = debate_mystery_mansion_assets.id
        )`,
    ).run(userId);
    db.exec("COMMIT");
  } catch (error) {
    if (db.isTransaction) db.exec("ROLLBACK");
    throw error;
  }
}
