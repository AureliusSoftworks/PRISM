import { createHash, randomUUID } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import type { DatabaseSync } from "node:sqlite";
import {
  DEBATE_MYSTERY_CREDIBILITY_STRIKES,
  DEBATE_MYSTERY_GENERATOR_VERSION,
  DEBATE_MYSTERY_NOTEBOOK_CHARACTER_LIMIT,
  DEBATE_MYSTERY_ROOM_TEMPLATES,
  DEBATE_MYSTERY_SCHEMA_VERSION,
  DEBATE_SCHEMA_VERSION,
  compileDeterministicDebateMystery,
  debateMysteryRecipeSeed,
  debateMysteryNotebookCharacterCount,
  gradeDebateMysteryTheory,
  normalizeDebateIdempotencyKey,
  normalizeDebateMysteryFormatStateV1,
  projectDebateMysteryCase,
  resolveDebateMysteryConfig,
  updateDebateMysteryPublicLeads,
  validateDebateMysteryCaseBible,
  validateDebateMysteryNotebookCleanupProposal,
  type DebateMysteryActionRequestV1,
  type DebateMysteryCaseBibleV1,
  type DebateMysteryCaseCodeV1,
  type DebateMysteryNotebookBlockV1,
  type DebateMysteryNotebookCleanupProposalV1,
  type DebateMysteryNotebookPageV1,
  type DebateMysteryNotebookV1,
  type DebateMysteryPortableManifestV1,
  type DebateMysteryResolvedConfigV1,
  type DebateMysterySuspectSnapshotV1,
  type DebateSessionCreateRequest,
  type DebateSessionV1,
  type DebateWhodunnitCreateConfigV1,
  type DebateWhodunnitFormatStateV1,
} from "@localai/shared";
import {
  createDebateSession,
  debatePowerPlanForBots,
  getDebateSession,
  type DebateAiRuntime,
  type DebateGenerationLane,
} from "./debate.ts";
import { HttpError } from "./utils.http.ts";

interface MysteryBotRow {
  id: string;
  name: string;
  system_prompt: string;
  export_hash: string | null;
  color: string | null;
  glyph: string | null;
}

interface MysteryCaseRow {
  private_json: string;
  content_hash: string;
}

interface MysteryNotebookRow {
  revision: number;
  document_json: string;
  pending_proposal_json: string | null;
}

export interface MysteryExhibitVisual {
  id: string;
  adjective: string;
  object: string;
  title: string;
  emoji: string;
  imageId: string | null;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function compact(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/gu, " ").trim().slice(0, max) : "";
}

function compactMarkdown(value: unknown, max: number): string {
  return typeof value === "string"
    ? value
      .replace(/\r\n?/gu, "\n")
      .replace(/[\t ]+/gu, " ")
      .replace(/ *\n */gu, "\n")
      .replace(/\n{3,}/gu, "\n\n")
      .trim()
      .slice(0, max)
    : "";
}

/** A committed `@` pick uses the same exhibit marker as the Debate court
 * composer. Plain prose, even when it names an item, is never confrontation. */
const MYSTERY_EVIDENCE_MENTION_RE = /\[\[exhibit:([^\]\s]+)\]\]/gu;

export function parseDebateMysteryEvidenceConfrontation(
  question: string,
  discoveredEvidence: readonly { id: string }[],
): string | null {
  const markers = [...question.matchAll(MYSTERY_EVIDENCE_MENTION_RE)];
  if (markers.length === 0) return null;
  if (markers.length !== 1) {
    throw new HttpError(400, "Reference one discovered evidence item at a time.");
  }
  const evidenceId = markers[0]?.[1] ?? "";
  if (!discoveredEvidence.some((item) => item.id === evidenceId)) {
    throw new HttpError(404, "That evidence is not in the discovered record.");
  }
  return evidenceId;
}

const MYSTERY_CONTEXT_MENTION_RE = /\[\[mystery:(testimony|suspect|victim|lead):([^\]\s]+)\]\]/gu;

/** Mention markers are durable IDs at the boundary, then become only real
 * colored-character/public-record names before any model sees the question. */
export function resolveDebateMysteryQuestionMentions(
  question: string,
  state: DebateWhodunnitFormatStateV1,
  bible: Pick<DebateMysteryCaseBibleV1, "victim">,
): string {
  const withContext = question.replace(MYSTERY_CONTEXT_MENTION_RE, (_marker, kind: string, id: string) => {
    if (kind === "victim") {
      if (id !== bible.victim.id) throw new HttpError(404, "That victim mention is not in this case.");
      return bible.victim.name;
    }
    if (kind === "suspect") {
      const suspect = state.suspects.find((entry) => entry.seatId === id);
      if (!suspect) throw new HttpError(404, "That suspect mention is not in this case.");
      return suspect.name;
    }
    if (kind === "lead") {
      const separator = id.lastIndexOf("@");
      const leadId = separator >= 0 ? id.slice(0, separator) : id;
      const revision = separator >= 0 ? Number(id.slice(separator + 1)) : Number.NaN;
      const lead = state.leads.find((entry) => entry.id === leadId);
      if (!lead || !Number.isInteger(revision) || lead.revision !== revision) {
        throw new HttpError(409, "That lead revision is no longer current. Choose the updated lead from the @ menu.");
      }
      return `Lead \"${lead.title}\" (${lead.status}, revision ${lead.revision}): ${lead.summary}`;
    }
    const testimony = state.testimony.find((entry) => entry.id === id);
    if (!testimony) throw new HttpError(404, "That testimony mention is not in the discovered record.");
    const suspect = state.suspects.find((entry) => entry.seatId === testimony.speakerSeatId);
    return `${suspect?.name ?? "Witness"}'s testimony: ${testimony.exactQuote}`;
  });
  return withContext.replace(MYSTERY_EVIDENCE_MENTION_RE, (_marker, id: string) => {
    const evidence = state.discoveredEvidence.find((entry) => entry.id === id);
    if (!evidence) throw new HttpError(404, "That evidence mention is not in the discovered record.");
    return evidence.title;
  });
}

function resolveMysterySeatNames(
  prose: string,
  state: Pick<DebateWhodunnitFormatStateV1, "suspects">,
): string {
  return state.suspects.reduce((resolved, suspect) => {
    const escaped = suspect.seatId.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return resolved.replace(new RegExp(`\\b${escaped}\\b`, "giu"), suspect.name);
  }, prose);
}

function parseJsonObject(value: string): Record<string, unknown> {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model response was not JSON.");
  const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Model response was not an object.");
  return parsed as Record<string, unknown>;
}

function publicMysteryEvidence(
  item: DebateMysteryCaseBibleV1["evidence"][number],
): DebateWhodunnitFormatStateV1["discoveredEvidence"][number] {
  const { factTags: _factTags, relation: _relation, isCanonicalWeapon: _isCanonicalWeapon, ...publicItem } = item;
  return publicItem;
}

function frozenForensicFinding(item: DebateMysteryCaseBibleV1["evidence"][number]) {
  const usedInMurder = item.isCanonicalWeapon;
  const contextualRelevance = usedInMurder ? "used" as const : item.relation === "related" ? "contextual" as const : "no_matching_trace" as const;
  return {
    evidenceId: item.id,
    usedInMurder,
    contextualRelevance,
    summary: usedInMurder
      ? "Forensic examination finds that this item was used in the murder."
      : contextualRelevance === "contextual"
        ? "Forensic examination finds trace details and provenance that may help place this item in the case, though it was not used as the weapon."
        : "Forensic examination finds no trace matching the established method; the item's provenance remains part of the record.",
    completedAt: new Date().toISOString(),
  };
}

function publicMysteryTestimony(
  item: DebateMysteryCaseBibleV1["testimony"][number],
): DebateWhodunnitFormatStateV1["testimony"][number] {
  const { factTags: _factTags, ...publicItem } = item;
  return { ...publicItem, discovered: true };
}

function mysteryKeywords(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/gu)
      .map((token) => token.trim())
      .filter((token) => token.length > 1),
  );
}

/** Presentation-only reuse: the canonical observation remains the sole fact
 * even when a prior Debate exhibit supplies a visual. */
export function resolveDebateMysteryEvidenceVisuals(
  bible: DebateMysteryCaseBibleV1,
  library: readonly MysteryExhibitVisual[],
): DebateMysteryCaseBibleV1 {
  const candidates = library.filter((item) => item.imageId);
  if (candidates.length === 0) return bible;
  return {
    ...bible,
    evidence: bible.evidence.map((evidence) => {
      const wanted = mysteryKeywords(
        [evidence.adjective, evidence.object, evidence.title, ...evidence.keywords].join(" "),
      );
      const matches = candidates
        .map((candidate) => {
          const available = mysteryKeywords(
            [candidate.adjective, candidate.object, candidate.title].join(" "),
          );
          const score = [...wanted].filter((token) => available.has(token)).length;
          return { candidate, score };
        })
        .filter((entry) => entry.score >= 2)
        .sort((left, right) =>
          right.score - left.score ||
          sha256(`${bible.caseSeed}:${evidence.id}:${left.candidate.id}`).localeCompare(
            sha256(`${bible.caseSeed}:${evidence.id}:${right.candidate.id}`),
          ),
        );
      const match = matches[0]?.candidate;
      return match
        ? { ...evidence, imageId: match.imageId, emoji: match.emoji || evidence.emoji }
        : evidence;
    }),
  };
}

function mysteryExhibitLibrary(
  db: DatabaseSync,
  userId: string,
): MysteryExhibitVisual[] {
  const rows = db.prepare(
    `SELECT session_json FROM debate_sessions
      WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100`,
  ).all(userId) as unknown as Array<{ session_json: string }>;
  const exhibits: MysteryExhibitVisual[] = [];
  for (const row of rows) {
    try {
      const parsed = JSON.parse(row.session_json) as {
        evidence?: { exhibits?: unknown };
      };
      if (!Array.isArray(parsed.evidence?.exhibits)) continue;
      for (const value of parsed.evidence.exhibits) {
        if (!value || typeof value !== "object") continue;
        const exhibit = value as Partial<MysteryExhibitVisual>;
        if (
          typeof exhibit.id === "string" &&
          typeof exhibit.adjective === "string" &&
          typeof exhibit.object === "string" &&
          typeof exhibit.title === "string" &&
          typeof exhibit.emoji === "string" &&
          typeof exhibit.imageId === "string" &&
          exhibit.imageId.trim()
        ) {
          exhibits.push({
            id: exhibit.id,
            adjective: exhibit.adjective,
            object: exhibit.object,
            title: exhibit.title,
            emoji: exhibit.emoji,
            imageId: exhibit.imageId,
          });
        }
      }
    } catch {
      // A malformed older Debate record cannot block a new mystery.
    }
  }
  return exhibits;
}

function mysteryLane(runtime: DebateAiRuntime): DebateGenerationLane {
  if (runtime.responseMode === "local" || runtime.preferredProvider === "local") return runtime.local;
  return runtime.online?.available === false ? runtime.local : (runtime.online ?? runtime.local);
}

function mysteryBotRows(db: DatabaseSync, userId: string, botIds: readonly string[]): MysteryBotRow[] {
  const ids = [...new Set(botIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return [];
  const rows = db.prepare(
    `SELECT id, name, system_prompt, export_hash, color, glyph
       FROM bots
      WHERE user_id = ? AND id IN (${ids.map(() => "?").join(", ")})`,
  ).all(userId, ...ids) as unknown as MysteryBotRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

async function completeMysteryEnsembleReadiness(
  bots: readonly MysteryBotRow[],
  runtime: DebateAiRuntime,
): Promise<void> {
  const lane = mysteryLane(runtime);
  await Promise.all(
    bots.map(async (bot) => {
      try {
        await lane.provider.generateResponse(
          [
            {
              role: "system",
              content:
                "Perform a non-spoiling fictional ensemble readiness check. No victim, culprit, accomplice, case facts, or secret role has been assigned. Confirm only that the supplied persona can be portrayed as an active suspect in a clearly fictional, non-canonical anthology while preserving its public identity and safety boundaries. Return JSON only: {ready:true, portrayalNote:string}.",
            },
            {
              role: "user",
              content: JSON.stringify({
                name: bot.name,
                fictionalPersonaProfile: bot.system_prompt.slice(0, 1_800),
              }),
            },
          ],
          {
            model: lane.model,
            reasoningEffort: lane.reasoningEffort,
            turbo: lane.turbo,
            maxTokens: 320,
            temperature: 0.1,
            jsonMode: true,
            usagePurpose: "debate_generation",
            allowFinalLocalFallback: lane.providerName === "local",
          },
        );
      } catch {
        // A provider-format failure does not make an EULA-eligible persona
        // ineligible. The deterministic non-spoiling seat remains valid.
      }
    }),
  );
}

function mysterySessionRequest(
  config: DebateMysteryResolvedConfigV1,
  source: DebateWhodunnitCreateConfigV1,
  idempotencyKey: string,
): DebateSessionCreateRequest {
  return {
    format: "whodunnit",
    whodunnit: source,
    formality: "structured",
    presetId: "custom",
    jury: { enabled: false },
    motion: {
      version: DEBATE_SCHEMA_VERSION,
      id: randomUUID(),
      title: "Whodunnit?",
      motion: "Determine who murdered the victim and prove the filed theory in court.",
      forSide: { label: "Prosecution", brief: "Investigate the mansion, file a theory, and prove it from the discovered record." },
      againstSide: { label: "Defense", brief: "Test the filed theory against the strongest supported alternative in the admissible record." },
    },
    evidence: { version: DEBATE_SCHEMA_VERSION, notes: "", sources: [], exhibits: [], frozenAt: null },
    moderatorTitle: "PRISM · Judge & Casekeeper",
    moderatorBotId: "prism:player-judge",
    playerJudgeUsesPrism: true,
    forAdvocateBotId: config.prosecutorPartnerBotId,
    againstAdvocateBotId: config.rivalDefenseBotId,
    playerRole: "investigator",
    playerSideId: null,
    advocacyConsent: [],
    preferredProvider: undefined,
    modelOverride: null,
    responseMode: undefined,
    theme: "dark",
    deferStart: false,
    idempotencyKey,
  };
}

function publicSessionJson(session: DebateSessionV1): string {
  return JSON.stringify({ ...session, events: [] });
}

function persistMysterySession(
  db: DatabaseSync,
  userId: string,
  session: DebateSessionV1,
  expectedRevision: number,
): DebateSessionV1 {
  const next = { ...session, revision: expectedRevision + 1, updatedAt: new Date().toISOString() };
  const result = db.prepare(
    `UPDATE debate_sessions
        SET revision = ?, status = ?, phase = ?, step_key = ?, player_role = ?,
            motion = ?, winner_side_id = ?, session_json = ?, error = ?,
            updated_at = ?, completed_at = ?
      WHERE id = ? AND user_id = ? AND revision = ?`,
  ).run(
    next.revision,
    next.status,
    next.phase,
    next.stepKey,
    "judge", // SQLite compatibility: canonical investigator role lives in session_json.
    next.motion.motion,
    next.winnerSideId,
    publicSessionJson(next),
    next.error,
    next.updatedAt,
    next.completedAt,
    next.id,
    userId,
    expectedRevision,
  );
  if (Number(result.changes) !== 1) throw new HttpError(409, "This case changed in another window. Refresh and try again.");
  return next;
}

function privateCaseRow(db: DatabaseSync, userId: string, sessionId: string): MysteryCaseRow | null {
  return (db.prepare(
    `SELECT private_json, content_hash FROM debate_mystery_cases WHERE session_id = ? AND user_id = ?`,
  ).get(sessionId, userId) as MysteryCaseRow | undefined) ?? null;
}

export function getDebateMysteryCaseBible(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): DebateMysteryCaseBibleV1 {
  const row = privateCaseRow(db, userId, sessionId);
  if (!row) throw new HttpError(404, "Mystery Case Bible not found.");
  if (sha256(row.private_json) !== row.content_hash) throw new HttpError(409, "The private Case Bible failed its integrity check.");
  const parsed = JSON.parse(row.private_json) as DebateMysteryCaseBibleV1;
  return {
    ...parsed,
    inventoryItems: Array.isArray(parsed.inventoryItems) ? parsed.inventoryItems : [],
    accessLocks: Array.isArray(parsed.accessLocks) ? parsed.accessLocks : [],
    activeRegions: parsed.activeRegions.map((outcome) => ({
      ...outcome,
      inventoryItemId: outcome.inventoryItemId ?? null,
    })),
  };
}

function storeCaseBible(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  bible: DebateMysteryCaseBibleV1,
): void {
  const now = new Date().toISOString();
  const privateJson = JSON.stringify(bible);
  db.prepare(
    `INSERT INTO debate_mystery_cases
       (session_id, user_id, schema_version, generator_version, private_json, content_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       private_json = excluded.private_json,
       content_hash = excluded.content_hash,
       updated_at = excluded.updated_at
     WHERE debate_mystery_cases.user_id = excluded.user_id`,
  ).run(sessionId, userId, bible.version, bible.generatorVersion, privateJson, sha256(privateJson), now, now);
}

/** Attaches presentation-only generated art after compilation. Hidden rooms and
 * undiscovered clues remain private; the public projection gains an image only
 * when that record is already discoverable. */
export function attachDebateMysteryGeneratedAssets(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  assets: {
    roomImageByTemplateId?: Record<string, string>;
    evidenceImageById?: Record<string, string>;
  },
): DebateSessionV1 {
  const session = getDebateSession(db, userId, sessionId);
  const state = requireMysteryState(session);
  const bible = getDebateMysteryCaseBible(db, userId, sessionId);
  const roomImages = assets.roomImageByTemplateId ?? {};
  const evidenceImages = assets.evidenceImageById ?? {};
  const imageIds = [...new Set([...Object.values(roomImages), ...Object.values(evidenceImages)].filter(Boolean))];
  if (imageIds.length === 0) return session;
  const owned = new Set(
    (db.prepare(
      `SELECT id FROM images WHERE user_id = ? AND id IN (${imageIds.map(() => "?").join(", ")})`,
    ).all(userId, ...imageIds) as unknown as Array<{ id: string }>).map((row) => row.id),
  );
  if (owned.size !== imageIds.length) throw new HttpError(404, "One or more mystery images were not found in this Library.");
  const nextBible: DebateMysteryCaseBibleV1 = {
    ...bible,
    rooms: bible.rooms.map((room) => ({
      ...room,
      imageId: roomImages[room.templateId] ?? room.imageId,
    })),
    evidence: bible.evidence.map((item) => ({
      ...item,
      imageId: evidenceImages[item.id] ?? item.imageId,
    })),
  };
  const nextState: DebateWhodunnitFormatStateV1 = {
    ...state,
    rooms: state.rooms.map((room) => {
      if (!room.discovered || !room.templateId) return room;
      return { ...room, imageId: roomImages[room.templateId] ?? room.imageId };
    }),
    discoveredEvidence: state.discoveredEvidence.map((item) => ({
      ...item,
      imageId: evidenceImages[item.id] ?? item.imageId,
    })),
  };
  storeCaseBible(db, userId, sessionId, nextBible);
  return persistMysterySession(db, userId, { ...session, formatState: nextState }, session.revision);
}

function setCompileStage(
  db: DatabaseSync,
  userId: string,
  session: DebateSessionV1,
  stage: DebateWhodunnitFormatStateV1["compileStage"],
): DebateSessionV1 {
  const state = session.formatState.format === "whodunnit" ? session.formatState : null;
  if (!state) return session;
  return persistMysterySession(db, userId, {
    ...session,
    status: stage === "failed" ? "failed" : "live",
    stepKey: stage === "complete" ? "mystery_arrival" : `mystery_${stage}`,
    formatState: { ...state, compileStage: stage },
  }, session.revision);
}

async function authorCaseProse(
  bible: DebateMysteryCaseBibleV1,
  botRows: MysteryBotRow[],
  runtime: DebateAiRuntime,
): Promise<DebateMysteryCaseBibleV1> {
  const lane = mysteryLane(runtime);
  const ensemble = botRows.map((bot, index) => ({
    seatId: `suspect-${index + 1}`,
    name: bot.name,
    fictionalRoleProfile: bot.system_prompt.slice(0, 1_800),
  }));
  const structure = {
    title: bible.title,
    victim: bible.victim,
    culpritSeatId: bible.culpritSeatId,
    accompliceSeatId: bible.accompliceSeatId,
    motive: bible.motive,
    method: bible.method,
    timeline: bible.timeline,
    ensemble,
    rooms: bible.rooms.map((room) => ({ id: room.id, templateId: room.templateId, kind: room.kind, suspectSeatId: room.assignedSuspectSeatId })),
    activeRegions: bible.activeRegions
      .filter((outcome) => outcome.kind !== "empty")
      .map((outcome) => ({ roomId: outcome.roomId, regionId: outcome.regionId, kind: outcome.kind, hidingMechanism: outcome.hidingMechanism })),
    evidence: bible.evidence.map((item) => ({
      id: item.id,
      adjective: item.adjective,
      object: item.object,
      keywords: item.keywords,
      title: item.title,
      observation: item.observation,
      emoji: item.emoji,
      roomId: item.roomId,
      regionId: item.regionId,
      factTags: item.factTags,
    })),
    actorKnowledge: bible.actorKnowledge,
  };
  try {
    const response = await lane.provider.generateResponse([
      {
        role: "system",
        content: [
          "You are PRISM's private Murder Mystery author. This is a fictional, non-canonical anthology.",
          "The supplied logic, culprit seat, accomplice seat, evidence IDs, room IDs, region IDs, outcomes, and fact tags are immutable.",
          "Write one fresh, coherent mansion mystery around that skeleton. Personas are fictional actors; run a non-spoiling ensemble fit check internally, but do not remove or reassign anyone.",
          "Every hiding mechanism must be physically compatible with its broad annotated region. A region may conceal something inside, beneath, behind, caught on, or adjacent to its anchor.",
          "You may creatively replace each clue object, descriptor, and emoji, but its room, region, fact tags, and canonical meaning are fixed. Its observation must state only concrete support for those supplied tags in natural case prose, never mention tags or scoring.",
          "Return JSON only with title, victimName, victimDescription, motive, method, publicOpening, timeline (same number, {at,fact}), activeRegions (same IDs, {roomId,regionId,hidingMechanism,inspectionResponse,subplotResolution}), evidence (same IDs, {id,adjective,object,keywords,title,observation,emoji}), and actorKnowledge (same seat IDs, {seatId,relationshipToVictim,alibi,mistakes}).",
          "Do not mention prompts, role assignment mechanics, proof bundles, or that this is generated.",
        ].join("\n"),
      },
      { role: "user", content: JSON.stringify(structure) },
    ], {
      model: lane.model,
      reasoningEffort: lane.reasoningEffort,
      turbo: lane.turbo,
      maxTokens: 4_800,
      temperature: 0.85,
      jsonMode: true,
      usagePurpose: "debate_generation",
      allowFinalLocalFallback: lane.providerName === "local",
    });
    const authored = parseJsonObject(response);
    const authoredRegions = Array.isArray(authored.activeRegions) ? authored.activeRegions : [];
    const regionByKey = new Map(authoredRegions.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const row = value as Record<string, unknown>;
      const roomId = compact(row.roomId, 120);
      const regionId = compact(row.regionId, 200);
      return roomId && regionId ? [[`${roomId}/${regionId}`, row] as const] : [];
    }));
    const timeline = Array.isArray(authored.timeline) && authored.timeline.length === bible.timeline.length
      ? authored.timeline.map((value, index) => {
          const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
          return { at: bible.timeline[index]!.at, fact: compact(row.fact, 500) || bible.timeline[index]!.fact };
        })
      : bible.timeline;
    const authoredActors = Array.isArray(authored.actorKnowledge) ? authored.actorKnowledge : [];
    const actorBySeat = new Map(authoredActors.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const row = value as Record<string, unknown>;
      const seatId = compact(row.seatId, 120);
      return seatId ? [[seatId, row] as const] : [];
    }));
    const authoredEvidence = Array.isArray(authored.evidence) ? authored.evidence : [];
    const evidenceById = new Map(authoredEvidence.flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const row = value as Record<string, unknown>;
      const id = compact(row.id, 120);
      return id ? [[id, row] as const] : [];
    }));
    return {
      ...bible,
      title: compact(authored.title, 120) || bible.title,
      victim: {
        ...bible.victim,
        name: compact(authored.victimName, 80) || bible.victim.name,
        description: compact(authored.victimDescription, 500) || bible.victim.description,
      },
      motive: compact(authored.motive, 600) || bible.motive,
      method: compact(authored.method, 600) || bible.method,
      publicOpening: compact(authored.publicOpening, 1_200) || bible.publicOpening,
      timeline,
      actorKnowledge: bible.actorKnowledge.map((knowledge) => {
        const authoredKnowledge = actorBySeat.get(knowledge.seatId);
        const mistakes = Array.isArray(authoredKnowledge?.mistakes)
          ? authoredKnowledge.mistakes.map((value) => compact(value, 500)).filter(Boolean).slice(0, 4)
          : knowledge.mistakes;
        return authoredKnowledge ? {
          ...knowledge,
          relationshipToVictim: compact(authoredKnowledge.relationshipToVictim, 600) || knowledge.relationshipToVictim,
          alibi: compact(authoredKnowledge.alibi, 800) || knowledge.alibi,
          mistakes: mistakes.length ? mistakes : knowledge.mistakes,
        } : knowledge;
      }),
      evidence: bible.evidence.map((evidence) => {
        const authoredItem = evidenceById.get(evidence.id);
        if (!authoredItem) return evidence;
        const adjective = compact(authoredItem.adjective, 80) || evidence.adjective;
        const object = compact(authoredItem.object, 120) || evidence.object;
        const keywords = Array.isArray(authoredItem.keywords)
          ? authoredItem.keywords.map((value) => compact(value, 80)).filter(Boolean).slice(0, 16)
          : evidence.keywords;
        const rawTitle = compact(authoredItem.title, 160) || `${adjective} ${object}`;
        const cleanedTitle = rawTitle.replace(/^recovered\s+(?:a|an|the)\s+/iu, "").trim() || rawTitle;
        const title = `${cleanedTitle[0]?.toLocaleUpperCase() ?? ""}${cleanedTitle.slice(1)}`;
        const rawObservation = compact(authoredItem.observation, 1_200) || evidence.observation;
        const observation = rawObservation.replace(/^The recovered\s+(?:a|an|the)\s+/iu, "The ");
        const authoredEmoji = compact(authoredItem.emoji, 16) || evidence.emoji;
        const semanticLabel = `${title} ${object} ${keywords.join(" ")}`.toLocaleLowerCase();
        const emoji = semanticLabel.includes("letter opener")
          ? "🗡️"
          : /\b(?:gun|pistol|revolver|firearm)\b/u.test(semanticLabel)
            ? "🔫"
            : /\b(?:knife|dagger|blade)\b/u.test(semanticLabel)
              ? "🔪"
              : /\b(?:poison|toxin|venom|chemical)\b/u.test(semanticLabel)
                ? "🧪"
                : authoredEmoji;
        return {
          ...evidence,
          adjective,
          object,
          keywords: keywords.length ? keywords : evidence.keywords,
          title,
          observation,
          emoji,
        };
      }),
      activeRegions: bible.activeRegions.map((outcome) => {
        const authoredOutcome = regionByKey.get(`${outcome.roomId}/${outcome.regionId}`);
        return authoredOutcome ? {
          ...outcome,
          hidingMechanism: compact(authoredOutcome.hidingMechanism, 500) || outcome.hidingMechanism,
          inspectionResponse: compact(authoredOutcome.inspectionResponse, 1_000) || outcome.inspectionResponse,
          subplotResolution: outcome.kind === "subplot" ? compact(authoredOutcome.subplotResolution, 800) || outcome.subplotResolution : null,
        } : outcome;
      }),
      fallbackProseUsed: false,
    };
  } catch {
    return bible;
  }
}

const MYSTERY_ROOM_TEXTURE_BATCH_SIZE = 4;
const MYSTERY_ROOM_TEXTURE_BANNED_FACTS =
  /\b(?:alibi|blood|clue|culprit|evidence|fingerprints?|footprints?|guilt|killer|murderer|poison|suspect|victim|weapon)\b/iu;

function safeMysteryRoomTexture(value: unknown): string {
  const observation = compact(value, 320);
  if (observation.length < 24 || MYSTERY_ROOM_TEXTURE_BANNED_FACTS.test(observation)) return "";
  return observation;
}

/**
 * Give outcome-neutral room clicks their own authoring budget during the
 * existing loader. This pass never receives culprit, evidence, testimony, or
 * proof data, so it can add sensory specificity without inventing case facts.
 */
async function authorMysteryRoomTexture(
  bible: DebateMysteryCaseBibleV1,
  runtime: DebateAiRuntime,
): Promise<DebateMysteryCaseBibleV1> {
  const emptyOutcomes = bible.activeRegions.filter((outcome) => outcome.kind === "empty");
  if (emptyOutcomes.length === 0) return bible;
  const lane = mysteryLane(runtime);
  const roomIds = bible.rooms
    .filter((room) => emptyOutcomes.some((outcome) => outcome.roomId === room.id))
    .map((room) => room.id);
  const authoredByKey = new Map<string, string>();
  const usedObservations = new Set<string>();

  for (let offset = 0; offset < roomIds.length; offset += MYSTERY_ROOM_TEXTURE_BATCH_SIZE) {
    const batchRoomIds = new Set(roomIds.slice(offset, offset + MYSTERY_ROOM_TEXTURE_BATCH_SIZE));
    const regions = emptyOutcomes.flatMap((outcome) => {
      if (!batchRoomIds.has(outcome.roomId)) return [];
      const room = bible.rooms.find((candidate) => candidate.id === outcome.roomId);
      const template = DEBATE_MYSTERY_ROOM_TEMPLATES.find((candidate) => candidate.id === room?.templateId);
      const region = template?.regions.find((candidate) => candidate.id === outcome.regionId);
      if (!room || !template || !region) return [];
      return [{
        roomId: room.id,
        roomName: template.name,
        regionId: region.id,
        label: region.label,
        physicalAnchor: region.physicalAnchor,
      }];
    });
    if (regions.length === 0) continue;
    try {
      const response = await lane.provider.generateResponse([
        {
          role: "system",
          content: [
            "You are PRISM's Murder Mystery room-observation stylist.",
            "The supplied regions are deliberately outcome-neutral: none contains a clue, access item, subplot, or hidden case fact.",
            "Write one vivid inspection observation per exact roomId/regionId pair, grounded only in that physical anchor.",
            "Use 12-32 words and one or two sentences. Vary the dominant sense and physical action across the batch: light, texture, temperature, sound, scent, reflection, pressure, or material behavior.",
            "Make ordinary spaces rewarding to inspect without implying importance. Never introduce a person, named object, timestamp, crime fact, secret compartment, or actionable lead.",
            "Avoid stock conclusions such as 'worth a closer look', 'nothing out of the ordinary', 'only what it appears to be', and 'old dust and ordinary wear'.",
            "Return JSON only as {\"observations\":[{\"roomId\":string,\"regionId\":string,\"observation\":string}]}. Preserve every supplied ID exactly and return each pair once.",
          ].join("\n"),
        },
        {
          role: "user",
          content: JSON.stringify({
            caseTitle: bible.title,
            regions,
          }),
        },
      ], {
        model: lane.model,
        reasoningEffort: lane.reasoningEffort,
        turbo: lane.turbo,
        maxTokens: Math.min(4_800, 800 + regions.length * 42),
        temperature: 0.92,
        jsonMode: true,
        usagePurpose: "debate_generation",
        allowFinalLocalFallback: lane.providerName === "local",
      });
      const authored = parseJsonObject(response);
      const allowedKeys = new Set(regions.map((region) => `${region.roomId}/${region.regionId}`));
      const rows = Array.isArray(authored.observations) ? authored.observations : [];
      for (const value of rows) {
        if (!value || typeof value !== "object") continue;
        const row = value as Record<string, unknown>;
        const roomId = compact(row.roomId, 120);
        const regionId = compact(row.regionId, 200);
        const key = `${roomId}/${regionId}`;
        const observation = safeMysteryRoomTexture(row.observation);
        const normalizedObservation = observation.toLocaleLowerCase();
        if (!allowedKeys.has(key) || !observation || usedObservations.has(normalizedObservation)) continue;
        authoredByKey.set(key, observation);
        usedObservations.add(normalizedObservation);
      }
    } catch {
      // The deterministic material-aware prose remains playable when a model
      // cannot produce a complete, safe batch.
    }
  }

  if (authoredByKey.size === 0) return bible;
  return {
    ...bible,
    activeRegions: bible.activeRegions.map((outcome) => {
      if (outcome.kind !== "empty") return outcome;
      const observation = authoredByKey.get(`${outcome.roomId}/${outcome.regionId}`);
      return observation ? { ...outcome, inspectionResponse: observation } : outcome;
    }),
  };
}

function createInitialNotebook(db: DatabaseSync, userId: string, sessionId: string): DebateMysteryNotebookV1 {
  const now = new Date().toISOString();
  const notebook: DebateMysteryNotebookV1 = {
    version: 1,
    sessionId,
    revision: 1,
    pages: [{ id: randomUUID(), title: "Case Notes", blocks: [], createdAt: now, updatedAt: now }],
    createdAt: now,
    updatedAt: now,
  };
  const documentJson = JSON.stringify(notebook);
  db.prepare(
    `INSERT OR IGNORE INTO debate_mystery_notebooks
       (session_id, user_id, revision, document_json, pending_proposal_json, created_at, updated_at)
     VALUES (?, ?, 1, ?, NULL, ?, ?)`,
  ).run(sessionId, userId, documentJson, now, now);
  db.prepare(
    `INSERT OR IGNORE INTO debate_mystery_notebook_revisions
       (id, user_id, session_id, revision, document_json, reason, idempotency_key, created_at)
     VALUES (?, ?, ?, 1, ?, 'import', ?, ?)`,
  ).run(randomUUID(), userId, sessionId, documentJson, `initial:${sessionId}`, now);
  return getDebateMysteryNotebook(db, userId, sessionId).notebook;
}

export async function createDebateMysterySession(
  db: DatabaseSync,
  userId: string,
  configInput: DebateWhodunnitCreateConfigV1,
  idempotencyKeyInput: unknown,
  runtime: DebateAiRuntime,
): Promise<DebateSessionV1> {
  const idempotencyKey = normalizeDebateIdempotencyKey(idempotencyKeyInput);
  if (!idempotencyKey) throw new HttpError(400, "A stable idempotency key is required.");
  let config: DebateMysteryResolvedConfigV1;
  try { config = resolveDebateMysteryConfig(configInput); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "Invalid mystery setup."); }
  const allBotIds = [...config.suspectBotIds, config.prosecutorPartnerBotId, config.rivalDefenseBotId];
  const bots = mysteryBotRows(db, userId, allBotIds);
  if (bots.length !== allBotIds.length) throw new HttpError(404, "One or more selected cast bots were not found.");
  const request = mysterySessionRequest(config, configInput, idempotencyKey);
  let session = createDebateSession(db, userId, request, runtime);
  const powerPlan = debatePowerPlanForBots(
    db,
    userId,
    [session.moderator.id, ...allBotIds],
    "dark",
  );
  const existingCase = privateCaseRow(db, userId, session.id);
  if (existingCase) return getDebateSession(db, userId, session.id);
  session = persistMysterySession(db, userId, {
    ...session,
    powerPlan,
    status: "live",
    stepKey: "mystery_casting",
    error: null,
    formatState: session.formatState.format === "whodunnit" ? {
      ...session.formatState,
      compileStage: "casting",
      playPhase: "compiling",
      config,
      recipeSeed: debateMysteryRecipeSeed(config),
    } : session.formatState,
  }, session.revision);
  try {
    const suspectRows = config.suspectBotIds.map((id) => bots.find((bot) => bot.id === id)!);
    await completeMysteryEnsembleReadiness(suspectRows, runtime);
    session = setCompileStage(db, userId, session, "building_mansion");
    let bible = compileDeterministicDebateMystery({
      config,
      suspects: suspectRows.map((bot) => ({ botId: bot.id, exportHash: bot.export_hash, name: bot.name, color: bot.color, glyph: bot.glyph })),
    });
    session = setCompileStage(db, userId, session, "writing_alibis");
    bible = await authorCaseProse(bible, suspectRows, runtime);
    session = setCompileStage(db, userId, session, "hiding_evidence");
    let validation = validateDebateMysteryCaseBible(bible, config.actionBudget);
    for (let repairAttempt = 0; repairAttempt < 2 && !validation.valid; repairAttempt += 1) {
      const repairSkeleton = compileDeterministicDebateMystery({
        config,
        suspects: suspectRows.map((bot) => ({ botId: bot.id, exportHash: bot.export_hash, name: bot.name, color: bot.color, glyph: bot.glyph })),
      });
      bible = await authorCaseProse(repairSkeleton, suspectRows, runtime);
      validation = validateDebateMysteryCaseBible(bible, config.actionBudget);
    }
    // Structural repair is deliberately deterministic. The model may dress the
    // case, but it never earns authority to change truth or solvability.
    if (!validation.valid) {
      bible = compileDeterministicDebateMystery({
        config,
        suspects: suspectRows.map((bot) => ({ botId: bot.id, exportHash: bot.export_hash, name: bot.name, color: bot.color, glyph: bot.glyph })),
      });
      const repaired = validateDebateMysteryCaseBible(bible, config.actionBudget);
      if (!repaired.valid) throw new Error(repaired.errors.join("; "));
    }
    bible = resolveDebateMysteryEvidenceVisuals(
      bible,
      mysteryExhibitLibrary(db, userId),
    );
    session = setCompileStage(db, userId, session, "testing_theories");
    session = setCompileStage(db, userId, session, "preparing_rooms");
    bible = await authorMysteryRoomTexture(bible, runtime);
    storeCaseBible(db, userId, session.id, bible);
    createInitialNotebook(db, userId, session.id);
    const publicState = projectDebateMysteryCase(bible, config);
    appendAutomaticNotebookReferences(
      db,
      userId,
      session.id,
      publicState.discoveredEvidence.map((item) => ({
        kind: "evidence" as const,
        id: item.id,
        label: `${item.title}: ${item.observation}`,
      })),
    );
    const compiled: DebateSessionV1 = {
      ...session,
      status: "waiting_for_player",
      phase: "challenge",
      stepKey: "mystery_investigation",
      playerRole: "investigator",
      moderatorTitle: "PRISM · Judge & Casekeeper",
      moderator: {
        ...session.moderator,
        name: "PRISM",
        systemPrompt: "You are PRISM, the neutral Judge and server-side Casekeeper. Never expose hidden case truth. Rule only from deterministic validation and phrase that ruling clearly.",
      },
      formatState: publicState,
    };
    return persistMysterySession(db, userId, compiled, session.revision);
  } catch (error) {
    const failed = {
      ...session,
      status: "failed" as const,
      stepKey: "mystery_failed",
      error: error instanceof Error ? error.message : "Mystery compilation failed.",
      formatState: session.formatState.format === "whodunnit" ? { ...session.formatState, compileStage: "failed" as const, playPhase: "compiling" as const } : session.formatState,
    };
    persistMysterySession(db, userId, failed, session.revision);
    throw error;
  }
}

export async function resumeDebateMysteryCompilation(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  runtime: DebateAiRuntime,
): Promise<DebateSessionV1> {
  const session = getDebateSession(db, userId, sessionId);
  const state = requireMysteryState(session);
  if (privateCaseRow(db, userId, sessionId)) return session;
  if (state.config.suspectBotIds.length < 4) throw new HttpError(409, "This interrupted case predates resumable compilation.");
  const row = db.prepare(
    "SELECT create_idempotency_key FROM debate_sessions WHERE id = ? AND user_id = ?",
  ).get(sessionId, userId) as { create_idempotency_key?: string } | undefined;
  const idempotencyKey = row?.create_idempotency_key?.trim();
  if (!idempotencyKey) throw new HttpError(409, "This interrupted case has no durable compilation key.");
  const source: DebateWhodunnitCreateConfigV1 = {
    version: 1,
    preset: state.config.preset,
    difficulty: state.config.difficulty,
    artMode: state.config.artMode,
    inspiration: state.config.inspiration,
    nonce: state.config.nonce,
    floors: state.config.floors,
    totalRooms: state.config.totalRooms,
    suspectBotIds: state.config.suspectBotIds,
    prosecutorPartnerBotId: state.config.prosecutorPartnerBotId,
    rivalDefenseBotId: state.config.rivalDefenseBotId,
  };
  return createDebateMysterySession(db, userId, source, idempotencyKey, runtime);
}

function requireMysteryState(session: DebateSessionV1): DebateWhodunnitFormatStateV1 {
  if (session.format !== "whodunnit" || session.formatState.format !== "whodunnit") throw new HttpError(409, "This Debate is not a Whodunnit case.");
  return normalizeDebateMysteryFormatStateV1(session.formatState);
}

function appendMysteryAction(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  actionKind: string,
  publicPayload: Record<string, unknown>,
): void {
  const next = db.prepare(
    `SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
       FROM debate_mystery_actions WHERE user_id = ? AND session_id = ?`,
  ).get(userId, sessionId) as { sequence: number };
  db.prepare(
    `INSERT INTO debate_mystery_actions
       (id, user_id, session_id, sequence, action_kind, public_payload_json, occurred_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), userId, sessionId, next.sequence, actionKind, JSON.stringify(publicPayload), new Date().toISOString());
}

function replayMysteryMutation(db: DatabaseSync, userId: string, sessionId: string, key: string): DebateSessionV1 | null {
  const row = db.prepare(
    `SELECT response_json FROM debate_mutations WHERE user_id = ? AND session_id = ? AND idempotency_key = ?`,
  ).get(userId, sessionId, key) as { response_json?: string } | undefined;
  return row?.response_json ? JSON.parse(row.response_json) as DebateSessionV1 : null;
}

/** Server-owned discovery writes durable notebook chips once. The references
 * are intentionally the only payload: private relevance and model prose stay
 * outside the notebook until the investigator authors them. */
function appendAutomaticNotebookReferences(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  references: Array<{ kind: "evidence" | "testimony"; id: string; label: string }>,
): void {
  if (references.length === 0) return;
  const record = getDebateMysteryNotebook(db, userId, sessionId).notebook;
  const existing = new Set(record.pages.flatMap((page) => page.blocks
    .filter((block) => block.kind === "reference")
    .map((block) => `${block.referenceKind}:${block.referenceId}`)));
  const additions = references.filter((reference) => !existing.has(`${reference.kind}:${reference.id}`));
  if (additions.length === 0) return;
  const now = new Date().toISOString();
  const page = record.pages[0];
  if (!page) return;
  const pages = record.pages.map((candidate) => candidate.id === page.id ? {
    ...candidate,
    updatedAt: now,
    blocks: [...candidate.blocks, ...additions.map((reference) => ({
      id: randomUUID(),
      kind: "reference" as const,
      text: `[[${reference.kind}:${reference.id}]] ${reference.label}`,
      referenceKind: reference.kind,
      referenceId: reference.id,
    }))],
  } : candidate);
  const next = { ...record, revision: record.revision + 1, pages, updatedAt: now };
  db.prepare(
    `UPDATE debate_mystery_notebooks
        SET revision = ?, document_json = ?, pending_proposal_json = NULL, updated_at = ?
      WHERE session_id = ? AND user_id = ? AND revision = ?`,
  ).run(next.revision, JSON.stringify(next), now, sessionId, userId, record.revision);
  db.prepare(
    `INSERT INTO debate_mystery_notebook_revisions
       (id, user_id, session_id, revision, document_json, reason, idempotency_key, created_at)
     VALUES (?, ?, ?, ?, ?, 'import', ?, ?)`,
  ).run(randomUUID(), userId, sessionId, next.revision, JSON.stringify(next), `automatic:${sessionId}:${next.revision}`, now);
}

function recordMysteryMutation(
  db: DatabaseSync,
  userId: string,
  prior: DebateSessionV1,
  next: DebateSessionV1,
  key: string,
): void {
  db.prepare(
    `INSERT INTO debate_mutations
       (user_id, session_id, idempotency_key, expected_revision, result_revision, response_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(userId, prior.id, key, prior.revision, next.revision, JSON.stringify(next), new Date().toISOString());
}

async function projectedActorReply(args: {
  bible: DebateMysteryCaseBibleV1;
  state: DebateWhodunnitFormatStateV1;
  seatId: string;
  question: string;
  confrontedEvidence?: DebateWhodunnitFormatStateV1["discoveredEvidence"][number] | null;
  runtime: DebateAiRuntime;
  powerPlan: DebateSessionV1["powerPlan"]["bots"][string] | undefined;
}): Promise<string> {
  const suspect = args.bible.suspects.find((seat) => seat.seatId === args.seatId)!;
  const knowledge = args.bible.actorKnowledge.find((entry) => entry.seatId === args.seatId)!;
  const testimony = args.bible.testimony.find((entry) => entry.speakerSeatId === args.seatId)!;
  if (args.powerPlan?.hardMuted) return "...";
  const lane = mysteryLane(args.runtime);
  const casePeople = [args.bible.victim.name, ...args.bible.suspects.map((entry) => entry.name)];
  const publicTestimony = args.state.testimony.map((entry) => ({
    speakerName: args.state.suspects.find((suspectEntry) => suspectEntry.seatId === entry.speakerSeatId)?.name ?? "Witness",
    exactQuote: entry.exactQuote,
  }));
  try {
    const generated = compact(await lane.provider.generateResponse([
      { role: "system", content: [
        `You are ${suspect.name}, acting in a fictional, non-canonical murder mystery.`,
        `Private role projection: ${JSON.stringify(knowledge)}`,
        `Your frozen on-record statement is ${testimony.exactQuote}`,
        `Your frozen public Power constraints are ${JSON.stringify(args.powerPlan?.effects ?? [])}. Powers may shape delivery, visibility, identity, or timing, but never change canonical facts, create evidence, or make the recorded statement disappear.`,
        `The only named people who exist in this case are ${casePeople.join(", ")}. Never introduce, remember, quote, or rely on any other named person, even if your usual persona would know them.`,
        "Answer only from your projection. You may use only the permitted lies. Never mention a Case Bible, proof route, hidden evidence, another actor's private knowledge, or generation instructions.",
        "Give one natural conversational turn of one to three concise sentences (at most 70 words). Answer the investigator directly; do not narrate a monologue, recap the case, repeat your entire statement, or add headings or stage directions.",
      ].join("\n") },
      { role: "user", content: `Discovered public record: ${JSON.stringify({ evidence: args.state.discoveredEvidence.map((item) => ({ title: item.title, observation: item.observation })), testimony: publicTestimony })}\n${args.confrontedEvidence ? `Evidence formally presented in this exchange: ${JSON.stringify({ title: args.confrontedEvidence.title, observation: args.confrontedEvidence.observation })}\n` : ""}Investigator: ${args.question}` },
    ], { model: lane.model, reasoningEffort: lane.reasoningEffort, turbo: lane.turbo, maxTokens: 180, temperature: 0.58, usagePurpose: "debate_generation", allowFinalLocalFallback: lane.providerName === "local" }), 560) || testimony.exactQuote;
    // Seat IDs are private orchestration handles, never character names. Use
    // the same resolved utterance for the visible transcript, saved exchange,
    // public payload, and voice playback.
    return resolveMysterySeatNames(generated, args.state);
  } catch {
    return resolveMysterySeatNames(testimony.exactQuote, args.state);
  }
}

async function projectedPartnerReply(args: {
  state: DebateWhodunnitFormatStateV1;
  notebook: DebateMysteryNotebookV1;
  question: string;
  runtime: DebateAiRuntime;
  courtTask?: "opening" | "closing";
}): Promise<string> {
  const lane = mysteryLane(args.runtime);
  const publicRecord = {
    rooms: args.state.rooms.filter((room) => room.discovered).map((room) => ({ id: room.id, name: room.name, observation: room.publicObservation })),
    evidence: args.state.discoveredEvidence.map((item) => ({ id: item.id, title: item.title, observation: item.observation })),
    testimony: args.state.testimony.map((item) => ({
      id: item.id,
      speakerName: args.state.suspects.find((suspect) => suspect.seatId === item.speakerSeatId)?.name ?? "Witness",
      exactQuote: item.exactQuote,
    })),
    leads: args.state.leads.map((lead) => ({
      id: lead.id,
      title: lead.title,
      status: lead.status,
      revision: lead.revision,
      summary: lead.summary,
      linkedRoomIds: lead.linkedRoomIds,
      linkedEvidenceIds: lead.linkedEvidenceIds,
      linkedTestimonyIds: lead.linkedTestimonyIds,
    })),
    notebook: args.notebook.pages,
  };
  try {
    const courtDirection = args.courtTask
      ? [
          `Deliver the prosecution ${args.courtTask} as one spoken paragraph of 50 to 90 words.`,
          "Address PRISM as Judge. There is no jury. Never say 'ladies and gentlemen' or refer to jurors.",
          "Use no Markdown, headings, bullets, checklist, follow-up question, or analysis preamble. Sound decisive but do not claim anything outside the filed theory and admitted record.",
        ].join("\n")
      : [
          "Format for a narrow co-counsel rail: short paragraphs and concise Markdown bullets are welcome, but do not use headings, tables, or links.",
          "Stay under 220 words. Prefer two or three concrete bullets and one recommended next question over a long case recap.",
        ].join("\n");
    const answer = (args.courtTask ? compact : compactMarkdown)(await lane.provider.generateResponse([
      { role: "system", content: [
        "You are the investigator's prosecutor partner. You can read only this discovered public record and the investigator's fallible notebook. Offer analysis, questions, and uncertainty; never invent evidence, canonize notes, infer hidden case state, or claim access to a Case Bible.",
        "Use the suspects' actual display names, never seat labels such as Suspect-1.",
        "Treat every timestamp and quotation as exact. Never merge two witnesses' times, attribute one witness's words to another, or paraphrase a statement as a stronger fact. Separate documented fact from inference explicitly, and say when the record does not establish something.",
        courtDirection,
        args.state.config.difficulty === "casual"
          ? "Casual case: make the strongest next public lead clear and concrete."
          : args.state.config.difficulty === "mastermind"
            ? "Mastermind case: stay subtle, point to tensions without naming the deduction, and let the investigator connect them."
            : "Classic case: identify a useful next question without resolving the theory for the investigator.",
      ].join("\n") },
      { role: "user", content: `${JSON.stringify(publicRecord)}\nInvestigator asks: ${args.question}` },
    ], { model: lane.model, reasoningEffort: lane.reasoningEffort, turbo: lane.turbo, maxTokens: args.courtTask ? 220 : 420, temperature: 0.2, usagePurpose: "debate_generation", allowFinalLocalFallback: lane.providerName === "local" }), args.courtTask ? 700 : 1_200) || "I can only work from what we have actually discovered.";
    return resolveMysterySeatNames(answer, args.state);
  } catch {
    return "I can only work from what we have actually discovered. The notebook is our working theory, not evidence.";
  }
}

async function projectedDefenseReply(args: {
  state: DebateWhodunnitFormatStateV1;
  theory: DebateWhodunnitFormatStateV1["theory"];
  task: "opening" | "closing";
  runtime: DebateAiRuntime;
}): Promise<string> {
  const lane = mysteryLane(args.runtime);
  const admissibleRecord = {
    theory: args.theory,
    rooms: args.state.rooms
      .filter((room) => room.discovered)
      .map((room) => ({ id: room.id, name: room.name, observation: room.publicObservation })),
    evidence: args.state.discoveredEvidence.map((item) => ({
      id: item.id,
      title: item.title,
      observation: item.observation,
    })),
    testimony: args.state.testimony,
    sustainedTestimonyIds: args.state.court?.sustainedTestimonyIds ?? [],
  };
  try {
    return compact(
      await lane.provider.generateResponse(
        [
          {
            role: "system",
            content: [
              "You are rival defense counsel in a fictional, non-canonical murder trial. You receive only the admissible public record. Give the strongest supported alternative or reasonable-doubt argument without inventing facts, evidence, witnesses, hidden case state, or notebook content. Never claim access to the Case Bible.",
              `Deliver this ${args.task} as one spoken paragraph of 50 to 90 words. Address PRISM as Judge. There is no jury: never say 'ladies and gentlemen,' mention jurors, or appeal to a jury.`,
              "Use no Markdown, headings, bullets, stage directions, or legal-analysis preamble. Be sharp, theatrical, and grounded only in the record.",
            ].join("\n"),
          },
          {
            role: "user",
            content: `${args.task.toUpperCase()} TASK\n${JSON.stringify(admissibleRecord)}`,
          },
        ],
        {
          model: lane.model,
          reasoningEffort: lane.reasoningEffort,
          turbo: lane.turbo,
          maxTokens: 240,
          temperature: 0.45,
          usagePurpose: "debate_generation",
          allowFinalLocalFallback: lane.providerName === "local",
        },
      ),
      800,
    ) || "The defense asks PRISM to judge only what this admissible record actually proves.";
  } catch {
    return "The defense asks PRISM to judge only what this admissible record actually proves.";
  }
}

async function appendMysteryCourtCounselBeat(args: {
  db: DatabaseSync;
  userId: string;
  sessionId: string;
  state: DebateWhodunnitFormatStateV1;
  task: "opening" | "closing";
  runtime: DebateAiRuntime;
}): Promise<void> {
  const notebook = getDebateMysteryNotebook(
    args.db,
    args.userId,
    args.sessionId,
  ).notebook;
  const partner = await projectedPartnerReply({
    state: args.state,
    notebook,
    question:
      args.task === "opening"
        ? "Deliver a concise prosecution opening from the filed theory and discovered record. Treat notebook claims as fallible and identify what the court must test."
        : "Deliver a concise prosecution closing from the filed theory, discovered record, and sustained courtroom contradictions. Do not claim facts that were not admitted.",
    runtime: args.runtime,
    courtTask: args.task,
  });
  const defense = await projectedDefenseReply({
    state: args.state,
    theory: args.state.theory,
    task: args.task,
    runtime: args.runtime,
  });
  args.state.partnerJournal.push(`Prosecution: ${partner}`);
  args.state.partnerJournal.push(`Defense: ${defense}`);
}

async function projectedJudgeRuling(args: {
  ruling: "sustained" | "overruled";
  testimony: { id: string; exactQuote: string };
  evidence: { id: string; title: string; observation: string };
  runtime: DebateAiRuntime;
}): Promise<string> {
  const lane = mysteryLane(args.runtime);
  const fallback = args.ruling === "sustained"
    ? "Sustained. The contradiction is established by the admissible record."
    : "Overruled. Those two record items do not form a canonical contradiction.";
  try {
    return compact(
      await lane.provider.generateResponse(
        [
          {
            role: "system",
            content:
              "You are PRISM, the neutral Judge. The deterministic Casekeeper has already locked the ruling supplied below. Phrase that exact ruling in one concise courtroom sentence using only the quoted testimony and canonical evidence observation. Never change, hedge, or reconsider the ruling; never add facts or mention hidden logic.",
          },
          {
            role: "user",
            content: JSON.stringify({
              lockedRuling: args.ruling,
              testimony: args.testimony,
              evidence: args.evidence,
            }),
          },
        ],
        {
          model: lane.model,
          reasoningEffort: lane.reasoningEffort,
          turbo: lane.turbo,
          maxTokens: 240,
          temperature: 0.25,
          usagePurpose: "debate_generation",
          allowFinalLocalFallback: lane.providerName === "local",
        },
      ),
      700,
    ) || fallback;
  } catch {
    return fallback;
  }
}

function nextCourtTestimony(state: DebateWhodunnitFormatStateV1, currentId: string): string | null {
  const ids = state.court?.witnessTestimonyIds ?? [];
  const index = ids.indexOf(currentId);
  return ids[index + 1] ?? null;
}

function completeMysteryTrial(
  session: DebateSessionV1,
  state: DebateWhodunnitFormatStateV1,
  bible: DebateMysteryCaseBibleV1,
): DebateSessionV1 {
  const gradedVerdict = gradeDebateMysteryTheory({
    bible,
    theory: state.theory!,
    sustainedTestimonyIds: state.court?.sustainedTestimonyIds ?? [],
    credibilityRemaining: state.credibilityRemaining,
    deliveredAt: new Date().toISOString(),
  });
  const verdict = {
    ...gradedVerdict,
    accompliceCorrect: state.theory!.accompliceSeatId === null
      ? null
      : gradedVerdict.accompliceCorrect,
  };
  return {
    ...session,
    status: "completed",
    phase: "verdict",
    stepKey: "mystery_verdict",
    completedAt: verdict.deliveredAt,
    formatState: { ...state, playPhase: "verdict", verdict, court: state.court ? { ...state.court, activeTestimonyId: null } : null },
  };
}

export async function applyDebateMysteryAction(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  request: DebateMysteryActionRequestV1,
  runtime: DebateAiRuntime,
): Promise<DebateSessionV1> {
  const key = normalizeDebateIdempotencyKey(request.idempotencyKey);
  if (!key) throw new HttpError(400, "A stable idempotency key is required.");
  const replay = replayMysteryMutation(db, userId, sessionId, key);
  if (replay) return replay;
  const session = getDebateSession(db, userId, sessionId);
  if (request.expectedRevision !== session.revision) throw new HttpError(409, "This case changed in another window. Refresh and try again.");
  const state = requireMysteryState(session);
  const bible = getDebateMysteryCaseBible(db, userId, sessionId);
  if (session.status === "completed" && request.action !== "reveal_spoilers") throw new HttpError(409, "This case is already complete.");
  let nextState = structuredClone(state);
  let nextSession: DebateSessionV1 = { ...session };
  let publicPayload: Record<string, unknown> = {};
  const automaticNotebookReferences: Array<{ kind: "evidence" | "testimony"; id: string; label: string }> = [];
  const revealInventoryItem = (itemId: string): DebateWhodunnitFormatStateV1["inventoryItems"][number] => {
    const canonical = bible.inventoryItems.find((item) => item.id === itemId);
    if (!canonical) throw new HttpError(409, "The Case Bible names an unavailable inventory item.");
    const existing = nextState.inventoryItems.find((item) => item.id === itemId);
    if (!existing) nextState.inventoryItems.push(structuredClone(canonical));
    if (canonical.evidenceId) {
      const evidence = bible.evidence.find((item) => item.id === canonical.evidenceId);
      if (evidence && !nextState.discoveredEvidence.some((item) => item.id === evidence.id)) {
        nextState.discoveredEvidence.push(publicMysteryEvidence(evidence));
        automaticNotebookReferences.push({ kind: "evidence", id: evidence.id, label: `${evidence.title}: ${evidence.observation}` });
      }
    }
    return existing ?? canonical;
  };
  const spendAction = () => {
    if (nextState.actionsRemaining <= 0) throw new HttpError(409, "No investigation actions remain. File a theory to continue.");
    nextState.actionsRemaining -= 1;
  };
  if (request.action === "travel") {
    if (nextState.playPhase !== "investigation" && nextState.playPhase !== "continuance") throw new HttpError(409, "Travel is unavailable during trial.");
    const room = nextState.rooms.find((candidate) => candidate.id === request.roomId);
    if (!room) throw new HttpError(404, "Room not found.");
    if (room.locked) throw new HttpError(409, "This room is locked. Use an access item on it from the mansion map.");
    if (!room.discovered) {
      spendAction();
      room.discovered = true;
      const canonicalRoom = bible.rooms.find((entry) => entry.id === room.id)!;
      room.templateId = canonicalRoom.templateId;
      room.imageId = canonicalRoom.imageId;
      room.kind = canonicalRoom.kind;
      room.assignedSuspectSeatId = canonicalRoom.assignedSuspectSeatId;
      if (canonicalRoom.assignedSuspectSeatId) {
        const revealedSuspect = nextState.suspects.find((suspect) => suspect.seatId === canonicalRoom.assignedSuspectSeatId);
        if (revealedSuspect) revealedSuspect.roomId = room.id;
      }
      room.name = DEBATE_MYSTERY_ROOM_TEMPLATES.find((entry) => entry.id === canonicalRoom.templateId)?.name ?? "Unnamed Room";
      room.activeRegionIds = bible.activeRegions
        .filter((entry) => entry.roomId === room.id)
        .map((entry) => entry.regionId);
      room.activeRegionId = room.activeRegionIds[0] ?? null;
      room.inspectionCounts = {};
    }
    nextState.currentRoomId = room.id;
    nextState.playPhase = "investigation";
    publicPayload = { roomId: room.id, name: room.name, discovered: true };
  } else if (request.action === "inspect") {
    const room = nextState.rooms.find((candidate) => candidate.id === request.roomId);
    if (!room?.discovered) throw new HttpError(409, "Discover this room first.");
    if (nextState.currentRoomId !== room.id) throw new HttpError(409, "Enter this room before inspecting it.");
    if (!room.activeRegionIds.includes(request.regionId)) throw new HttpError(404, "That area is not active in this case.");
    if (room.inspectedRegionIds.includes(request.regionId)) {
      throw new HttpError(409, "That area has already been investigated.");
    }
    const outcome = bible.activeRegions.find((entry) => entry.roomId === room.id && entry.regionId === request.regionId)!;
    const resolvedLock = bible.accessLocks.find((lock) => {
      if (!nextState.accessHistory.some((entry) => entry.id === lock.id && entry.success)) return false;
      if (lock.targetKind === "region") return lock.targetId === `${room.id}:${request.regionId}`;
      if (lock.targetKind !== "item") return false;
      const target = bible.inventoryItems.find((item) => item.id === lock.targetId);
      return target?.sourceRoomId === room.id && target.sourceRegionId === request.regionId;
    });
    const inspectionResponse = resolvedLock?.unlockObservation ?? outcome.inspectionResponse;
    room.inspectionCounts ??= {};
    room.inspectionCounts[request.regionId] = 1;
    room.inspectedRegionIds.push(request.regionId);
    room.searched = room.activeRegionIds.every((regionId) => room.inspectedRegionIds.includes(regionId));
    room.publicObservation = inspectionResponse;
    room.outcomeKind = outcome.kind;
    if (outcome.evidenceId) {
      const item = bible.evidence.find((candidate) => candidate.id === outcome.evidenceId)!;
      if (!nextState.discoveredEvidence.some((candidate) => candidate.id === item.id)) {
        nextState.discoveredEvidence.push(publicMysteryEvidence(item));
        automaticNotebookReferences.push({ kind: "evidence", id: item.id, label: `${item.title}: ${item.observation}` });
      }
    }
    if (outcome.inventoryItemId) revealInventoryItem(outcome.inventoryItemId);
    const template = DEBATE_MYSTERY_ROOM_TEMPLATES.find((entry) => entry.id === room.templateId);
    room.observations.push({
      regionId: outcome.regionId,
      label: template?.regions.find((region) => region.id === outcome.regionId)?.label ?? "Inspected area",
      observation: inspectionResponse,
      outcomeKind: outcome.kind,
      evidenceId: outcome.evidenceId,
    });
    nextState.partnerJournal.push(inspectionResponse);
    publicPayload = { roomId: room.id, regionId: outcome.regionId, observation: inspectionResponse, outcomeKind: outcome.kind, evidenceId: outcome.evidenceId, inventoryItemId: outcome.inventoryItemId, inspectionCount: 1, repeated: false, roomComplete: room.searched };
  } else if (request.action === "use_access_item") {
    if (nextState.playPhase !== "investigation" && nextState.playPhase !== "continuance") throw new HttpError(409, "Access items are unavailable during trial.");
    const accessItem = nextState.inventoryItems.find((item) => item.id === request.accessItemId && item.usable);
    if (!accessItem) throw new HttpError(404, "That access item is not in your active inventory.");
    let targetLabel = "selected target";
    if (request.targetKind === "item") {
      const target = nextState.inventoryItems.find((item) => item.id === request.targetId && item.locked);
      if (!target) throw new HttpError(404, "That locked item is not in your active inventory.");
      targetLabel = target.title;
    } else if (request.targetKind === "room") {
      const target = nextState.rooms.find((room) => room.id === request.targetId);
      if (!target) throw new HttpError(404, "That room is not part of this mansion.");
      targetLabel = target.name ?? "locked room";
    } else {
      const [targetRoomId, ...targetRegionParts] = request.targetId.split(":");
      const targetRegionId = targetRegionParts.join(":");
      const targetRoom = nextState.rooms.find((room) => room.id === targetRoomId);
      if (!targetRoom?.discovered || targetRoom.id !== nextState.currentRoomId || !targetRoom.activeRegionIds.includes(targetRegionId)) {
        throw new HttpError(404, "That room area is not available from here.");
      }
      const template = DEBATE_MYSTERY_ROOM_TEMPLATES.find((entry) => entry.id === targetRoom.templateId);
      targetLabel = template?.regions.find((region) => region.id === targetRegionId)?.label ?? "room area";
    }
    const lock = bible.accessLocks.find((candidate) =>
      candidate.targetKind === request.targetKind &&
      candidate.targetId === request.targetId &&
      candidate.requiredAccessItemId === request.accessItemId,
    );
    const resolvedAt = new Date().toISOString();
    if (!lock) {
      const failedResponses = [
        "The item and target do not engage; neither is damaged.",
        "Nothing turns, releases, or responds.",
        "The fit is inconclusive, and the target remains as it was.",
      ];
      const observation = failedResponses[nextState.accessHistory.length % failedResponses.length]!;
      nextState.accessHistory.push({
        id: `access-attempt-${nextState.accessHistory.length + 1}`,
        accessItemTitle: accessItem.title,
        targetKind: request.targetKind,
        targetLabel,
        success: false,
        observation,
        consumedItemTitles: [],
        resultItemTitles: [],
        resolvedAt,
      });
      publicPayload = { success: false, accessItemId: accessItem.id, targetKind: request.targetKind, targetId: request.targetId, observation };
    } else {
      if (nextState.accessHistory.some((entry) => entry.id === lock.id && entry.success)) throw new HttpError(409, "This lock has already been resolved.");
      const consumedItemTitles: string[] = [];
      if (lock.consumeAccessItem) {
        nextState.inventoryItems = nextState.inventoryItems.filter((item) => item.id !== accessItem.id);
        consumedItemTitles.push(accessItem.title);
      }
      if (lock.targetKind === "item" && lock.consumeTargetItem) {
        const target = nextState.inventoryItems.find((item) => item.id === lock.targetId);
        if (target) {
          nextState.inventoryItems = nextState.inventoryItems.filter((item) => item.id !== target.id);
          consumedItemTitles.push(target.title);
          if (target.evidenceId) nextState.discoveredEvidence = nextState.discoveredEvidence.filter((item) => item.id !== target.evidenceId);
        }
      }
      if (lock.targetKind === "room") {
        const target = nextState.rooms.find((room) => room.id === lock.targetId)!;
        target.locked = false;
      }
      const results = lock.resultInventoryItemIds.map(revealInventoryItem);
      const resolvedSource = lock.targetKind === "region"
        ? (() => {
            const [roomId, ...regionParts] = lock.targetId.split(":");
            return { roomId: roomId!, regionId: regionParts.join(":") };
          })()
        : lock.targetKind === "item"
          ? (() => {
              const target = bible.inventoryItems.find((item) => item.id === lock.targetId);
              return target ? { roomId: target.sourceRoomId, regionId: target.sourceRegionId } : null;
            })()
          : null;
      if (resolvedSource) {
        const sourceRoom = nextState.rooms.find((room) => room.id === resolvedSource.roomId);
        if (sourceRoom?.discovered) {
          sourceRoom.inspectionCounts ??= {};
          sourceRoom.inspectionCounts[resolvedSource.regionId] ??= 1;
          if (!sourceRoom.inspectedRegionIds.includes(resolvedSource.regionId)) sourceRoom.inspectedRegionIds.push(resolvedSource.regionId);
          sourceRoom.searched = sourceRoom.activeRegionIds.every((regionId) => sourceRoom.inspectedRegionIds.includes(regionId));
          sourceRoom.publicObservation = lock.unlockObservation;
          sourceRoom.outcomeKind = "clue";
          sourceRoom.observations = [
            ...sourceRoom.observations.filter((observation) => observation.regionId !== resolvedSource.regionId),
            {
              regionId: resolvedSource.regionId,
              label: lock.targetLabel,
              observation: lock.unlockObservation,
              outcomeKind: "clue",
              evidenceId: results.find((item) => item.evidenceId)?.evidenceId ?? null,
            },
          ];
        }
      }
      nextState.accessHistory.push({
        id: lock.id,
        accessItemTitle: accessItem.title,
        targetKind: lock.targetKind,
        targetLabel: lock.targetLabel,
        success: true,
        observation: lock.unlockObservation,
        consumedItemTitles,
        resultItemTitles: results.map((item) => item.title),
        resolvedAt,
      });
      nextState.partnerJournal.push(lock.unlockObservation);
      publicPayload = { success: true, accessItemId: accessItem.id, targetKind: lock.targetKind, targetId: lock.targetId, observation: lock.unlockObservation, consumedItemTitles, resultItemTitles: results.map((item) => item.title) };
    }
  } else if (request.action === "forensic") {
    if (nextState.playPhase !== "investigation" && nextState.playPhase !== "continuance") throw new HttpError(409, "Forensics is unavailable during trial.");
    const evidence = nextState.discoveredEvidence.find((item) => item.id === request.evidenceId);
    if (!evidence?.isPhysical) throw new HttpError(404, "That discovered item cannot be sent to forensics.");
    if (nextState.forensicFindings.some((finding) => finding.evidenceId === evidence.id)) throw new HttpError(409, "This item has already been examined.");
    if (nextState.actionsRemaining < 3) throw new HttpError(409, "Forensics costs exactly 3 investigation actions.");
    nextState.actionsRemaining -= 3;
    const canonical = bible.evidence.find((item) => item.id === evidence.id)!;
    const finding = frozenForensicFinding(canonical);
    nextState.forensicFindings.push(finding);
    nextState.partnerJournal.push(`Forensics: ${finding.summary}`);
    publicPayload = { evidenceId: evidence.id, finding };
  } else if (request.action === "interview") {
    const suspect = nextState.suspects.find((candidate) => candidate.seatId === request.suspectSeatId);
    if (!suspect) throw new HttpError(404, "Suspect not found.");
    const room = nextState.rooms.find((candidate) => candidate.id === suspect.roomId);
    if (!room?.discovered) throw new HttpError(409, "Discover the suspect's room before interviewing them.");
    if (nextState.currentRoomId !== room.id) throw new HttpError(409, "Enter the suspect's room before interviewing them.");
    const question = compact(request.question, 2_000);
    if (!question) throw new HttpError(400, "Ask a question or choose a suggested lead.");
    const parsedEvidenceId = parseDebateMysteryEvidenceConfrontation(question, nextState.discoveredEvidence);
    if ((request.evidenceId ?? null) !== parsedEvidenceId) {
      throw new HttpError(400, "Evidence confrontations must use a selected @ evidence reference.");
    }
    const confrontedEvidence = parsedEvidenceId
      ? nextState.discoveredEvidence.find((item) => item.id === parsedEvidenceId)!
      : null;
    const answer = await projectedActorReply({ bible, state: nextState, seatId: suspect.seatId, question: resolveDebateMysteryQuestionMentions(question, nextState, bible), confrontedEvidence, runtime, powerPlan: session.powerPlan.bots[suspect.botId] });
    const testimony = bible.testimony.find((entry) => entry.speakerSeatId === suspect.seatId)!;
    const publicTestimony = publicMysteryTestimony(testimony);
    if (!nextState.testimony.some((entry) => entry.id === testimony.id)) {
      nextState.testimony.push(publicTestimony);
      automaticNotebookReferences.push({ kind: "testimony", id: testimony.id, label: `${suspect.name}: “${publicTestimony.exactQuote}”` });
    }
    const createdAt = new Date().toISOString();
    const exchangeNumber = Math.floor(nextState.interviewLog.length / 2) + 1;
    nextState.interviewLog.push(
      {
        id: `interview-${suspect.seatId}-${exchangeNumber}-question`,
        suspectSeatId: suspect.seatId,
        role: "investigator",
        content: question,
        evidenceId: confrontedEvidence?.id ?? null,
        createdAt,
      },
      {
        id: `interview-${suspect.seatId}-${exchangeNumber}-answer`,
        suspectSeatId: suspect.seatId,
        role: "suspect",
        content: answer,
        evidenceId: confrontedEvidence?.id ?? null,
        createdAt,
      },
    );
    publicPayload = { suspectSeatId: suspect.seatId, question, evidenceId: confrontedEvidence?.id ?? null, answer, testimony: publicTestimony };
  } else if (request.action === "consult_partner") {
    const question = compact(request.question, 2_000);
    if (!question) throw new HttpError(400, "Ask your partner a question.");
    const notebook = getDebateMysteryNotebook(db, userId, sessionId).notebook;
    const answer = await projectedPartnerReply({ state: nextState, notebook, question: resolveDebateMysteryQuestionMentions(question, nextState, bible), runtime });
    nextState.partnerJournal.push(answer);
    publicPayload = { question, answer };
  } else if (request.action === "file_theory") {
    if (!request.theory.culpritSeatId) throw new HttpError(400, "Choose a culprit before filing charges.");
    if (request.theory.accompliceSeatId && request.theory.accompliceSeatId === request.theory.culpritSeatId) throw new HttpError(400, "The culprit cannot also be filed as their own accomplice.");
    if (!nextState.suspects.some((suspect) => suspect.seatId === request.theory.culpritSeatId)) throw new HttpError(400, "The filed culprit is not in this case.");
    if (request.theory.accompliceSeatId && !nextState.suspects.some((suspect) => suspect.seatId === request.theory.accompliceSeatId)) throw new HttpError(400, "The filed accomplice is not in this case.");
    const evidenceIds = [...new Set(request.theory.evidenceIds.map((id) => compact(id, 120)).filter(Boolean))];
    const testimonyIds = [...new Set(request.theory.testimonyIds.map((id) => compact(id, 120)).filter(Boolean))];
    if (evidenceIds.some((id) => !nextState.discoveredEvidence.some((item) => item.id === id))) throw new HttpError(400, "A filed evidence item is not in the discovered record.");
    if (testimonyIds.some((id) => !nextState.testimony.some((item) => item.id === id))) throw new HttpError(400, "A filed testimony excerpt is not in the discovered record.");
    nextState.theory = {
      culpritSeatId: request.theory.culpritSeatId,
      accompliceSeatId: request.theory.accompliceSeatId ?? null,
      method: compact(request.theory.method, 2_000),
      motive: compact(request.theory.motive, 2_000),
      opportunity: compact(request.theory.opportunity, 2_000),
      evidenceIds,
      testimonyIds,
    };
    nextState.theoryFiledAt = new Date().toISOString();
    const accusedStatement = bible.testimony.find((entry) => entry.speakerSeatId === request.theory.culpritSeatId);
    const witnessCount = Math.min(3, Math.max(1, Math.ceil(nextState.config.totalRooms / 5)));
    const otherStatements = bible.testimony
      .filter((entry) => entry.id !== accusedStatement?.id)
      .sort((left, right) =>
        Number(nextState.testimony.some((known) => known.id === right.id)) -
        Number(nextState.testimony.some((known) => known.id === left.id)),
      )
      .slice(0, witnessCount);
    const witnessTestimonyIds = [accusedStatement, ...otherStatements].filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)).map((entry) => entry.id);
    for (const testimonyId of witnessTestimonyIds) {
      const statement = bible.testimony.find((entry) => entry.id === testimonyId);
      if (statement && !nextState.testimony.some((entry) => entry.id === statement.id)) {
        const publicStatement = publicMysteryTestimony(statement);
        nextState.testimony.push(publicStatement);
        const speakerName = nextState.suspects.find((suspect) => suspect.seatId === statement.speakerSeatId)?.name ?? "Witness";
        automaticNotebookReferences.push({ kind: "testimony", id: statement.id, label: `${speakerName}: “${publicStatement.exactQuote}”` });
      }
    }
    nextState.court = { witnessTestimonyIds, activeTestimonyId: witnessTestimonyIds[0] ?? null, examinedTestimonyIds: [], sustainedTestimonyIds: [], failedActions: 0 };
    nextState.playPhase = "trial";
    nextState.credibilityRemaining = DEBATE_MYSTERY_CREDIBILITY_STRIKES;
    await appendMysteryCourtCounselBeat({ db, userId, sessionId, state: nextState, task: "opening", runtime });
    nextSession = { ...nextSession, phase: "closing", stepKey: "mystery_trial", status: "waiting_for_player" };
    publicPayload = { theory: nextState.theory, witnessTestimonyIds };
  } else if (request.action === "court_speak") {
    if (nextState.playPhase !== "trial" || !nextState.court || !nextState.theory) throw new HttpError(409, "File a theory before addressing the court.");
    const content = compact(request.content, 600);
    if (!content) throw new HttpError(400, "Write a brief statement for the court.");
    nextState.partnerJournal.push(`Investigator: ${content}`);
    publicPayload = { content };
  } else if (request.action === "court_press" || request.action === "court_present" || request.action === "court_pass") {
    if (nextState.playPhase !== "trial" || !nextState.court || !nextState.theory) throw new HttpError(409, "File a theory before using courtroom actions.");
    if (nextState.court.activeTestimonyId !== request.testimonyId) throw new HttpError(409, "Choose the active testimony statement.");
    if (request.action === "court_press") {
      if (!nextState.court.examinedTestimonyIds.includes(request.testimonyId)) nextState.court.examinedTestimonyIds.push(request.testimonyId);
      const testimony = bible.testimony.find((entry) => entry.id === request.testimonyId)!;
      nextState.partnerJournal.push(`PRISM: The witness must clarify ${testimony.exactQuote}`);
      publicPayload = { testimonyId: request.testimonyId, exactQuote: testimony.exactQuote, pressed: true };
    } else if (request.action === "court_present") {
      const evidence = nextState.discoveredEvidence.find((item) => item.id === request.evidenceId);
      const canonicalEvidence = bible.evidence.find((item) => item.id === request.evidenceId);
      const testimony = bible.testimony.find((entry) => entry.id === request.testimonyId);
      if (!evidence || !canonicalEvidence || !testimony) throw new HttpError(404, "That evidence or testimony is not in the admissible record.");
      const sustained = testimony.factTags.includes("contradiction") && canonicalEvidence.factTags.includes("contradiction");
      if (sustained) {
        if (!nextState.court.sustainedTestimonyIds.includes(testimony.id)) nextState.court.sustainedTestimonyIds.push(testimony.id);
      } else {
        nextState.court.failedActions += 1;
        nextState.credibilityRemaining = Math.max(0, nextState.credibilityRemaining - 1);
      }
      const lockedRuling = sustained ? "sustained" : "overruled";
      const rulingProse = await projectedJudgeRuling({
        ruling: lockedRuling,
        testimony,
        evidence,
        runtime,
      });
      nextState.partnerJournal.push(`PRISM: ${rulingProse}`);
      publicPayload = { testimonyId: testimony.id, evidenceId: evidence.id, ruling: lockedRuling, rulingProse };
      if (!sustained && nextState.credibilityRemaining === 0) {
        if (!nextState.continuanceUsed) {
          nextState.continuanceUsed = true;
          nextState.actionsRemaining = Math.ceil(nextState.config.totalRooms / 5) + 2;
          nextState.playPhase = "continuance";
          nextState.theory = null;
          nextState.theoryFiledAt = null;
          nextState.court = null;
          nextSession = { ...nextSession, phase: "challenge", stepKey: "mystery_continuance", status: "waiting_for_player" };
        } else {
          const failedVerdict = { grade: "incorrect" as const, culpritCorrect: false, accompliceCorrect: null, matchedBundleId: null, credibilityRemaining: 0, reason: "The prosecution exhausted its credibility after the continuance.", deliveredAt: new Date().toISOString() };
          nextState.playPhase = "verdict";
          nextState.verdict = failedVerdict;
          nextState.court.activeTestimonyId = null;
          nextSession = { ...nextSession, status: "completed", phase: "verdict", stepKey: "mystery_verdict", completedAt: failedVerdict.deliveredAt };
        }
      } else if (sustained) {
        const nextId = nextCourtTestimony(nextState, request.testimonyId);
        nextState.court.activeTestimonyId = nextId;
        if (!nextId) {
          await appendMysteryCourtCounselBeat({ db, userId, sessionId, state: nextState, task: "closing", runtime });
          nextSession = completeMysteryTrial(nextSession, nextState, bible);
        }
      }
    } else {
      const nextId = nextCourtTestimony(nextState, request.testimonyId);
      nextState.court.activeTestimonyId = nextId;
      nextState.partnerJournal.push("PRISM: The prosecution passes this statement.");
      publicPayload = { testimonyId: request.testimonyId, passed: true };
      if (!nextId) {
        await appendMysteryCourtCounselBeat({ db, userId, sessionId, state: nextState, task: "closing", runtime });
        nextSession = completeMysteryTrial(nextSession, nextState, bible);
      }
    }
  } else if (request.action === "reveal_spoilers") {
    if (!nextState.verdict) throw new HttpError(409, "Finish the case before revealing spoilers.");
    nextState.spoilersRevealed = true;
    publicPayload = { spoilersRevealed: true, timeline: bible.timeline, culpritSeatId: bible.culpritSeatId, accompliceSeatId: bible.accompliceSeatId, unseenEvidence: bible.evidence.filter((item) => !nextState.discoveredEvidence.some((known) => known.id === item.id)), proofBundles: bible.proofBundles };
  }
  if (nextSession.formatState === state) nextSession = { ...nextSession, formatState: nextState };
  else if (nextSession.formatState.format === "whodunnit") nextState = nextSession.formatState;
  const priorLeads = new Map(state.leads.map((lead) => [lead.id, lead]));
  nextState.leads = updateDebateMysteryPublicLeads(bible, nextState);
  const leadUpdates = nextState.leads
    .filter((lead) => priorLeads.get(lead.id)?.revision !== lead.revision)
    .map((lead) => ({
      id: lead.id,
      title: lead.title,
      status: lead.status,
      revision: lead.revision,
      summary: lead.summary,
    }));
  if (leadUpdates.length > 0) publicPayload = { ...publicPayload, leadUpdates };
  nextSession = { ...nextSession, formatState: nextState };
  db.exec("BEGIN IMMEDIATE");
  try {
    appendAutomaticNotebookReferences(db, userId, sessionId, automaticNotebookReferences);
    const persisted = persistMysterySession(db, userId, { ...nextSession, formatState: nextState }, session.revision);
    appendMysteryAction(db, userId, sessionId, request.action, publicPayload);
    recordMysteryMutation(db, userId, session, persisted, key);
    db.exec("COMMIT");
    return persisted;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function getDebateMysteryNotebook(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): { notebook: DebateMysteryNotebookV1; cleanupProposal: DebateMysteryNotebookCleanupProposalV1 | null } {
  requireMysteryState(getDebateSession(db, userId, sessionId));
  const row = db.prepare(
    `SELECT revision, document_json, pending_proposal_json
       FROM debate_mystery_notebooks WHERE session_id = ? AND user_id = ?`,
  ).get(sessionId, userId) as MysteryNotebookRow | undefined;
  if (!row) throw new HttpError(404, "Investigator's Notebook not found.");
  const notebook = JSON.parse(row.document_json) as DebateMysteryNotebookV1;
  return { notebook: { ...notebook, revision: row.revision }, cleanupProposal: row.pending_proposal_json ? JSON.parse(row.pending_proposal_json) as DebateMysteryNotebookCleanupProposalV1 : null };
}

function validateNotebookPages(pages: unknown): DebateMysteryNotebookPageV1[] {
  if (!Array.isArray(pages) || pages.length === 0 || pages.length > 40) throw new HttpError(400, "Keep between one and forty notebook pages.");
  const pageIds = new Set<string>();
  const blockIds = new Set<string>();
  const normalized = pages.map((value): DebateMysteryNotebookPageV1 => {
    if (!value || typeof value !== "object") throw new HttpError(400, "Notebook page is malformed.");
    const page = value as Record<string, unknown>;
    const id = compact(page.id, 120);
    const title = compact(page.title, 120) || "Untitled Page";
    if (!id || pageIds.has(id)) throw new HttpError(400, "Notebook page IDs must be stable and unique.");
    pageIds.add(id);
    if (!Array.isArray(page.blocks)) throw new HttpError(400, "Notebook page blocks are malformed.");
    const blocks = page.blocks.map((entry): DebateMysteryNotebookBlockV1 => {
      if (!entry || typeof entry !== "object") throw new HttpError(400, "Notebook block is malformed.");
      const block = entry as Record<string, unknown>;
      const blockId = compact(block.id, 120);
      const kinds = new Set(["paragraph", "heading", "list", "checkbox", "reference", "quote"]);
      const kind = typeof block.kind === "string" && kinds.has(block.kind) ? block.kind as DebateMysteryNotebookBlockV1["kind"] : "paragraph";
      if (!blockId || blockIds.has(blockId)) throw new HttpError(400, "Notebook block IDs must be stable and unique.");
      blockIds.add(blockId);
      const referenceKind = block.referenceKind === "room" || block.referenceKind === "evidence" || block.referenceKind === "testimony" || block.referenceKind === "lead" ? block.referenceKind : undefined;
      const referenceId = compact(block.referenceId, 160) || undefined;
      const leadId = compact(block.leadId, 160) || undefined;
      const leadRevision = typeof block.leadRevision === "number" && Number.isInteger(block.leadRevision) && block.leadRevision > 0 ? block.leadRevision : undefined;
      if (kind === "reference" && (!referenceKind || !referenceId)) throw new HttpError(400, "Reference chips require a durable kind and ID.");
      if ((leadId && !leadRevision) || (!leadId && leadRevision)) throw new HttpError(400, "Lead annotations require a stable lead ID and revision.");
      return { id: blockId, kind, text: typeof block.text === "string" ? block.text.slice(0, 8_000) : "", ...(kind === "checkbox" ? { checked: block.checked === true } : {}), ...(referenceKind && referenceId ? { referenceKind, referenceId } : {}), ...(leadId && leadRevision ? { leadId, leadRevision } : {}) };
    });
    return { id, title, blocks, createdAt: compact(page.createdAt, 64) || new Date().toISOString(), updatedAt: new Date().toISOString() };
  });
  const count = debateMysteryNotebookCharacterCount({ pages: normalized });
  if (count > DEBATE_MYSTERY_NOTEBOOK_CHARACTER_LIMIT) throw new HttpError(413, `Notebook exceeds the ${DEBATE_MYSTERY_NOTEBOOK_CHARACTER_LIMIT.toLocaleString()}-character limit.`);
  return normalized;
}

function commitNotebookRevision(args: {
  db: DatabaseSync;
  userId: string;
  current: DebateMysteryNotebookV1;
  pages: DebateMysteryNotebookPageV1[];
  reason: "edit" | "cleanup" | "undo";
  idempotencyKey: string;
  clearProposal?: boolean;
}): DebateMysteryNotebookV1 {
  const now = new Date().toISOString();
  const next: DebateMysteryNotebookV1 = { ...args.current, revision: args.current.revision + 1, pages: args.pages, updatedAt: now };
  args.db.exec("BEGIN IMMEDIATE");
  try {
    const result = args.db.prepare(
      `UPDATE debate_mystery_notebooks
          SET revision = ?, document_json = ?, pending_proposal_json = NULL, updated_at = ?
        WHERE session_id = ? AND user_id = ? AND revision = ?`,
    ).run(next.revision, JSON.stringify(next), now, next.sessionId, args.userId, args.current.revision);
    if (Number(result.changes) !== 1) throw new HttpError(409, "The notebook changed in another window. Refresh and try again.");
    args.db.prepare(
      `INSERT INTO debate_mystery_notebook_revisions
         (id, user_id, session_id, revision, document_json, reason, idempotency_key, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), args.userId, next.sessionId, next.revision, JSON.stringify(next), args.reason, args.idempotencyKey, now);
    args.db.exec("COMMIT");
    return next;
  } catch (error) {
    args.db.exec("ROLLBACK");
    throw error;
  }
}

export function patchDebateMysteryNotebook(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  body: Record<string, unknown>,
): { notebook: DebateMysteryNotebookV1; cleanupProposal: DebateMysteryNotebookCleanupProposalV1 | null } {
  const key = normalizeDebateIdempotencyKey(body.idempotencyKey);
  if (!key) throw new HttpError(400, "A stable idempotency key is required.");
  const replay = db.prepare(
    `SELECT document_json FROM debate_mystery_notebook_revisions WHERE user_id = ? AND session_id = ? AND idempotency_key = ?`,
  ).get(userId, sessionId, key) as { document_json?: string } | undefined;
  if (replay?.document_json) return { notebook: JSON.parse(replay.document_json) as DebateMysteryNotebookV1, cleanupProposal: null };
  const currentRecord = getDebateMysteryNotebook(db, userId, sessionId);
  const current = currentRecord.notebook;
  if (body.expectedRevision !== current.revision) throw new HttpError(409, "The notebook changed in another window. Refresh and try again.");
  const operation = body.operation === "accept_cleanup" || body.operation === "reject_cleanup" || body.operation === "undo" ? body.operation : "replace";
  if (operation === "reject_cleanup") {
    db.prepare(`UPDATE debate_mystery_notebooks SET pending_proposal_json = NULL, updated_at = ? WHERE session_id = ? AND user_id = ? AND revision = ?`).run(new Date().toISOString(), sessionId, userId, current.revision);
    return { notebook: current, cleanupProposal: null };
  }
  if (operation === "accept_cleanup") {
    const proposal = currentRecord.cleanupProposal;
    if (!proposal || proposal.id !== body.proposalId) throw new HttpError(409, "Cleanup proposal is unavailable or stale.");
    const validation = validateDebateMysteryNotebookCleanupProposal(current, proposal);
    if (!validation.valid) throw new HttpError(409, validation.errors.join(" "));
    const pages = current.pages.map((page) => {
      const replacement = proposal.pages.find((candidate) => candidate.pageId === page.id);
      return replacement ? { ...page, title: replacement.proposedTitle, blocks: replacement.proposedBlocks.map(({ sourceBlockIds: _sourceBlockIds, ...block }) => block), updatedAt: new Date().toISOString() } : page;
    });
    return { notebook: commitNotebookRevision({ db, userId, current, pages, reason: "cleanup", idempotencyKey: key, clearProposal: true }), cleanupProposal: null };
  }
  if (operation === "undo") {
    const prior = db.prepare(
      `SELECT document_json FROM debate_mystery_notebook_revisions
        WHERE user_id = ? AND session_id = ? AND revision < ?
        ORDER BY revision DESC LIMIT 1`,
    ).get(userId, sessionId, current.revision) as { document_json?: string } | undefined;
    if (!prior?.document_json) throw new HttpError(409, "There is no earlier notebook revision to restore.");
    const priorNotebook = JSON.parse(prior.document_json) as DebateMysteryNotebookV1;
    return { notebook: commitNotebookRevision({ db, userId, current, pages: priorNotebook.pages, reason: "undo", idempotencyKey: key, clearProposal: true }), cleanupProposal: null };
  }
  const pages = validateNotebookPages(body.pages);
  return { notebook: commitNotebookRevision({ db, userId, current, pages, reason: "edit", idempotencyKey: key }), cleanupProposal: currentRecord.cleanupProposal };
}

export async function proposeDebateMysteryNotebookCleanup(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  body: Record<string, unknown>,
  runtime: DebateAiRuntime,
): Promise<DebateMysteryNotebookCleanupProposalV1> {
  const { notebook } = getDebateMysteryNotebook(db, userId, sessionId);
  if (body.expectedRevision !== notebook.revision) throw new HttpError(409, "The notebook changed in another window. Refresh and try again.");
  const selected = Array.isArray(body.pageIds) ? new Set(body.pageIds.map((id) => compact(id, 120)).filter(Boolean)) : new Set(notebook.pages.map((page) => page.id));
  const pages = notebook.pages.filter((page) => selected.has(page.id));
  if (pages.length === 0) throw new HttpError(400, "Select at least one notebook page to clean up.");
  const selectedBlockIds = Array.isArray(body.blockIds)
    ? new Set(body.blockIds.map((id) => compact(id, 120)).filter(Boolean))
    : null;
  const cleanupInputPages = selectedBlockIds
    ? pages
        .map((page) => ({
          ...page,
          blocks: page.blocks.filter((block) => selectedBlockIds.has(block.id)),
        }))
        .filter((page) => page.blocks.length > 0)
    : pages;
  if (cleanupInputPages.length === 0) throw new HttpError(400, "Select at least one notebook block to rewrite.");
  const state = requireMysteryState(getDebateSession(db, userId, sessionId));
  const publicLabels = {
    rooms: state.rooms.filter((room) => room.discovered).map((room) => ({ id: room.id, label: room.name })),
    evidence: state.discoveredEvidence.map((item) => ({ id: item.id, label: item.title })),
    testimony: state.testimony.map((item) => ({ id: item.id, quote: item.exactQuote })),
  };
  const lane = mysteryLane(runtime);
  let proposedPages: DebateMysteryNotebookCleanupProposalV1["pages"] | null = null;
  try {
    const response = await lane.provider.generateResponse([
      { role: "system", content: [
        "Clean up the investigator's selected notebook pages without changing meaning.",
        "You may improve headings, organization, ordering, duplicate wording, grammar, and phrasing. Do not add deductions or facts, resolve uncertainty, change negation, strengthen suspicion, or alter exact quotations or [[room:]], [[evidence:]], and [[testimony:]] tokens.",
        "Return every supplied source block exactly once through sourceBlockIds. Merged duplicates may list several source IDs on one proposed block. Never invent a source ID.",
        "Return JSON only: {pages:[{pageId,proposedTitle,proposedBlocks:[{id,kind,text,checked?,referenceId?,referenceKind?,sourceBlockIds:[]}]}]}.",
        "The reference labels below are the only discovered public labels. They are not additional facts.",
      ].join("\n") },
      { role: "user", content: JSON.stringify({ publicLabels, pages: cleanupInputPages }) },
    ], { model: lane.model, reasoningEffort: lane.reasoningEffort, turbo: lane.turbo, maxTokens: 4_000, temperature: 0.15, jsonMode: true, usagePurpose: "debate_generation", allowFinalLocalFallback: lane.providerName === "local" });
    const parsed = parseJsonObject(response);
    if (Array.isArray(parsed.pages)) {
      const authoredPages = parsed.pages as DebateMysteryNotebookCleanupProposalV1["pages"];
      proposedPages = selectedBlockIds
        ? pages.map((page) => {
          const authored = authoredPages.find((entry) => entry.pageId === page.id);
          const replacements = authored?.proposedBlocks ?? [];
          const firstSelectedIndex = page.blocks.findIndex((block) => selectedBlockIds.has(block.id));
          return {
            pageId: page.id,
            proposedTitle: page.title,
            proposedBlocks: page.blocks.flatMap((block, index) => {
              if (!selectedBlockIds.has(block.id)) return [{ ...block, sourceBlockIds: [block.id] }];
              return index === firstSelectedIndex ? replacements : [];
            }),
          };
        })
        : authoredPages;
    }
  } catch {
    // A local model can fail structured output even when the notebook itself is
    // perfectly valid. Preserve every authored block and still return a safe,
    // reviewable proposal so cleanup never strands the notebook UI.
    proposedPages = pages.map((page) => ({
      pageId: page.id,
      proposedTitle: page.title,
      proposedBlocks: page.blocks.map((block) => ({ ...block, sourceBlockIds: [block.id] })),
    }));
  }
  if (!proposedPages) throw new HttpError(422, "The cleanup model did not return a usable notebook proposal.");
  let proposal: DebateMysteryNotebookCleanupProposalV1 = {
    version: 1,
    id: randomUUID(),
    sessionId,
    sourceRevision: notebook.revision,
    scopePageIds: pages.map((page) => page.id),
    pages: proposedPages,
    status: "pending",
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  const validation = validateDebateMysteryNotebookCleanupProposal(notebook, proposal);
  if (!validation.valid) throw new HttpError(422, `The cleanup proposal was rejected because it could alter your notes: ${validation.errors.join(" ")}`);
  db.prepare(
    `UPDATE debate_mystery_notebooks SET pending_proposal_json = ?, updated_at = ? WHERE session_id = ? AND user_id = ? AND revision = ?`,
  ).run(JSON.stringify(proposal), new Date().toISOString(), sessionId, userId, notebook.revision);
  return proposal;
}

function portableManifest(bible: DebateMysteryCaseBibleV1, config: DebateMysteryResolvedConfigV1): DebateMysteryPortableManifestV1 {
  const { suspectBotIds: _suspectBotIds, prosecutorPartnerBotId: _prosecutor, rivalDefenseBotId: _defense, ...portableConfig } = config;
  const { suspects: _suspects, caseSeed: _caseSeed, ...portableCase } = bible;
  return {
    version: DEBATE_MYSTERY_SCHEMA_VERSION,
    generatorVersion: bible.generatorVersion,
    config: portableConfig,
    seats: bible.suspects.map((seat) => ({ seatId: seat.seatId, exportHash: seat.exportHash })),
    case: {
      ...portableCase,
      rooms: portableCase.rooms.map((room) => ({ ...room, imageId: null })),
      evidence: portableCase.evidence.map((item) => ({ ...item, imageId: null })),
    },
  };
}

export function debateMysteryCaseCodeForSession(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): DebateMysteryCaseCodeV1 {
  const session = getDebateSession(db, userId, sessionId);
  const state = requireMysteryState(session);
  const bible = getDebateMysteryCaseBible(db, userId, sessionId);
  const encoded = deflateRawSync(Buffer.from(JSON.stringify(portableManifest(bible, state.config)), "utf8")).toString("base64url");
  return {
    version: DEBATE_MYSTERY_SCHEMA_VERSION,
    generatorVersion: bible.generatorVersion,
    encoding: "deflate-base64url",
    checksum: sha256(encoded),
    payload: encoded,
  };
}

function isSupportedMysteryGeneratorVersion(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 1
    && value <= DEBATE_MYSTERY_GENERATOR_VERSION;
}

export function inspectDebateMysteryCaseCode(value: unknown): {
  version: number;
  generatorVersion: number;
  title: string;
  floors: number;
  totalRooms: number;
  seats: Array<{ seatId: string; exportHash: string | null }>;
} {
  if (!value || typeof value !== "object") throw new HttpError(400, "Case Seed is malformed.");
  const code = value as Partial<DebateMysteryCaseCodeV1>;
  if (code.version !== DEBATE_MYSTERY_SCHEMA_VERSION || code.encoding !== "deflate-base64url" || typeof code.payload !== "string" || sha256(code.payload) !== code.checksum) throw new HttpError(400, "Case Seed checksum is invalid.");
  if (!isSupportedMysteryGeneratorVersion(code.generatorVersion)) throw new HttpError(400, "Case Seed version is unsupported.");
  let manifest: DebateMysteryPortableManifestV1;
  try { manifest = JSON.parse(inflateRawSync(Buffer.from(code.payload, "base64url")).toString("utf8")) as DebateMysteryPortableManifestV1; }
  catch { throw new HttpError(400, "Case Seed could not be decoded."); }
  if (
    manifest.version !== DEBATE_MYSTERY_SCHEMA_VERSION
    || !isSupportedMysteryGeneratorVersion(manifest.generatorVersion)
    || manifest.generatorVersion !== code.generatorVersion
    || manifest.case?.generatorVersion !== manifest.generatorVersion
    || !Array.isArray(manifest.seats)
  ) throw new HttpError(400, "Case Seed version is unsupported.");
  return { version: manifest.version, generatorVersion: manifest.generatorVersion, title: manifest.case.title, floors: manifest.config.floors, totalRooms: manifest.config.totalRooms, seats: manifest.seats };
}

export function decodeDebateMysteryCaseCode(value: unknown): DebateMysteryPortableManifestV1 {
  inspectDebateMysteryCaseCode(value);
  const code = value as DebateMysteryCaseCodeV1;
  return JSON.parse(inflateRawSync(Buffer.from(code.payload, "base64url")).toString("utf8")) as DebateMysteryPortableManifestV1;
}

export async function importDebateMysteryCase(
  db: DatabaseSync,
  userId: string,
  body: Record<string, unknown>,
  runtime: DebateAiRuntime,
): Promise<DebateSessionV1> {
  const manifest = decodeDebateMysteryCaseCode(body.caseCode);
  const assignments = Array.isArray(body.seatAssignments) ? body.seatAssignments : [];
  const mapped = new Map(assignments.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const seatId = compact(row.seatId, 120);
    const botId = compact(row.botId, 200);
    return seatId && botId ? [[seatId, botId] as const] : [];
  }));
  const suspectBotIds = manifest.seats.map((seat) => mapped.get(seat.seatId) ?? "");
  if (suspectBotIds.some((id) => !id) || new Set(suspectBotIds).size !== manifest.seats.length) {
    throw new HttpError(400, "Assign one distinct eligible Library bot to every mystery seat.");
  }
  const prosecutorPartnerBotId = compact(body.prosecutorPartnerBotId, 200);
  const rivalDefenseBotId = compact(body.rivalDefenseBotId, 200);
  const sourceConfig: DebateWhodunnitCreateConfigV1 = {
    version: 1,
    preset: manifest.config.preset,
    difficulty: manifest.config.difficulty,
    artMode: manifest.config.artMode,
    inspiration: manifest.config.inspiration,
    nonce: manifest.config.nonce,
    floors: manifest.config.floors,
    totalRooms: manifest.config.totalRooms,
    suspectBotIds,
    prosecutorPartnerBotId,
    rivalDefenseBotId,
  };
  let config: DebateMysteryResolvedConfigV1;
  try { config = resolveDebateMysteryConfig(sourceConfig); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "Invalid imported cast."); }
  const allBotIds = [...suspectBotIds, prosecutorPartnerBotId, rivalDefenseBotId];
  const bots = mysteryBotRows(db, userId, allBotIds);
  if (bots.length !== allBotIds.length) throw new HttpError(404, "One or more imported cast bots were not found.");
  const suspectRows = suspectBotIds.map((id) => bots.find((bot) => bot.id === id)!);
  await completeMysteryEnsembleReadiness(suspectRows, runtime);
  const idempotencyKey = normalizeDebateIdempotencyKey(body.idempotencyKey);
  if (!idempotencyKey) throw new HttpError(400, "A stable idempotency key is required.");
  let session = createDebateSession(db, userId, mysterySessionRequest(config, sourceConfig, idempotencyKey), runtime);
  session = {
    ...session,
    powerPlan: debatePowerPlanForBots(
      db,
      userId,
      [session.moderator.id, ...allBotIds],
      "dark",
    ),
  };
  if (privateCaseRow(db, userId, session.id)) return getDebateSession(db, userId, session.id);
  const suspects: DebateMysterySuspectSnapshotV1[] = manifest.seats.map((seat, index) => {
    const bot = suspectRows[index]!;
    const room = manifest.case.rooms.find((candidate) => candidate.assignedSuspectSeatId === seat.seatId);
    if (!room) throw new HttpError(400, "Imported case seat mapping is invalid.");
    return { seatId: seat.seatId, botId: bot.id, exportHash: bot.export_hash, name: bot.name, color: bot.color, glyph: bot.glyph, roomId: room.id };
  });
  let bible: DebateMysteryCaseBibleV1 = {
    ...manifest.case,
    suspects,
    caseSeed: `case-v${manifest.generatorVersion}-${sha256(JSON.stringify(manifest)).slice(0, 12)}`,
    rooms: manifest.case.rooms.map((room) => ({ ...room, imageId: null })),
    evidence: manifest.case.evidence.map((item) => ({ ...item, imageId: null })),
    inventoryItems: Array.isArray(manifest.case.inventoryItems) ? manifest.case.inventoryItems : [],
    accessLocks: Array.isArray(manifest.case.accessLocks) ? manifest.case.accessLocks : [],
    activeRegions: manifest.case.activeRegions.map((outcome) => ({
      ...outcome,
      inventoryItemId: outcome.inventoryItemId ?? null,
    })),
  };
  const validation = validateDebateMysteryCaseBible(bible, config.actionBudget);
  if (!validation.valid) throw new HttpError(422, `Imported case is not solvable: ${validation.errors.join(" ")}`);
  bible = resolveDebateMysteryEvidenceVisuals(
    bible,
    mysteryExhibitLibrary(db, userId),
  );
  storeCaseBible(db, userId, session.id, bible);
  createInitialNotebook(db, userId, session.id);
  const importedPublicState = projectDebateMysteryCase(bible, config);
  appendAutomaticNotebookReferences(
    db,
    userId,
    session.id,
    importedPublicState.discoveredEvidence.map((item) => ({
      kind: "evidence" as const,
      id: item.id,
      label: `${item.title}: ${item.observation}`,
    })),
  );
  session = persistMysterySession(db, userId, {
    ...session,
    status: "waiting_for_player",
    phase: "challenge",
    stepKey: "mystery_investigation",
    playerRole: "investigator",
    moderatorTitle: "PRISM · Judge & Casekeeper",
    moderator: { ...session.moderator, name: "PRISM", systemPrompt: "You are PRISM, the neutral Judge and server-side Casekeeper. Never expose hidden case truth." },
    formatState: importedPublicState,
  }, session.revision);
  return session;
}

export function listDebateMysteryActions(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): Array<{ sequence: number; action: string; payload: Record<string, unknown>; occurredAt: string }> {
  getDebateSession(db, userId, sessionId);
  return (db.prepare(
    `SELECT sequence, action_kind, public_payload_json, occurred_at
       FROM debate_mystery_actions WHERE user_id = ? AND session_id = ? ORDER BY sequence`,
  ).all(userId, sessionId) as unknown as Array<{ sequence: number; action_kind: string; public_payload_json: string; occurred_at: string }>).map((row) => ({ sequence: row.sequence, action: row.action_kind, payload: JSON.parse(row.public_payload_json) as Record<string, unknown>, occurredAt: row.occurred_at }));
}
