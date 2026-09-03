import {
  whodunnitPropPresentationEmojiV1,
  type EvidencePropBindingV1,
} from "@localai/shared";

export interface MysteryEvidencePresentationV1 {
  id: string;
  title: string;
  description: string;
  emoji: string;
}

/** A projection of sealed scaffold facts, assembled before prose authoring. */
export interface FrozenMysteryEvidencePresentationV1 {
  id: string;
  physicalSubject: string;
  observation: string;
  identity: string;
  appearanceDescription: string;
  emoji: string;
}

function normalizedObservation(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

/** Returns a player-safe reason when authored prose drifted from frozen object truth. */
export function frozenEvidencePresentationIssueV1(args: {
  evidence: readonly MysteryEvidencePresentationV1[];
  bindingsByEvidenceId: Readonly<Record<string, EvidencePropBindingV1>>;
  presentation: readonly FrozenMysteryEvidencePresentationV1[];
}): string | null {
  if (args.evidence.length !== args.presentation.length ||
    Object.keys(args.bindingsByEvidenceId).some((id) =>
      !args.presentation.some((entry) => entry.id === id))) {
    return "The authored evidence does not match its frozen physical presentation.";
  }
  for (const frozen of args.presentation) {
    const entries = args.evidence.filter((candidate) => candidate.id === frozen.id);
    const entry = entries[0];
    const binding = args.bindingsByEvidenceId[frozen.id];
    const bindingMismatch = binding && (
      frozen.identity !== binding.chosenIdentity.displayName.trim() ||
      frozen.physicalSubject !== binding.chosenIdentity.displayName.trim() ||
      frozen.appearanceDescription !== binding.chosenIdentity.appearanceDescription.trim() ||
      frozen.emoji !== (binding.presentationEmoji ??
        whodunnitPropPresentationEmojiV1(binding.archetypeId))
    );
    if (
      entries.length !== 1 || !entry || bindingMismatch ||
      !frozen.physicalSubject.trim() || !frozen.observation.trim() ||
      entry.title !== frozen.identity || entry.emoji !== frozen.emoji ||
      normalizedObservation(entry.description) !== normalizedObservation(frozen.observation)
    ) {
      return `The authored evidence ${frozen.id} does not match its frozen physical presentation.`;
    }
  }
  return null;
}

/** Replacing a stale foundation invalidates every section that consumed it.
 * Ambient observations and the frozen identities/voice capsule are independent.
 * Witnesses also consume the complete evidence list as their forbidden-fact
 * boundary, and later witnesses/court choices can depend on earlier testimony. */
export function restoreFrozenMysteryEvidenceDraftV1<Core extends {
  evidence: readonly MysteryEvidencePresentationV1[];
}>(args: {
  draft: {
    foundation: Core | null;
    foundationCore: Core | null;
    examinationsById: Record<string, string>;
    suspectsBySeatId: Record<string, unknown>;
    prosecutionChoicesByWitnessSeatId: Record<string, unknown>;
    prosecutionChoices: unknown;
    connectiveAdditions: Record<string, unknown>;
    provenanceBySection: Record<string, unknown>;
    recoveryBySection: Record<string, unknown>;
  };
  foundationCore: Core;
  consequentialExaminationIds: readonly string[];
  bindingsByEvidenceId: Readonly<Record<string, EvidencePropBindingV1>>;
  presentation: readonly FrozenMysteryEvidencePresentationV1[];
}): boolean {
  const { draft } = args;
  const cachedFoundations = [draft.foundationCore, draft.foundation]
    .filter((entry) => entry !== null);
  if (!cachedFoundations.some((entry) => frozenEvidencePresentationIssueV1({
    evidence: entry.evidence,
    bindingsByEvidenceId: args.bindingsByEvidenceId,
    presentation: args.presentation,
  }))) return false;
  // Never install a replacement whose own projection fails the same contract.
  const replacementIssue = frozenEvidencePresentationIssueV1({
    evidence: args.foundationCore.evidence,
    bindingsByEvidenceId: args.bindingsByEvidenceId,
    presentation: args.presentation,
  });
  if (replacementIssue) throw new Error(replacementIssue);
  draft.foundation = null;
  draft.foundationCore = args.foundationCore;
  for (const id of args.consequentialExaminationIds) delete draft.examinationsById[id];
  draft.suspectsBySeatId = {};
  draft.prosecutionChoicesByWitnessSeatId = {};
  draft.prosecutionChoices = null;
  draft.connectiveAdditions = {};
  // Receipts describe the old foundation's derived output, not the replacement.
  draft.provenanceBySection = {};
  draft.recoveryBySection = {};
  return true;
}

/** Normalizes repeated authoring/repair passes without losing distinct facts. */
export function appendDistinctMysteryEvidenceFactV1(
  description: string,
  fact: string,
): string {
  const normalizedDescription = description.replace(/\s+/gu, " ").trim();
  const normalizedFact = fact.replace(/\s+/gu, " ").trim();
  if (!normalizedFact) return normalizedDescription;
  return normalizedDescription.toLocaleLowerCase().includes(normalizedFact.toLocaleLowerCase())
    ? normalizedDescription
    : `${normalizedDescription} ${normalizedFact}`.trim();
}
