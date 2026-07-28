import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  BOT_POWER_CANONICAL_SILENCE_V1,
  DEBATE_CASE_CARDS_PER_SIDE,
  DEBATE_PLAYER_TURN_MAX_LENGTH,
  DEBATE_SCHEMA_VERSION,
  applyBotPowerMumbledResponseV1,
  applyBotPowerMuteResponseV1,
  applyBotPowerResponseBudgetV1,
  botPowerIntermittentMuteTurnIsIgnoredFromEffectsV1,
  debateSourceIdsFromText,
  isDebatePlayerRole,
  isDebateSideId,
  normalizeDebateEvidencePacketV1,
  normalizeDebateIdempotencyKey,
  normalizeDebateMotionSlateV1,
  parseStoredBotAudioVoiceProfileV1,
  parseStoredBotAvatarDetailsV1,
  parseStoredBotPowersV1,
  sanitizeDebateStatementSources,
  strongestBotPowerResponseBudgetEffectV1,
  type DebateAdvocacyConsent,
  type DebateAdvanceRequest,
  type DebateBallotV1,
  type DebateBotPowerPlanV1,
  type DebateBotSnapshotV1,
  type DebateCaseCardV1,
  type DebateEventKind,
  type DebateEventV1,
  type DebateEvidencePacketV1,
  type DebateMotionSlateV1,
  type DebatePlayerTurnRequest,
  type DebatePowerEffectPlanV1,
  type DebatePowerPlanV1,
  type DebateSessionCreateRequest,
  type DebateSessionListItemV1,
  type DebateSessionV1,
  type DebateSideId,
  type DebateSpeakerKind,
  type DebateVerdictRequest,
} from "@localai/shared";
import { resolveSocialPowersForBots } from "./coffee-powers.ts";
import {
  botPowerTextRequestsRepeat,
  strongestHearingRepeatEffect,
} from "./bot-power-hearing-repeat.ts";
import type {
  LlmProvider,
  ProviderMessage,
  ProviderName,
} from "./providers.ts";
import { HttpError } from "./utils.http.ts";

interface DebateBotRow {
  id: string;
  name: string;
  system_prompt: string;
  online_enabled: number;
  model: string | null;
  local_model: string | null;
  online_model: string | null;
  temperature: number | null;
  max_tokens: number | null;
  top_p: number | null;
  top_k: number | null;
  repetition_penalty: number | null;
  color: string | null;
  glyph: string | null;
  avatar_details_json: string | null;
  authored_audio_voice_profile: string | null;
  audio_voice_profile_override: string | null;
  powers_json: string | null;
  updated_at: string;
}

interface DebateSessionRow {
  id: string;
  revision: number;
  status: DebateSessionV1["status"];
  phase: DebateSessionV1["phase"];
  step_key: string;
  player_role: DebateSessionV1["playerRole"];
  player_side_id: DebateSideId | null;
  motion: string;
  winner_side_id: DebateSideId | null;
  session_json: string;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface DebateGenerationLane {
  provider: LlmProvider;
  providerName: ProviderName;
  model: string;
}

export interface DebateAiRuntime {
  local: DebateGenerationLane;
  online?: DebateGenerationLane;
  /** Always local; used only for asynchronous, non-blocking case-board distillation. */
  auxiliary?: LlmProvider;
  preferredProvider: ProviderName;
}

const DEBATE_BOT_SELECT = `
  SELECT id, name, system_prompt, online_enabled, model, local_model,
         online_model, temperature, max_tokens, top_p, top_k,
         repetition_penalty, color, glyph, avatar_details_json,
         authored_audio_voice_profile, audio_voice_profile_override,
         powers_json, updated_at
    FROM bots
   WHERE user_id = ? AND id IN (__IDS__)
`;

const PLAYER_STEPS = new Set([
  "challenge_judge_question",
  "challenge_participant_turn",
  "rebuttal_against_player",
  "rebuttal_for_player",
  "verdict_player",
]);

const DEBATE_CRITERIA =
  "directness, responsiveness, evidence use, concessions, and clarity";

function compactText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/\s+/gu, " ").trim().slice(0, maxLength)
    : "";
}

function multilineText(value: unknown, maxLength: number): string {
  return typeof value === "string"
    ? value.replace(/\r\n?/gu, "\n").trim().slice(0, maxLength)
    : "";
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function parsedJsonRecord(raw: string): Record<string, unknown> {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/iu, "")
    .replace(/\s*```$/u, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Model response was not JSON.");
  return jsonRecord(JSON.parse(cleaned.slice(start, end + 1)) as unknown);
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function debateMotionHash(motion: DebateMotionSlateV1): string {
  return hashJson({
    motion: motion.motion,
    forSide: motion.forSide,
    againstSide: motion.againstSide,
  });
}

function botRevision(row: DebateBotRow): string {
  return hashJson({
    id: row.id,
    updatedAt: row.updated_at,
    systemPrompt: row.system_prompt,
    powers: row.powers_json,
    voice: [
      row.authored_audio_voice_profile,
      row.audio_voice_profile_override,
    ],
    presentation: [row.color, row.glyph, row.avatar_details_json],
    models: [row.model, row.local_model, row.online_model, row.online_enabled],
  });
}

function botRows(
  db: DatabaseSync,
  userId: string,
  ids: readonly string[],
): DebateBotRow[] {
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return [];
  const sql = DEBATE_BOT_SELECT.replace(
    "__IDS__",
    uniqueIds.map(() => "?").join(", "),
  );
  const rows = db.prepare(sql).all(userId, ...uniqueIds) as unknown as DebateBotRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  return uniqueIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

function laneForBot(runtime: DebateAiRuntime, bot: DebateBotRow): DebateGenerationLane {
  return runtime.preferredProvider !== "local" &&
    bot.online_enabled !== 0 &&
    runtime.online
    ? runtime.online
    : runtime.local;
}

function modelForBot(row: DebateBotRow, lane: DebateGenerationLane): string {
  if (lane.providerName === "local") {
    return row.local_model?.trim() || row.model?.trim() || lane.model;
  }
  return row.online_model?.trim() || row.model?.trim() || lane.model;
}

async function generateJson(
  lane: DebateGenerationLane,
  messages: ProviderMessage[],
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    repetitionPenalty?: number;
  } = {},
): Promise<Record<string, unknown>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await lane.provider.generateResponse(messages, {
        model: options.model ?? lane.model,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        topP: options.topP,
        topK: options.topK,
        repetitionPenalty: options.repetitionPenalty,
        usagePurpose: "system_unlabeled",
        jsonMode: true,
      });
      return parsedJsonRecord(response);
    } catch (error) {
      lastError = error;
      messages = [
        ...messages,
        {
          role: "system",
          content:
            "Your prior output was malformed. Return one valid JSON object only, with every requested key.",
        },
      ];
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("The model did not return usable output.");
}

function completeMotion(slate: DebateMotionSlateV1): boolean {
  return Boolean(
    slate.motion &&
      slate.forSide.label &&
      slate.forSide.brief &&
      slate.againstSide.label &&
      slate.againstSide.brief,
  );
}

export async function synthesizeDebateSlates(
  topicRaw: unknown,
  lane: DebateGenerationLane,
): Promise<DebateMotionSlateV1[]> {
  const topic = compactText(topicRaw, 1_000);
  if (!topic) throw new HttpError(400, "Enter a topic to synthesize.");
  const parsed = await generateJson(
    lane,
    [
      {
        role: "system",
        content:
          "You design fair, vivid two-sided motions for a short formal debate. Return JSON only.",
      },
      {
        role: "user",
        content: [
          `Topic: ${topic}`,
          "Create exactly three genuinely distinct, balanced debate slates.",
          "Each slate needs: id, motion, forSide {label, brief}, againstSide {label, brief}.",
          "The motion must be editable, specific, and arguable by reasonable people.",
          "Each brief should give that advocate a fair 2-4 sentence mandate without pretending evidence exists.",
          'JSON shape: {"slates":[...]}',
        ].join("\n"),
      },
    ],
    { maxTokens: 1_800, temperature: 0.65 },
  );
  const rawSlates = Array.isArray(parsed.slates) ? parsed.slates : [];
  const slates = rawSlates
    .map((value, index) =>
      normalizeDebateMotionSlateV1(value, `slate-${index + 1}`),
    )
    .filter(completeMotion)
    .slice(0, 3);
  if (slates.length !== 3) {
    throw new HttpError(502, "Prism could not produce three complete debate slates.");
  }
  return slates;
}

async function roleCheck(
  bot: DebateBotRow,
  sideId: DebateSideId,
  motion: DebateMotionSlateV1,
  runtime: DebateAiRuntime,
): Promise<DebateAdvocacyConsent> {
  const lane = laneForBot(runtime, bot);
  const side = sideId === "for" ? motion.forSide : motion.againstSide;
  const opposite = sideId === "for" ? motion.againstSide : motion.forSide;
  const parsed = await generateJson(
    lane,
    [
      {
        role: "system",
        content: [
          bot.system_prompt,
          "",
          "This is a private advocacy consent check, not a public debate turn.",
          "Choose accept for an ordinary compatible assignment.",
          "Choose devils_advocate when the assignment conflicts with your likely beliefs but can be performed as an explicit role.",
          "Choose decline only for an authored boundary or severe defining-identity conflict. Mere disagreement is never enough.",
          "Return JSON only: {status: accept|devils_advocate|decline, reason: string|null}.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Exact motion: ${motion.motion}`,
          `Assigned side: ${side.label}`,
          `Assigned brief: ${side.brief}`,
          `Opposing brief: ${opposite.brief}`,
        ].join("\n"),
      },
    ],
    {
      model: modelForBot(bot, lane),
      maxTokens: 220,
      temperature: 0.1,
    },
  );
  const rawStatus = parsed.status;
  const status =
    rawStatus === "decline" || rawStatus === "devils_advocate"
      ? rawStatus
      : "accept";
  return {
    version: DEBATE_SCHEMA_VERSION,
    botId: bot.id,
    sideId,
    status,
    reason:
      status === "accept" ? null : compactText(parsed.reason, 500) || null,
    motionHash: debateMotionHash(motion),
    botRevision: botRevision(bot),
    checkedAt: new Date().toISOString(),
  };
}

export async function checkDebateAdvocacyRoles(
  db: DatabaseSync,
  userId: string,
  request: {
    motion: unknown;
    forAdvocateBotId: unknown;
    againstAdvocateBotId: unknown;
  },
  runtime: DebateAiRuntime,
): Promise<DebateAdvocacyConsent[]> {
  const motion = normalizeDebateMotionSlateV1(request.motion);
  if (!completeMotion(motion)) throw new HttpError(400, "Complete the motion and both side briefs.");
  const forId = compactText(request.forAdvocateBotId, 200);
  const againstId = compactText(request.againstAdvocateBotId, 200);
  if (!forId || !againstId || forId === againstId) {
    throw new HttpError(400, "Choose two different advocates.");
  }
  const rows = botRows(db, userId, [forId, againstId]);
  if (rows.length !== 2) throw new HttpError(404, "One or more advocates were not found.");
  return Promise.all([
    roleCheck(rows[0]!, "for", motion, runtime),
    roleCheck(rows[1]!, "against", motion, runtime),
  ]);
}

function debatePowerPolicy(
  type: DebatePowerEffectPlanV1["effect"]["type"],
): DebatePowerEffectPlanV1["policy"] {
  if (type === "mute" || type === "intermittent_mute" || type === "hearing_repeat") {
    return "enforced";
  }
  if (
    type === "designation" ||
    type === "awareness" ||
    type === "speech_audience" ||
    type === "avatar_visibility" ||
    type === "avatar_scale" ||
    type === "avatar_color_cycle" ||
    type === "voice_presence" ||
    type === "speech_obfuscation" ||
    type === "identity_mirror" ||
    type === "identity_shapeshift" ||
    type === "false_name" ||
    type === "candor"
  ) {
    return "direct";
  }
  return "adapted";
}

function debatePowerPlan(
  db: DatabaseSync,
  userId: string,
  botIds: readonly string[],
  theme: "light" | "dark",
): DebatePowerPlanV1 {
  const social = resolveSocialPowersForBots(db, userId, botIds);
  const bots: Record<string, DebateBotPowerPlanV1> = {};
  for (const botId of botIds) {
    const source = social.bots[botId];
    const effects: DebatePowerEffectPlanV1[] = (source?.effects ?? []).map(
      (effect, index) => ({
        powerId: source?.powerIds[index] ?? source?.powerIds[0] ?? "power",
        powerName:
          source?.powerNames?.[index] ?? source?.powerNames?.[0] ?? "Power",
        policy: debatePowerPolicy(effect.type),
        effect,
      }),
    );
    bots[botId] = {
      botId,
      effects,
      hardMuted: effects.some(({ effect }) => effect.type === "mute"),
      visibleToBotIds: source?.visibleToBotIds ?? null,
      speechAudienceBotIds: source?.speechAudienceBotIds ?? null,
      warnings: [...(source?.warnings ?? [])],
    };
  }
  return {
    version: DEBATE_SCHEMA_VERSION,
    resolvedAt: social.resolvedAt,
    theme,
    bots,
  };
}

function snapshotBot(
  row: DebateBotRow,
  role: DebateBotSnapshotV1["role"],
  sideId: DebateSideId | null,
  runtime: DebateAiRuntime,
): DebateBotSnapshotV1 {
  const lane = laneForBot(runtime, row);
  return {
    version: DEBATE_SCHEMA_VERSION,
    id: row.id,
    name: row.name,
    systemPrompt: row.system_prompt,
    role,
    sideId,
    color: row.color,
    glyph: row.glyph,
    avatarDetails: parseStoredBotAvatarDetailsV1(row.avatar_details_json),
    voiceProfile:
      parseStoredBotAudioVoiceProfileV1(row.audio_voice_profile_override) ??
      parseStoredBotAudioVoiceProfileV1(row.authored_audio_voice_profile),
    powers: parseStoredBotPowersV1(row.powers_json),
    provider: lane.providerName,
    model: modelForBot(row, lane),
    revision: botRevision(row),
  };
}

function freezeEvidence(value: unknown, now: string): DebateEvidencePacketV1 {
  const evidence = normalizeDebateEvidencePacketV1(value);
  return { ...evidence, frozenAt: now };
}

function serializeSessionState(session: DebateSessionV1): string {
  return JSON.stringify({ ...session, events: [] });
}

function eventRows(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): DebateEventV1[] {
  return (
    db
      .prepare(
        `SELECT event_json
           FROM debate_events
          WHERE user_id = ? AND session_id = ?
          ORDER BY sequence`,
      )
      .all(userId, sessionId) as unknown as Array<{ event_json: string }>
  ).flatMap((row) => {
    try {
      return [JSON.parse(row.event_json) as DebateEventV1];
    } catch {
      return [];
    }
  });
}

function parseSessionRow(
  db: DatabaseSync,
  userId: string,
  row: DebateSessionRow,
): DebateSessionV1 {
  const parsed = JSON.parse(row.session_json) as DebateSessionV1;
  return {
    ...parsed,
    revision: row.revision,
    status: row.status,
    phase: row.phase,
    stepKey: row.step_key,
    winnerSideId: row.winner_side_id,
    error: row.error,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    events: eventRows(db, userId, row.id),
  };
}

function sessionRow(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): DebateSessionRow | null {
  return (
    (db
      .prepare(
        `SELECT id, revision, status, phase, step_key, player_role,
                player_side_id, motion, winner_side_id, session_json, error,
                created_at, updated_at, completed_at
           FROM debate_sessions
          WHERE id = ? AND user_id = ?`,
      )
      .get(sessionId, userId) as DebateSessionRow | undefined) ?? null
  );
}

export function getDebateSession(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
): DebateSessionV1 {
  const row = sessionRow(db, userId, sessionId);
  if (!row) throw new HttpError(404, "Debate not found.");
  return parseSessionRow(db, userId, row);
}

export function listDebateSessions(
  db: DatabaseSync,
  userId: string,
): DebateSessionListItemV1[] {
  return (
    db
      .prepare(
        `SELECT id, status, phase, motion, player_role, winner_side_id,
                updated_at, completed_at
           FROM debate_sessions
          WHERE user_id = ? AND status != 'cancelled'
          ORDER BY updated_at DESC
          LIMIT 100`,
      )
      .all(userId) as unknown as Array<{
      id: string;
      status: DebateSessionV1["status"];
      phase: DebateSessionV1["phase"];
      motion: string;
      player_role: DebateSessionV1["playerRole"];
      winner_side_id: DebateSideId | null;
      updated_at: string;
      completed_at: string | null;
    }>
  ).map((row) => ({
    id: row.id,
    status: row.status,
    phase: row.phase,
    motion: row.motion,
    playerRole: row.player_role,
    winnerSideId: row.winner_side_id,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
  }));
}

function validateConsents(
  consents: readonly DebateAdvocacyConsent[],
  motion: DebateMotionSlateV1,
  advocates: readonly DebateBotRow[],
): DebateAdvocacyConsent[] {
  const expectedHash = debateMotionHash(motion);
  return advocates.map((bot, index) => {
    const sideId: DebateSideId = index === 0 ? "for" : "against";
    const consent = consents.find(
      (candidate) => candidate.botId === bot.id && candidate.sideId === sideId,
    );
    if (
      !consent ||
      consent.motionHash !== expectedHash ||
      consent.botRevision !== botRevision(bot)
    ) {
      throw new HttpError(
        409,
        `${bot.name}'s advocacy consent is stale. Check the role again.`,
      );
    }
    if (consent.status === "decline") {
      throw new HttpError(
        409,
        `${bot.name} declined this role. Swap sides, choose another bot, or revise the motion.`,
      );
    }
    return consent;
  });
}

export function createDebateSession(
  db: DatabaseSync,
  userId: string,
  request: DebateSessionCreateRequest,
  runtime: DebateAiRuntime,
): DebateSessionV1 {
  const idempotencyKey = normalizeDebateIdempotencyKey(request.idempotencyKey);
  if (!idempotencyKey) throw new HttpError(400, "A stable idempotency key is required.");
  const existing = db
    .prepare(
      "SELECT id FROM debate_sessions WHERE user_id = ? AND create_idempotency_key = ?",
    )
    .get(userId, idempotencyKey) as { id?: string } | undefined;
  if (existing?.id) return getDebateSession(db, userId, existing.id);

  const motion = normalizeDebateMotionSlateV1(request.motion);
  if (!completeMotion(motion)) throw new HttpError(400, "Complete the motion and both side briefs.");
  if (!isDebatePlayerRole(request.playerRole)) {
    throw new HttpError(400, "Choose a valid player role.");
  }
  const playerSideId =
    request.playerRole === "participant" && isDebateSideId(request.playerSideId)
      ? request.playerSideId
      : null;
  if (request.playerRole === "participant" && !playerSideId) {
    throw new HttpError(400, "Choose which side you will participate on.");
  }
  const castIds = [
    request.moderatorBotId,
    request.forAdvocateBotId,
    request.againstAdvocateBotId,
  ].map((id) => compactText(id, 200));
  if (new Set(castIds).size !== 3 || castIds.some((id) => !id)) {
    throw new HttpError(400, "Choose exactly three different owned bots.");
  }
  const rows = botRows(db, userId, castIds);
  if (rows.length !== 3) throw new HttpError(404, "One or more cast bots were not found.");
  const [moderatorRow, forRow, againstRow] = rows as [
    DebateBotRow,
    DebateBotRow,
    DebateBotRow,
  ];
  const advocacyConsent = validateConsents(
    request.advocacyConsent,
    motion,
    [forRow, againstRow],
  );
  const now = new Date().toISOString();
  const powerPlan = debatePowerPlan(
    db,
    userId,
    castIds,
    request.theme === "dark" ? "dark" : "light",
  );
  if (powerPlan.bots[moderatorRow.id]?.hardMuted) {
    throw new HttpError(
      409,
      `${moderatorRow.name} is hard-muted by a Power and cannot moderate.`,
    );
  }
  const session: DebateSessionV1 = {
    version: DEBATE_SCHEMA_VERSION,
    id: randomUUID(),
    revision: 1,
    status: "live",
    phase: "opening",
    stepKey: "intro",
    playerRole: request.playerRole,
    playerSideId,
    motion,
    evidence: freezeEvidence(request.evidence, now),
    moderator: snapshotBot(moderatorRow, "moderator", null, runtime),
    forAdvocate: snapshotBot(forRow, "advocate", "for", runtime),
    againstAdvocate: snapshotBot(againstRow, "advocate", "against", runtime),
    advocacyConsent,
    powerPlan,
    caseBoard: [],
    ballots: [],
    playerVerdict: null,
    winnerSideId: null,
    events: [],
    error: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  db.prepare(
    `INSERT INTO debate_sessions
       (id, user_id, revision, status, phase, step_key, player_role,
        player_side_id, create_idempotency_key, motion, winner_side_id,
        session_json, error, created_at, updated_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    session.id,
    userId,
    session.revision,
    session.status,
    session.phase,
    session.stepKey,
    session.playerRole,
    session.playerSideId,
    idempotencyKey,
    session.motion.motion,
    null,
    serializeSessionState(session),
    null,
    now,
    now,
    null,
  );
  return session;
}

function mutationReplay(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  idempotencyKey: string,
): DebateSessionV1 | null {
  const row = db
    .prepare(
      `SELECT response_json
         FROM debate_mutations
        WHERE user_id = ? AND session_id = ? AND idempotency_key = ?`,
    )
    .get(userId, sessionId, idempotencyKey) as
    | { response_json?: string }
    | undefined;
  if (!row?.response_json) return null;
  return JSON.parse(row.response_json) as DebateSessionV1;
}

function assertMutation(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  request: { expectedRevision: number; idempotencyKey: string },
): {
  session: DebateSessionV1;
  idempotencyKey: string;
  replay: DebateSessionV1 | null;
} {
  const idempotencyKey = normalizeDebateIdempotencyKey(request.idempotencyKey);
  if (!idempotencyKey) throw new HttpError(400, "A stable idempotency key is required.");
  const replay = mutationReplay(db, userId, sessionId, idempotencyKey);
  const session = getDebateSession(db, userId, sessionId);
  if (replay) return { session, idempotencyKey, replay };
  if (!Number.isInteger(request.expectedRevision) || request.expectedRevision < 1) {
    throw new HttpError(400, "expectedRevision must be a positive integer.");
  }
  if (session.revision !== request.expectedRevision) {
    throw new HttpError(
      409,
      `Debate changed from revision ${request.expectedRevision} to ${session.revision}. Refresh and retry.`,
    );
  }
  return { session, idempotencyKey, replay: null };
}

function insertEvents(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  events: readonly DebateEventV1[],
): void {
  const insert = db.prepare(
    `INSERT INTO debate_events
       (id, user_id, session_id, sequence, phase, step_key, kind,
        event_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  for (const event of events) {
    insert.run(
      event.id,
      userId,
      sessionId,
      event.sequence,
      event.phase,
      event.stepKey,
      event.kind,
      JSON.stringify(event),
      event.createdAt,
    );
  }
}

function commitMutation(
  db: DatabaseSync,
  userId: string,
  previous: DebateSessionV1,
  nextInput: DebateSessionV1,
  idempotencyKey: string,
  newEvents: readonly DebateEventV1[],
): DebateSessionV1 {
  const now = new Date().toISOString();
  const next: DebateSessionV1 = {
    ...nextInput,
    revision: previous.revision + 1,
    updatedAt: now,
    events: [...previous.events, ...newEvents],
  };
  const ownsTransaction = !db.isTransaction;
  if (ownsTransaction) db.exec("BEGIN IMMEDIATE");
  try {
    const current = db
      .prepare(
        "SELECT revision FROM debate_sessions WHERE id = ? AND user_id = ?",
      )
      .get(previous.id, userId) as { revision?: number } | undefined;
    if (current?.revision !== previous.revision) {
      throw new HttpError(409, "Debate changed while this turn was being prepared. Refresh and retry.");
    }
    const result = db
      .prepare(
        `UPDATE debate_sessions
            SET revision = ?, status = ?, phase = ?, step_key = ?,
                winner_side_id = ?, session_json = ?, error = ?,
                updated_at = ?, completed_at = ?
          WHERE id = ? AND user_id = ? AND revision = ?`,
      )
      .run(
        next.revision,
        next.status,
        next.phase,
        next.stepKey,
        next.winnerSideId,
        serializeSessionState(next),
        next.error,
        now,
        next.completedAt,
        next.id,
        userId,
        previous.revision,
      );
    if (Number(result.changes) !== 1) {
      throw new HttpError(409, "Debate changed while this turn was being prepared. Refresh and retry.");
    }
    insertEvents(db, userId, next.id, newEvents);
    db.prepare(
      `INSERT INTO debate_mutations
         (user_id, session_id, idempotency_key, expected_revision,
          result_revision, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      next.id,
      idempotencyKey,
      previous.revision,
      next.revision,
      JSON.stringify(next),
      now,
    );
    if (ownsTransaction) db.exec("COMMIT");
    return next;
  } catch (error) {
    if (ownsTransaction) db.exec("ROLLBACK");
    throw error;
  }
}

function makeEvent(
  session: DebateSessionV1,
  args: {
    kind: DebateEventKind;
    speakerKind: DebateSpeakerKind;
    speakerBotId?: string | null;
    sideId?: DebateSideId | null;
    content: string;
    sourceIds?: string[];
    stepKey?: string;
  },
): DebateEventV1 {
  return {
    version: DEBATE_SCHEMA_VERSION,
    id: randomUUID(),
    sequence: session.events.length + 1,
    phase: session.phase,
    stepKey: args.stepKey ?? session.stepKey,
    kind: args.kind,
    speakerKind: args.speakerKind,
    speakerBotId: args.speakerBotId ?? null,
    sideId: args.sideId ?? null,
    content: args.content,
    sourceIds: args.sourceIds ?? [],
    createdAt: new Date().toISOString(),
  };
}

function botForSide(session: DebateSessionV1, sideId: DebateSideId): DebateBotSnapshotV1 {
  return sideId === "for" ? session.forAdvocate : session.againstAdvocate;
}

function debateBots(session: DebateSessionV1): DebateBotSnapshotV1[] {
  return [session.moderator, session.forAdvocate, session.againstAdvocate];
}

function sideLabel(session: DebateSessionV1, sideId: DebateSideId): string {
  return sideId === "for"
    ? session.motion.forSide.label
    : session.motion.againstSide.label;
}

function laneForSnapshot(
  runtime: DebateAiRuntime,
  snapshot: DebateBotSnapshotV1,
): DebateGenerationLane {
  return snapshot.provider === "openai" && runtime.online
    ? runtime.online
    : snapshot.provider === "anthropic" &&
        runtime.online?.providerName === "anthropic"
      ? runtime.online
      : runtime.local;
}

function evidencePrompt(evidence: DebateEvidencePacketV1): string {
  const notes = evidence.notes ? `Player notes:\n${evidence.notes}` : "Player notes: none.";
  const sources =
    evidence.sources.length > 0
      ? evidence.sources
          .map(
            (source) =>
              `- [[source:${source.id}]] ${source.title}: ${source.snippet} (${source.url})`,
          )
          .join("\n")
      : "No web sources were frozen.";
  return `${notes}\nFrozen sources:\n${sources}`;
}

function publicTranscript(
  session: DebateSessionV1,
  observerBotId?: string,
  includeOwnSpeech = true,
): string {
  const events = session.events
    .filter((event) =>
      ["intro", "speech", "silence", "player_turn", "reaction"].includes(event.kind),
    )
    .filter((event) => {
      if (!observerBotId || !event.speakerBotId) return true;
      if (event.speakerBotId === observerBotId && includeOwnSpeech) return true;
      const audience =
        session.powerPlan.bots[event.speakerBotId]?.speechAudienceBotIds;
      return audience === null || audience === undefined
        ? true
        : audience.includes(observerBotId);
    })
    .slice(-18);
  if (events.length === 0) return "No public speech yet.";
  return events
    .map((event) => {
      const speaker =
        event.speakerKind === "player"
          ? "Player"
          : event.speakerBotId === session.moderator.id
            ? session.moderator.name
            : event.speakerBotId === session.forAdvocate.id
              ? session.forAdvocate.name
              : event.speakerBotId === session.againstAdvocate.id
                ? session.againstAdvocate.name
                : "System";
      return `${speaker}: ${event.content}`;
    })
    .join("\n");
}

function powerPrompt(session: DebateSessionV1, botId: string): string {
  const plan = session.powerPlan.bots[botId];
  if (!plan || plan.effects.length === 0) return "";
  return [
    "Frozen Power instructions:",
    ...plan.effects.map(
      ({ powerName, policy, effect }) =>
        `- ${powerName} (${policy}): ${JSON.stringify(effect)}`,
    ),
    "Formal role and scheduled floor remain bound to your stable bot ID. Interruptions may only appear as one brief between-turn reaction.",
  ].join("\n");
}

function advocacyDisclosure(session: DebateSessionV1): string {
  const devils = session.advocacyConsent
    .filter((consent) => consent.status === "devils_advocate")
    .map((consent) => botForSide(session, consent.sideId).name);
  return devils.length > 0
    ? `Briefly disclose once that ${devils.join(" and ")} ${
        devils.length === 1 ? "is" : "are"
      } serving as an explicit Devil's Advocate.`
    : "No Devil's Advocate disclosure is needed.";
}

async function generateSpeech(
  session: DebateSessionV1,
  snapshot: DebateBotSnapshotV1,
  instruction: string,
  runtime: DebateAiRuntime,
): Promise<{ content: string; sourceIds: string[]; silent: boolean }> {
  const powerBot = session.powerPlan.bots[snapshot.id];
  const effects = powerBot?.effects.map((entry) => entry.effect) ?? [];
  if (
    powerBot?.hardMuted ||
    botPowerIntermittentMuteTurnIsIgnoredFromEffectsV1(
      effects,
      `${session.id}:${session.stepKey}:${snapshot.id}`,
    )
  ) {
    return {
      content: BOT_POWER_CANONICAL_SILENCE_V1,
      sourceIds: [],
      silent: true,
    };
  }
  const lane = laneForSnapshot(runtime, snapshot);
  const result = await generateJson(
    lane,
    [
      {
        role: "system",
        content: [
          snapshot.systemPrompt,
          "",
          "You are participating in PRISM Debate, a short formal duel.",
          `Motion: ${session.motion.motion}`,
          `For brief: ${session.motion.forSide.brief}`,
          `Against brief: ${session.motion.againstSide.brief}`,
          `Judging criteria: ${DEBATE_CRITERIA}.`,
          "Use only the frozen prep packet below. Never claim live research.",
          "Cite a frozen source only as [[source:id]]. Never invent a source ID.",
          "Concede fair points when warranted. Stay in your assigned formal role.",
          powerPrompt(session, snapshot.id),
          "",
          evidencePrompt(session.evidence),
        ]
          .filter(Boolean)
          .join("\n"),
      },
      {
        role: "user",
        content: [
          instruction,
          "",
          "Public debate so far:",
          publicTranscript(session, snapshot.id),
          "",
          'Return JSON only: {"content":"your public statement"}',
        ].join("\n"),
      },
    ],
    {
      model: snapshot.model,
      maxTokens: 520,
      temperature: 0.55,
    },
  );
  let intended = multilineText(result.content, 6_000);
  if (!intended) throw new Error("The bot returned an empty debate turn.");
  const responseBudget = strongestBotPowerResponseBudgetEffectV1(effects);
  intended = applyBotPowerResponseBudgetV1(intended, responseBudget, 3);
  if (session.stepKey === "intro") {
    const devils = session.advocacyConsent
      .filter((consent) => consent.status === "devils_advocate")
      .map((consent) => botForSide(session, consent.sideId).name);
    if (devils.length > 0 && !/devil['’]s advocate/iu.test(intended)) {
      intended = `${intended}\n\nModerator’s disclosure: ${devils.join(
        " and ",
      )} ${devils.length === 1 ? "is" : "are"} serving as an explicit Devil’s Advocate.`;
    }
  }
  if (effects.some((effect) => effect.type === "speech_obfuscation")) {
    intended = applyBotPowerMumbledResponseV1(intended);
  }
  if (powerBot?.speechAudienceBotIds?.length === 0) {
    intended = BOT_POWER_CANONICAL_SILENCE_V1;
  }
  if (powerBot?.hardMuted) intended = applyBotPowerMuteResponseV1(intended);
  const sanitized = sanitizeDebateStatementSources(intended, session.evidence);
  return {
    content: sanitized.content,
    sourceIds: sanitized.sourceIds,
    silent: sanitized.content === BOT_POWER_CANONICAL_SILENCE_V1,
  };
}

function claimSummary(content: string): string {
  const plain = content
    .replace(/\[\[source:[^\]]+\]\]/giu, "")
    .replace(/\*[^*]{1,160}\*/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  return (plain.match(/^.+?[.!?](?:\s|$)/u)?.[0] ?? plain).trim().slice(0, 220);
}

function updateCaseBoard(
  session: DebateSessionV1,
  event: DebateEventV1,
): DebateCaseCardV1[] {
  if (
    (event.kind !== "speech" &&
      !(
        event.kind === "player_turn" &&
        event.stepKey !== "challenge_judge_question"
      )) ||
    !event.sideId ||
    event.content === "Pass." ||
    event.content === BOT_POWER_CANONICAL_SILENCE_V1 ||
    botPowerTextRequestsRepeat(event.content)
  ) {
    return session.caseBoard;
  }
  const speakerEffects = event.speakerBotId
    ? session.powerPlan.bots[event.speakerBotId]?.effects ?? []
    : [];
  if (
    speakerEffects.some(
      ({ effect }) => effect.type === "speech_obfuscation",
    )
  ) {
    return session.caseBoard;
  }
  const summary = claimSummary(event.content);
  if (!summary) return session.caseBoard;
  const now = event.createdAt;
  const otherSide: DebateSideId = event.sideId === "for" ? "against" : "for";
  const next = session.caseBoard.map((card) =>
    card.sideId === otherSide && card.status === "active"
      ? { ...card, status: "challenged" as const, updatedAt: now }
      : card,
  );
  next.push({
    id: randomUUID(),
    sideId: event.sideId,
    summary,
    status: "active",
    sourceIds: event.sourceIds,
    createdEventId: event.id,
    updatedAt: now,
  });
  return (["for", "against"] as const).flatMap((sideId) =>
    next
      .filter((card) => card.sideId === sideId)
      .slice(-DEBATE_CASE_CARDS_PER_SIDE),
  );
}

function caseBoardEvent(
  session: DebateSessionV1,
  board: DebateCaseCardV1[],
  sourceEvent: DebateEventV1,
): DebateEventV1 {
  return makeEvent(session, {
    kind: "case_board",
    speakerKind: "system",
    sideId: sourceEvent.sideId,
    content: JSON.stringify(board),
    sourceIds: sourceEvent.sourceIds,
  });
}

export async function refineDebateCaseBoard(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  sourceEvent: DebateEventV1,
  provider: LlmProvider,
): Promise<void> {
  const initial = getDebateSession(db, userId, sessionId);
  const target = initial.caseBoard.find(
    (card) => card.createdEventId === sourceEvent.id,
  );
  if (!target) return;
  const result = await generateJson(
    {
      provider,
      providerName: "local",
      model: provider.diagnosticModel?.trim() || "auxiliary",
    },
    [
      {
        role: "system",
        content:
          "Distill a scoreless public debate case board. Do not judge a winner, use hidden intent, or add facts. Return JSON only.",
      },
      {
        role: "user",
        content: [
          `Newest public statement: ${sourceEvent.content}`,
          `Current board: ${JSON.stringify(initial.caseBoard)}`,
          "Return a compact claim summary of at most 220 characters.",
          "You may update existing card states only when the public statement clearly challenges, concedes, or leaves a directly posed claim unanswered.",
          'JSON shape: {"summary":"...","statusUpdates":[{"id":"existing-card-id","status":"active|challenged|conceded|unanswered"}]}',
        ].join("\n"),
      },
    ],
    { maxTokens: 420, temperature: 0.1 },
  );
  const summary = compactText(result.summary, 220);
  if (!summary) return;
  const validStatuses = new Set([
    "active",
    "challenged",
    "conceded",
    "unanswered",
  ]);
  const statusUpdates = new Map<string, DebateCaseCardV1["status"]>();
  if (Array.isArray(result.statusUpdates)) {
    for (const rawUpdate of result.statusUpdates) {
      const update = jsonRecord(rawUpdate);
      const id = compactText(update.id, 200);
      if (
        id &&
        typeof update.status === "string" &&
        validStatuses.has(update.status)
      ) {
        statusUpdates.set(id, update.status as DebateCaseCardV1["status"]);
      }
    }
  }
  db.exec("BEGIN IMMEDIATE");
  try {
    const row = sessionRow(db, userId, sessionId);
    if (!row) {
      db.exec("ROLLBACK");
      return;
    }
    const stored = JSON.parse(row.session_json) as DebateSessionV1;
    if (
      !stored.caseBoard.some(
        (card) => card.createdEventId === sourceEvent.id,
      )
    ) {
      db.exec("ROLLBACK");
      return;
    }
    const updatedAt = new Date().toISOString();
    const caseBoard = stored.caseBoard.map((card) => ({
      ...card,
      summary:
        card.createdEventId === sourceEvent.id ? summary : card.summary,
      status: statusUpdates.get(card.id) ?? card.status,
      updatedAt:
        card.createdEventId === sourceEvent.id || statusUpdates.has(card.id)
          ? updatedAt
          : card.updatedAt,
    }));
    const current = parseSessionRow(db, userId, row);
    const historyEvent: DebateEventV1 = {
      ...makeEvent(
        { ...current, caseBoard },
        {
          kind: "case_board",
          speakerKind: "system",
          sideId: sourceEvent.sideId,
          content: JSON.stringify(caseBoard),
          sourceIds: sourceEvent.sourceIds,
          stepKey: sourceEvent.stepKey,
        },
      ),
      phase: sourceEvent.phase,
    };
    db.prepare(
      `UPDATE debate_sessions
          SET session_json = ?
        WHERE id = ? AND user_id = ?`,
    ).run(
      serializeSessionState({ ...stored, caseBoard }),
      sessionId,
      userId,
    );
    insertEvents(db, userId, sessionId, [historyEvent]);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function queueCaseBoardRefinement(
  db: DatabaseSync,
  userId: string,
  session: DebateSessionV1,
  events: readonly DebateEventV1[],
  provider: LlmProvider | undefined,
): void {
  if (!provider) return;
  const sourceEvent = events.find(
    (event) =>
      (event.kind === "speech" || event.kind === "player_turn") &&
      session.caseBoard.some((card) => card.createdEventId === event.id),
  );
  if (!sourceEvent) return;
  void refineDebateCaseBoard(
    db,
    userId,
    session.id,
    sourceEvent,
    provider,
  ).catch(() => {
    // The deterministic board is already committed and remains authoritative.
  });
}

function statusForStep(stepKey: string): DebateSessionV1["status"] {
  return PLAYER_STEPS.has(stepKey) ? "waiting_for_player" : "live";
}

function enterRebuttal(
  session: DebateSessionV1,
  sideId: DebateSideId,
): DebateSessionV1 {
  const playerOwns =
    session.playerRole === "participant" && session.playerSideId === sideId;
  const stepKey = `rebuttal_${sideId}${playerOwns ? "_player" : ""}`;
  return {
    ...session,
    phase: "rebuttal",
    stepKey,
    status: statusForStep(stepKey),
  };
}

function nextAfterRebuttal(
  session: DebateSessionV1,
  sideId: DebateSideId,
): DebateSessionV1 {
  if (sideId === "against") return enterRebuttal(session, "for");
  return {
    ...session,
    phase: "closing",
    stepKey: "closing_against",
    status: "live",
  };
}

function nextAfterOpening(session: DebateSessionV1): DebateSessionV1 {
  if (session.playerRole === "judge") {
    return {
      ...session,
      phase: "challenge",
      stepKey: "challenge_judge_question",
      status: "waiting_for_player",
    };
  }
  if (session.playerRole === "participant") {
    return {
      ...session,
      phase: "challenge",
      stepKey: "challenge_participant_prompt",
      status: "live",
    };
  }
  return {
    ...session,
    phase: "challenge",
    stepKey: "challenge_for_prompt",
    status: "live",
  };
}

function moderatorChallengeInstruction(
  session: DebateSessionV1,
  sideId: DebateSideId,
): string {
  return [
    `Ask one concise, difficult, even-handed challenge to the ${sideLabel(session, sideId)} side.`,
    "Do not answer it. Target a vulnerability in the public argument so far.",
  ].join(" ");
}

function botHeardEvent(
  session: DebateSessionV1,
  event: DebateEventV1,
  listenerBotId: string,
): boolean {
  if (!event.speakerBotId || event.speakerBotId === listenerBotId) return true;
  const audience =
    session.powerPlan.bots[event.speakerBotId]?.speechAudienceBotIds;
  return audience === null || audience === undefined
    ? true
    : audience.includes(listenerBotId);
}

function hearingRepeatReaction(
  session: DebateSessionV1,
  requester: DebateBotSnapshotV1,
  requestEvent: DebateEventV1,
): DebateEventV1 | null {
  const requesterEffects =
    session.powerPlan.bots[requester.id]?.effects.map(({ effect }) => effect) ??
    [];
  if (
    !strongestHearingRepeatEffect(requesterEffects) ||
    !botPowerTextRequestsRepeat(requestEvent.content)
  ) {
    return null;
  }
  const source = [...session.events]
    .reverse()
    .find(
      (event) =>
        ["intro", "speech", "reaction"].includes(event.kind) &&
        Boolean(event.speakerBotId) &&
        event.speakerBotId !== requester.id &&
        event.content !== BOT_POWER_CANONICAL_SILENCE_V1 &&
        botHeardEvent(session, event, requester.id),
    );
  if (!source?.speakerBotId) return null;
  const repeatingBot = debateBots(session).find(
    (bot) => bot.id === source.speakerBotId,
  );
  if (!repeatingBot) return null;
  return makeEvent(session, {
    kind: "reaction",
    speakerKind: repeatingBot.role,
    speakerBotId: repeatingBot.id,
    sideId: source.sideId,
    content: source.content,
    sourceIds: source.sourceIds,
  });
}

function stablePowerChance(key: string): number {
  return createHash("sha256").update(key).digest()[0]! / 255;
}

function interruptionCandidate(
  session: DebateSessionV1,
  speaker: DebateBotSnapshotV1,
): DebateBotSnapshotV1 | null {
  const strengthRank = { small: 1, medium: 2, large: 3 } as const;
  return debateBots(session)
    .filter((candidate) => candidate.id !== speaker.id)
    .flatMap((candidate) => {
      const plan = session.powerPlan.bots[candidate.id];
      if (plan?.hardMuted || !botHeardEvent(
        session,
        {
          version: DEBATE_SCHEMA_VERSION,
          id: "",
          sequence: 0,
          phase: session.phase,
          stepKey: session.stepKey,
          kind: "speech",
          speakerKind: speaker.role,
          speakerBotId: speaker.id,
          sideId: speaker.sideId,
          content: "",
          sourceIds: [],
          createdAt: session.updatedAt,
        },
        candidate.id,
      )) {
        return [];
      }
      return (plan?.effects ?? []).flatMap(({ effect }) => {
        if (
          effect.type !== "interruption" ||
          !effect.targets.some(
            (target) =>
              target.kind === "all" ||
              (target.kind === "bot" && target.botId === speaker.id),
          )
        ) {
          return [];
        }
        const eligible =
          effect.certainty === "always" ||
          stablePowerChance(
            `${session.id}:${session.stepKey}:${candidate.id}:${speaker.id}`,
          ) < (effect.frequency === "frequent" ? 0.65 : 0.35);
        return eligible
          ? [
              {
                bot: candidate,
                score:
                  (effect.certainty === "always" ? 100 : 0) +
                  (effect.frequency === "frequent" ? 10 : 0) +
                  strengthRank[effect.strength],
              },
            ]
          : [];
      });
    })
    .sort((a, b) => b.score - a.score || a.bot.id.localeCompare(b.bot.id))[0]
    ?.bot ?? null;
}

async function interruptionReaction(
  session: DebateSessionV1,
  speaker: DebateBotSnapshotV1,
  speechEvent: DebateEventV1,
  runtime: DebateAiRuntime,
): Promise<DebateEventV1 | null> {
  if (session.stepKey === "intro" || speechEvent.kind !== "speech") return null;
  const interrupter = interruptionCandidate(session, speaker);
  if (!interrupter) return null;
  try {
    const reactionSession = session;
    const speech = await generateSpeech(
      reactionSession,
      interrupter,
      `Give one brief between-turn reaction to ${speaker.name}'s latest line. Do not take the scheduled floor, start a new argument, or exceed one sentence.`,
      runtime,
    );
    if (speech.silent) return null;
    return makeEvent(reactionSession, {
      kind: "reaction",
      speakerKind: interrupter.role,
      speakerBotId: interrupter.id,
      sideId: interrupter.sideId,
      content: speech.content,
      sourceIds: speech.sourceIds,
    });
  } catch {
    return null;
  }
}

async function speechTransition(
  session: DebateSessionV1,
  snapshot: DebateBotSnapshotV1,
  sideId: DebateSideId | null,
  instruction: string,
  runtime: DebateAiRuntime,
  next: (session: DebateSessionV1) => DebateSessionV1,
): Promise<{ session: DebateSessionV1; events: DebateEventV1[] }> {
  const speech = await generateSpeech(session, snapshot, instruction, runtime);
  const event = makeEvent(session, {
    kind: speech.silent ? "silence" : "speech",
    speakerKind: snapshot.role,
    speakerBotId: snapshot.id,
    sideId,
    content: speech.content,
    sourceIds: speech.sourceIds,
  });
  const withBoard = {
    ...session,
    caseBoard: updateCaseBoard(session, event),
    events: [...session.events, event],
  };
  const boardChanged = withBoard.caseBoard !== session.caseBoard;
  const boardEvent = boardChanged
    ? caseBoardEvent(withBoard, withBoard.caseBoard, event)
    : null;
  if (boardEvent) withBoard.events.push(boardEvent);
  const repeat = hearingRepeatReaction(withBoard, snapshot, event);
  const reaction =
    repeat ??
    (await interruptionReaction(withBoard, snapshot, event, runtime));
  if (reaction) {
    reaction.sequence = withBoard.events.length + 1;
    withBoard.events.push(reaction);
  }
  const transitioned = next(withBoard);
  return {
    session: { ...transitioned, events: session.events },
    events: [
      event,
      ...(boardEvent ? [boardEvent] : []),
      ...(reaction ? [reaction] : []),
    ],
  };
}

function botBallotPrompt(session: DebateSessionV1, voter: DebateBotSnapshotV1): string {
  return [
    "Advocacy has ended. Vote independently for either for or against.",
    `Judge only ${DEBATE_CRITERIA}; do not vote for your assigned side by default.`,
    "Do not use private intent, hidden speech, relationship memory, or numeric scoring.",
    `Motion: ${session.motion.motion}`,
    `For label: ${session.motion.forSide.label}`,
    `Against label: ${session.motion.againstSide.label}`,
    "Public transcript:",
    publicTranscript(session, voter.id, false),
    'Return JSON only: {"sideId":"for|against","reason":"one concise public reason"}.',
    `You are ${voter.name}.`,
  ].join("\n");
}

async function generateBallot(
  session: DebateSessionV1,
  voter: DebateBotSnapshotV1,
  runtime: DebateAiRuntime,
): Promise<DebateBallotV1> {
  const lane = laneForSnapshot(runtime, voter);
  const parsed = await generateJson(
    lane,
    [
      {
        role: "system",
        content: [
          voter.systemPrompt,
          "You are now a neutral ballot judge. Your prior advocacy role does not control your vote.",
        ].join("\n"),
      },
      { role: "user", content: botBallotPrompt(session, voter) },
    ],
    { model: voter.model, maxTokens: 220, temperature: 0.2 },
  );
  const sideId: DebateSideId = parsed.sideId === "against" ? "against" : "for";
  const muted = session.powerPlan.bots[voter.id]?.hardMuted === true;
  return {
    version: DEBATE_SCHEMA_VERSION,
    voterBotId: voter.id,
    sideId,
    reason: muted ? null : compactText(parsed.reason, 600) || "That side made the clearer case.",
    privateReason: muted,
    createdAt: new Date().toISOString(),
  };
}

function majorityWinner(ballots: readonly DebateBallotV1[]): DebateSideId {
  const forVotes = ballots.filter((ballot) => ballot.sideId === "for").length;
  return forVotes >= 2 ? "for" : "against";
}

function skippedTransition(session: DebateSessionV1): DebateSessionV1 {
  const step = session.stepKey;
  if (step === "intro") return { ...session, stepKey: "opening_for" };
  if (step === "opening_for") return { ...session, stepKey: "opening_against" };
  if (step === "opening_against") return nextAfterOpening(session);
  if (step.endsWith("_prompt")) {
    return { ...session, stepKey: step.replace(/_prompt$/u, "_answer") };
  }
  if (step.endsWith("_answer")) {
    if (step === "challenge_for_answer") {
      return { ...session, stepKey: "challenge_against_prompt" };
    }
    if (
      step === "challenge_against_answer" ||
      step === "challenge_opponent_answer" ||
      step === "challenge_moderator_other_answer" ||
      step === "challenge_judge_pass_against_answer"
    ) {
      return enterRebuttal(session, "against");
    }
    if (step === "challenge_judge_pass_for_answer") {
      return { ...session, stepKey: "challenge_judge_pass_against_prompt" };
    }
  }
  if (step.startsWith("rebuttal_against")) return nextAfterRebuttal(session, "against");
  if (step.startsWith("rebuttal_for")) return nextAfterRebuttal(session, "for");
  if (step === "closing_against") return { ...session, stepKey: "closing_for" };
  if (step === "closing_for") {
    const nextStep = session.playerRole === "judge" ? "verdict_player" : "ballot_moderator";
    return {
      ...session,
      phase: "verdict",
      stepKey: nextStep,
      status: statusForStep(nextStep),
    };
  }
  if (step === "ballot_moderator") return { ...session, stepKey: "ballot_for" };
  if (step === "ballot_for") return { ...session, stepKey: "ballot_against" };
  if (step === "ballot_against") {
    const winnerSideId =
      session.playerRole === "judge"
        ? session.playerVerdict
        : session.ballots.length >= 3
          ? majorityWinner(session.ballots)
          : null;
    return {
      ...session,
      status: winnerSideId ? "completed" : "failed",
      winnerSideId,
      completedAt: winnerSideId ? new Date().toISOString() : null,
      error: winnerSideId ? null : "The debate ended without enough ballots.",
    };
  }
  throw new HttpError(409, "This Debate step cannot be skipped.");
}

function skipEvent(session: DebateSessionV1): DebateEventV1 {
  return makeEvent(session, {
    kind: "error",
    speakerKind: "system",
    content: "Turn skipped. No dialogue was fabricated.",
  });
}

async function advanceStep(
  session: DebateSessionV1,
  runtime: DebateAiRuntime,
): Promise<{ session: DebateSessionV1; events: DebateEventV1[] }> {
  switch (session.stepKey) {
    case "intro":
      return speechTransition(
        session,
        session.moderator,
        null,
        [
          "Open the Duel in 3-5 sentences.",
          `State the exact motion, introduce ${session.forAdvocate.name} for ${session.motion.forSide.label} and ${session.againstAdvocate.name} for ${session.motion.againstSide.label}, and name the judging criteria: ${DEBATE_CRITERIA}.`,
          advocacyDisclosure(session),
        ].join(" "),
        runtime,
        (next) => ({ ...next, stepKey: "opening_for" }),
      );
    case "opening_for":
      return speechTransition(
        session,
        session.forAdvocate,
        "for",
        `Give the ${session.motion.forSide.label} opening. Establish a focused thesis and the strongest frozen-evidence-supported case.`,
        runtime,
        (next) => ({ ...next, stepKey: "opening_against" }),
      );
    case "opening_against":
      return speechTransition(
        session,
        session.againstAdvocate,
        "against",
        `Respond with the ${session.motion.againstSide.label} opening. Establish a distinct thesis and engage what the For side actually said.`,
        runtime,
        nextAfterOpening,
      );
    case "challenge_participant_prompt": {
      const sideId = session.playerSideId ?? "for";
      return speechTransition(
        session,
        session.moderator,
        null,
        moderatorChallengeInstruction(session, sideId),
        runtime,
        (next) => ({
          ...next,
          stepKey: "challenge_participant_turn",
          status: "waiting_for_player",
        }),
      );
    }
    case "challenge_participant_partner":
      return speechTransition(
        session,
        botForSide(session, session.playerSideId ?? "for"),
        session.playerSideId ?? "for",
        "The participant passed their Challenge answer back to you. Answer the moderator directly for your shared side.",
        runtime,
        (next) => ({ ...next, stepKey: "challenge_opponent_prompt" }),
      );
    case "challenge_opponent_prompt": {
      const sideId: DebateSideId = session.playerSideId === "against" ? "for" : "against";
      return speechTransition(
        session,
        session.moderator,
        null,
        moderatorChallengeInstruction(session, sideId),
        runtime,
        (next) => ({ ...next, stepKey: "challenge_opponent_answer" }),
      );
    }
    case "challenge_opponent_answer": {
      const sideId: DebateSideId = session.playerSideId === "against" ? "for" : "against";
      return speechTransition(
        session,
        botForSide(session, sideId),
        sideId,
        "Answer the moderator's latest challenge directly. Acknowledge any fair premise before defending or narrowing your claim.",
        runtime,
        (next) => enterRebuttal(next, "against"),
      );
    }
    case "challenge_for_prompt":
    case "challenge_against_prompt":
    case "challenge_judge_pass_for_prompt":
    case "challenge_judge_pass_against_prompt": {
      const sideId: DebateSideId = session.stepKey.includes("against") ? "against" : "for";
      return speechTransition(
        session,
        session.moderator,
        null,
        moderatorChallengeInstruction(session, sideId),
        runtime,
        (next) => ({
          ...next,
          stepKey: session.stepKey.replace(/_prompt$/u, "_answer"),
        }),
      );
    }
    case "challenge_for_answer":
    case "challenge_against_answer":
    case "challenge_judge_pass_for_answer":
    case "challenge_judge_pass_against_answer": {
      const sideId: DebateSideId = session.stepKey.includes("against") ? "against" : "for";
      return speechTransition(
        session,
        botForSide(session, sideId),
        sideId,
        "Answer the moderator's latest challenge directly. Make one clear concession if the challenge warrants it.",
        runtime,
        (next) => {
          if (
            session.stepKey === "challenge_for_answer" ||
            session.stepKey === "challenge_judge_pass_for_answer"
          ) {
            return {
              ...next,
              stepKey:
                session.stepKey === "challenge_for_answer"
                  ? "challenge_against_prompt"
                  : "challenge_judge_pass_against_prompt",
            };
          }
          return enterRebuttal(next, "against");
        },
      );
    }
    case "challenge_judge_answer": {
      const question = [...session.events]
        .reverse()
        .find(
          (event) =>
            event.kind === "player_turn" &&
            event.stepKey === "challenge_judge_question",
        );
      const sideId = question?.sideId ?? "for";
      return speechTransition(
        session,
        botForSide(session, sideId),
        sideId,
        "Answer the Judge's latest question directly and concisely.",
        runtime,
        (next) => ({ ...next, stepKey: "challenge_moderator_other_prompt" }),
      );
    }
    case "challenge_moderator_other_prompt": {
      const question = [...session.events]
        .reverse()
        .find(
          (event) =>
            event.kind === "player_turn" &&
            event.stepKey === "challenge_judge_question",
        );
      const sideId: DebateSideId = question?.sideId === "against" ? "for" : "against";
      return speechTransition(
        session,
        session.moderator,
        null,
        moderatorChallengeInstruction(session, sideId),
        runtime,
        (next) => ({ ...next, stepKey: "challenge_moderator_other_answer" }),
      );
    }
    case "challenge_moderator_other_answer": {
      const question = [...session.events]
        .reverse()
        .find(
          (event) =>
            event.kind === "player_turn" &&
            event.stepKey === "challenge_judge_question",
        );
      const sideId: DebateSideId = question?.sideId === "against" ? "for" : "against";
      return speechTransition(
        session,
        botForSide(session, sideId),
        sideId,
        "Answer the moderator's latest challenge directly.",
        runtime,
        (next) => enterRebuttal(next, "against"),
      );
    }
    case "rebuttal_against":
    case "rebuttal_against_partner":
      return speechTransition(
        session,
        session.againstAdvocate,
        "against",
        session.stepKey.endsWith("_partner")
          ? "Your participant passed the rebuttal back to you. Deliver it for your shared side."
          : "Deliver the Against rebuttal first. Respond to the strongest live For claims, not a straw person.",
        runtime,
        (next) => nextAfterRebuttal(next, "against"),
      );
    case "rebuttal_for":
    case "rebuttal_for_partner":
      return speechTransition(
        session,
        session.forAdvocate,
        "for",
        session.stepKey.endsWith("_partner")
          ? "Your participant passed the rebuttal back to you. Deliver it for your shared side."
          : "Deliver the For rebuttal. Answer the strongest Against response and sharpen the remaining disagreement.",
        runtime,
        (next) => nextAfterRebuttal(next, "for"),
      );
    case "closing_against":
      return speechTransition(
        session,
        session.againstAdvocate,
        "against",
        session.playerRole === "participant" &&
          session.playerSideId === "against"
          ? "Close first for the Against side. Incorporate the participant's public contributions, synthesize the decisive clash, acknowledge any surviving concession, and make no new major argument."
          : "Close first for the Against side. Synthesize the decisive clash, acknowledge any surviving concession, and make no new major argument.",
        runtime,
        (next) => ({ ...next, stepKey: "closing_for" }),
      );
    case "closing_for":
      return speechTransition(
        session,
        session.forAdvocate,
        "for",
        session.playerRole === "participant" && session.playerSideId === "for"
          ? "Give the final reply for the For side. Incorporate the participant's public contributions and make no new major argument."
          : session.playerRole === "participant" && session.playerSideId === "against"
            ? "Give the final reply for the For side. Answer the participant's public contributions and make no new major argument."
            : "Give the final reply for the For side. Synthesize the decisive clash and make no new major argument.",
        runtime,
        (next) => {
          const stepKey =
            next.playerRole === "judge" ? "verdict_player" : "ballot_moderator";
          return {
            ...next,
            phase: "verdict",
            stepKey,
            status: statusForStep(stepKey),
          };
        },
      );
    case "ballot_moderator":
    case "ballot_for":
    case "ballot_against": {
      const voter =
        session.stepKey === "ballot_moderator"
          ? session.moderator
          : session.stepKey === "ballot_for"
            ? session.forAdvocate
            : session.againstAdvocate;
      const ballot = await generateBallot(session, voter, runtime);
      const event = makeEvent(session, {
        kind: "ballot",
        speakerKind: voter.role,
        speakerBotId: voter.id,
        sideId: ballot.sideId,
        content:
          ballot.reason ??
          `${voter.name} cast a private ballot without a spoken reason.`,
      });
      const ballots = [...session.ballots, ballot];
      if (session.stepKey !== "ballot_against") {
        return {
          session: {
            ...session,
            ballots,
            stepKey:
              session.stepKey === "ballot_moderator" ? "ballot_for" : "ballot_against",
          },
          events: [event],
        };
      }
      const winnerSideId =
        session.playerRole === "judge"
          ? session.playerVerdict
          : majorityWinner(ballots);
      if (!winnerSideId) throw new Error("The Judge verdict is missing.");
      const verdictEvent = makeEvent(
        { ...session, events: [...session.events, event] },
        {
          kind: "verdict",
          speakerKind: "system",
          sideId: winnerSideId,
          content:
            session.playerRole === "judge"
              ? `The Judge's final ruling stands for ${sideLabel(session, winnerSideId)}. Bot ballots are an agreement and dissent epilogue only.`
              : `${sideLabel(session, winnerSideId)} wins by the three-bot majority.`,
        },
      );
      return {
        session: {
          ...session,
          ballots,
          winnerSideId,
          status: "completed",
          completedAt: new Date().toISOString(),
          stepKey: "completed",
        },
        events: [event, verdictEvent],
      };
    }
    default:
      throw new HttpError(409, "This Debate is waiting for player input.");
  }
}

export async function advanceDebateSession(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  request: DebateAdvanceRequest,
  runtime: DebateAiRuntime,
): Promise<DebateSessionV1> {
  const checked = assertMutation(db, userId, sessionId, request);
  if (checked.replay) return checked.replay;
  const session = checked.session;
  if (session.status === "completed" || session.status === "cancelled") {
    throw new HttpError(409, "This Debate is already finished.");
  }
  if (session.status === "waiting_for_player") {
    throw new HttpError(409, "This Debate is waiting for the player.");
  }
  if (session.status === "paused" && !session.error) {
    throw new HttpError(409, "Resume this Debate before advancing.");
  }
  if (request.skip) {
    const event = skipEvent(session);
    const next = skippedTransition({
      ...session,
      error: null,
      status: "live",
      events: [...session.events, event],
    });
    return commitMutation(
      db,
      userId,
      session,
      { ...next, events: session.events },
      checked.idempotencyKey,
      [event],
    );
  }
  try {
    const transitioned = await advanceStep(
      { ...session, status: "live", error: null },
      runtime,
    );
    const committed = commitMutation(
      db,
      userId,
      session,
      transitioned.session,
      checked.idempotencyKey,
      transitioned.events,
    );
    queueCaseBoardRefinement(
      db,
      userId,
      committed,
      transitioned.events,
      runtime.auxiliary,
    );
    return committed;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const event = makeEvent(session, {
      kind: "error",
      speakerKind: "system",
      content: "Turn unavailable. Retry or skip this turn; no dialogue was fabricated.",
    });
    return commitMutation(
      db,
      userId,
      session,
      {
        ...session,
        status: "paused",
        error:
          error instanceof Error
            ? `Turn unavailable: ${compactText(error.message, 300)}`
            : "Turn unavailable.",
      },
      checked.idempotencyKey,
      [event],
    );
  }
}

export function submitDebatePlayerTurn(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  request: DebatePlayerTurnRequest,
  auxiliaryProvider?: LlmProvider,
): DebateSessionV1 {
  const checked = assertMutation(db, userId, sessionId, request);
  if (checked.replay) return checked.replay;
  const session = checked.session;
  if (session.status !== "waiting_for_player") {
    throw new HttpError(409, "This Debate is not waiting for a player turn.");
  }
  const pass = request.pass === true;
  const rawContent = multilineText(request.content, DEBATE_PLAYER_TURN_MAX_LENGTH);
  if (!pass && !rawContent) throw new HttpError(400, "Enter your contribution or choose Pass.");
  if (session.stepKey === "verdict_player") {
    throw new HttpError(409, "Use the verdict action for the Judge's ruling.");
  }
  const sanitized = sanitizeDebateStatementSources(rawContent, session.evidence);
  const targetSideId =
    session.stepKey === "challenge_judge_question"
      ? isDebateSideId(request.targetSideId)
        ? request.targetSideId
        : "for"
      : session.playerSideId;
  const event = makeEvent(session, {
    kind: "player_turn",
    speakerKind: "player",
    sideId: targetSideId,
    content: pass ? "Pass." : sanitized.content,
    sourceIds: pass ? [] : sanitized.sourceIds,
  });
  const caseBoard = updateCaseBoard(session, event);
  const boardEvent =
    caseBoard !== session.caseBoard
      ? caseBoardEvent(
          { ...session, events: [...session.events, event] },
          caseBoard,
          event,
        )
      : null;
  let next: DebateSessionV1;
  if (session.stepKey === "challenge_judge_question") {
    next = pass
      ? {
          ...session,
          stepKey: "challenge_judge_pass_for_prompt",
          status: "live",
        }
      : { ...session, stepKey: "challenge_judge_answer", status: "live" };
  } else if (session.stepKey === "challenge_participant_turn") {
    next = {
      ...session,
      stepKey: pass
        ? "challenge_participant_partner"
        : "challenge_opponent_prompt",
      status: "live",
    };
  } else if (session.stepKey === "rebuttal_against_player") {
    next = pass
      ? { ...session, stepKey: "rebuttal_against_partner", status: "live" }
      : nextAfterRebuttal(session, "against");
  } else if (session.stepKey === "rebuttal_for_player") {
    next = pass
      ? { ...session, stepKey: "rebuttal_for_partner", status: "live" }
      : nextAfterRebuttal(session, "for");
  } else {
    throw new HttpError(409, "This player window is no longer active.");
  }
  const committed = commitMutation(
    db,
    userId,
    session,
    { ...next, caseBoard, events: session.events },
    checked.idempotencyKey,
    boardEvent ? [event, boardEvent] : [event],
  );
  queueCaseBoardRefinement(
    db,
    userId,
    committed,
    boardEvent ? [event, boardEvent] : [event],
    auxiliaryProvider,
  );
  return committed;
}

export function submitDebateVerdict(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  request: DebateVerdictRequest,
): DebateSessionV1 {
  const checked = assertMutation(db, userId, sessionId, request);
  if (checked.replay) return checked.replay;
  const session = checked.session;
  if (
    session.playerRole !== "judge" ||
    session.status !== "waiting_for_player" ||
    session.stepKey !== "verdict_player"
  ) {
    throw new HttpError(409, "This Debate is not waiting for a Judge verdict.");
  }
  if (!isDebateSideId(request.sideId)) throw new HttpError(400, "Choose For or Against.");
  const reason = compactText(request.reason, 1_200);
  const event = makeEvent(session, {
    kind: "verdict",
    speakerKind: "player",
    sideId: request.sideId,
    content: reason || `The Judge rules for ${sideLabel(session, request.sideId)}.`,
  });
  return commitMutation(
    db,
    userId,
    session,
    {
      ...session,
      playerVerdict: request.sideId,
      winnerSideId: request.sideId,
      stepKey: "ballot_moderator",
      status: "live",
    },
    checked.idempotencyKey,
    [event],
  );
}

function simpleMutation(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  request: { expectedRevision: number; idempotencyKey: string },
  update: (session: DebateSessionV1) => DebateSessionV1,
): DebateSessionV1 {
  const checked = assertMutation(db, userId, sessionId, request);
  if (checked.replay) return checked.replay;
  return commitMutation(
    db,
    userId,
    checked.session,
    update(checked.session),
    checked.idempotencyKey,
    [],
  );
}

export function pauseDebateSession(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  request: { expectedRevision: number; idempotencyKey: string },
): DebateSessionV1 {
  return simpleMutation(db, userId, sessionId, request, (session) => {
    if (session.status === "completed" || session.status === "cancelled") {
      throw new HttpError(409, "This Debate is already finished.");
    }
    return { ...session, status: "paused" };
  });
}

export function resumeDebateSession(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  request: { expectedRevision: number; idempotencyKey: string },
): DebateSessionV1 {
  return simpleMutation(db, userId, sessionId, request, (session) => {
    if (session.status !== "paused") throw new HttpError(409, "This Debate is not paused.");
    return {
      ...session,
      status: statusForStep(session.stepKey),
      error: null,
    };
  });
}

export function deleteDebateSession(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  request: { expectedRevision: number; idempotencyKey: string },
): void {
  const checked = assertMutation(db, userId, sessionId, request);
  if (checked.replay) return;
  commitMutation(
    db,
    userId,
    checked.session,
    {
      ...checked.session,
      status: "cancelled",
      error: null,
    },
    checked.idempotencyKey,
    [],
  );
}

export function restoreDeletedDebateSession(
  db: DatabaseSync,
  userId: string,
  before: DebateSessionV1,
): DebateSessionV1 {
  const current = getDebateSession(db, userId, before.id);
  if (current.status !== "cancelled") {
    throw new HttpError(409, "Only a quarantined Debate can be restored.");
  }
  const now = new Date().toISOString();
  const restored: DebateSessionV1 = {
    ...before,
    revision: current.revision + 1,
    updatedAt: now,
    events: current.events,
  };
  const result = db
    .prepare(
      `UPDATE debate_sessions
          SET revision = ?, status = ?, phase = ?, step_key = ?,
              winner_side_id = ?, session_json = ?, error = ?,
              updated_at = ?, completed_at = ?
        WHERE id = ? AND user_id = ? AND revision = ? AND status = 'cancelled'`,
    )
    .run(
      restored.revision,
      restored.status,
      restored.phase,
      restored.stepKey,
      restored.winnerSideId,
      serializeSessionState(restored),
      restored.error,
      now,
      restored.completedAt,
      restored.id,
      userId,
      current.revision,
    );
  if (Number(result.changes) !== 1) {
    throw new HttpError(409, "The quarantined Debate changed before it could be restored.");
  }
  return restored;
}

export function debateStatementSourceIds(
  session: DebateSessionV1,
  content: string,
): string[] {
  return debateSourceIdsFromText(content, session.evidence);
}
