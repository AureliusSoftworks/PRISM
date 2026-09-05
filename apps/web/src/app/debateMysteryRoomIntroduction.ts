import {
  debateMysteryRoomNarrationNamesPersonaV2,
  debateMysteryRoomNarrationTextV2,
  type DebateMysteryRoomIntroductionPhaseV2,
  type DebateMysteryRoomNarrationAppearanceV2,
} from "@localai/shared";

export type DebateMysteryRoomIntroductionGestureV2 =
  | "reveal_casekeeper_narration"
  | "advance_to_persona"
  | "finish_dialogue";

/**
 * The first room-entry click belongs to presentation only. The second click
 * advances the durable graph into the frozen, voiced opening exchange.
 */
export function debateMysteryRoomIntroductionGestureV2(args: {
  casekeeperNarrationVisible: boolean;
  phase: DebateMysteryRoomIntroductionPhaseV2;
}): DebateMysteryRoomIntroductionGestureV2 {
  if (args.phase !== "casekeeper") return "finish_dialogue";
  return args.casekeeperNarrationVisible
    ? "advance_to_persona"
    : "reveal_casekeeper_narration";
}

/**
 * Once the player has explicitly dismissed the final frozen line, the empty
 * queue can complete the durable room phase immediately and restore controls.
 */
export function debateMysteryRoomIntroductionShouldAutoCompleteV2(args: {
  busy: boolean;
  hasActiveAudio: boolean;
  hasHeldDialogue: boolean;
  hasQueuedDialogue: boolean;
  phase: DebateMysteryRoomIntroductionPhaseV2;
}): boolean {
  return args.phase === "persona" &&
    !args.busy &&
    !args.hasActiveAudio &&
    !args.hasHeldDialogue &&
    !args.hasQueuedDialogue;
}

/** Spoiler-safe public copy: a name-free visual tableau before the actor appears. */
export function debateMysteryRoomCasekeeperNarrationTextV2(args: {
  appearance?: DebateMysteryRoomNarrationAppearanceV2 | null;
  fixtureLabels?: readonly string[];
  personaName?: string | null;
  persistedNarration?: string | null;
}): string {
  const persisted = args.persistedNarration?.replace(/\s+/gu, " ").trim();
  const personaName = args.personaName?.replace(/\s+/gu, " ").trim();
  const persistedNamesPersona = debateMysteryRoomNarrationNamesPersonaV2(
    persisted,
    personaName,
  );
  if (
    persisted &&
    persisted !== "..." &&
    !persistedNamesPersona &&
    !/\b(?:color and sigil|own account comes next|room occupant)\b/iu.test(persisted)
  ) return persisted;
  return debateMysteryRoomNarrationTextV2({
    appearance: args.appearance,
    fixtureLabels: args.fixtureLabels,
    personaName,
  });
}
