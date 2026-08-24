import type {
  DebateMysteryArtMode,
  DebateMysteryDifficulty,
  DebateMysteryPointV1,
  DebateMysteryPresetId,
  DebateMysteryPublicEvidenceItemV1,
  DebateMysteryPublicSuspectSnapshotV1,
  DebateMysteryTheoryV1,
} from "./debateMystery.js";

export const DEBATE_MYSTERY_V2_SCHEMA_VERSION = 2 as const;
export const DEBATE_MYSTERY_AUDIO_MANIFEST_VERSION = 1 as const;
export const DEBATE_MYSTERY_V2_JUROR_COUNT = 4 as const;

export type DebateMysteryTrialTypeV2 = "jury" | "bench";
export type DebateMysteryCompilationStageV2 =
  | "writing_case"
  | "testing_contradictions"
  | "directing_performances"
  | "preparing_local_voices"
  | "verifying_case_audio"
  | "complete"
  | "needs_attention"
  | "cancelled";
export type DebateMysteryPlayPhaseV2 =
  | "case_forge"
  | "title_card"
  | "investigation"
  | "theory"
  | "trial"
  | "verdict";
export type DebateMysteryLineModeV2 = "spoken" | "text_only" | "player_selected";
export type DebateMysteryRecordKindV2 = "evidence" | "testimony";
export type DebateMysteryCourtCalloutV2 =
  | "hold_it"
  | "objection"
  | "order"
  | "sustained"
  | "overruled"
  | "testimony_revised"
  | "guilty"
  | "not_guilty";
export type DebateMysteryDialogueNodeKindV2 =
  | "briefing"
  | "talk_topic"
  | "present_reaction"
  | "examination_result"
  | "testimony_statement"
  | "press_result"
  | "testimony_revision"
  | "prosecution_choice"
  | "choice_reaction"
  | "court_reaction"
  | "partner_consult"
  | "verdict";

export interface DebateWhodunnitCreateConfigV2 {
  version: typeof DEBATE_MYSTERY_V2_SCHEMA_VERSION;
  preset: DebateMysteryPresetId;
  difficulty: DebateMysteryDifficulty;
  artMode: DebateMysteryArtMode;
  trialType: DebateMysteryTrialTypeV2;
  inspiration: string;
  nonce: string;
  floors?: number;
  totalRooms?: number;
  suspectBotIds: string[];
  judgeBotId?: string;
  prosecutorPartnerBotId: string;
  rivalDefenseBotId: string;
  jurorBotIds: string[];
  playerRole?: "participant" | "spectator";
  participationDifficulty?: "coach" | "standard" | "immersive";
}

export interface DebateMysteryResolvedConfigV2
  extends Omit<DebateWhodunnitCreateConfigV2, "floors" | "totalRooms" | "judgeBotId"> {
  floors: number;
  totalRooms: number;
  judgeBotId: string;
  jurorBotIds: [string, string, string, string] | [];
  eyewitnessChance: number;
}

export interface DebateMysteryRecordReferenceV2 {
  kind: DebateMysteryRecordKindV2;
  id: string;
}

export interface DebateMysteryPerformanceDirectionV2 {
  mood: string;
  pace: "measured" | "natural" | "urgent";
  intensity: 0 | 1 | 2 | 3;
  actorNote: string;
}

export interface DebateMysterySpokenLineV2 {
  id: string;
  nodeId: string;
  speakerKind: "bot" | "judge" | "player" | "narrator";
  speakerBotId: string | null;
  visibleText: string;
  spokenText: string;
  performance: DebateMysteryPerformanceDirectionV2;
  mode: DebateMysteryLineModeV2;
  reusableCalloutKey: DebateMysteryCourtCalloutV2 | null;
}

export interface DebateMysteryDialogueRequirementV2 {
  discoveryIds: string[];
  unlockedTopicIds: string[];
  admittedRecordIds: string[];
  choices: Array<{ choiceId: string; optionId: string }>;
}

export interface DebateMysteryDialogueMutationV2 {
  discoverIds: string[];
  unlockTopicIds: string[];
  admitRecordIds: string[];
  choices: Array<{ choiceId: string; optionId: string }>;
}

export interface DebateMysteryDialogueNodeV2 {
  id: string;
  kind: DebateMysteryDialogueNodeKindV2;
  scene: "investigation" | "court" | "verdict";
  speakerSeatId: string | null;
  intendedRecipientSeatId: string | null;
  lineId: string | null;
  label: string | null;
  requirements: DebateMysteryDialogueRequirementV2;
  mutations: DebateMysteryDialogueMutationV2;
  recordReferences: DebateMysteryRecordReferenceV2[];
  nextNodeIds: string[];
  terminalOutcome: "return_to_room" | "chapter_complete" | "case_complete" | null;
}

export interface DebateMysteryStatementVersionV2 {
  id: string;
  statementId: string;
  witnessSeatId: string;
  version: number;
  lineId: string;
  pressNodeId: string;
  correctPresentations: DebateMysteryRecordReferenceV2[];
  rebuttalNodeId: string;
  revisionNodeId: string | null;
  nextStatementId: string | null;
}

export interface DebateMysteryWitnessChapterV2 {
  id: string;
  witnessSeatId: string;
  ordinal: number;
  pivotal: boolean;
  recall: boolean;
  checkpointNodeId: string;
  initialStatementIds: string[];
  statementVersions: DebateMysteryStatementVersionV2[];
  completionNodeId: string;
}

export interface DebateMysteryProsecutionChoiceV2 {
  id: string;
  promptLineId: string;
  optionIds: string[];
}

export interface DebateMysteryDialogueGraphV2 {
  version: typeof DEBATE_MYSTERY_V2_SCHEMA_VERSION;
  caseId: string;
  initialDiscoveryIds: string[];
  initialAdmittedRecordIds: string[];
  interactionRootNodeIds: string[];
  nodes: DebateMysteryDialogueNodeV2[];
  lines: DebateMysterySpokenLineV2[];
  witnessChapters: DebateMysteryWitnessChapterV2[];
  prosecutionChoices: DebateMysteryProsecutionChoiceV2[];
  talkTopicNodeIdsBySuspect: Record<string, string[]>;
  presentNodeIdsBySuspect: Record<string, string[]>;
  verdictNodeIds: string[];
}

export interface DebateMysteryCompilationStatusV2 {
  version: typeof DEBATE_MYSTERY_V2_SCHEMA_VERSION;
  jobId: string;
  stage: DebateMysteryCompilationStageV2;
  attempt: number;
  completedPasses: number;
  totalPasses: number;
  preparedAudioCount: number;
  requiredAudioCount: number;
  retryable: boolean;
  spoilerSafeMessage: string;
  updatedAt: string;
}

export interface DebateMysteryAudioManifestEntryV1 {
  lineId: string;
  textHash: string;
  botId: string | null;
  voiceProfileHash: string;
  performanceDirectionHash: string;
  clipPath: string;
  mimeType: string;
  durationMs: number;
  byteSize: number;
  sha256: string;
  alignment: Array<{ startMs: number; endMs: number; start: number; end: number }> | null;
  reusableCalloutKey: DebateMysteryCourtCalloutV2 | null;
  verifiedAt: string;
}

export interface DebateMysteryAudioManifestV1 {
  version: typeof DEBATE_MYSTERY_AUDIO_MANIFEST_VERSION;
  caseId: string;
  caseHash: string;
  scriptHash: string;
  dialogueGraphHash: string;
  engine: "prism-instant-local";
  model: string;
  modelVersion: string;
  entries: DebateMysteryAudioManifestEntryV1[];
  complete: boolean;
  completedAt: string | null;
  verifiedAt: string | null;
}

export type DebateMysteryVerdictClassificationV2 =
  | "just_conviction"
  | "unsafe_conviction"
  | "wrongful_conviction"
  | "acquittal_despite_proof"
  | "failed_prosecution";

export interface DebateMysteryJurorBallotV2 {
  jurorBotId: string;
  vote: "guilty" | "not_guilty";
  reason: string;
  powerAffected: boolean;
}

export interface DebateMysteryVerdictV2 {
  legalResult: "guilty" | "not_guilty";
  classification: DebateMysteryVerdictClassificationV2;
  sealedCulpritCorrect: boolean;
  proofGrade: "proved" | "unsafe" | "failed";
  jurorBallots: DebateMysteryJurorBallotV2[];
  deliveredAt: string;
}

export interface DebateMysteryRoomV2 {
  id: string;
  name: string;
  floor: number;
  emoji: string;
  imageId: string | null;
  bundledAssetPath: string | null;
  unlocked: boolean;
  visited: boolean;
  hotspots: Array<{
    id: string;
    label: string;
    polygon: DebateMysteryPointV1[];
    examined: boolean;
    unlocked: boolean;
  }>;
}

export interface DebateMysteryPublicRecordItemV2 {
  reference: DebateMysteryRecordReferenceV2;
  title: string;
  description: string;
  emoji: string;
  admitted: boolean;
  updatedAt: string;
}

export interface DebateMysteryPublicTopicV2 {
  nodeId: string;
  suspectSeatId: string;
  label: string;
  unlocked: boolean;
  completed: boolean;
}

export interface DebateMysteryPublicDialogueEntryV2 {
  nodeId: string;
  lineId: string | null;
  visibleText: string;
  speakerSeatId: string | null;
  occurredAt: string;
}

export interface DebateMysteryPublicStatementV2 {
  statementId: string;
  versionId: string;
  witnessSeatId: string;
  version: number;
  lineId: string;
  visibleText: string;
  pressed: boolean;
}

export interface DebateMysteryWitnessCheckpointV2 {
  chapterId: string;
  publicStateJson: string;
  createdAt: string;
}

export interface DebateMysteryCourtStateV2 {
  witnessOrder: string[];
  completedChapterIds: string[];
  activeChapterId: string | null;
  activeStatementId: string | null;
  statements: DebateMysteryPublicStatementV2[];
  credibilityRemaining: number;
  credibilityMaximum: number;
  checkpoint: DebateMysteryWitnessCheckpointV2 | null;
}

export interface DebateWhodunnitFormatStateV2 {
  version: typeof DEBATE_MYSTERY_V2_SCHEMA_VERSION;
  format: "whodunnit";
  playPhase: DebateMysteryPlayPhaseV2;
  compilation: DebateMysteryCompilationStatusV2;
  caseTitle: string | null;
  fictionLabel: "Fictional, non-canonical case";
  config: DebateMysteryResolvedConfigV2;
  victim: { id: string; name: string } | null;
  suspects: DebateMysteryPublicSuspectSnapshotV1[];
  rooms: DebateMysteryRoomV2[];
  currentRoomId: string | null;
  roomView: "mansion" | "room";
  metSuspectSeatIds: string[];
  discoveryIds: string[];
  record: DebateMysteryPublicRecordItemV2[];
  topics: DebateMysteryPublicTopicV2[];
  dialogueHistory: DebateMysteryPublicDialogueEntryV2[];
  activeDialogueNodeId: string | null;
  theoryAvailable: boolean;
  theory: DebateMysteryTheoryV1 | null;
  theoryFiledAt: string | null;
  court: DebateMysteryCourtStateV2 | null;
  verdict: DebateMysteryVerdictV2 | null;
  audioReady: boolean;
  voicesEnabled: boolean;
  localAudioFailure: string | null;
  pendingCallout: { id: string; callout: DebateMysteryCourtCalloutV2; actorColor: string | null } | null;
}

export type DebateMysteryActionRequestV2 =
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "move"; roomId?: string }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "examine"; roomId: string; hotspotId: string }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "talk"; suspectSeatId: string; topicNodeId: string }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "present_to_suspect"; suspectSeatId: string; record: DebateMysteryRecordReferenceV2 }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "file_theory"; theory: DebateMysteryTheoryV1 }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "focus_statement"; statementId: string }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "press_statement"; statementId: string }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "present_record"; statementId: string; record: DebateMysteryRecordReferenceV2 }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "choose_prosecution_response"; choiceId: string; optionId: string }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "consult_partner"; contextNodeId?: string | null }
  | { version: 2; expectedRevision: number; idempotencyKey: string; action: "retry_witness_checkpoint" };

export interface DebateMysteryGraphValidationResultV2 {
  valid: boolean;
  errors: string[];
  reachableNodeIds: string[];
  reachableSpokenLineIds: string[];
}

interface SolverState {
  nodeId: string;
  discoveries: Set<string>;
  topics: Set<string>;
  records: Set<string>;
  choices: Map<string, string>;
}

function recordKey(reference: DebateMysteryRecordReferenceV2): string {
  return `${reference.kind}:${reference.id}`;
}

function duplicateIds(values: readonly { id: string }[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) duplicates.add(value.id);
    seen.add(value.id);
  }
  return [...duplicates];
}

function requirementsSatisfied(
  requirements: DebateMysteryDialogueRequirementV2,
  state: Omit<SolverState, "nodeId">,
): boolean {
  return requirements.discoveryIds.every((id) => state.discoveries.has(id)) &&
    requirements.unlockedTopicIds.every((id) => state.topics.has(id)) &&
    requirements.admittedRecordIds.every((id) => state.records.has(id)) &&
    requirements.choices.every((choice) => state.choices.get(choice.choiceId) === choice.optionId);
}

function applyMutations(node: DebateMysteryDialogueNodeV2, state: SolverState): SolverState {
  const next: SolverState = {
    nodeId: state.nodeId,
    discoveries: new Set(state.discoveries),
    topics: new Set(state.topics),
    records: new Set(state.records),
    choices: new Map(state.choices),
  };
  for (const id of node.mutations.discoverIds) next.discoveries.add(id);
  for (const id of node.mutations.unlockTopicIds) next.topics.add(id);
  for (const id of node.mutations.admitRecordIds) next.records.add(id);
  for (const choice of node.mutations.choices) next.choices.set(choice.choiceId, choice.optionId);
  return next;
}

function solverSignature(state: SolverState): string {
  return [
    state.nodeId,
    [...state.discoveries].sort().join(","),
    [...state.topics].sort().join(","),
    [...state.records].sort().join(","),
    [...state.choices].sort(([a], [b]) => a.localeCompare(b)).map(([id, option]) => `${id}:${option}`).join(","),
  ].join("|");
}

export function validateDebateMysteryDialogueGraphV2(args: {
  graph: DebateMysteryDialogueGraphV2;
  suspectSeatIds: readonly string[];
  recordReferences: readonly DebateMysteryRecordReferenceV2[];
  eyewitnessSeatId?: string | null;
  accusedAlibiSupportDiscoveryIds?: readonly string[];
}): DebateMysteryGraphValidationResultV2 {
  const { graph } = args;
  const errors: string[] = [];
  for (const id of duplicateIds(graph.nodes)) errors.push(`Duplicate dialogue node ID: ${id}.`);
  for (const id of duplicateIds(graph.lines)) errors.push(`Duplicate spoken line ID: ${id}.`);
  for (const id of duplicateIds(graph.witnessChapters)) errors.push(`Duplicate witness chapter ID: ${id}.`);
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const lineById = new Map(graph.lines.map((line) => [line.id, line]));
  const recordIds = new Set(args.recordReferences.map(recordKey));

  for (const node of graph.nodes) {
    if (node.lineId && !lineById.has(node.lineId)) errors.push(`Node ${node.id} references missing line ${node.lineId}.`);
    for (const nextId of node.nextNodeIds) {
      if (!nodeById.has(nextId)) errors.push(`Node ${node.id} transitions to missing node ${nextId}.`);
    }
    for (const reference of node.recordReferences) {
      if (!recordIds.has(recordKey(reference))) errors.push(`Node ${node.id} references missing record ${recordKey(reference)}.`);
    }
  }
  for (const line of graph.lines) {
    if (!nodeById.has(line.nodeId)) errors.push(`Line ${line.id} references missing node ${line.nodeId}.`);
    if (!line.visibleText.trim()) errors.push(`Line ${line.id} has no visible text.`);
    if (line.mode === "spoken" && !line.spokenText.trim()) errors.push(`Spoken line ${line.id} has no performance text.`);
  }

  const chaptersByWitness = new Map<string, DebateMysteryWitnessChapterV2[]>();
  for (const chapter of graph.witnessChapters) {
    const witnessChapters = chaptersByWitness.get(chapter.witnessSeatId) ?? [];
    witnessChapters.push(chapter);
    chaptersByWitness.set(chapter.witnessSeatId, witnessChapters);
    if (!nodeById.has(chapter.checkpointNodeId)) errors.push(`Chapter ${chapter.id} has a missing checkpoint node.`);
    if (!nodeById.has(chapter.completionNodeId)) errors.push(`Chapter ${chapter.id} has a missing completion node.`);
    const statementIds = new Set(chapter.statementVersions.map((statement) => statement.statementId));
    for (const statementId of chapter.initialStatementIds) {
      if (!statementIds.has(statementId)) errors.push(`Chapter ${chapter.id} starts with missing statement ${statementId}.`);
    }
    for (const statement of chapter.statementVersions) {
      if (statement.witnessSeatId !== chapter.witnessSeatId) errors.push(`Statement ${statement.id} belongs to the wrong witness.`);
      if (!lineById.has(statement.lineId)) errors.push(`Statement ${statement.id} references missing line ${statement.lineId}.`);
      if (!nodeById.has(statement.pressNodeId)) errors.push(`Statement ${statement.id} has no Press result.`);
      if (!nodeById.has(statement.rebuttalNodeId)) errors.push(`Statement ${statement.id} has no incorrect-presentation rebuttal.`);
      if (statement.revisionNodeId && !nodeById.has(statement.revisionNodeId)) errors.push(`Statement ${statement.id} has a missing revision node.`);
      if (statement.nextStatementId && !statementIds.has(statement.nextStatementId)) errors.push(`Statement ${statement.id} points to missing statement ${statement.nextStatementId}.`);
      for (const proof of statement.correctPresentations) {
        if (!recordIds.has(recordKey(proof))) errors.push(`Statement ${statement.id} contradicts with missing record ${recordKey(proof)}.`);
      }
    }
  }
  for (const seatId of args.suspectSeatIds) {
    if (!(chaptersByWitness.get(seatId)?.length)) errors.push(`Suspect ${seatId} has no cross-examination chapter.`);
  }
  const ordinals = graph.witnessChapters.map((chapter) => chapter.ordinal);
  if (new Set(ordinals).size !== ordinals.length) errors.push("Witness chapter order contains duplicate ordinals.");

  const initial: Omit<SolverState, "nodeId"> = {
    discoveries: new Set(graph.initialDiscoveryIds),
    topics: new Set<string>(),
    records: new Set(graph.initialAdmittedRecordIds),
    choices: new Map<string, string>(),
  };
  const queue: SolverState[] = [];
  const enqueueEligibleRoot = (
    rootId: string,
    state: Omit<SolverState, "nodeId">,
  ): boolean => {
    const root = nodeById.get(rootId);
    if (!root) return false;
    if (requirementsSatisfied(root.requirements, state)) {
      queue.push({ nodeId: rootId, ...state });
      return true;
    }
    if (root.kind !== "choice_reaction" || root.requirements.choices.length !== 1) return false;
    const requiredChoice = root.requirements.choices[0]!;
    const choice = graph.prosecutionChoices.find((entry) =>
      entry.id === requiredChoice.choiceId && entry.optionIds.includes(requiredChoice.optionId));
    const promptNodeId = choice ? lineById.get(choice.promptLineId)?.nodeId : null;
    if (!choice || !promptNodeId || !reachableNodes.has(promptNodeId)) return false;
    const withoutChoice: DebateMysteryDialogueRequirementV2 = {
      ...root.requirements,
      choices: [],
    };
    if (!requirementsSatisfied(withoutChoice, state)) return false;
    const choices = new Map(state.choices);
    choices.set(requiredChoice.choiceId, requiredChoice.optionId);
    queue.push({ nodeId: rootId, ...state, choices });
    return true;
  };
  const reachableNodes = new Set<string>();
  const reachableLines = new Set<string>();
  for (const rootId of graph.interactionRootNodeIds) {
    const root = nodeById.get(rootId);
    if (!root) {
      errors.push(`Missing interaction root ${rootId}.`);
      continue;
    }
    enqueueEligibleRoot(rootId, initial);
  }
  const visited = new Set<string>();
  const accumulated = {
    discoveries: new Set(initial.discoveries),
    topics: new Set(initial.topics),
    records: new Set(initial.records),
    choices: new Map(initial.choices),
  };
  let madeProgress = true;
  while (madeProgress) {
    madeProgress = false;
    while (queue.length) {
      const state = queue.shift()!;
      const signature = solverSignature(state);
      if (visited.has(signature)) continue;
      visited.add(signature);
      const node = nodeById.get(state.nodeId);
      if (!node || !requirementsSatisfied(node.requirements, state)) continue;
      reachableNodes.add(node.id);
      if (node.lineId && lineById.get(node.lineId)?.mode === "spoken") reachableLines.add(node.lineId);
      const nextState = applyMutations(node, state);
      for (const id of nextState.discoveries) accumulated.discoveries.add(id);
      for (const id of nextState.topics) accumulated.topics.add(id);
      for (const id of nextState.records) accumulated.records.add(id);
      for (const [id, option] of nextState.choices) accumulated.choices.set(id, option);
      for (const nextId of node.nextNodeIds) queue.push({ ...nextState, nodeId: nextId });
      madeProgress = true;
    }
    for (const rootId of graph.interactionRootNodeIds) {
      if (reachableNodes.has(rootId)) continue;
      if (enqueueEligibleRoot(rootId, accumulated)) madeProgress = true;
    }
  }
  for (const node of graph.nodes) {
    if (!reachableNodes.has(node.id)) errors.push(`Dialogue node ${node.id} is unreachable.`);
  }
  for (const chapter of graph.witnessChapters) {
    if (!reachableNodes.has(chapter.completionNodeId)) errors.push(`Witness chapter ${chapter.id} cannot reach completion.`);
    const hasReachableProof = chapter.statementVersions.some((statement) =>
      statement.correctPresentations.length > 0 &&
      statement.correctPresentations.some((reference) => accumulated.records.has(recordKey(reference))));
    if (!hasReachableProof) errors.push(`Witness chapter ${chapter.id} has no admitted statement-level proof route.`);
  }
  if (args.eyewitnessSeatId) {
    const chapter = graph.witnessChapters.find((entry) => entry.witnessSeatId === args.eyewitnessSeatId);
    if (!chapter) errors.push("The eyewitness has no exact statement-level resolution chapter.");
    if ((args.accusedAlibiSupportDiscoveryIds?.length ?? 0) < 2) errors.push("An eyewitness case requires two outwardly independent alibi supports.");
    for (const id of args.accusedAlibiSupportDiscoveryIds ?? []) {
      if (!accumulated.discoveries.has(id)) errors.push(`Accused alibi support ${id} is not discoverable.`);
    }
  }
  for (const choice of graph.prosecutionChoices) {
    if (!lineById.has(choice.promptLineId)) errors.push(`Prosecution choice ${choice.id} has no prompt line.`);
    if (choice.optionIds.length < 2) errors.push(`Prosecution choice ${choice.id} needs at least two authored options.`);
    for (const optionId of choice.optionIds) {
      const responseExists = graph.nodes.some((node) =>
        node.kind === "choice_reaction" &&
        node.requirements.choices.some((choiceRequirement) =>
          choiceRequirement.choiceId === choice.id && choiceRequirement.optionId === optionId));
      if (!responseExists) errors.push(`Prosecution choice ${choice.id} option ${optionId} has no authored response.`);
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    reachableNodeIds: [...reachableNodes],
    reachableSpokenLineIds: [...reachableLines],
  };
}

export function validateDebateMysteryAudioManifestV1(args: {
  graph: DebateMysteryDialogueGraphV2;
  manifest: DebateMysteryAudioManifestV1;
  reachableSpokenLineIds: readonly string[];
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const required = new Set(args.reachableSpokenLineIds);
  const entries = new Map(args.manifest.entries.map((entry) => [entry.lineId, entry]));
  const graphLineIds = new Set(args.graph.lines.map((line) => line.id));
  for (const lineId of required) {
    const entry = entries.get(lineId);
    if (!entry) {
      errors.push(`Reachable spoken line ${lineId} is missing from the local audio pack.`);
      continue;
    }
    if (!entry.sha256 || entry.byteSize <= 0 || entry.durationMs <= 0 || !entry.clipPath) {
      errors.push(`Audio entry ${lineId} is incomplete.`);
    }
  }
  for (const entry of args.manifest.entries) {
    if (!graphLineIds.has(entry.lineId)) errors.push(`Audio entry ${entry.lineId} is not in the dialogue graph.`);
    if (!required.has(entry.lineId)) errors.push(`Unreachable spoken line ${entry.lineId} was needlessly prepared.`);
  }
  if (!args.manifest.complete) errors.push("The local audio manifest is not complete.");
  if (args.manifest.complete && !args.manifest.verifiedAt) errors.push("The completed local audio manifest has not been verified.");
  return { valid: errors.length === 0, errors };
}

export function debateMysteryCredibilityMaximumV2(difficulty: DebateMysteryDifficulty): number {
  return difficulty === "casual" ? 5 : difficulty === "mastermind" ? 3 : 4;
}

export function debateMysteryEyewitnessChanceV2(
  difficulty: DebateMysteryDifficulty,
  preset: DebateMysteryPresetId,
): number {
  const base = difficulty === "casual" ? 0.1 : difficulty === "mastermind" ? 0.4 : 0.25;
  const modifier = preset === "grand" ? 0.1 : preset === "compact" ? -0.05 : 0;
  return Math.min(0.5, Math.max(0, base + modifier));
}

export function debateMysteryPremiumAvailableV2(): false {
  return false;
}

export function resolveDebateMysteryConfigV2(
  value: DebateWhodunnitCreateConfigV2,
): DebateMysteryResolvedConfigV2 {
  if (!value || value.version !== DEBATE_MYSTERY_V2_SCHEMA_VERSION) {
    throw new Error("Whodunnit V2 requires a version 2 setup.");
  }
  const preset = value.preset;
  const presetDefaults = preset === "compact"
    ? { floors: 1, rooms: 5, suspects: 4 }
    : preset === "grand"
      ? { floors: 3, rooms: 15, suspects: 8 }
      : { floors: 2, rooms: 10, suspects: 6 };
  const suspectBotIds = value.suspectBotIds.map((id) => id.trim()).filter(Boolean);
  if (suspectBotIds.length < 4 || suspectBotIds.length > 8) {
    throw new Error("Whodunnit V2 requires four to eight suspects.");
  }
  if (preset !== "custom" && suspectBotIds.length !== presetDefaults.suspects) {
    throw new Error(`${preset} Whodunnit requires ${presetDefaults.suspects} suspects.`);
  }
  const trialType: DebateMysteryTrialTypeV2 = value.trialType === "bench" ? "bench" : "jury";
  const jurorBotIds = value.jurorBotIds.map((id) => id.trim()).filter(Boolean);
  if (trialType === "jury" && jurorBotIds.length !== DEBATE_MYSTERY_V2_JUROR_COUNT) {
    throw new Error("A Whodunnit Jury Trial requires exactly four cast jurors.");
  }
  if (trialType === "bench" && jurorBotIds.length > 0) {
    throw new Error("Bench Trial cannot freeze juror bot IDs.");
  }
  const castIds = [
    ...suspectBotIds,
    value.prosecutorPartnerBotId.trim(),
    value.rivalDefenseBotId.trim(),
    ...(value.judgeBotId && value.judgeBotId !== "prism:player-judge" ? [value.judgeBotId.trim()] : []),
    ...jurorBotIds,
  ].filter(Boolean);
  if (new Set(castIds).size !== castIds.length) {
    throw new Error("Every Whodunnit cast role must use a distinct bot.");
  }
  const floors = preset === "custom"
    ? Math.min(3, Math.max(1, Math.floor(value.floors ?? 2)))
    : presetDefaults.floors;
  const totalRooms = preset === "custom"
    ? Math.min(18, Math.max(suspectBotIds.length + 1, Math.floor(value.totalRooms ?? 10)))
    : presetDefaults.rooms;
  return {
    ...value,
    trialType,
    suspectBotIds,
    jurorBotIds: trialType === "jury"
      ? jurorBotIds as [string, string, string, string]
      : [],
    judgeBotId: value.judgeBotId?.trim() || "prism:player-judge",
    prosecutorPartnerBotId: value.prosecutorPartnerBotId.trim(),
    rivalDefenseBotId: value.rivalDefenseBotId.trim(),
    inspiration: value.inspiration.trim().slice(0, 2_000),
    nonce: value.nonce.trim().slice(0, 200),
    floors,
    totalRooms,
    playerRole: value.playerRole === "spectator" ? "spectator" : "participant",
    participationDifficulty:
      value.participationDifficulty === "coach" || value.participationDifficulty === "immersive"
        ? value.participationDifficulty
        : "standard",
    eyewitnessChance: debateMysteryEyewitnessChanceV2(value.difficulty, value.preset),
  };
}

export function debateMysteryClassifyVerdictV2(args: {
  legalResult: "guilty" | "not_guilty";
  accusedIsCulprit: boolean;
  proofEstablished: boolean;
  proofSafe: boolean;
}): DebateMysteryVerdictClassificationV2 {
  if (args.legalResult === "guilty") {
    if (!args.accusedIsCulprit) return "wrongful_conviction";
    return args.proofEstablished && args.proofSafe ? "just_conviction" : "unsafe_conviction";
  }
  if (args.proofEstablished && args.accusedIsCulprit) return "acquittal_despite_proof";
  return "failed_prosecution";
}

export function emptyDebateMysteryRequirementsV2(): DebateMysteryDialogueRequirementV2 {
  return { discoveryIds: [], unlockedTopicIds: [], admittedRecordIds: [], choices: [] };
}

export function emptyDebateMysteryMutationsV2(): DebateMysteryDialogueMutationV2 {
  return { discoverIds: [], unlockTopicIds: [], admitRecordIds: [], choices: [] };
}

export function publicEvidenceRecordV2(
  evidence: DebateMysteryPublicEvidenceItemV1,
  updatedAt: string,
): DebateMysteryPublicRecordItemV2 {
  return {
    reference: { kind: "evidence", id: evidence.id },
    title: evidence.title,
    description: evidence.observation,
    emoji: evidence.emoji,
    admitted: true,
    updatedAt,
  };
}

export function normalizeDebateMysteryFormatStateV2(
  value: unknown,
): DebateWhodunnitFormatStateV2 | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<DebateWhodunnitFormatStateV2>;
  if (
    source.version !== DEBATE_MYSTERY_V2_SCHEMA_VERSION ||
    source.format !== "whodunnit" ||
    !source.compilation ||
    source.compilation.version !== DEBATE_MYSTERY_V2_SCHEMA_VERSION ||
    !source.config ||
    source.config.version !== DEBATE_MYSTERY_V2_SCHEMA_VERSION ||
    !Array.isArray(source.suspects) ||
    !Array.isArray(source.rooms) ||
    !Array.isArray(source.record) ||
    !Array.isArray(source.topics) ||
    !Array.isArray(source.dialogueHistory)
  ) {
    return null;
  }
  return source as DebateWhodunnitFormatStateV2;
}
