import type { LlmProviderName } from "./index.js";
import type { StoryItemGlyphCategory, StorySpritePose } from "./storyThemes.js";

export type StorySessionStatus = "generating" | "playing" | "complete" | "failed";
export type StoryProgressStatus = "playing" | "complete";
export type StoryTranscriptEntryKind = "scene" | "choice" | "travel" | "item" | "system";

export const STORY_BOT_COUNT_MIN = 1;
export const STORY_BOT_COUNT_MAX = 3;
export const STORY_SCENE_COUNT_MIN = 8;
export const STORY_SCENE_COUNT_MAX = 12;
export const STORY_LOCATION_COUNT_MIN = 3;
export const STORY_LOCATION_COUNT_MAX = 5;
export const STORY_ENDING_COUNT_MIN = 1;
export const STORY_ENDING_COUNT_MAX = 3;
export const STORY_CHOICE_COUNT_MIN = 2;
export const STORY_CHOICE_COUNT_MAX = 4;

const PRISM_DEFAULT_STORY_THEME_ID = "prism_default";
const STORY_ITEM_GLYPH_CATEGORIES = [
  "weapon",
  "potion",
  "key",
  "clue",
  "document",
  "relic",
  "tool",
  "collectible",
] satisfies readonly StoryItemGlyphCategory[];
const STORY_SPRITE_POSES = [
  "idle",
  "speaking",
  "thinking",
  "action",
] satisfies readonly StorySpritePose[];

export interface StoryLocation {
  id: string;
  name: string;
  description: string;
  x: number;
  y: number;
  discovered: boolean;
  backgroundAssetId?: string;
  arrivalSceneId?: string;
}

export interface StoryInventoryItem {
  id: string;
  name: string;
  category: StoryItemGlyphCategory;
  description: string;
  glyph?: string;
}

export interface StoryChoice {
  id: string;
  label: string;
  targetSceneId: string;
  revealLocationIds?: string[];
  grantItemIds?: string[];
  requireItemIds?: string[];
}

export interface StoryScene {
  id: string;
  title: string;
  locationId: string;
  narration: string;
  speakerBotId?: string | null;
  speakerName?: string;
  spritePose?: StorySpritePose;
  backgroundAssetId?: string;
  cutsceneAssetId?: string;
  itemIds?: string[];
  ending?: boolean;
  choices: StoryChoice[];
}

export interface StoryEpisodeManifest {
  id: string;
  title: string;
  summary: string;
  themeId: string;
  startSceneId: string;
  locations: StoryLocation[];
  items: StoryInventoryItem[];
  scenes: StoryScene[];
}

export interface StorySessionProgress {
  currentSceneId: string;
  discoveredLocationIds: string[];
  inventoryItemIds: string[];
  completedSceneIds: string[];
  status: StoryProgressStatus;
  endingSceneId?: string | null;
  updatedAt: string;
}

export interface StoryTranscriptEntry {
  id: string;
  kind: StoryTranscriptEntryKind;
  sceneId?: string;
  choiceId?: string;
  locationId?: string;
  speakerBotId?: string | null;
  text: string;
  createdAt: string;
}

export interface StorySessionSummary {
  id: string;
  title: string;
  themeId: string;
  status: StorySessionStatus;
  provider: LlmProviderName;
  model: string | null;
  botIds: string[];
  premise: string | null;
  currentSceneId?: string | null;
  error?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StorySessionDetail extends StorySessionSummary {
  episode: StoryEpisodeManifest | null;
  progress: StorySessionProgress | null;
  transcript: StoryTranscriptEntry[];
}

export interface StorySessionCreateRequest {
  botIds: string[];
  premise?: string | null;
  preferredProvider?: LlmProviderName;
  modelOverride?: string | null;
}

export interface StorySessionCreateResponse {
  session: StorySessionDetail;
}

export interface StorySessionListResponse {
  sessions: StorySessionSummary[];
}

export interface StorySessionDetailResponse {
  session: StorySessionDetail;
}

export interface StorySessionChoiceRequest {
  choiceId: string;
}

export interface StorySessionTravelRequest {
  locationId: string;
}

export interface StorySessionItemRequest {
  itemId: string;
}

export interface StorySessionMutationResponse {
  session: StorySessionDetail;
}

export interface StorySessionDeleteResponse {
  ok: true;
}

export interface StoryTransitionResult {
  progress: StorySessionProgress;
  transcriptEntries: StoryTranscriptEntry[];
}

const STORY_ITEM_CATEGORY_SET = new Set<string>(STORY_ITEM_GLYPH_CATEGORIES);
const STORY_SPRITE_POSE_SET = new Set<string>(STORY_SPRITE_POSES);

function readString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readObject(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function readArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }
  return value;
}

function readBoundedNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${field} must be a finite number.`);
  }
  return Math.max(0, Math.min(1, value));
}

function uniqueStrings(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function assertUniqueIds<T extends { id: string }>(rows: readonly T[], field: string): void {
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id)) {
      throw new Error(`${field} contains duplicate id "${row.id}".`);
    }
    ids.add(row.id);
  }
}

function readOptionalStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  const out = readArray(value, field).map((entry, index) =>
    readString(entry, `${field}[${index}]`)
  );
  return uniqueStrings(out);
}

function parseLocations(raw: unknown): StoryLocation[] {
  const locations = readArray(raw, "locations").map((entry, index): StoryLocation => {
    const row = readObject(entry, `locations[${index}]`);
    return {
      id: readString(row.id, `locations[${index}].id`),
      name: readString(row.name, `locations[${index}].name`),
      description: readString(row.description, `locations[${index}].description`),
      x: readBoundedNumber(row.x, `locations[${index}].x`),
      y: readBoundedNumber(row.y, `locations[${index}].y`),
      discovered: row.discovered === true,
      ...(readOptionalString(row.backgroundAssetId)
        ? { backgroundAssetId: readOptionalString(row.backgroundAssetId) }
        : {}),
      ...(readOptionalString(row.arrivalSceneId)
        ? { arrivalSceneId: readOptionalString(row.arrivalSceneId) }
        : {}),
    };
  });
  if (locations.length < STORY_LOCATION_COUNT_MIN || locations.length > STORY_LOCATION_COUNT_MAX) {
    throw new Error(`Story episodes need ${STORY_LOCATION_COUNT_MIN}-${STORY_LOCATION_COUNT_MAX} locations.`);
  }
  assertUniqueIds(locations, "locations");
  return locations;
}

function parseItems(raw: unknown): StoryInventoryItem[] {
  const items = readArray(raw, "items").map((entry, index): StoryInventoryItem => {
    const row = readObject(entry, `items[${index}]`);
    const category = readString(row.category, `items[${index}].category`);
    if (!STORY_ITEM_CATEGORY_SET.has(category)) {
      throw new Error(`Unknown story item category "${category}".`);
    }
    const glyph = readOptionalString(row.glyph);
    return {
      id: readString(row.id, `items[${index}].id`),
      name: readString(row.name, `items[${index}].name`),
      category: category as StoryItemGlyphCategory,
      description: readString(row.description, `items[${index}].description`),
      ...(glyph ? { glyph } : {}),
    };
  });
  assertUniqueIds(items, "items");
  return items;
}

function parseChoices(raw: unknown, sceneField: string): StoryChoice[] {
  return readArray(raw, `${sceneField}.choices`).map((entry, index): StoryChoice => {
    const row = readObject(entry, `${sceneField}.choices[${index}]`);
    const revealLocationIds = readOptionalStringArray(
      row.revealLocationIds,
      `${sceneField}.choices[${index}].revealLocationIds`
    );
    const grantItemIds = readOptionalStringArray(
      row.grantItemIds,
      `${sceneField}.choices[${index}].grantItemIds`
    );
    const requireItemIds = readOptionalStringArray(
      row.requireItemIds,
      `${sceneField}.choices[${index}].requireItemIds`
    );
    return {
      id: readString(row.id, `${sceneField}.choices[${index}].id`),
      label: readString(row.label, `${sceneField}.choices[${index}].label`),
      targetSceneId: readString(row.targetSceneId, `${sceneField}.choices[${index}].targetSceneId`),
      ...(revealLocationIds && revealLocationIds.length > 0 ? { revealLocationIds } : {}),
      ...(grantItemIds && grantItemIds.length > 0 ? { grantItemIds } : {}),
      ...(requireItemIds && requireItemIds.length > 0 ? { requireItemIds } : {}),
    };
  });
}

function parseScenes(raw: unknown): StoryScene[] {
  const scenes = readArray(raw, "scenes").map((entry, index): StoryScene => {
    const row = readObject(entry, `scenes[${index}]`);
    const field = `scenes[${index}]`;
    const spritePose = readOptionalString(row.spritePose);
    const itemIds = readOptionalStringArray(row.itemIds, `${field}.itemIds`);
    if (spritePose && !STORY_SPRITE_POSE_SET.has(spritePose)) {
      throw new Error(`Unknown story sprite pose "${spritePose}".`);
    }
    return {
      id: readString(row.id, `${field}.id`),
      title: readString(row.title, `${field}.title`),
      locationId: readString(row.locationId, `${field}.locationId`),
      narration: readString(row.narration, `${field}.narration`),
      speakerBotId:
        typeof row.speakerBotId === "string" && row.speakerBotId.trim().length > 0
          ? row.speakerBotId.trim()
          : null,
      ...(readOptionalString(row.speakerName) ? { speakerName: readOptionalString(row.speakerName) } : {}),
      ...(spritePose ? { spritePose: spritePose as StorySpritePose } : {}),
      ...(readOptionalString(row.backgroundAssetId)
        ? { backgroundAssetId: readOptionalString(row.backgroundAssetId) }
        : {}),
      ...(readOptionalString(row.cutsceneAssetId)
        ? { cutsceneAssetId: readOptionalString(row.cutsceneAssetId) }
        : {}),
      ...(itemIds && itemIds.length > 0 ? { itemIds } : {}),
      ending: row.ending === true,
      choices: parseChoices(row.choices, field),
    };
  });
  if (scenes.length < STORY_SCENE_COUNT_MIN || scenes.length > STORY_SCENE_COUNT_MAX) {
    throw new Error(`Story episodes need ${STORY_SCENE_COUNT_MIN}-${STORY_SCENE_COUNT_MAX} scenes.`);
  }
  assertUniqueIds(scenes, "scenes");
  return scenes;
}

export function validateStoryEpisodeManifest(raw: unknown): StoryEpisodeManifest {
  const row = readObject(raw, "episode");
  const themeId = readOptionalString(row.themeId) ?? PRISM_DEFAULT_STORY_THEME_ID;
  if (themeId !== PRISM_DEFAULT_STORY_THEME_ID) {
    throw new Error(`Unsupported Story theme "${themeId}".`);
  }

  const locations = parseLocations(row.locations);
  const items = parseItems(row.items ?? []);
  const scenes = parseScenes(row.scenes);
  const startSceneId = readString(row.startSceneId, "startSceneId");
  const locationIds = new Set(locations.map((location) => location.id));
  const itemIds = new Set(items.map((item) => item.id));
  const sceneIds = new Set(scenes.map((scene) => scene.id));

  if (!sceneIds.has(startSceneId)) {
    throw new Error(`startSceneId "${startSceneId}" does not exist.`);
  }

  for (const location of locations) {
    if (!location.arrivalSceneId) continue;
    const arrivalScene = scenes.find((scene) => scene.id === location.arrivalSceneId);
    if (!arrivalScene) {
      throw new Error(`Location "${location.id}" references unknown arrival scene "${location.arrivalSceneId}".`);
    }
    if (arrivalScene.locationId !== location.id) {
      throw new Error(`Location "${location.id}" arrival scene must be in the same location.`);
    }
    if (arrivalScene.ending) {
      throw new Error(`Location "${location.id}" arrival scene cannot be an ending.`);
    }
  }

  let endingCount = 0;
  for (const scene of scenes) {
    if (!locationIds.has(scene.locationId)) {
      throw new Error(`Scene "${scene.id}" references unknown location "${scene.locationId}".`);
    }
    for (const itemId of scene.itemIds ?? []) {
      if (!itemIds.has(itemId)) {
        throw new Error(`Scene "${scene.id}" references unknown pickup item "${itemId}".`);
      }
    }
    if (scene.ending) {
      endingCount += 1;
      if (scene.choices.length > 0) {
        throw new Error(`Ending scene "${scene.id}" cannot have choices.`);
      }
    } else if (scene.choices.length < STORY_CHOICE_COUNT_MIN || scene.choices.length > STORY_CHOICE_COUNT_MAX) {
      throw new Error(`Scene "${scene.id}" needs ${STORY_CHOICE_COUNT_MIN}-${STORY_CHOICE_COUNT_MAX} choices.`);
    }
    assertUniqueIds(scene.choices, `choices for scene "${scene.id}"`);
    for (const choice of scene.choices) {
      if (!sceneIds.has(choice.targetSceneId)) {
        throw new Error(`Choice "${choice.id}" references unknown scene "${choice.targetSceneId}".`);
      }
      for (const locationId of choice.revealLocationIds ?? []) {
        if (!locationIds.has(locationId)) {
          throw new Error(`Choice "${choice.id}" reveals unknown location "${locationId}".`);
        }
      }
      for (const itemId of [...(choice.grantItemIds ?? []), ...(choice.requireItemIds ?? [])]) {
        if (!itemIds.has(itemId)) {
          throw new Error(`Choice "${choice.id}" references unknown item "${itemId}".`);
        }
      }
    }
  }

  if (endingCount < STORY_ENDING_COUNT_MIN || endingCount > STORY_ENDING_COUNT_MAX) {
    throw new Error(`Story episodes need ${STORY_ENDING_COUNT_MIN}-${STORY_ENDING_COUNT_MAX} endings.`);
  }

  const startScene = scenes.find((scene) => scene.id === startSceneId)!;
  const startLocation = locations.find((location) => location.id === startScene.locationId)!;
  const normalizedLocations = locations.map((location) =>
    location.id === startLocation.id ? { ...location, discovered: true } : location
  );

  return {
    id: readString(row.id, "id"),
    title: readString(row.title, "title"),
    summary: readString(row.summary, "summary"),
    themeId,
    startSceneId,
    locations: normalizedLocations,
    items,
    scenes,
  };
}

export function getStoryScene(
  episode: StoryEpisodeManifest,
  sceneId: string
): StoryScene | undefined {
  return episode.scenes.find((scene) => scene.id === sceneId);
}

export function getStoryLocation(
  episode: StoryEpisodeManifest,
  locationId: string
): StoryLocation | undefined {
  return episode.locations.find((location) => location.id === locationId);
}

export function getStoryCurrentScene(
  episode: StoryEpisodeManifest,
  progress: StorySessionProgress
): StoryScene {
  const scene = getStoryScene(episode, progress.currentSceneId);
  if (!scene) {
    throw new Error(`Current scene "${progress.currentSceneId}" does not exist.`);
  }
  return scene;
}

export function createInitialStoryProgress(
  episode: StoryEpisodeManifest,
  now = new Date().toISOString()
): StorySessionProgress {
  const startScene = getStoryScene(episode, episode.startSceneId);
  if (!startScene) {
    throw new Error(`Start scene "${episode.startSceneId}" does not exist.`);
  }
  return {
    currentSceneId: episode.startSceneId,
    discoveredLocationIds: uniqueStrings([
      ...episode.locations.filter((location) => location.discovered).map((location) => location.id),
      startScene.locationId,
    ]),
    inventoryItemIds: [],
    completedSceneIds: [],
    status: startScene.ending ? "complete" : "playing",
    endingSceneId: startScene.ending ? startScene.id : null,
    updatedAt: now,
  };
}

export function createStorySceneTranscriptEntry(
  episode: StoryEpisodeManifest,
  scene: StoryScene,
  id: string,
  now = new Date().toISOString()
): StoryTranscriptEntry {
  const location = getStoryLocation(episode, scene.locationId);
  return {
    id,
    kind: "scene",
    sceneId: scene.id,
    locationId: scene.locationId,
    speakerBotId: scene.speakerBotId ?? null,
    text: `${location?.name ?? scene.title}: ${scene.narration}`,
    createdAt: now,
  };
}

export function createInitialStoryTranscript(
  episode: StoryEpisodeManifest,
  id: string,
  now = new Date().toISOString()
): StoryTranscriptEntry[] {
  const scene = getStoryScene(episode, episode.startSceneId);
  if (!scene) return [];
  return [createStorySceneTranscriptEntry(episode, scene, id, now)];
}

function applyChoiceRewards(
  progress: StorySessionProgress,
  choice: StoryChoice,
  targetScene: StoryScene,
  now: string
): StorySessionProgress {
  const discoveredLocationIds = uniqueStrings([
    ...progress.discoveredLocationIds,
    targetScene.locationId,
    ...(choice.revealLocationIds ?? []),
  ]);
  const inventoryItemIds = uniqueStrings([
    ...progress.inventoryItemIds,
    ...(choice.grantItemIds ?? []),
  ]);
  const completedSceneIds = uniqueStrings([
    ...progress.completedSceneIds,
    progress.currentSceneId,
  ]);
  return {
    currentSceneId: targetScene.id,
    discoveredLocationIds,
    inventoryItemIds,
    completedSceneIds,
    status: targetScene.ending ? "complete" : "playing",
    endingSceneId: targetScene.ending ? targetScene.id : progress.endingSceneId ?? null,
    updatedAt: now,
  };
}

export function applyStoryChoice(
  episode: StoryEpisodeManifest,
  progress: StorySessionProgress,
  choiceId: string,
  entryIdFactory: () => string,
  now = new Date().toISOString()
): StoryTransitionResult {
  if (progress.status === "complete") {
    throw new Error("This Story session is already complete.");
  }
  const scene = getStoryCurrentScene(episode, progress);
  const choice = scene.choices.find((candidate) => candidate.id === choiceId);
  if (!choice) {
    throw new Error(`Choice "${choiceId}" is not available in the current scene.`);
  }
  const missingItem = (choice.requireItemIds ?? []).find(
    (itemId) => !progress.inventoryItemIds.includes(itemId)
  );
  if (missingItem) {
    throw new Error(`Choice "${choiceId}" requires missing item "${missingItem}".`);
  }
  const targetScene = getStoryScene(episode, choice.targetSceneId);
  if (!targetScene) {
    throw new Error(`Choice "${choiceId}" targets missing scene "${choice.targetSceneId}".`);
  }
  const nextProgress = applyChoiceRewards(progress, choice, targetScene, now);
  return {
    progress: nextProgress,
    transcriptEntries: [
      {
        id: entryIdFactory(),
        kind: "choice",
        sceneId: scene.id,
        choiceId: choice.id,
        text: choice.label,
        createdAt: now,
      },
      createStorySceneTranscriptEntry(episode, targetScene, entryIdFactory(), now),
    ],
  };
}

function findTravelSceneForLocation(
  episode: StoryEpisodeManifest,
  locationId: string,
  progress: StorySessionProgress
): StoryScene | undefined {
  const location = getStoryLocation(episode, locationId);
  if (location?.arrivalSceneId) {
    const arrivalScene = getStoryScene(episode, location.arrivalSceneId);
    if (arrivalScene && !arrivalScene.ending) return arrivalScene;
  }
  const scenesAtLocation = episode.scenes.filter((scene) => scene.locationId === locationId);
  return (
    scenesAtLocation.find(
      (scene) =>
        !scene.ending &&
        !scene.speakerBotId &&
        scene.id !== progress.currentSceneId &&
        !progress.completedSceneIds.includes(scene.id)
    ) ??
    scenesAtLocation.find((scene) => !scene.ending && !scene.speakerBotId) ??
    scenesAtLocation.find(
      (scene) =>
        !scene.ending &&
        scene.id !== progress.currentSceneId &&
        !progress.completedSceneIds.includes(scene.id)
    ) ??
    scenesAtLocation.find((scene) => !scene.ending && !progress.completedSceneIds.includes(scene.id)) ??
    scenesAtLocation.find((scene) => !scene.ending) ??
    scenesAtLocation[0]
  );
}

export function applyStoryTravel(
  episode: StoryEpisodeManifest,
  progress: StorySessionProgress,
  locationId: string,
  entryIdFactory: () => string,
  now = new Date().toISOString()
): StoryTransitionResult {
  if (!progress.discoveredLocationIds.includes(locationId)) {
    throw new Error("That Story location has not been discovered yet.");
  }
  const location = getStoryLocation(episode, locationId);
  if (!location) {
    throw new Error(`Location "${locationId}" does not exist.`);
  }
  const targetScene = findTravelSceneForLocation(episode, locationId, progress);
  if (!targetScene) {
    throw new Error(`No scene exists for location "${locationId}".`);
  }
  const nextProgress: StorySessionProgress = {
    ...progress,
    currentSceneId: targetScene.id,
    completedSceneIds: uniqueStrings([...progress.completedSceneIds, progress.currentSceneId]),
    status: targetScene.ending ? "complete" : "playing",
    endingSceneId: targetScene.ending ? targetScene.id : progress.endingSceneId ?? null,
    updatedAt: now,
  };
  return {
    progress: nextProgress,
    transcriptEntries: [
      {
        id: entryIdFactory(),
        kind: "travel",
        sceneId: targetScene.id,
        locationId: location.id,
        text: `Traveled to ${location.name}.`,
        createdAt: now,
      },
      createStorySceneTranscriptEntry(episode, targetScene, entryIdFactory(), now),
    ],
  };
}

export function applyStoryItemPickup(
  episode: StoryEpisodeManifest,
  progress: StorySessionProgress,
  itemId: string,
  entryIdFactory: () => string,
  now = new Date().toISOString()
): StoryTransitionResult {
  if (progress.status === "complete") {
    throw new Error("This Story session is already complete.");
  }
  if (progress.inventoryItemIds.includes(itemId)) {
    throw new Error(`Item "${itemId}" is already in the inventory.`);
  }
  const scene = getStoryCurrentScene(episode, progress);
  if (!scene.itemIds?.includes(itemId)) {
    throw new Error(`Item "${itemId}" is not available in the current scene.`);
  }
  const item = episode.items.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new Error(`Item "${itemId}" does not exist.`);
  }
  const nextProgress: StorySessionProgress = {
    ...progress,
    inventoryItemIds: uniqueStrings([...progress.inventoryItemIds, item.id]),
    updatedAt: now,
  };
  return {
    progress: nextProgress,
    transcriptEntries: [
      {
        id: entryIdFactory(),
        kind: "item",
        sceneId: scene.id,
        locationId: scene.locationId,
        text: `Picked up ${item.name}.`,
        createdAt: now,
      },
    ],
  };
}
