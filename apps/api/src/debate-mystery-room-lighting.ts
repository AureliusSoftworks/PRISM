import type { DatabaseSync } from "node:sqlite";
import {
  MANSION_LAYOUT_V2_MAX_LIGHTS,
  MANSION_LIGHT_BLEND_MODES_V1,
  validateMansionLayoutV2,
  type MansionDynamicLightV2,
  type MansionLayoutV2,
  type MansionLightBlendModeV1,
} from "@localai/shared";
import { getDebateSession } from "./debate.ts";
import { commitDebateMysterySceneRepairV1 } from "./debate-mystery-v2.ts";
import { HttpError } from "./utils.http.ts";

/** Validate only the submitted room's presentation; never accept a replacement case/layout. */
export function validateRoomLightingEditV1(layout: MansionLayoutV2, roomId: string, input: Record<string, unknown>) {
  if (Object.keys(input).some((key) => !["roomId", "lights", "blendMode"].includes(key))) {
    throw new HttpError(400, "Light placement accepts only a room, lights, and blend mode.");
  }
  if (!layout.entities.some((entity) => entity.kind === "room" && entity.id === roomId)) {
    throw new HttpError(409, "This room has no editable lighting layout.");
  }
  if (!Array.isArray(input.lights) || input.lights.length > MANSION_LAYOUT_V2_MAX_LIGHTS ||
    !MANSION_LIGHT_BLEND_MODES_V1.includes(input.blendMode as MansionLightBlendModeV1)) {
    throw new HttpError(400, "Choose valid room lights and a supported blend mode.");
  }
  const otherIds = new Set(layout.lights.filter((light) => light.roomId !== roomId).map((light) => light.id));
  for (const light of input.lights) {
    if (!light || typeof light !== "object" || light.roomId !== roomId || otherIds.has(light.id) ||
      !["fire", "omni", "directional", "neon"].includes(light.kind) || !light.geometry) {
      throw new HttpError(400, "Every light must belong to this room and have valid geometry.");
    }
  }
  const lights = structuredClone(input.lights) as MansionDynamicLightV2[];
  // Use the canonical layout validator, isolating these lights from unrelated legacy metadata.
  let errors: string[];
  try {
    const baseline = new Set(validateMansionLayoutV2({ ...layout, lights: [] }));
    errors = validateMansionLayoutV2({ ...layout, lights }).filter((error) => !baseline.has(error));
  } catch {
    throw new HttpError(400, "A light has malformed presentation settings.");
  }
  if (errors.length) throw new HttpError(400, errors[0]!);
  return { lights, blendMode: input.blendMode as MansionLightBlendModeV1 };
}

/** A purely local edit: same player and visited-room gates as other field repairs. */
export function saveDebateMysteryRoomLightingV1(db: DatabaseSync, userId: string, sessionId: string, input: Record<string, unknown>) {
  const session = getDebateSession(db, userId, sessionId);
  const state = session.formatState;
  if (state.format !== "whodunnit" || state.version !== 2) throw new HttpError(409, "Open a Whodunnit investigation first.");
  const roomId = typeof input.roomId === "string" ? input.roomId : "";
  if (!state.rooms.some((room) => room.id === roomId && room.visited)) throw new HttpError(409, "Visit this room before editing its lights.");
  const layout = state.config.mansionSnapshot?.layoutV2;
  if (!layout) throw new HttpError(409, "This archived venue has no editable lighting layout.");
  const edit = validateRoomLightingEditV1(layout, roomId, input);
  return commitDebateMysterySceneRepairV1(db, userId, sessionId, {
    action: "refresh_room_lights", roomId, lights: edit.lights, lightBlendMode: edit.blendMode,
  });
}
