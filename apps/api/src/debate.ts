import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  BOT_POWER_CANONICAL_SILENCE_V1,
  DEBATE_CASE_CARDS_PER_SIDE,
  DEBATE_FORMAT_SCHEMA_VERSION,
  DEBATE_PLAYER_TURN_MAX_LENGTH,
  DEBATE_SCHEMA_VERSION,
  DEBATE_TURNABOUT_STATEMENTS_PER_SIDE,
  applyBotPowerMumbledResponseV1,
  applyBotPowerMuteResponseV1,
  applyBotPowerResponseBudgetV1,
  botPowerIntermittentMuteTurnIsIgnoredFromEffectsV1,
  debateSourceIdsFromText,
  debateSpokenText,
  defaultDebateFormatStateV1,
  isDebateFormatId,
  isDebatePlayerRole,
  isDebateSideId,
  normalizeDebateFormatStateV1,
  normalizeDebateEvidencePacketV1,
  normalizeDebateIdempotencyKey,
  normalizeDebateMotionSlateV1,
  parseStoredBotPrompt,
  parseStoredBotAudioVoiceProfileV1,
  parseStoredBotAvatarDetailsV1,
  parseStoredBotPowersV1,
  sanitizeDebateStatementSources,
  stripBotProfileMetaSuffix,
  strongestBotPowerResponseBudgetEffectV1,
  type AutoFallbackModelRef,
  type AutoRecoveryTraceV1,
  type DebateAdvocacyConsent,
  type DebateAdvanceRequest,
  type DebateBallotV1,
  type DebateBotPowerPlanV1,
  type DebateBotSnapshotV1,
  type DebateCaseCardV1,
  type DebateEventKind,
  type DebateEventV1,
  type DebateEvidencePacketV1,
  type DebateFormatId,
  type DebateInterjectionRequest,
  type DebateMotionSlateV1,
  type DebatePlayerTurnRequest,
  type DebatePowerEffectPlanV1,
  type DebatePowerPlanV1,
  type DebateSessionCreateRequest,
  type DebateSessionListItemV1,
  type DebateSessionV1,
  type DebateSideId,
  type DebateSpeakerKind,
  type DebateTurnaboutActionRequest,
  type DebateTurnaboutContradictionV1,
  type DebateTurnaboutFormatStateV1,
  type DebateTurnaboutStatementV1,
  type DebateVerdictRequest,
  type ResponseMode,
} from "@localai/shared";
import {
  AutoFallbackExhaustedError,
  runAutoFallbackChain,
  type AutoFallbackValidationResult,
} from "./auto-fallback.ts";
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
  available?: boolean;
}

export interface DebateAiRuntime {
  local: DebateGenerationLane;
  online?: DebateGenerationLane;
  responseMode?: ResponseMode;
  /** Ordered primary + fallback lanes for AUTO; otherwise the selected lane. */
  lanes?: DebateGenerationLane[];
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
  "turnabout_action",
  "turnabout_verdict_player",
]);

const DEBATE_CRITERIA =
  "directness, responsiveness, evidence use, concessions, and clarity";
const TURNABOUT_CRITERIA =
  "record consistency, grounded evidence use, responsive clarification, concessions, and clarity";

function debateProductionPrompt(
  format: DebateFormatId,
  role: DebateBotSnapshotV1["role"],
): string {
  if (format === "turnabout") {
    return [
      "Production voice — Court of Record: this is an original, heightened courtroom examination. Keep the language taut, immediate, theatrical, and bound to the public record as pressure builds.",
      role === "moderator"
        ? "You are the neutral presiding judge. Control the room with concise judicial authority; refer naturally to the court, the record, the active statement, and the evidence. Use sustained or overruled only for an actual recorded ruling."
        : "You are an advocate giving or defending testimony under examination. Answer the exact statement under pressure, with decisive turns and earned reversals rather than generic debate speech.",
      "Never imitate a named character or game, quote a signature catchphrase, or borrow protected writing or presentation.",
      "The production changes cadence and procedural vocabulary, not frozen evidence, formal identity, floor ownership, ballots, the persona's own voice, or the persona's reasoning ability.",
    ].join("\n");
  }
  return [
    "Production voice — Assembly Chamber: this is a live parliamentary forum. Keep the language measured, public-minded, procedurally crisp, and rhetorically energetic.",
    role === "moderator"
      ? "You are the neutral chair. Call the chamber to order, state the motion before the chamber, recognize each speaker, and yield or restore the floor without arguing either side."
      : "You are a recognized member addressing the chamber. Speak to the motion, answer the opposing case directly, and use parliamentary address naturally without turning every sentence into ceremony.",
    "Do not recast Forum as a courtroom: avoid witnesses, testimony, objections, evidence rulings, sustained, and overruled unless those words are themselves part of the public record.",
    "The production changes cadence and procedural vocabulary, not frozen evidence, formal identity, floor ownership, ballots, the persona's own voice, or the persona's reasoning ability.",
  ].join("\n");
}

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

function selectedLane(runtime: DebateAiRuntime): DebateGenerationLane {
  return runtime.lanes?.[0] ??
    (runtime.preferredProvider !== "local" && runtime.online
    ? runtime.online
    : runtime.local);
}

interface DebateJsonGeneration {
  value: Record<string, unknown>;
  provider: ProviderName;
  model: string;
  autoRecovery?: AutoRecoveryTraceV1;
}

async function generateJsonOnLane(
  lane: DebateGenerationLane,
  messages: ProviderMessage[],
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    repetitionPenalty?: number;
    validate?: (value: Record<string, unknown>) => boolean;
  } = {},
  signal?: AbortSignal,
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
        signal,
      });
      const parsed = parsedJsonRecord(response);
      if (options.validate && !options.validate(parsed)) {
        throw new Error("The model returned an invalid Debate response shape.");
      }
      return parsed;
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

function validateDebateJson(
  raw: string,
): AutoFallbackValidationResult<Record<string, unknown>> {
  if (!raw.trim()) return { ok: false, reason: "empty" };
  try {
    return { ok: true, value: parsedJsonRecord(raw) };
  } catch {
    return { ok: false, reason: "invalid_output" };
  }
}

async function generateJson(
  lanes: DebateGenerationLane | readonly DebateGenerationLane[],
  messages: ProviderMessage[],
  options: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    topK?: number;
    repetitionPenalty?: number;
    validate?: (value: Record<string, unknown>) => boolean;
  } = {},
): Promise<DebateJsonGeneration> {
  const ordered = Array.isArray(lanes) ? [...lanes] : [lanes];
  const primary = ordered[0];
  if (!primary) throw new Error("No Debate generation model is available.");
  if (ordered.length === 1) {
    return {
      value: await generateJsonOnLane(primary, messages, options),
      provider: primary.providerName,
      model: options.model ?? primary.model,
    };
  }
  const result = await runAutoFallbackChain({
    attempts: ordered.map((lane) => ({
      provider: lane.providerName,
      model: lane.model,
      available: lane.available,
      run: async (signal) =>
        JSON.stringify(
          await generateJsonOnLane(
            lane,
            messages,
            { ...options, model: lane.model },
            signal,
          ),
        ),
    })),
    perAttemptTimeoutMs: 60_000,
    totalTimeoutMs: ordered.length * 60_000,
    validate: validateDebateJson,
  });
  return {
    value: result.value,
    provider: result.provider,
    model: result.model,
    ...(result.recovery ? { autoRecovery: result.recovery } : {}),
  };
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
  runtime: DebateAiRuntime,
): Promise<DebateMotionSlateV1[]> {
  const topic = compactText(topicRaw, 1_000);
  if (!topic) throw new HttpError(400, "Enter a topic to synthesize.");
  const generation = await generateJson(
    runtime.lanes ?? selectedLane(runtime),
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
          "Each side label must be a clean 1–3 word public name, no more than 24 characters.",
          "The motion must be editable, specific, and arguable by reasonable people.",
          "Each brief should give that advocate a fair 2-4 sentence mandate without pretending evidence exists.",
          'JSON shape: {"slates":[...]}',
        ].join("\n"),
      },
    ],
    {
      maxTokens: 1_800,
      temperature: 0.65,
      validate: (value) =>
        Array.isArray(value.slates) &&
        value.slates
          .map((slate, index) =>
            normalizeDebateMotionSlateV1(slate, `slate-${index + 1}`),
          )
          .filter(completeMotion)
          .slice(0, 3).length === 3,
    },
  );
  const parsed = generation.value;
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
  format: DebateFormatId,
  runtime: DebateAiRuntime,
): Promise<DebateAdvocacyConsent> {
  const side = sideId === "for" ? motion.forSide : motion.againstSide;
  const opposite = sideId === "for" ? motion.againstSide : motion.forSide;
  const generation = await generateJson(
    runtime.lanes ?? selectedLane(runtime),
    [
      {
        role: "system",
        content: [
          bot.system_prompt,
          "",
          "This is a private advocacy consent check, not a public debate turn.",
          `The proposed Debate format is ${format === "turnabout" ? "Turnabout in the Court of Record: pressable testimony, frozen-evidence objections, and immediate neutral rulings" : "Forum in the Assembly Chamber: parliamentary opening addresses, challenges, rebuttals, closings, and a verdict"}.`,
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
      maxTokens: 220,
      temperature: 0.1,
      validate: (value) =>
        value.status === "accept" ||
        value.status === "devils_advocate" ||
        value.status === "decline",
    },
  );
  const parsed = generation.value;
  const rawStatus = parsed.status;
  const status =
    rawStatus === "decline" || rawStatus === "devils_advocate"
      ? rawStatus
      : "accept";
  return {
    version: DEBATE_SCHEMA_VERSION,
    format,
    botId: bot.id,
    sideId,
    status,
    reason:
      status === "accept" ? null : compactText(parsed.reason, 500) || null,
    motionHash: debateMotionHash(motion),
    botRevision: botRevision(bot),
    checkedAt: new Date().toISOString(),
    provider: generation.provider,
    model: generation.model,
    ...(generation.autoRecovery
      ? { autoRecovery: generation.autoRecovery }
      : {}),
  };
}

export async function checkDebateAdvocacyRoles(
  db: DatabaseSync,
  userId: string,
  request: {
    format?: unknown;
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
  const format: DebateFormatId =
    request.format === "turnabout" ? "turnabout" : "forum";
  return Promise.all([
    roleCheck(rows[0]!, "for", motion, format, runtime),
    roleCheck(rows[1]!, "against", motion, format, runtime),
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
  lane: DebateGenerationLane,
): DebateBotSnapshotV1 {
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
    model: lane.model,
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
  const format: DebateFormatId = isDebateFormatId(parsed.format)
    ? parsed.format
    : "forum";
  return {
    ...parsed,
    provider: parsed.provider ?? parsed.moderator.provider,
    model: parsed.model ?? parsed.moderator.model,
    responseMode: parsed.responseMode ?? (
      (parsed.provider ?? parsed.moderator.provider) === "local"
        ? "local"
        : "online"
    ),
    generationChain:
      Array.isArray(parsed.generationChain) && parsed.generationChain.length > 0
        ? parsed.generationChain
        : [{
            provider: parsed.provider ?? parsed.moderator.provider,
            model: parsed.model ?? parsed.moderator.model,
          }],
    format,
    formatVersion: DEBATE_FORMAT_SCHEMA_VERSION,
    formatState: normalizeDebateFormatStateV1(parsed.formatState, format),
    revision: row.revision,
    status: row.status,
    phase: row.phase,
    stepKey: row.step_key,
    winnerSideId: row.winner_side_id,
    error: row.error,
    updatedAt: row.updated_at,
    endedEarlyAt:
      typeof parsed.endedEarlyAt === "string" ? parsed.endedEarlyAt : null,
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
                session_json, updated_at, completed_at
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
      session_json: string;
      updated_at: string;
      completed_at: string | null;
    }>
  ).map((row) => {
    let format: DebateFormatId = "forum";
    try {
      const parsed = JSON.parse(row.session_json) as { format?: unknown };
      if (isDebateFormatId(parsed.format)) format = parsed.format;
    } catch {
      format = "forum";
    }
    return {
      id: row.id,
      format,
      status: row.status,
      phase: row.phase,
      motion: row.motion,
      playerRole: row.player_role,
      winnerSideId: row.winner_side_id,
      updatedAt: row.updated_at,
      completedAt: row.completed_at,
    };
  });
}

function validateConsents(
  consents: readonly DebateAdvocacyConsent[],
  motion: DebateMotionSlateV1,
  advocates: readonly DebateBotRow[],
  format: DebateFormatId,
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
      consent.botRevision !== botRevision(bot) ||
      (consent.format ?? "forum") !== format
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
  const format: DebateFormatId =
    request.format === "turnabout" ? "turnabout" : "forum";
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
    format,
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
  const lane = selectedLane(runtime);
  const generationChain: AutoFallbackModelRef[] = (
    runtime.lanes?.length ? runtime.lanes : [lane]
  ).map((candidate) => ({
    provider: candidate.providerName,
    model: candidate.model,
  }));
  const session: DebateSessionV1 = {
    version: DEBATE_SCHEMA_VERSION,
    id: randomUUID(),
    revision: 1,
    status: "live",
    phase: "opening",
    stepKey: format === "turnabout" ? "turnabout_intro" : "intro",
    provider: lane.providerName,
    model: lane.model,
    responseMode:
      runtime.responseMode === "auto" && generationChain.length > 1
        ? "auto"
        : lane.providerName === "local"
          ? "local"
          : "online",
    generationChain,
    format,
    formatVersion: DEBATE_FORMAT_SCHEMA_VERSION,
    formatState: defaultDebateFormatStateV1(format),
    playerRole: request.playerRole,
    playerSideId,
    motion,
    evidence: freezeEvidence(request.evidence, now),
    moderator: snapshotBot(moderatorRow, "moderator", null, lane),
    forAdvocate: snapshotBot(forRow, "advocate", "for", lane),
    againstAdvocate: snapshotBot(againstRow, "advocate", "against", lane),
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
    endedEarlyAt: null,
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
  const parsed = JSON.parse(row.response_json) as DebateSessionV1;
  const format: DebateFormatId = isDebateFormatId(parsed.format)
    ? parsed.format
    : "forum";
  return {
    ...parsed,
    format,
    formatVersion: DEBATE_FORMAT_SCHEMA_VERSION,
    formatState: normalizeDebateFormatStateV1(parsed.formatState, format),
    endedEarlyAt:
      typeof parsed.endedEarlyAt === "string" ? parsed.endedEarlyAt : null,
  };
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

function commitRevisedEventMutation(
  db: DatabaseSync,
  userId: string,
  previous: DebateSessionV1,
  nextInput: DebateSessionV1,
  idempotencyKey: string,
  revisedEvent: DebateEventV1,
  newEvents: readonly DebateEventV1[],
): DebateSessionV1 {
  const now = new Date().toISOString();
  const priorEvents = previous.events.map((event) =>
    event.id === revisedEvent.id ? revisedEvent : event,
  );
  const next: DebateSessionV1 = {
    ...nextInput,
    revision: previous.revision + 1,
    updatedAt: now,
    events: [...priorEvents, ...newEvents],
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
      throw new HttpError(
        409,
        "Debate changed while this interjection was being prepared. Refresh and retry.",
      );
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
      throw new HttpError(
        409,
        "Debate changed while this interjection was being prepared. Refresh and retry.",
      );
    }
    const eventUpdate = db
      .prepare(
        `UPDATE debate_events
            SET event_json = ?
          WHERE id = ? AND user_id = ? AND session_id = ?`,
      )
      .run(
        JSON.stringify(revisedEvent),
        revisedEvent.id,
        userId,
        previous.id,
      );
    if (Number(eventUpdate.changes) !== 1) {
      throw new HttpError(409, "The interrupted floor event is no longer current.");
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
    parentEventId?: string | null;
    interrupted?: boolean;
    interruptedBy?: "player" | "bot" | null;
    provider?: ProviderName;
    model?: string;
    autoRecovery?: AutoRecoveryTraceV1;
    statementId?: string | null;
    evidenceSourceId?: string | null;
    ruling?: "sustained" | "overruled" | null;
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
    ...(args.parentEventId !== undefined
      ? { parentEventId: args.parentEventId }
      : {}),
    ...(args.interrupted !== undefined
      ? { interrupted: args.interrupted }
      : {}),
    ...(args.interruptedBy !== undefined
      ? { interruptedBy: args.interruptedBy }
      : {}),
    ...(args.provider ? { provider: args.provider } : {}),
    ...(args.model ? { model: args.model } : {}),
    ...(args.autoRecovery ? { autoRecovery: args.autoRecovery } : {}),
    ...(args.statementId !== undefined
      ? { statementId: args.statementId }
      : {}),
    ...(args.evidenceSourceId !== undefined
      ? { evidenceSourceId: args.evidenceSourceId }
      : {}),
    ...(args.ruling !== undefined ? { ruling: args.ruling } : {}),
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

function lanesForSession(
  runtime: DebateAiRuntime,
  session: DebateSessionV1,
): DebateGenerationLane[] {
  const runtimeLanes = runtime.lanes?.length
    ? runtime.lanes
    : [runtime.local, ...(runtime.online ? [runtime.online] : [])];
  const byKey = new Map(
    runtimeLanes.map((lane) => [
      `${lane.providerName}:${lane.model.trim().toLowerCase()}`,
      lane,
    ]),
  );
  const frozen = session.generationChain?.length
    ? session.generationChain
    : [{ provider: session.provider, model: session.model }];
  const resolved = frozen.flatMap((entry) => {
    const exact = byKey.get(
      `${entry.provider}:${entry.model.trim().toLowerCase()}`,
    );
    if (exact) return [exact];
    const providerMatch = runtimeLanes.find(
      (lane) => lane.providerName === entry.provider,
    );
    return providerMatch ? [{ ...providerMatch, model: entry.model }] : [];
  });
  return resolved.length > 0 ? resolved : [runtime.local];
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

function personaVoicePrompt(snapshot: DebateBotSnapshotV1): string {
  return [
    `Persona voice is binding: speak as ${snapshot.name}, using only diction, idioms, cadence, confidence, and rhetorical habits that their saved persona would plausibly use.`,
    "Do not smooth their voice into generic polished-debater, corporate, academic, or assistant language. A formal Debate role changes the structure of a turn, not the persona's vocabulary or fluency.",
    "Let the persona be imperfect when appropriate: simple wording, bluntness, enthusiasm, uncertainty, eccentric phrasing, or limited rhetorical polish are all preferable to out-of-character eloquence.",
  ].join("\n");
}

type DebatePersonaReasoningLevel = "concrete" | "everyday" | "advanced";

interface DebatePersonaCapability {
  reasoningLevel: DebatePersonaReasoningLevel;
}

const CONCRETE_PERSONA_STRONG_CUE =
  /\b(?:simple-minded|dim-witted|slow-witted|unintelligent|low intelligence|not (?:very )?(?:smart|bright|intelligent)|easily confused|slow thinker)\b/giu;
const CONCRETE_PERSONA_SUPPORTING_CUE =
  /\b(?:literal-minded|naive|gullible|foolish|distractible|odd logic|goofy|airheaded|childlike|simple wording|limited vocabulary|avoid technical overconfidence|avoids? complex|confused by complex)\b/giu;
const ADVANCED_PERSONA_CUE =
  /\b(?:highly intelligent|brilliant|genius|expert reasoner|rigorous analyst|strategic thinker|trained (?:lawyer|scientist|researcher|philosopher)|legal scholar|academic expert)\b/iu;
const CONCRETE_SPEECH_UPGRADE_CUE =
  /\b(?:record-backed|frozen record (?:does not|doesn't) prove|strongest fit|best fits?|on balance|central tradeoff|decisive clash|scope of (?:my|the) claim|I concede|my claim is|the evidence (?:does not|doesn't) prove|inferential claim|judging criterion|weighing the evidence)\b/giu;

function debatePersonaCapability(
  snapshot: DebateBotSnapshotV1,
): DebatePersonaCapability {
  const profile = parseStoredBotPrompt(snapshot.systemPrompt).fields;
  const description = [
    stripBotProfileMetaSuffix(snapshot.systemPrompt),
    profile.purpose.statement,
    profile.purpose.legacyNotes,
    profile.core.traits,
    profile.core.boundaries,
    profile.core.quirks,
    profile.identity.background,
    profile.identity.role,
  ]
    .filter(Boolean)
    .join("\n");
  if (ADVANCED_PERSONA_CUE.test(description)) {
    return { reasoningLevel: "advanced" };
  }
  const strongCues = description.match(CONCRETE_PERSONA_STRONG_CUE)?.length ?? 0;
  const supportingCues =
    description.match(CONCRETE_PERSONA_SUPPORTING_CUE)?.length ?? 0;
  return {
    reasoningLevel:
      strongCues > 0 || supportingCues >= 2 ? "concrete" : "everyday",
  };
}

function personaCapabilityPrompt(snapshot: DebateBotSnapshotV1): string {
  const capability = debatePersonaCapability(snapshot);
  const shared = [
    "Persona capability is binding, not merely a writing style.",
    "The Debate format supplies turn order and a topic; it must not grant this persona extra knowledge, intelligence, logic, self-awareness, strategic discipline, or rhetorical skill.",
    "Use only reasoning and concepts this saved persona could independently notice, understand, and express. Do not turn source material or production direction into expertise they do not possess.",
  ];
  if (capability.reasoningLevel === "concrete") {
    shared.push(
      `Concrete reasoning ceiling for ${snapshot.name}: use short, everyday thoughts, one reason at a time.`,
      "They may repeat an obvious fact from the packet, misunderstand complexity, get distracted, or use odd logic when that fits. Do not convert those traits into a polished multi-factor analysis.",
      "Do not manufacture strategic concessions, careful scope narrowing, evidence weighing, formal distinctions, or debate meta-language. A brief accidental insight is fine; sustained expert reasoning is not.",
    );
  } else if (capability.reasoningLevel === "everyday") {
    shared.push(
      `${snapshot.name} may reason coherently at an everyday level, but should not become an expert analyst unless the saved persona explicitly supports it.`,
    );
  } else {
    shared.push(
      `${snapshot.name} may use sophisticated reasoning where the saved persona supports it, without borrowing knowledge outside the frozen packet.`,
    );
  }
  return shared.join("\n");
}

function debatePersonaSpeechExceedsCapability(
  snapshot: DebateBotSnapshotV1,
  content: string,
): boolean {
  if (debatePersonaCapability(snapshot).reasoningLevel !== "concrete") {
    return false;
  }
  const spoken = debateSpokenText(content).replace(/\s+/gu, " ").trim();
  const words = spoken.match(/[\p{L}\p{N}’'-]+/gu)?.length ?? 0;
  const sentences = spoken.match(/[^.!?]+(?:[.!?]+|$)/gu)?.length ?? 0;
  const upgradedCues = spoken.match(CONCRETE_SPEECH_UPGRADE_CUE)?.length ?? 0;
  return upgradedCues > 0 || words > 70 || sentences > 3;
}

async function repairPersonaCapabilityText(
  session: DebateSessionV1,
  snapshot: DebateBotSnapshotV1,
  draft: string,
  runtime: DebateAiRuntime,
  purpose: "speech" | "ballot reason",
): Promise<{ content: string; generation: DebateJsonGeneration } | null> {
  try {
    const generation = await generateJson(
      lanesForSession(runtime, session),
      [
        {
          role: "system",
          content: [
            snapshot.systemPrompt,
            personaVoicePrompt(snapshot),
            personaCapabilityPrompt(snapshot),
            "This is a bounded persona-capability repair. Preserve the original stance and any valid frozen source markers, but discard analytical language the persona could not produce.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `Persona capability repair for a ${purpose}.`,
            "Rewrite the draft from scratch as one or two short sentences this persona could naturally think and say. Use everyday words and one simple reason. Add no facts.",
            "",
            "Draft:",
            draft,
            "",
            'Return JSON only: {"content":"repaired text"}',
          ].join("\n"),
        },
      ],
      {
        maxTokens: 180,
        temperature: 0.35,
        validate: (value) =>
          typeof value.content === "string" &&
          value.content.trim().length > 0,
      },
    );
    const content = multilineText(generation.value.content, 1_200);
    return content && !debatePersonaSpeechExceedsCapability(snapshot, content)
      ? { content, generation }
      : null;
  } catch {
    return null;
  }
}

function publicTranscript(
  session: DebateSessionV1,
  observerBotId?: string,
  includeOwnSpeech = true,
): string {
  const publicKinds =
    session.format === "turnabout"
      ? new Set([
          "intro",
          "speech",
          "silence",
          "testimony",
          "press",
          "objection",
          "evidence",
          "revelation",
          "player_turn",
          "moderator_ruling",
          "reaction",
        ])
      : new Set([
          "intro",
          "speech",
          "silence",
          "player_turn",
          "reaction",
        ]);
  const events = session.events
    .filter((event) => publicKinds.has(event.kind))
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
): Promise<{
  content: string;
  sourceIds: string[];
  silent: boolean;
  provider?: ProviderName;
  model?: string;
  autoRecovery?: AutoRecoveryTraceV1;
}> {
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
  let deliveryGeneration = await generateJson(
    lanesForSession(runtime, session),
    [
      {
        role: "system",
        content: [
          snapshot.systemPrompt,
          "",
          session.format === "turnabout"
            ? "You are participating in PRISM Debate: Turnabout, a theatrical but record-bound examination."
            : "You are participating in PRISM Debate: Forum, a parliamentary proceeding.",
          debateProductionPrompt(session.format, snapshot.role),
          `Motion: ${session.motion.motion}`,
          `For brief: ${session.motion.forSide.brief}`,
          `Against brief: ${session.motion.againstSide.brief}`,
          "Use only the frozen prep packet below. Never claim live research.",
          "Cite a frozen source only as [[source:id]]. Never invent a source ID.",
          "Stay in your assigned formal role, but perform it only as well as this persona naturally could.",
          personaVoicePrompt(snapshot),
          personaCapabilityPrompt(snapshot),
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
      maxTokens: 520,
      temperature: 0.55,
      validate: (value) =>
        typeof value.content === "string" && value.content.trim().length > 0,
    },
  );
  const result = deliveryGeneration.value;
  let intended = multilineText(result.content, 6_000);
  if (!intended) throw new Error("The bot returned an empty debate turn.");
  if (debatePersonaSpeechExceedsCapability(snapshot, intended)) {
    const repaired = await repairPersonaCapabilityText(
      session,
      snapshot,
      intended,
      runtime,
      "speech",
    );
    if (repaired) {
      intended = repaired.content;
      deliveryGeneration = repaired.generation;
    } else {
      intended = BOT_POWER_CANONICAL_SILENCE_V1;
    }
  }
  const responseBudget = strongestBotPowerResponseBudgetEffectV1(effects);
  intended = applyBotPowerResponseBudgetV1(intended, responseBudget, 3);
  if (
    session.stepKey === "intro" ||
    session.stepKey === "turnabout_intro"
  ) {
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
    provider: deliveryGeneration.provider,
    model: deliveryGeneration.model,
    ...(deliveryGeneration.autoRecovery
      ? { autoRecovery: deliveryGeneration.autoRecovery }
      : {}),
  };
}

const TURNABOUT_QUANTIFIED_CLAIM_PATTERN =
  /(?:[$€£]\s*)?\d+(?:[.,]\d+)*(?:\s*(?:%|percent|minutes?|hours?|days?|weeks?|months?|years?|thousand|million|billion|dollars?|euros?|pounds?|per\s+[a-z]+))?/giu;
const TURNABOUT_EVIDENCE_ATTRIBUTION_PATTERN =
  /\b(?:according to|research (?:shows|finds)|data (?:shows|indicates)|studies? (?:show|find)|reports? (?:show|find)|surveys? (?:show|find)|statistics? (?:show|indicate))\b/iu;

type DebateSpeechGeneration = Awaited<ReturnType<typeof generateSpeech>>;

function normalizeTurnaboutRecordText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[“”‘’]/gu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

function turnaboutFrozenRecordText(
  session: DebateSessionV1,
  additionalRecord = "",
): string {
  return normalizeTurnaboutRecordText(
    [
      session.motion.motion,
      session.motion.forSide.label,
      session.motion.forSide.brief,
      session.motion.againstSide.label,
      session.motion.againstSide.brief,
      session.evidence.notes,
      ...session.evidence.sources.flatMap((source) => [
        source.id,
        source.title,
        source.snippet,
        source.publishedAt ?? "",
      ]),
      additionalRecord,
    ].join("\n"),
  );
}

function turnaboutRecordViolation(
  session: DebateSessionV1,
  speech: DebateSpeechGeneration,
  additionalRecord = "",
): boolean {
  if (speech.silent) return false;
  const publicContent = debateSpokenText(speech.content);
  const frozenRecord = turnaboutFrozenRecordText(session, additionalRecord);
  const quantifiedClaims =
    publicContent.match(TURNABOUT_QUANTIFIED_CLAIM_PATTERN) ?? [];
  const hasUnsupportedQuantity = quantifiedClaims.some(
    (claim) =>
      !frozenRecord.includes(normalizeTurnaboutRecordText(claim)),
  );
  const hasUnsupportedAttribution =
    TURNABOUT_EVIDENCE_ATTRIBUTION_PATTERN.test(publicContent) &&
    speech.sourceIds.length === 0;
  return hasUnsupportedQuantity || hasUnsupportedAttribution;
}

async function turnaboutRecordBoundSpeech(
  session: DebateSessionV1,
  speaker: DebateBotSnapshotV1,
  speech: DebateSpeechGeneration,
  runtime: DebateAiRuntime,
  additionalRecord = "",
): Promise<DebateSpeechGeneration> {
  if (!turnaboutRecordViolation(session, speech, additionalRecord)) {
    return speech;
  }
  const repaired = await generateSpeech(
    session,
    speaker,
    [
      "Your previous draft could not enter the frozen record because it attributed unsupported evidence or used a quantity absent from the record.",
      "Try once more in character. State one simpler claim already supported by the motion, side brief, public transcript, or a valid frozen source marker.",
      "Do not mention the rejected draft, the repair, or missing evidence. Add no numbers or outside attribution.",
    ].join(" "),
    runtime,
  );
  if (!turnaboutRecordViolation(session, repaired, additionalRecord)) {
    return repaired;
  }
  return {
    ...repaired,
    content: BOT_POWER_CANONICAL_SILENCE_V1,
    sourceIds: [],
    silent: true,
  };
}

function claimSummary(content: string): string {
  const plain = content
    .replace(/\[\[source:[^\]]+\]\]/giu, "")
    .replace(/\*[^*]{1,160}\*/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  const sentences = plain.match(/[^.!?]+(?:[.!?]+|$)/gu) ?? [];
  const survivingClaim = sentences
    .map((sentence) => sentence.trim())
    .find(
      (sentence) =>
        sentence &&
        !/^(?:(?:i|we)\s+(?:concede|grant|agree|acknowledge|accept)\b|.+?\b(?:point|argument|case)\s+is\s+(?:fair|correct|right)\b)/iu.test(
          sentence,
        ),
    );
  return (survivingClaim ?? sentences[0] ?? plain).trim().slice(0, 220);
}

const CASE_BOARD_QUOTE_STOP_WORDS = new Set([
  "about",
  "after",
  "again",
  "against",
  "because",
  "before",
  "being",
  "between",
  "could",
  "does",
  "from",
  "have",
  "into",
  "just",
  "more",
  "most",
  "other",
  "should",
  "than",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "under",
  "very",
  "what",
  "when",
  "where",
  "which",
  "while",
  "with",
  "would",
  "your",
]);

function normalizedCaseBoardQuote(value: string): string {
  return value.replace(/\s+/gu, " ").trim().toLocaleLowerCase();
}

function groundedCaseBoardQuote(
  publicStatement: string,
  value: unknown,
): string {
  const quote = compactText(value, 600);
  if (quote.length < 12) return "";
  return normalizedCaseBoardQuote(publicStatement).includes(
    normalizedCaseBoardQuote(quote),
  )
    ? quote
    : "";
}

function materialCaseBoardTokens(value: string): Set<string> {
  return new Set(
    (value.toLocaleLowerCase().match(/[\p{L}\p{N}’'-]+/gu) ?? []).filter(
      (token) => token.length >= 4 && !CASE_BOARD_QUOTE_STOP_WORDS.has(token),
    ),
  );
}

function caseBoardTextsOverlap(left: string, right: string): boolean {
  const rightTokens = materialCaseBoardTokens(right);
  return [...materialCaseBoardTokens(left)].some((token) =>
    rightTokens.has(token),
  );
}

function caseBoardStatusQuoteIsValid(
  status: DebateCaseCardV1["status"],
  quote: string,
): boolean {
  if (status === "conceded") {
    return /\b(?:conced(?:e|ed|ing)|grant(?:ed|ing)?|agree(?:d|ing)?|acknowledg(?:e|ed|ing)|accept(?:ed|ing)?)\b/iu.test(
      quote,
    );
  }
  if (status === "unanswered") {
    return /\b(?:unanswered|did not answer|does not answer|has not answered|fails? to answer|avoids? (?:the|this) question)\b/iu.test(
      quote,
    );
  }
  return status === "challenged";
}

function caseBoardStatusTransitionIsValid(
  current: DebateCaseCardV1["status"],
  next: DebateCaseCardV1["status"],
): boolean {
  if (current === "conceded" || current === "unanswered") return false;
  if (next === "challenged") return current === "active";
  return next === "conceded" || next === "unanswered";
}

function interruptedStatementPrefix(
  content: string,
  requestedCharacterCount: number,
): string {
  const count = Math.max(
    1,
    Math.min(content.length - 1, Math.floor(requestedCharacterCount)),
  );
  let prefix = content.slice(0, count);
  const markerStart = prefix.lastIndexOf("[[source:");
  const markerEnd = prefix.lastIndexOf("]]");
  if (markerStart > markerEnd) prefix = prefix.slice(0, markerStart);
  const boundary = Math.max(
    prefix.lastIndexOf(" "),
    prefix.lastIndexOf("\n"),
    prefix.lastIndexOf("."),
    prefix.lastIndexOf(","),
    prefix.lastIndexOf(";"),
    prefix.lastIndexOf(":"),
    prefix.lastIndexOf("!"),
    prefix.lastIndexOf("?"),
  );
  if (boundary >= Math.max(0, prefix.length - 28)) {
    prefix = prefix.slice(0, boundary + 1);
  }
  prefix = prefix.trimEnd().replace(/[,:;–—-]+$/gu, "").trimEnd();
  return prefix ? `${prefix}…` : "";
}

function caseBoardAfterInterruptedSpeech(
  session: DebateSessionV1,
  speech: DebateEventV1,
): DebateCaseCardV1[] {
  const summary = claimSummary(speech.content);
  return session.caseBoard.flatMap((card) => {
    if (card.createdEventId !== speech.id) return [card];
    if (!summary) return [];
    return [
      {
        ...card,
        summary,
        sourceIds: speech.sourceIds,
        updatedAt: new Date().toISOString(),
      },
    ];
  });
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
    parentEventId: sourceEvent.id,
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
  const generation = await generateJson(
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
          `The newest statement belongs to the ${sideLabel(initial, target.sideId)} side.`,
          "Return the speaker's surviving advocated proposition, not an opponent's position, a quoted premise, or a concession preamble.",
          "Return a compact claim summary of at most 220 characters plus summaryQuote: one exact supporting quote copied from the newest public statement.",
          "You may update existing card states only when the public statement clearly challenges, concedes, or leaves a directly posed claim unanswered.",
          "Every status update needs evidenceQuote: one exact supporting quote copied from the newest public statement and materially related to that card.",
          'JSON shape: {"summary":"...","summaryQuote":"exact quote","statusUpdates":[{"id":"existing-card-id","status":"challenged|conceded|unanswered","evidenceQuote":"exact quote"}]}',
        ].join("\n"),
      },
    ],
    { maxTokens: 420, temperature: 0.1 },
  );
  const result = generation.value;
  const summary = compactText(result.summary, 220);
  const summaryQuote = groundedCaseBoardQuote(
    sourceEvent.content,
    result.summaryQuote,
  );
  if (
    !summary ||
    !summaryQuote ||
    !caseBoardTextsOverlap(summary, summaryQuote)
  ) {
    return;
  }
  const validStatuses = new Set([
    "challenged",
    "conceded",
    "unanswered",
  ]);
  const initialCardsById = new Map(
    initial.caseBoard.map((card) => [card.id, card]),
  );
  const statusUpdates = new Map<string, DebateCaseCardV1["status"]>();
  if (Array.isArray(result.statusUpdates)) {
    for (const rawUpdate of result.statusUpdates) {
      const update = jsonRecord(rawUpdate);
      const id = compactText(update.id, 200);
      const card = initialCardsById.get(id);
      const evidenceQuote = groundedCaseBoardQuote(
        sourceEvent.content,
        update.evidenceQuote,
      );
      if (
        card &&
        card.createdEventId !== sourceEvent.id &&
        typeof update.status === "string" &&
        validStatuses.has(update.status) &&
        caseBoardStatusTransitionIsValid(
          card.status,
          update.status as DebateCaseCardV1["status"],
        ) &&
        evidenceQuote &&
        caseBoardTextsOverlap(card.summary, evidenceQuote) &&
        caseBoardStatusQuoteIsValid(
          update.status as DebateCaseCardV1["status"],
          evidenceQuote,
        )
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
          parentEventId: sourceEvent.id,
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

function enterModeratedRebuttal(
  session: DebateSessionV1,
): DebateSessionV1 {
  return {
    ...session,
    phase: "rebuttal",
    stepKey: "moderator_to_rebuttal",
    status: "live",
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
    stepKey: "moderator_to_closing",
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
      status: "live" as const,
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
    `Recognize the ${sideLabel(session, sideId)} side. Ask one concise, difficult, even-handed challenge.`,
    "Do not answer it. Target a vulnerability in the public argument so far, then yield that side the floor.",
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
    .filter(
      (candidate) => candidate.id !== speaker.id && candidate.sideId !== null,
    )
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

interface DebateBotFloorBreak {
  speechEvent: DebateEventV1;
  interjectionEvent: DebateEventV1;
  rulingEvent: DebateEventV1 | null;
}

async function botFloorBreak(
  session: DebateSessionV1,
  speaker: DebateBotSnapshotV1,
  speechEvent: DebateEventV1,
  runtime: DebateAiRuntime,
): Promise<DebateBotFloorBreak | null> {
  if (session.stepKey === "intro" || speechEvent.kind !== "speech") return null;
  const interrupter = interruptionCandidate(session, speaker);
  if (!interrupter) return null;
  const cutoffRatio =
    0.54 +
    stablePowerChance(
      `${session.id}:${session.stepKey}:${interrupter.id}:cutoff`,
    ) *
      0.18;
  const cutoff = interruptedStatementPrefix(
    speechEvent.content,
    Math.floor(speechEvent.content.length * cutoffRatio),
  );
  if (cutoff.length < 36 || cutoff.length >= speechEvent.content.length - 8) {
    return null;
  }
  const interruptedEvent: DebateEventV1 = {
    ...speechEvent,
    content: cutoff,
    sourceIds: debateSourceIdsFromText(cutoff, session.evidence),
    interrupted: true,
    interruptedBy: "bot",
  };
  const interruptedSession = {
    ...session,
    events: [...session.events, interruptedEvent],
  };
  try {
    const interjection = await generateSpeech(
      interruptedSession,
      interrupter,
      `Break the floor now and cut off ${speaker.name}. Respond only to the heard public fragment below in one forceful sentence. Do not introduce an unrelated argument.\n\nHeard fragment:\n${cutoff}`,
      runtime,
    );
    if (interjection.silent) return null;
    const interjectionEvent = makeEvent(interruptedSession, {
      kind: "interjection",
      speakerKind: interrupter.role,
      speakerBotId: interrupter.id,
      sideId: interrupter.sideId,
      content: interjection.content,
      sourceIds: interjection.sourceIds,
      parentEventId: interruptedEvent.id,
      provider: interjection.provider,
      model: interjection.model,
      autoRecovery: interjection.autoRecovery,
    });
    const rulingSession = {
      ...interruptedSession,
      events: [...interruptedSession.events, interjectionEvent],
    };
    const ruling = await generateSpeech(
      rulingSession,
      session.moderator,
      `${interrupter.name} broke the floor and cut off ${speaker.name}. Give a brief procedural ruling in one or two sentences. Acknowledge that only the heard fragment is public, enforce the scheduled order, and do not argue either side.`,
      runtime,
    );
    const rulingEvent = ruling.silent
      ? null
      : makeEvent(rulingSession, {
          kind: "moderator_ruling",
          speakerKind: "moderator",
          speakerBotId: session.moderator.id,
          sideId: null,
          content: ruling.content,
          sourceIds: [],
          parentEventId: interjectionEvent.id,
          provider: ruling.provider,
          model: ruling.model,
          autoRecovery: ruling.autoRecovery,
        });
    return {
      speechEvent: interruptedEvent,
      interjectionEvent,
      rulingEvent,
    };
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
  let event = makeEvent(session, {
    kind: speech.silent ? "silence" : "speech",
    speakerKind: snapshot.role,
    speakerBotId: snapshot.id,
    sideId,
    content: speech.content,
    sourceIds: speech.sourceIds,
    provider: speech.provider,
    model: speech.model,
    autoRecovery: speech.autoRecovery,
  });
  const repeatSession = {
    ...session,
    events: [...session.events, event],
  };
  const repeat = hearingRepeatReaction(repeatSession, snapshot, event);
  const floorBreak =
    repeat || event.kind !== "speech"
      ? null
      : await botFloorBreak(session, snapshot, event, runtime);
  if (floorBreak) event = floorBreak.speechEvent;
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
  if (repeat) {
    repeat.sequence = withBoard.events.length + 1;
    withBoard.events.push(repeat);
  }
  if (floorBreak) {
    floorBreak.interjectionEvent.sequence = withBoard.events.length + 1;
    withBoard.events.push(floorBreak.interjectionEvent);
    if (floorBreak.rulingEvent) {
      floorBreak.rulingEvent.sequence = withBoard.events.length + 1;
      withBoard.events.push(floorBreak.rulingEvent);
    }
  }
  const transitioned = next(withBoard);
  return {
    session: { ...transitioned, events: session.events },
    events: [
      event,
      ...(boardEvent ? [boardEvent] : []),
      ...(repeat ? [repeat] : []),
      ...(floorBreak ? [floorBreak.interjectionEvent] : []),
      ...(floorBreak?.rulingEvent ? [floorBreak.rulingEvent] : []),
    ],
  };
}

async function moderatorPhaseTransition(
  session: DebateSessionV1,
  instruction: string,
  runtime: DebateAiRuntime,
  next: (session: DebateSessionV1) => DebateSessionV1,
): Promise<{ session: DebateSessionV1; events: DebateEventV1[] }> {
  const speech = await generateSpeech(
    session,
    session.moderator,
    instruction,
    runtime,
  );
  const event = makeEvent(session, {
    kind: speech.silent ? "silence" : "phase",
    speakerKind: "moderator",
    speakerBotId: session.moderator.id,
    content: speech.content,
    sourceIds: speech.sourceIds,
    provider: speech.provider,
    model: speech.model,
    autoRecovery: speech.autoRecovery,
  });
  return {
    session: next(session),
    events: [event],
  };
}

function botBallotPrompt(session: DebateSessionV1, voter: DebateBotSnapshotV1): string {
  return [
    "Advocacy has ended. Vote independently for either for or against.",
    `Judge only ${
      session.format === "turnabout" ? TURNABOUT_CRITERIA : DEBATE_CRITERIA
    }; do not vote for your assigned side by default.`,
    session.format === "turnabout"
      ? "Treat sustained and overruled objections exactly as the public moderator recorded them. Do not invent a contradiction or use an unpresented evidence item."
      : "",
    session.endedEarlyAt
      ? "The proceeding ended early. Judge only the limited public record that exists. Do not penalize either side for rounds that were never heard."
      : "",
    session.format === "turnabout"
      ? "Voice the reason as a concise finding from the Court of Record: identify the decisive recorded statement, clarification, contradiction, or concession. Do not add courtroom theatrics to the canonical ruling."
      : "Voice the reason as a concise Assembly Chamber finding: identify which side carried the motion through the public exchange. Do not use courtroom vocabulary.",
    "Do not use private intent, hidden speech, relationship memory, or numeric scoring.",
    personaVoicePrompt(voter),
    personaCapabilityPrompt(voter),
    `Motion: ${session.motion.motion}`,
    `For label: ${session.motion.forSide.label}`,
    `Against label: ${session.motion.againstSide.label}`,
    "Public transcript:",
    publicTranscript(session, voter.id, false),
    `Return JSON only: {"sideId":"for|against","reason":"${
      session.endedEarlyAt
        ? "one brief public sentence"
        : "one concise public reason"
    }"}.`,
    `You are ${voter.name}.`,
  ].join("\n");
}

async function generateBallot(
  session: DebateSessionV1,
  voter: DebateBotSnapshotV1,
  runtime: DebateAiRuntime,
): Promise<DebateBallotV1> {
  let deliveryGeneration = await generateJson(
    lanesForSession(runtime, session),
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
    {
      maxTokens: session.endedEarlyAt ? 140 : 220,
      temperature: 0.2,
      validate: (value) =>
        value.sideId === "for" || value.sideId === "against",
    },
  );
  const parsed = deliveryGeneration.value;
  const sideId: DebateSideId = parsed.sideId === "against" ? "against" : "for";
  const muted = session.powerPlan.bots[voter.id]?.hardMuted === true;
  let reason = compactText(parsed.reason, 600);
  let capabilityRejected = false;
  if (!muted && reason && debatePersonaSpeechExceedsCapability(voter, reason)) {
    const repaired = await repairPersonaCapabilityText(
      session,
      voter,
      reason,
      runtime,
      "ballot reason",
    );
    if (repaired) {
      reason = compactText(repaired.content, 600);
      deliveryGeneration = repaired.generation;
    } else {
      reason = "";
      capabilityRejected = true;
    }
  }
  return {
    version: DEBATE_SCHEMA_VERSION,
    voterBotId: voter.id,
    sideId,
    reason:
      muted || capabilityRejected
        ? null
        : reason || "That side made the clearer case.",
    privateReason: muted || capabilityRejected,
    provider: deliveryGeneration.provider,
    model: deliveryGeneration.model,
    ...(deliveryGeneration.autoRecovery
      ? { autoRecovery: deliveryGeneration.autoRecovery }
      : {}),
    createdAt: new Date().toISOString(),
  };
}

function majorityWinner(ballots: readonly DebateBallotV1[]): DebateSideId {
  const forVotes = ballots.filter((ballot) => ballot.sideId === "for").length;
  return forVotes >= 2 ? "for" : "against";
}

function turnaboutState(
  session: DebateSessionV1,
): DebateTurnaboutFormatStateV1 {
  if (session.format !== "turnabout") {
    throw new HttpError(409, "This action belongs to the Turnabout format.");
  }
  const state = normalizeDebateFormatStateV1(
    session.formatState,
    "turnabout",
  );
  if (state.format !== "turnabout") {
    throw new HttpError(409, "The Turnabout record is unavailable.");
  }
  return state;
}

function withTurnaboutState(
  session: DebateSessionV1,
  state: DebateTurnaboutFormatStateV1,
): DebateSessionV1 {
  return {
    ...session,
    format: "turnabout",
    formatVersion: DEBATE_FORMAT_SCHEMA_VERSION,
    formatState: state,
  };
}

function turnaboutEligibleStatements(
  session: DebateSessionV1,
  state: DebateTurnaboutFormatStateV1,
): DebateTurnaboutStatementV1[] {
  if (session.playerRole !== "participant") return state.statements;
  const opposingSide: DebateSideId =
    session.playerSideId === "against" ? "for" : "against";
  return state.statements.filter(
    (statement) => statement.sideId === opposingSide,
  );
}

function turnaboutResolutionStart(
  session: DebateSessionV1,
  state: DebateTurnaboutFormatStateV1,
): DebateSessionV1 {
  const stepKey =
    session.playerRole === "judge"
      ? "turnabout_verdict_player"
      : "turnabout_ballot_moderator";
  return withTurnaboutState(
    {
      ...session,
      phase: "verdict",
      stepKey,
      status: statusForStep(stepKey),
    },
    {
      ...state,
      phase: "resolution",
      activeStatementId: null,
      floorOwnerBotId:
        session.playerRole === "judge" ? null : session.moderator.id,
    },
  );
}

function turnaboutNextStatement(
  session: DebateSessionV1,
  state: DebateTurnaboutFormatStateV1,
): DebateSessionV1 {
  const next = turnaboutEligibleStatements(session, state).find(
    (statement) =>
      statement.status === "ready" || statement.status === "pressed",
  );
  if (!next) return turnaboutResolutionStart(session, state);
  return withTurnaboutState(
    {
      ...session,
      phase: "challenge",
      stepKey:
        session.playerRole === "spectator"
          ? "turnabout_spectator_press"
          : "turnabout_action",
      status:
        session.playerRole === "spectator" ? "live" : "waiting_for_player",
    },
    {
      ...state,
      phase: "examination",
      activeStatementId: next.id,
      floorOwnerBotId: next.speakerBotId,
    },
  );
}

function replaceTurnaboutStatement(
  state: DebateTurnaboutFormatStateV1,
  statementId: string,
  update: (
    statement: DebateTurnaboutStatementV1,
  ) => DebateTurnaboutStatementV1,
): DebateTurnaboutFormatStateV1 {
  return {
    ...state,
    statements: state.statements.map((statement) =>
      statement.id === statementId ? update(statement) : statement,
    ),
  };
}

async function generateTurnaboutTestimony(
  session: DebateSessionV1,
  sideId: DebateSideId,
  runtime: DebateAiRuntime,
): Promise<{
  statements: DebateTurnaboutStatementV1[];
  events: DebateEventV1[];
}> {
  const speaker = botForSide(session, sideId);
  const events: DebateEventV1[] = [];
  const statements: DebateTurnaboutStatementV1[] = [];
  let working = session;
  for (
    let index = 0;
    index < DEBATE_TURNABOUT_STATEMENTS_PER_SIDE;
    index += 1
  ) {
    const generatedSpeech = await generateSpeech(
      working,
      speaker,
      [
        `Deliver testimony statement ${index + 1} of ${DEBATE_TURNABOUT_STATEMENTS_PER_SIDE} for ${sideLabel(session, sideId)} into the Court of Record.`,
        "State one claim this persona can actually notice and explain. It may be simple, literal, mistaken, or oddly reasoned when that fits the saved persona.",
        index === 0
          ? "Give their own most natural reason for this side."
          : "Add a different natural reason if this persona can think of one; do not force a sophisticated second line of argument.",
        "Keep it to 1-3 sentences. Use only the frozen record and cite frozen sources with valid markers.",
      ].join(" "),
      runtime,
    );
    const speech = await turnaboutRecordBoundSpeech(
      session,
      speaker,
      generatedSpeech,
      runtime,
    );
    if (speech.silent) {
      const silence = makeEvent(working, {
        kind: "silence",
        speakerKind: "advocate",
        speakerBotId: speaker.id,
        sideId,
        content: BOT_POWER_CANONICAL_SILENCE_V1,
      });
      events.push(silence);
      break;
    }
    const statementId = randomUUID();
    const event = makeEvent(working, {
      kind: "testimony",
      speakerKind: "advocate",
      speakerBotId: speaker.id,
      sideId,
      content: speech.content,
      sourceIds: speech.sourceIds,
      provider: speech.provider,
      model: speech.model,
      autoRecovery: speech.autoRecovery,
      statementId,
    });
    const statement: DebateTurnaboutStatementV1 = {
      id: statementId,
      sideId,
      speakerBotId: speaker.id,
      content: event.content,
      sourceIds: event.sourceIds,
      status: "ready",
      createdEventId: event.id,
    };
    events.push(event);
    statements.push(statement);
    working = { ...working, events: [...working.events, event] };
  }
  return { statements, events };
}

async function pressTurnaboutStatement(
  session: DebateSessionV1,
  statement: DebateTurnaboutStatementV1,
  runtime: DebateAiRuntime,
  actor: "player" | "moderator",
): Promise<{
  state: DebateTurnaboutFormatStateV1;
  events: DebateEventV1[];
}> {
  const state = turnaboutState(session);
  const speaker = botForSide(session, statement.sideId);
  const press = makeEvent(session, {
    kind: "press",
    speakerKind: actor,
    speakerBotId: actor === "moderator" ? session.moderator.id : null,
    sideId: actor === "player" ? session.playerSideId : null,
    content:
      actor === "moderator"
        ? `The court presses statement ${statement.id.slice(0, 8)} for a clearer account.`
        : `Press statement ${statement.id.slice(0, 8)}: explain what this claim rests on.`,
    statementId: statement.id,
    parentEventId: statement.createdEventId,
  });
  const withPress: DebateSessionV1 = {
    ...session,
    events: [...session.events, press],
  };
  const generatedClarification = await generateSpeech(
    withPress,
    speaker,
    [
      `Your recorded statement was: ${statement.content}`,
      "The court has pressed it.",
      "Answer only as well as this persona can understand the question, in 1-3 sentences.",
      "Narrow or concede only if this persona would naturally recognize and express that move. Do not introduce evidence outside the frozen record.",
    ].join("\n"),
    runtime,
  );
  const clarification = await turnaboutRecordBoundSpeech(
    session,
    speaker,
    generatedClarification,
    runtime,
    statement.content,
  );
  const clarificationEvent = makeEvent(withPress, {
    kind: clarification.silent ? "silence" : "speech",
    speakerKind: "advocate",
    speakerBotId: speaker.id,
    sideId: statement.sideId,
    content: clarification.content,
    sourceIds: clarification.sourceIds,
    parentEventId: press.id,
    provider: clarification.provider,
    model: clarification.model,
    autoRecovery: clarification.autoRecovery,
    statementId: statement.id,
  });
  const withClarification: DebateSessionV1 = {
    ...withPress,
    events: [...withPress.events, clarificationEvent],
  };
  const ruling = makeEvent(withClarification, {
    kind: "moderator_ruling",
    speakerKind: "moderator",
    speakerBotId: session.moderator.id,
    content: clarification.silent
      ? "The court records canonical silence. The original statement remains on the public record."
      : "Entered. The original statement remains subject to a frozen-evidence objection.",
    parentEventId: clarificationEvent.id,
    statementId: statement.id,
  });
  return {
    state: replaceTurnaboutStatement(
      state,
      statement.id,
      (current) => ({
        ...current,
        status: actor === "moderator" ? "resolved" : "pressed",
      }),
    ),
    events: [press, clarificationEvent, ruling],
  };
}

function exactGroundedQuote(
  quoteRaw: unknown,
  sourceRaw: string,
): string | null {
  const quote = compactText(quoteRaw, 600);
  if (quote.length < 8) return null;
  const source = sourceRaw.replace(/\s+/gu, " ").trim();
  const index = source.toLocaleLowerCase().indexOf(quote.toLocaleLowerCase());
  if (index < 0) return null;
  return source.slice(index, index + quote.length);
}

async function assessTurnaboutContradiction(
  session: DebateSessionV1,
  statement: DebateTurnaboutStatementV1,
  evidenceSourceId: string,
  runtime: DebateAiRuntime,
): Promise<{
  contradiction: DebateTurnaboutContradictionV1;
  provider: ProviderName;
  model: string;
  autoRecovery?: AutoRecoveryTraceV1;
}> {
  const evidence = session.evidence.sources.find(
    (source) => source.id === evidenceSourceId,
  );
  if (!session.evidence.frozenAt || !evidence) {
    throw new HttpError(
      400,
      "Only an evidence item frozen before Start may be presented.",
    );
  }
  const statementRecord = debateSpokenText(statement.content);
  const evidenceRecord = `${evidence.title}. ${evidence.snippet}`.trim();
  const generation = await generateJson(
    lanesForSession(runtime, session),
    [
      {
        role: "system",
        content: [
          "You validate one PRISM Turnabout contradiction against a frozen public record.",
          "Do not perform theatrics, score either side, infer hidden evidence, or invent language.",
          "A contradiction is sustained only when the frozen evidence materially conflicts with the recorded statement.",
          "Both quotes must be exact contiguous excerpts from the supplied records.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Recorded statement: ${statementRecord}`,
          `Frozen evidence ${evidence.id}: ${evidenceRecord}`,
          'Return JSON only: {"contradicts":true|false,"statementQuote":"exact excerpt","evidenceQuote":"exact excerpt","reason":"one concise grounded explanation"}.',
        ].join("\n"),
      },
    ],
    { maxTokens: 320, temperature: 0.1 },
  );
  const statementQuote = exactGroundedQuote(
    generation.value.statementQuote,
    statementRecord,
  );
  const evidenceQuote = exactGroundedQuote(
    generation.value.evidenceQuote,
    evidenceRecord,
  );
  const grounded = statementQuote !== null && evidenceQuote !== null;
  const ruling =
    generation.value.contradicts === true && grounded
      ? "sustained"
      : "overruled";
  return {
    contradiction: {
      id: randomUUID(),
      statementId: statement.id,
      evidenceSourceId,
      statementQuote: statementQuote ?? "",
      evidenceQuote: evidenceQuote ?? "",
      reason: grounded
        ? compactText(generation.value.reason, 1_000)
        : "The proposed contradiction was not grounded in exact public-record excerpts.",
      grounded,
      ruling,
      createdAt: new Date().toISOString(),
    },
    provider: generation.provider,
    model: generation.model,
    ...(generation.autoRecovery
      ? { autoRecovery: generation.autoRecovery }
      : {}),
  };
}

async function advanceTurnaboutStep(
  session: DebateSessionV1,
  runtime: DebateAiRuntime,
): Promise<{ session: DebateSessionV1; events: DebateEventV1[] }> {
  const state = turnaboutState(session);
  switch (session.stepKey) {
    case "turnabout_intro":
      return speechTransition(
        withTurnaboutState(session, {
          ...state,
          phase: "testimony",
          floorOwnerBotId: session.moderator.id,
        }),
        session.moderator,
        null,
        [
          "Call the Court of Record to order and open this Turnabout in 3-5 sentences.",
          `State the exact motion and identify ${session.forAdvocate.name} and ${session.againstAdvocate.name}.`,
          "Explain that each side will enter two pressable statements, objections must identify one statement and one frozen evidence item, and you will rule immediately from the public record.",
          session.evidence.sources.length > 0
            ? `The frozen record contains ${session.evidence.sources.length} presentable evidence item${session.evidence.sources.length === 1 ? "" : "s"}.`
            : "The frozen record contains no presentable evidence item. Say clearly that Press and Pass remain available, but Object and Present Evidence are unavailable in this proceeding.",
          "Do not say testimony must cite evidence. Testimony is a pressable advocacy claim; only a formal evidence presentation needs a frozen item.",
          "Remain neutral. Do not invent evidence or imply odds.",
          advocacyDisclosure(session),
        ].join(" "),
        runtime,
        (next) => ({ ...next, stepKey: "turnabout_testimony_for" }),
      );
    case "turnabout_testimony_for":
    case "turnabout_testimony_against": {
      const sideId: DebateSideId = session.stepKey.endsWith("_for")
        ? "for"
        : "against";
      const testimony = await generateTurnaboutTestimony(
        session,
        sideId,
        runtime,
      );
      const nextState: DebateTurnaboutFormatStateV1 = {
        ...state,
        phase: "testimony",
        floorOwnerBotId: botForSide(session, sideId).id,
        statements: [...state.statements, ...testimony.statements],
      };
      if (sideId === "for") {
        return {
          session: withTurnaboutState(
            { ...session, stepKey: "turnabout_testimony_against" },
            nextState,
          ),
          events: testimony.events,
        };
      }
      return {
        session: turnaboutNextStatement(session, nextState),
        events: testimony.events,
      };
    }
    case "turnabout_spectator_press": {
      const statement = state.statements.find(
        (candidate) => candidate.id === state.activeStatementId,
      );
      if (!statement) {
        return { session: turnaboutResolutionStart(session, state), events: [] };
      }
      const pressed = await pressTurnaboutStatement(
        session,
        statement,
        runtime,
        "moderator",
      );
      return {
        session: turnaboutNextStatement(session, pressed.state),
        events: pressed.events,
      };
    }
    case "turnabout_ballot_moderator":
    case "turnabout_ballot_for":
    case "turnabout_ballot_against": {
      const voter =
        session.stepKey === "turnabout_ballot_moderator"
          ? session.moderator
          : session.stepKey === "turnabout_ballot_for"
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
        provider: ballot.provider,
        model: ballot.model,
        autoRecovery: ballot.autoRecovery,
      });
      const ballots = [...session.ballots, ballot];
      if (session.stepKey !== "turnabout_ballot_against") {
        const nextStep =
          session.stepKey === "turnabout_ballot_moderator"
            ? "turnabout_ballot_for"
            : "turnabout_ballot_against";
        return {
          session: withTurnaboutState(
            { ...session, ballots, stepKey: nextStep },
            { ...state, floorOwnerBotId: voter.id },
          ),
          events: [event],
        };
      }
      const winnerSideId =
        session.playerRole === "judge"
          ? session.playerVerdict
          : majorityWinner(ballots);
      if (!winnerSideId) throw new Error("The Turnabout resolution is missing.");
      const verdictEvent = makeEvent(
        { ...session, events: [...session.events, event] },
        {
          kind: "verdict",
          speakerKind: "system",
          sideId: winnerSideId,
          content:
            session.playerRole === "judge"
              ? `From the public record, the Court finds for ${sideLabel(session, winnerSideId)}. The Judge's ruling resolves the Turnabout; bot ballots remain an agreement-and-dissent epilogue.`
              : `On the public record, ${sideLabel(session, winnerSideId)} carries the Turnabout by the three-bot majority.`,
        },
      );
      return {
        session: withTurnaboutState(
          {
            ...session,
            ballots,
            winnerSideId,
            status: "completed",
            completedAt: new Date().toISOString(),
            stepKey: "completed",
          },
          {
            ...state,
            phase: "resolution",
            activeStatementId: null,
            floorOwnerBotId: null,
          },
        ),
        events: [event, verdictEvent],
      };
    }
    default:
      throw new HttpError(409, "This Turnabout is waiting for player input.");
  }
}

function skippedTurnaboutTransition(
  session: DebateSessionV1,
): DebateSessionV1 {
  const state = turnaboutState(session);
  if (session.stepKey === "turnabout_intro") {
    return { ...session, stepKey: "turnabout_testimony_for" };
  }
  if (session.stepKey === "turnabout_testimony_for") {
    return { ...session, stepKey: "turnabout_testimony_against" };
  }
  if (session.stepKey === "turnabout_testimony_against") {
    return turnaboutNextStatement(session, state);
  }
  if (session.stepKey === "turnabout_spectator_press") {
    const currentId = state.activeStatementId;
    const resolved = currentId
      ? replaceTurnaboutStatement(state, currentId, (statement) => ({
          ...statement,
          status: "resolved",
        }))
      : state;
    return turnaboutNextStatement(session, resolved);
  }
  if (
    session.stepKey === "turnabout_ballot_moderator" ||
    session.stepKey === "turnabout_ballot_for"
  ) {
    return {
      ...session,
      stepKey:
        session.stepKey === "turnabout_ballot_moderator"
          ? "turnabout_ballot_for"
          : "turnabout_ballot_against",
    };
  }
  if (session.stepKey === "turnabout_ballot_against") {
    const winnerSideId =
      session.playerRole === "judge" ? session.playerVerdict : null;
    return {
      ...session,
      status: winnerSideId ? "completed" : "failed",
      winnerSideId,
      completedAt: winnerSideId ? new Date().toISOString() : null,
      error: winnerSideId
        ? null
        : "The Turnabout ended without enough public-record ballots.",
    };
  }
  throw new HttpError(409, "This Turnabout step cannot be skipped.");
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
      return enterModeratedRebuttal(session);
    }
    if (step === "challenge_judge_pass_for_answer") {
      return { ...session, stepKey: "challenge_judge_pass_against_prompt" };
    }
  }
  if (step === "moderator_to_rebuttal") {
    return enterRebuttal(session, "against");
  }
  if (step.startsWith("rebuttal_against")) return nextAfterRebuttal(session, "against");
  if (step.startsWith("rebuttal_for")) return nextAfterRebuttal(session, "for");
  if (step === "moderator_to_closing") {
    return { ...session, stepKey: "closing_against", status: "live" };
  }
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
          "Call the Assembly Chamber to order and open the Forum in 3-5 sentences.",
          `State the exact motion as the question before the chamber, recognize ${session.forAdvocate.name} for ${session.motion.forSide.label} and ${session.againstAdvocate.name} for ${session.motion.againstSide.label}, and name the judging criteria: ${DEBATE_CRITERIA}.`,
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
        `Give the ${session.motion.forSide.label} opening address to the chamber. Establish a focused thesis and make the strongest frozen-evidence-supported case.`,
        runtime,
        (next) => ({ ...next, stepKey: "opening_against" }),
      );
    case "opening_against":
      return speechTransition(
        session,
        session.againstAdvocate,
        "against",
        `Respond with the ${session.motion.againstSide.label} opening address to the chamber. Establish a distinct thesis and engage what the For side actually said.`,
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
        (next) => enterModeratedRebuttal(next),
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
          return enterModeratedRebuttal(next);
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
        (next) => enterModeratedRebuttal(next),
      );
    }
    case "moderator_to_rebuttal":
      return moderatorPhaseTransition(
        session,
        [
          "Move the Assembly Chamber into rebuttal in one or two concise sentences.",
          "Name the central unresolved clash using only what was publicly said, then recognize the Against side for the first rebuttal.",
          "Do not judge either side, add evidence, or make an argument yourself.",
        ].join(" "),
        runtime,
        (next) => enterRebuttal(next, "against"),
      );
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
    case "moderator_to_closing":
      return moderatorPhaseTransition(
        session,
        [
          "Move the Assembly Chamber into closing addresses in one or two concise sentences.",
          "Identify the single question still before the chamber, recognize the Against closing first, and reserve the final reply for For.",
          "Do not judge either side, introduce new material, or make an argument yourself.",
        ].join(" "),
        runtime,
        (next) => ({
          ...next,
          phase: "closing",
          stepKey: "closing_against",
          status: "live",
        }),
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
        provider: ballot.provider,
        model: ballot.model,
        autoRecovery: ballot.autoRecovery,
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
              ? `The chair records the Judge's decision for ${sideLabel(session, winnerSideId)}. Bot ballots remain an agreement-and-dissent epilogue only.`
              : `${sideLabel(session, winnerSideId)} carries the motion by the three-bot majority.`,
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
    const current = {
      ...session,
      error: null,
      status: "live" as const,
      events: [...session.events, event],
    };
    const next =
      session.format === "turnabout"
        ? skippedTurnaboutTransition(current)
        : skippedTransition(current);
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
    const active = { ...session, status: "live" as const, error: null };
    const transitioned =
      session.format === "turnabout"
        ? await advanceTurnaboutStep(active, runtime)
        : await advanceStep(active, runtime);
    const committed = commitMutation(
      db,
      userId,
      session,
      transitioned.session,
      checked.idempotencyKey,
      transitioned.events,
    );
    if (session.format === "forum") {
      queueCaseBoardRefinement(
        db,
        userId,
        committed,
        transitioned.events,
        runtime.auxiliary,
      );
    }
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
          error instanceof AutoFallbackExhaustedError
            ? "All configured Auto models failed. Retry this turn when a model is available."
            : error instanceof Error
            ? `Turn unavailable: ${compactText(error.message, 300)}`
            : "Turn unavailable.",
      },
      checked.idempotencyKey,
      [event],
    );
  }
}

export async function submitDebateTurnaboutAction(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  request: DebateTurnaboutActionRequest,
  runtime: DebateAiRuntime,
): Promise<DebateSessionV1> {
  const checked = assertMutation(db, userId, sessionId, request);
  if (checked.replay) return checked.replay;
  const session = checked.session;
  if (
    session.format !== "turnabout" ||
    session.status !== "waiting_for_player" ||
    session.stepKey !== "turnabout_action" ||
    session.playerRole === "spectator"
  ) {
    throw new HttpError(
      409,
      "This Turnabout is not waiting for a record action.",
    );
  }
  const state = turnaboutState(session);
  const statementId = compactText(request.statementId, 120);
  const statement = state.statements.find(
    (candidate) =>
      candidate.id === statementId &&
      candidate.id === state.activeStatementId,
  );
  if (!statement) {
    throw new HttpError(409, "That statement no longer owns the floor.");
  }

  if (request.action === "press") {
    if (statement.status !== "ready") {
      throw new HttpError(409, "This statement has already been pressed.");
    }
    const pressed = await pressTurnaboutStatement(
      session,
      statement,
      runtime,
      "player",
    );
    return commitMutation(
      db,
      userId,
      session,
      withTurnaboutState(
        { ...session, status: "waiting_for_player" },
        {
          ...pressed.state,
          phase: "examination",
          activeStatementId: statement.id,
          floorOwnerBotId: statement.speakerBotId,
        },
      ),
      checked.idempotencyKey,
      pressed.events,
    );
  }

  if (request.action === "pass") {
    const pass = makeEvent(session, {
      kind: "player_turn",
      speakerKind: "player",
      sideId: session.playerSideId,
      content: "Pass. The statement stands on the public record.",
      statementId: statement.id,
      parentEventId: statement.createdEventId,
    });
    const resolved = replaceTurnaboutStatement(
      state,
      statement.id,
      (current) => ({ ...current, status: "resolved" }),
    );
    return commitMutation(
      db,
      userId,
      session,
      turnaboutNextStatement(session, resolved),
      checked.idempotencyKey,
      [pass],
    );
  }

  if (request.action !== "present_evidence") {
    throw new HttpError(400, "Choose Press, Present Evidence, or Pass.");
  }
  const evidenceSourceId = compactText(
    request.evidenceSourceId,
    48,
  ).toLowerCase();
  const evidence = session.evidence.sources.find(
    (source) => source.id === evidenceSourceId,
  );
  if (!session.evidence.frozenAt || !evidence) {
    throw new HttpError(
      400,
      "Only an evidence item frozen before Start may be presented.",
    );
  }
  const assessment = await assessTurnaboutContradiction(
    session,
    statement,
    evidenceSourceId,
    runtime,
  );
  const objection = makeEvent(session, {
    kind: "objection",
    speakerKind: "player",
    sideId: session.playerSideId,
    content: `Objection to statement ${statement.id.slice(0, 8)}.`,
    statementId: statement.id,
    evidenceSourceId,
    parentEventId: statement.createdEventId,
  });
  const withObjection: DebateSessionV1 = {
    ...session,
    events: [...session.events, objection],
  };
  const publicEvidence = sanitizeDebateStatementSources(
    `Presenting ${evidence.title}: ${evidence.snippet} [[source:${evidence.id}]]`,
    session.evidence,
  );
  const evidenceEvent = makeEvent(withObjection, {
    kind: "evidence",
    speakerKind: "player",
    sideId: session.playerSideId,
    content: publicEvidence.content,
    sourceIds: publicEvidence.sourceIds,
    statementId: statement.id,
    evidenceSourceId,
    parentEventId: objection.id,
  });
  const withEvidence: DebateSessionV1 = {
    ...withObjection,
    events: [...withObjection.events, evidenceEvent],
  };
  const contradiction = assessment.contradiction;
  const rulingEvent = makeEvent(withEvidence, {
    kind: "moderator_ruling",
    speakerKind: "moderator",
    speakerBotId: session.moderator.id,
    content:
      contradiction.ruling === "sustained"
        ? `Sustained. The statement says “${contradiction.statementQuote}”; the frozen evidence says “${contradiction.evidenceQuote}”. The contradiction is entered.`
        : "Overruled. The submitted contradiction is not grounded in both the recorded statement and the frozen evidence. The statement remains open.",
    sourceIds:
      contradiction.ruling === "sustained" ? [evidenceSourceId] : [],
    statementId: statement.id,
    evidenceSourceId,
    ruling: contradiction.ruling,
    parentEventId: evidenceEvent.id,
    provider: assessment.provider,
    model: assessment.model,
    autoRecovery: assessment.autoRecovery,
  });
  let nextState: DebateTurnaboutFormatStateV1 = {
    ...state,
    contradictions: [...state.contradictions, contradiction],
    floorOwnerBotId:
      contradiction.ruling === "sustained"
        ? session.moderator.id
        : statement.speakerBotId,
  };
  const newEvents: DebateEventV1[] = [
    objection,
    evidenceEvent,
    rulingEvent,
  ];
  if (contradiction.ruling === "overruled") {
    return commitMutation(
      db,
      userId,
      session,
      withTurnaboutState(
        { ...session, status: "waiting_for_player" },
        {
          ...nextState,
          phase: "examination",
          activeStatementId: statement.id,
        },
      ),
      checked.idempotencyKey,
      newEvents,
    );
  }

  nextState = replaceTurnaboutStatement(
    {
      ...nextState,
      phase: "reversal",
      round: nextState.round + 1,
    },
    statement.id,
    (current) => ({ ...current, status: "contradicted" }),
  );
  const withRuling: DebateSessionV1 = {
    ...withTurnaboutState(session, nextState),
    events: [...withEvidence.events, rulingEvent],
  };
  const speaker = botForSide(session, statement.sideId);
  const generatedReversal = await generateSpeech(
    withRuling,
    speaker,
    [
      "A frozen-evidence contradiction to your recorded statement was sustained.",
      `Statement excerpt: ${contradiction.statementQuote}`,
      `Evidence excerpt: ${contradiction.evidenceQuote}`,
      "Respond as well as this persona can understand the contradiction. Concede, narrow, or reconcile only if that is a move this persona could naturally make.",
      "Do not fabricate evidence, attack the ruling, or repeat the original claim unchanged.",
    ].join("\n"),
    runtime,
  );
  const reversal = await turnaboutRecordBoundSpeech(
    session,
    speaker,
    generatedReversal,
    runtime,
    [
      statement.content,
      contradiction.statementQuote,
      contradiction.evidenceQuote,
    ].join("\n"),
  );
  const revelationEvent = makeEvent(withRuling, {
    kind: reversal.silent ? "silence" : "revelation",
    speakerKind: "advocate",
    speakerBotId: speaker.id,
    sideId: statement.sideId,
    content: reversal.content,
    sourceIds: reversal.sourceIds,
    statementId: statement.id,
    evidenceSourceId,
    parentEventId: rulingEvent.id,
    provider: reversal.provider,
    model: reversal.model,
    autoRecovery: reversal.autoRecovery,
  });
  newEvents.push(revelationEvent);
  return commitMutation(
    db,
    userId,
    session,
    turnaboutNextStatement(session, nextState),
    checked.idempotencyKey,
    newEvents,
  );
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
  if (session.format === "turnabout") {
    throw new HttpError(
      409,
      "Use the Turnabout record actions for this proceeding.",
    );
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

export async function submitDebateInterjection(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  request: DebateInterjectionRequest,
  runtime: DebateAiRuntime,
): Promise<DebateSessionV1> {
  const checked = assertMutation(db, userId, sessionId, request);
  if (checked.replay) return checked.replay;
  const session = checked.session;
  if (session.format === "turnabout") {
    throw new HttpError(
      409,
      "Use Turnabout objections instead of Forum interjections.",
    );
  }
  if (
    session.playerRole !== "participant" ||
    !session.playerSideId ||
    session.status !== "live"
  ) {
    throw new HttpError(
      409,
      "Only an active Participant may interject from the floor.",
    );
  }
  const target = session.events.find((event) => event.id === request.eventId);
  if (
    !target ||
    target.kind !== "speech" ||
    target.speakerKind !== "advocate" ||
    !target.sideId ||
    target.sideId === session.playerSideId ||
    target.interrupted
  ) {
    throw new HttpError(409, "That opposing floor is no longer interruptible.");
  }
  const laterPublicEvent = session.events.some(
    (event) =>
      event.sequence > target.sequence &&
      event.kind !== "case_board",
  );
  if (laterPublicEvent) {
    throw new HttpError(409, "The Forum has already moved beyond that floor.");
  }
  if (
    !Number.isInteger(request.heardCharacterCount) ||
    request.heardCharacterCount < 24 ||
    request.heardCharacterCount >= target.content.length
  ) {
    throw new HttpError(400, "Wait for a complete phrase before interjecting.");
  }
  const rawInterjection = multilineText(request.content, 600);
  if (!rawInterjection) {
    throw new HttpError(400, "Enter the point you want to interject.");
  }
  const publicInterjection = sanitizeDebateStatementSources(
    rawInterjection,
    session.evidence,
  );
  if (!publicInterjection.content) {
    throw new HttpError(400, "Enter the point you want to interject.");
  }
  const prefix = interruptedStatementPrefix(
    target.content,
    request.heardCharacterCount,
  );
  if (!prefix) throw new HttpError(409, "The speaker has not completed a phrase.");
  const publicPrefix = sanitizeDebateStatementSources(prefix, session.evidence);
  const revisedSpeech: DebateEventV1 = {
    ...target,
    content: publicPrefix.content,
    sourceIds: publicPrefix.sourceIds,
    interrupted: true,
    interruptedBy: "player",
  };
  const revisedEvents = session.events.map((event) =>
    event.id === target.id ? revisedSpeech : event,
  );
  const caseBoard = caseBoardAfterInterruptedSpeech(session, revisedSpeech);
  const interjection = makeEvent(
    { ...session, events: revisedEvents },
    {
      kind: "interjection",
      speakerKind: "player",
      sideId: session.playerSideId,
      content: publicInterjection.content,
      sourceIds: publicInterjection.sourceIds,
      parentEventId: target.id,
    },
  );
  const withInterjection: DebateSessionV1 = {
    ...session,
    caseBoard,
    events: [...revisedEvents, interjection],
  };
  const interruptedSpeaker =
    target.speakerBotId === session.forAdvocate.id
      ? session.forAdvocate
      : session.againstAdvocate;
  const ruling = await generateSpeech(
    withInterjection,
    session.moderator,
    [
      `${interruptedSpeaker.name} was cut off before completing the scheduled floor.`,
      `The participant interjected: ${publicInterjection.content}`,
      "Give a concise one- or two-sentence procedural ruling.",
      "Acknowledge the breach, warn or recognize the point as appropriate, and clearly restore the scheduled phase.",
      "Do not add a substantive argument, judge the motion, or invent evidence.",
    ].join(" "),
    runtime,
  );
  if (ruling.silent) {
    throw new Error("The moderator could not deliver a public ruling.");
  }
  const rulingEvent = makeEvent(withInterjection, {
    kind: "moderator_ruling",
    speakerKind: "moderator",
    speakerBotId: session.moderator.id,
      content: ruling.content,
      sourceIds: ruling.sourceIds,
      parentEventId: interjection.id,
      provider: ruling.provider,
      model: ruling.model,
      autoRecovery: ruling.autoRecovery,
  });
  const boardEvent = caseBoardEvent(
    {
      ...withInterjection,
      events: [...withInterjection.events, rulingEvent],
    },
    caseBoard,
    revisedSpeech,
  );
  const committed = commitRevisedEventMutation(
    db,
    userId,
    session,
    { ...session, caseBoard, events: session.events },
    checked.idempotencyKey,
    revisedSpeech,
    [interjection, rulingEvent, boardEvent],
  );
  queueCaseBoardRefinement(
    db,
    userId,
    committed,
    [revisedSpeech],
    runtime.auxiliary,
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
  const verdictStep =
    session.format === "turnabout"
      ? "turnabout_verdict_player"
      : "verdict_player";
  if (
    session.playerRole !== "judge" ||
    session.status !== "waiting_for_player" ||
    session.stepKey !== verdictStep
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
  const nextStep =
    session.format === "turnabout"
      ? "turnabout_ballot_moderator"
      : "ballot_moderator";
  const nextSession =
    session.format === "turnabout"
      ? withTurnaboutState(
          {
            ...session,
            playerVerdict: request.sideId,
            winnerSideId: request.sideId,
            stepKey: nextStep,
            status: "live",
          },
          {
            ...turnaboutState(session),
            phase: "resolution",
            activeStatementId: null,
            floorOwnerBotId: session.moderator.id,
          },
        )
      : {
          ...session,
          playerVerdict: request.sideId,
          winnerSideId: request.sideId,
          stepKey: nextStep,
          status: "live" as const,
        };
  return commitMutation(
    db,
    userId,
    session,
    nextSession,
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

export function endDebateSessionEarly(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  request: { expectedRevision: number; idempotencyKey: string },
): DebateSessionV1 {
  const checked = assertMutation(db, userId, sessionId, request);
  if (checked.replay) return checked.replay;
  const session = checked.session;
  if (
    session.status === "completed" ||
    session.status === "cancelled" ||
    session.status === "failed"
  ) {
    throw new HttpError(409, "This Debate is already finished.");
  }
  if (
    session.phase === "verdict" ||
    session.stepKey.includes("verdict") ||
    session.stepKey.includes("ballot")
  ) {
    throw new HttpError(409, "This Debate is already concluding.");
  }

  const endedEarlyAt = new Date().toISOString();
  const stepKey =
    session.format === "turnabout"
      ? session.playerRole === "judge"
        ? "turnabout_verdict_player"
        : "turnabout_ballot_moderator"
      : session.playerRole === "judge"
        ? "verdict_player"
        : "ballot_moderator";
  const concludingSession: DebateSessionV1 = {
    ...session,
    phase: "verdict",
    stepKey,
    status: statusForStep(stepKey),
    endedEarlyAt,
    error: null,
  };
  const nextSession =
    session.format === "turnabout"
      ? withTurnaboutState(concludingSession, {
          ...turnaboutState(session),
          phase: "resolution",
          activeStatementId: null,
          floorOwnerBotId:
            session.playerRole === "judge" ? null : session.moderator.id,
        })
      : concludingSession;
  const event = makeEvent(nextSession, {
    kind: "phase",
    speakerKind: "system",
    stepKey: "early_conclusion",
    content:
      session.format === "turnabout"
        ? session.playerRole === "judge"
          ? "The Court of Record closes examination early. The Judge must rule from the limited public record heard so far."
          : "The Court of Record closes examination early. The panel will decide from the limited public record heard so far."
        : session.playerRole === "judge"
          ? "The Assembly Chamber closes debate early. The Judge must decide which side carried the motion on the limited public record heard so far."
          : "The Assembly Chamber closes debate early. The panel will decide which side carried the motion on the limited public record heard so far.",
  });
  return commitMutation(
    db,
    userId,
    session,
    nextSession,
    checked.idempotencyKey,
    [event],
  );
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
