import { debateMysteryTheoryAccusedSeatIdsV2 } from "@localai/shared";
import type { DebateSessionV1, DebateWhodunnitFormatStateV2 } from "@localai/shared";

export const WHODUNNIT_DIAGNOSTIC_TRANSCRIPT_VERSION = 1;
export interface WhodunnitDiagnosticActionSummary {
  id?: string;
  sequence: number;
  action: string;
  occurredAt: string;
}
type PublicSessionContext = Pick<DebateSessionV1,
  "id" | "revision" | "status" | "phase" | "stepKey" | "provider" | "model" |
  "modelSelectionKind" | "responseMode" | "lastReasoningEffort" | "lastTurbo" | "createdAt" | "updatedAt" | "completedAt">;

/** Explicit public whitelist shared by live, terminal and Archive copy.
 * Diagnostic evidence, never an experienced-artifact or delivery claim. */
export function formatDebateMysteryV2PublicReview(
  state: DebateWhodunnitFormatStateV2,
  botNameForId: (botId: string) => string | null = () => null,
  session?: PublicSessionContext,
  actionSummaries: readonly WhodunnitDiagnosticActionSummary[] = [],
): string {
  const known = (value: unknown): string => value === null || value === undefined || value === ""
    ? "Unknown / not recorded" : String(value);
  const suspects = new Map(state.suspects.map((suspect) => [suspect.seatId, suspect.name]));
  const person = (id: string): string => suspects.get(id) ?? "Unknown public suspect";
  const admitted = state.record.filter((item) => item.admitted);
  const reference = (kind: string, id: string): string => {
    const item = admitted.find((entry) => entry.reference.kind === kind && entry.reference.id === id);
    return item ? `${item.title} [${kind}:${id}]` : "Unavailable / unadmitted reference omitted";
  };
  const publicRoom = (id: string): string => {
    const room = state.rooms.find((entry) => entry.id === id && entry.visited);
    return room ? `${room.name} [${room.id}]` : "Unvisited / unavailable room";
  };
  const timeline: Array<{ time: string; order: number; text: string }> = [];
  for (const action of actionSummaries) {
    if (session?.updatedAt && action.occurredAt > session.updatedAt) continue;
    if (state.publicActions?.some((entry) => entry.id === action.id ||
      (entry.action === action.action && entry.occurredAt === action.occurredAt))) continue;
    timeline.push({ time: action.occurredAt, order: action.sequence,
      text: `- ${action.occurredAt} · action ${known(action.id)} #${action.sequence} · ${action.action} · accepted/recorded (legacy ledger; targets, revision and outcome details unavailable)` });
  }
  for (const action of state.publicActions ?? []) {
    const room = state.rooms.find((entry) => entry.id === action.roomId && entry.visited);
    const hotspot = room?.hotspots.find((entry) => entry.id === action.hotspotId && entry.examined);
    const topic = state.topics?.find((entry) => entry.nodeId === action.topicNodeId && entry.completed);
    const statement = state.court?.statements.find((entry) => entry.statementId === action.statementId);
    // Never spread or JSON-serialize event metadata. Future fields must opt in.
    const detail = [
      action.roomId ? `room=${publicRoom(action.roomId)}` : null,
      `view=${known(action.roomViewAfter)}`,
      hotspot ? `examine=${hotspot.label} [${hotspot.id}]` : null,
      action.suspectSeatId && suspects.has(action.suspectSeatId) ? `person=${person(action.suspectSeatId)} [${action.suspectSeatId}]` : null,
      topic ? `topic=${topic.label} [${topic.nodeId}]` : null,
      statement ? `statement=${statement.statementId}` : null,
      action.record ? `present=${reference(action.record.kind, action.record.id)}` : null,
      ...(action.admittedRecords ?? []).map((entry) => `discovered=${reference(entry.kind, entry.id)}`),
      ...(action.acquiredItemIds ?? []).flatMap((id) => {
        const item = state.caseKit?.find((entry) => entry.id === id);
        return item ? [`acquired=${item.title} [${item.id}]`] : [];
      }),
      `accepted dialogue indexes=${(action.dialogueIndexes ?? []).join(", ") || "none"}`,
    ].filter(Boolean).join(" · ");
    timeline.push({ time: action.occurredAt, order: action.sequence,
      text: `- ${known(action.occurredAt)} · action ${action.id} #${action.sequence} · ${action.action} · accepted/recorded · revision ${action.revisionBefore}→${action.revisionAfter} · ${action.phaseBefore}→${action.phaseAfter}\n  ${detail}` });
  }
  state.dialogueHistory.forEach((entry, index) => {
    const speaker = entry.speakerKind === "narrator" ? "Narrator"
      : entry.speakerKind === "player" ? "Investigator"
      : entry.speakerKind === "judge" ? "Judge"
      : entry.speakerSeatId && suspects.has(entry.speakerSeatId) ? person(entry.speakerSeatId)
      : entry.speakerBotId && entry.speakerBotId === state.config.prosecutorBotId ? "Investigator"
      : entry.speakerBotId && entry.speakerBotId === state.config.rivalDefenseBotId ? "Defense"
      : "Unknown speaker (legacy public record)";
    timeline.push({ time: entry.occurredAt, order: index + 0.5,
      text: `- ${known(entry.occurredAt)} · dialogue[${index}] · node=${entry.nodeId} · line=${known(entry.lineId)} · recorded · intended delivery=${known(entry.delivery)}\n  ${speaker}: ${entry.visibleText}${entry.stageActionText ? `\n  Recorded stage action: ${entry.stageActionText}` : ""}${entry.caseFileRelevant ? "\n  Case File relevant observation" : ""}` });
  });
  timeline.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? "") || a.order - b.order);
  const c = state.compilation;
  const theory = state.theory;
  const verdict = state.verdict;
  const check = state.caseCheck;
  const mansion = state.config.mansionSnapshot;
  return [
    `# Whodunnit diagnostic verbose transcript · v${WHODUNNIT_DIAGNOSTIC_TRANSCRIPT_VERSION}`,
    "",
    "Public projection only. Recorded text/actions are not proof of what was visible or heard. Intended delivery is not observed playback. Delivery-observed: unknown unless separately supplied by a presentation capture. Missing timings, hidden branches, and sealed truth are not reconstructed.",
    "",
    "## Snapshot and provenance",
    `- Case: ${known(state.caseTitle)}`,
    `- Fiction: ${state.fictionLabel}`,
    `- Session / Run ID: ${known(session?.id)} · revision: ${known(session?.revision)}`,
    `- Status: ${known(session?.status)} · phase: ${state.playPhase} · session phase: ${known(session?.phase)} · step: ${known(session?.stepKey)}`,
    `- Created: ${known(session?.createdAt)} · updated: ${known(session?.updatedAt)} · completed: ${known(session?.completedAt)}`,
    `- Provider/model (session snapshot, not per-line attribution): ${known(session?.provider)} / ${known(session?.model)}`,
    `- Privacy / response lane: ${known(session?.responseMode)}`,
    `- Selection: ${known(session?.modelSelectionKind)} · Effort: ${known(session?.lastReasoningEffort)} · Turbo: ${known(session?.lastTurbo)}`,
    "- Running API/web/desktop build, per-line provider, source-case identity and package origin: unknown / not recorded in this projection",
    `- Setup: ${known(state.config.preset)} · ${state.config.difficulty} · ${state.config.trialType} · ${state.config.playerRole} · investigation=${known(state.config.investigationMode)}`,
    `- Mansion bundle: ${known(state.config.mansionBundleId)} · floors=${known(state.config.floors)} · rooms=${known(state.config.totalRooms)}`,
    `- Frozen mansion source: ${known(mansion?.sourceBundleId)} · captured=${known(mansion?.capturedAt)} · layout SHA-256=${known(mansion?.layoutSha256)} · presentation SHA-256=${known(mansion?.presentationSha256)}`,
    `- Charge: ${known(state.caseCharge?.title)} · ${known(state.caseCharge?.accusationPrompt)}`,
    `- Victim / affected party: ${known(state.victim?.name)}`,
    `- Compile job: ${known(c?.jobId)} · stage=${known(c?.stage)} · attempt=${known(c?.attempt)} · passes=${known(c?.completedPasses)}/${known(c?.totalPasses)}`,
    `- Compile started: ${known(c?.startedAt)} · updated: ${known(c?.updatedAt)} · elapsedMs=${known(c?.elapsedMs)}`,
    `- Public compile failure: ${known(c?.publicFailureCode)} · stage=${known(c?.publicFailureStage)}`,
    `- Readiness: ${known(state.readiness?.status)} · checked=${known(state.readiness?.checkedAt)}`,
    `- Voices enabled: ${state.voicesEnabled} · audio ready=${known(state.audioReady)} (preparation, not playback evidence)`,
    "",
    "## Public cast",
    ...state.suspects.map((suspect) => `- ${suspect.name} [${suspect.seatId}] · bot=${suspect.botId} · location=${suspect.roomId ? publicRoom(suspect.roomId) : "undiscovered"}`),
    "",
    "## Recorded chronology",
    state.publicActionHistoryComplete === true
      ? "Accepted action ledger available from this Run's start. Rejected requests and local draft edits are not recorded."
      : "Missing / legacy history: the complete accepted action ledger is unavailable (including any discarded restart/checkpoint history). Available dialogue and public snapshots follow; earlier actions, visits, durations and failed requests cannot be reconstructed.",
    ...(timeline.length ? timeline.map((entry) => entry.text) : ["No public action or dialogue history available."]),
    "",
    "## Visited rooms and examinations (current snapshot)",
    ...state.rooms.filter((room) => room.visited).map((room) =>
      `- ${room.name} [${room.id}]: ${room.hotspots.filter((spot) => spot.examined).map((spot) => `${spot.label} [${spot.id}]`).join(", ") || "visited; no completed examination"}`),
    "",
    "## Admitted public record (full available text)",
    ...(admitted.length ? admitted.map((item) => `- ${item.emoji} ${item.title} [${item.reference.kind}:${item.reference.id}] · updated=${known(item.updatedAt)}\n  ${item.description}`) : ["No admitted evidence or testimony."]),
    "",
    "## Recovered Case Kit",
    ...(state.caseKit ?? []).map((item) => `- ${item.title} [${item.id}] · ${item.kind} · acquired=${known(item.acquiredAt)}\n  ${item.description}`),
    "",
    "## Filed / reviewed theory",
    ...(theory ? [
      `- Accused: ${debateMysteryTheoryAccusedSeatIdsV2(theory).map(person).join(", ") || "None"}`,
      `- Claim: ${known(theory.claim)}`,
      `- Method: ${known(theory.method)}`,
      `- Motive: ${known(theory.motive)}`,
      `- Opportunity: ${known(theory.opportunity)}`,
      `- Evidence: ${theory.evidenceIds.map((id) => reference("evidence", id)).join(", ") || "None"}`,
      `- Testimony: ${theory.testimonyIds.map((id) => reference("testimony", id)).join(", ") || "None"}`,
      `- Filed: ${state.theoryFiledAt ?? "Not filed; reviewed hypothesis only"}`,
    ] : ["No theory filed. Unsaved local drafts are not included."]),
    "",
    "## Public Court record",
    ...(state.court?.statements ?? []).map((entry) => `- ${person(entry.witnessSeatId)} · ${entry.statementId} / ${entry.versionId} v${entry.version} · pressed=${entry.pressed}\n  ${entry.visibleText}`),
    ...state.calloutHistory.map((entry) => `- ${entry.occurredAt} · callout ${entry.id}: ${entry.callout.replaceAll("_", " ")} (recorded, not delivery-observed)`),
    "",
    "## Terminal result",
    ...(check ? [
      "- Completion: case_check v1 · Court skipped: yes · no legal verdict or jury ballot",
      `- Accusation correct: ${check.accusationCorrect} · concluded=${check.concludedAt}`,
      "- Assessment: exact accused set only. Method, motive, opportunity and strength of proof were not semantically graded. Sealed responsible identities remain undisclosed.",
    ] : verdict ? [
      "- Completion: Court verdict · Court skipped: no",
      `- Legal result: ${verdict.legalResult.replaceAll("_", " ")}`,
      `- Truth and proof grade: ${verdict.classification.replaceAll("_", " ")} · ${verdict.proofGrade}`,
      `- Accusation correct: ${known(verdict.accusationCorrect)} · recorded result time: ${verdict.deliveredAt}`,
      ...verdict.jurorBallots.map((ballot) => `- ${botNameForId(ballot.jurorBotId) ?? "Juror"}: ${ballot.vote.replaceAll("_", " ")} — ${ballot.reason}${ballot.powerAffected ? " (Power affected)" : ""}`),
    ] : ["No terminal result recorded."]),
  ].join("\n").trim();
}
