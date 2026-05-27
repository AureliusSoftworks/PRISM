import type { StoryChoice, StoryInventoryItem, StoryScene } from "@localai/shared";

export type StoryDialogActorRole = "scene" | "npc";

export interface StoryDialogBeat {
  id: string;
  actorRole: StoryDialogActorRole;
  speakerBotId: string | null;
  speakerName: string;
  spritePose: StoryScene["spritePose"];
  text: string;
}

export interface StoryDialogState {
  sceneId: string;
  beats: StoryDialogBeat[];
  activeBeat: StoryDialogBeat;
  activeBeatIndex: number;
  beatCount: number;
  canAdvance: boolean;
  isComplete: boolean;
}

export interface StoryInventoryViewState {
  inventoryItemIds: ReadonlySet<string>;
  collectedItems: StoryInventoryItem[];
  availableSceneItems: StoryInventoryItem[];
}

const STORY_DIALOG_BEAT_MAX_CHARS = 140;

function splitStoryDialogueParagraph(paragraph: string): string[] {
  const sentences =
    paragraph
      .match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) ?? [];
  if (sentences.length === 0) return [paragraph];

  const beats: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
      continue;
    }
    const next = `${current} ${sentence}`;
    if (next.length > STORY_DIALOG_BEAT_MAX_CHARS) {
      beats.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }
  if (current) beats.push(current);
  return beats;
}

export function splitStoryDialogueText(text: string): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const beats = paragraphs.flatMap((paragraph) =>
    paragraph.length > STORY_DIALOG_BEAT_MAX_CHARS
      ? splitStoryDialogueParagraph(paragraph)
      : [paragraph]
  );
  return beats.length > 0 ? beats : [text.trim() || "..."];
}

export function buildStoryDialogBeats(scene: StoryScene): StoryDialogBeat[] {
  const actorRole: StoryDialogActorRole = scene.speakerBotId ? "npc" : "scene";
  const speakerName = scene.speakerBotId
    ? scene.speakerName?.trim() || "NPC"
    : scene.title;
  return splitStoryDialogueText(scene.narration).map((text, index) => ({
    id: `${scene.id}:beat-${index + 1}`,
    actorRole,
    speakerBotId: scene.speakerBotId ?? null,
    speakerName,
    spritePose: scene.spritePose,
    text,
  }));
}

export function createStoryDialogState(
  scene: StoryScene,
  requestedBeatIndex: number
): StoryDialogState {
  const beats = buildStoryDialogBeats(scene);
  const beatCount = beats.length;
  const activeBeatIndex = Math.min(
    Math.max(0, Math.trunc(requestedBeatIndex) || 0),
    Math.max(0, beatCount - 1)
  );
  const activeBeat = beats[activeBeatIndex] ?? beats[0]!;
  const isComplete = activeBeatIndex >= beatCount - 1;
  return {
    sceneId: scene.id,
    beats,
    activeBeat,
    activeBeatIndex,
    beatCount,
    canAdvance: !isComplete,
    isComplete,
  };
}

export function createStoryInventoryViewState(
  allItems: readonly StoryInventoryItem[],
  inventoryItemIds: readonly string[],
  sceneItemIds: readonly string[] = []
): StoryInventoryViewState {
  const byId = new Map(allItems.map((item) => [item.id, item]));
  const inventory = new Set(inventoryItemIds);
  return {
    inventoryItemIds: inventory,
    collectedItems: inventoryItemIds
      .map((itemId) => byId.get(itemId))
      .filter((item): item is StoryInventoryItem => Boolean(item)),
    availableSceneItems: sceneItemIds
      .filter((itemId) => !inventory.has(itemId))
      .map((itemId) => byId.get(itemId))
      .filter((item): item is StoryInventoryItem => Boolean(item)),
  };
}

export function storyChoiceMissingItemId(
  choice: StoryChoice,
  inventoryItemIds: ReadonlySet<string>
): string | null {
  return (choice.requireItemIds ?? []).find((itemId) => !inventoryItemIds.has(itemId)) ?? null;
}
