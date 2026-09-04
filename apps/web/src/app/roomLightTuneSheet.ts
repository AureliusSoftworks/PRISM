import {
  MANSION_EFFECT_DEFAULT_BLEND_MODE_V1,
  mansionDynamicLightCenterV2,
  type MansionDynamicLightV2,
  type MansionLightBlendModeV1,
} from "@localai/shared";
import { roomLightBlend } from "./roomLightPlacement.ts";

/**
 * A contact sheet of the lit room, one tile per candidate blend, for a model to
 * judge. The plate and the layer's canvases are composited here on the client,
 * which already owns the renderer, so the server never has to draw a light.
 */

export interface RoomLightTuneCandidateV1 {
  /** Single letter the judge answers with. */
  label: string;
  blend: MansionLightBlendModeV1;
}

export interface RoomLightTuneSheetV1 {
  /** PNG bytes, base64 without a data-URL prefix. */
  png: string;
  width: number;
  height: number;
  columns: number;
  tile: { width: number; height: number };
  candidates: RoomLightTuneCandidateV1[];
  /** Numbered markers drawn on every tile, so the judge can name a light. */
  markers: Array<{ label: string; id: string }>;
}

export interface RoomLightTuneSheetLayoutV1 {
  columns: number;
  rows: number;
  tile: { width: number; height: number };
  width: number;
  height: number;
  tiles: Array<{ x: number; y: number }>;
}

/** Pure grid math: two columns once there is more than one candidate. */
export function roomLightTuneSheetLayoutV1(args: { count: number; aspect: number; tileWidth?: number }): RoomLightTuneSheetLayoutV1 {
  const count = Math.max(1, Math.floor(args.count));
  const tileWidth = Math.max(160, Math.round(args.tileWidth ?? 800));
  const aspect = Number.isFinite(args.aspect) && args.aspect > 0 ? args.aspect : 16 / 9;
  const tileHeight = Math.max(90, Math.round(tileWidth / aspect));
  const columns = count > 1 ? 2 : 1;
  const rows = Math.ceil(count / columns);
  const tiles = Array.from({ length: count }, (_, index) => ({
    x: (index % columns) * tileWidth,
    y: Math.floor(index / columns) * tileHeight,
  }));
  return { columns, rows, tile: { width: tileWidth, height: tileHeight }, width: columns * tileWidth, height: rows * tileHeight, tiles };
}

/** Canvas compositing operation that matches the CSS blend the layer uses. */
export function roomLightTuneCanvasBlendOpV1(blend: MansionLightBlendModeV1 | undefined): GlobalCompositeOperation {
  const resolved = roomLightBlend(blend);
  switch (resolved) {
    case "plus-lighter": return "lighter";
    case "normal": return "source-over";
    case "screen": case "overlay": case "soft-light": case "hard-light": case "multiply": return resolved;
    default: return "source-over";
  }
}

/** Human label for a candidate tile, e.g. "A · Hard Light". */
export function roomLightTuneCandidateTitleV1(candidate: RoomLightTuneCandidateV1): string {
  const words = roomLightBlend(candidate.blend).split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  return `${candidate.label} · ${words}`;
}

export function composeRoomLightTuneSheet(args: {
  plate: HTMLImageElement;
  /** The element that contains the layer's tagged canvases. */
  stage: HTMLElement;
  lights: readonly MansionDynamicLightV2[];
  candidates: readonly RoomLightTuneCandidateV1[];
  tileWidth?: number;
}): RoomLightTuneSheetV1 {
  const aspect = args.plate.naturalWidth > 0 && args.plate.naturalHeight > 0
    ? args.plate.naturalWidth / args.plate.naturalHeight
    : 16 / 9;
  const layout = roomLightTuneSheetLayoutV1({ count: args.candidates.length, aspect, tileWidth: args.tileWidth });
  const canvases = {
    lights: args.stage.querySelector<HTMLCanvasElement>('canvas[data-room-light-canvas="lights"]'),
    effects: args.stage.querySelector<HTMLCanvasElement>('canvas[data-room-light-canvas="effects"]'),
    atmosphere: args.stage.querySelector<HTMLCanvasElement>('canvas[data-room-light-canvas="atmosphere"]'),
  };
  const sheet = document.createElement("canvas");
  sheet.width = layout.width;
  sheet.height = layout.height;
  const context = sheet.getContext("2d");
  if (!context) throw new Error("This browser cannot compose the lighting sheet.");
  const markers = args.lights.map((light, index) => ({ label: String(index + 1), id: light.id }));
  const { width, height } = layout.tile;

  args.candidates.forEach((candidate, index) => {
    const origin = layout.tiles[index]!;
    context.save();
    context.beginPath();
    context.rect(origin.x, origin.y, width, height);
    context.clip();
    context.globalCompositeOperation = "source-over";
    context.drawImage(args.plate, origin.x, origin.y, width, height);
    if (canvases.lights) {
      context.globalCompositeOperation = roomLightTuneCanvasBlendOpV1(candidate.blend);
      context.drawImage(canvases.lights, origin.x, origin.y, width, height);
    }
    if (canvases.effects) {
      context.globalCompositeOperation = roomLightTuneCanvasBlendOpV1(MANSION_EFFECT_DEFAULT_BLEND_MODE_V1);
      context.drawImage(canvases.effects, origin.x, origin.y, width, height);
    }
    if (canvases.atmosphere) {
      context.globalCompositeOperation = "source-over";
      context.drawImage(canvases.atmosphere, origin.x, origin.y, width, height);
    }
    context.globalCompositeOperation = "source-over";
    // Numbered markers on every tile, in the detector's magenta so the judge reads them the same way.
    for (const [markerIndex, light] of args.lights.entries()) {
      const center = mansionDynamicLightCenterV2(light);
      const x = origin.x + center.x * width;
      const y = origin.y + center.y * height;
      context.beginPath();
      context.arc(x, y, 9, 0, Math.PI * 2);
      context.fillStyle = "rgba(255, 92, 240, 0.92)";
      context.fill();
      context.lineWidth = 2;
      context.strokeStyle = "#1a0a18";
      context.stroke();
      context.font = "bold 13px sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillStyle = "#fff";
      context.fillText(markers[markerIndex]!.label, x, y + 0.5);
    }
    const title = roomLightTuneCandidateTitleV1(candidate);
    context.font = "bold 18px sans-serif";
    context.textAlign = "left";
    context.textBaseline = "middle";
    const padding = 8;
    const textWidth = context.measureText(title).width;
    context.fillStyle = "rgba(4, 6, 12, 0.82)";
    context.fillRect(origin.x + 10, origin.y + 10, textWidth + padding * 2, 30);
    context.fillStyle = "#fff";
    context.fillText(title, origin.x + 10 + padding, origin.y + 25);
    context.restore();
  });

  const dataUrl = sheet.toDataURL("image/png");
  return {
    png: dataUrl.slice(dataUrl.indexOf(",") + 1),
    width: layout.width,
    height: layout.height,
    columns: layout.columns,
    tile: layout.tile,
    candidates: [...args.candidates],
    markers,
  };
}
