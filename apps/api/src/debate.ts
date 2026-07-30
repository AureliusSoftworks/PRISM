import { createHash, randomInt, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  BOT_POWER_CANONICAL_SILENCE_V1,
  DEBATE_CASE_CARDS_PER_SIDE,
  DEBATE_FORMAT_SCHEMA_VERSION,
  DEBATE_JURY_DISCUSSION_TURNS,
  DEBATE_JURY_EARLY_DISCUSSION_TURNS,
  DEBATE_JURY_SIZE,
  DEBATE_PLAYER_JUDGE_BOT_ID,
  DEBATE_PLAYER_TURN_MAX_LENGTH,
  DEBATE_SCHEMA_VERSION,
  DEBATE_SETUP_PRESETS,
  DEBATE_TURNABOUT_STATEMENTS_PER_SIDE,
  applyBotPowerMumbledResponseV1,
  applyBotPowerMuteResponseV1,
  applyBotPowerResponseBudgetV1,
  botPowerIntermittentMuteTurnIsIgnoredFromEffectsV1,
  botPowerObserverProjectionFromEffectsV1,
  debateFormalityGuidance,
  debateEstimatedSpeechDurationMs,
  botPowerPairwisePerceptionFromEffectsV1,
  debateSourceIdsFromText,
  debateSpokenText,
  defaultDebateFormatStateV1,
  defaultDebateJuryStateV1,
  isDebateFormatId,
  isDebatePlayerRole,
  isDebateSideId,
  normalizeDebateFormatStateV1,
  normalizeDebateEvidencePacketV1,
  normalizeDebateFormalityId,
  normalizeDebateIdempotencyKey,
  normalizeDebateJuryStateV1,
  normalizeDebateMotionSlateV1,
  normalizeDebateSetupPresetId,
  normalizeBotAudioVoiceProfileV1,
  parseStoredBotPrompt,
  parseStoredBotAudioVoiceProfileV1,
  parseStoredBotAvatarDetailsV1,
  parseStoredBotPowersV1,
  sanitizeDebateStatementSources,
  stripBotProfileMetaSuffix,
  strongestBotPowerResponseBudgetEffectV1,
  type AutoFallbackModelRef,
  type AutoRecoveryTraceV1,
  type BotAudioVoiceProfileV1,
  type DebateAdvocacyConsent,
  type DebateAdvanceRequest,
  type DebateBallotV1,
  type DebateBotPowerPlanV1,
  type DebateBotSnapshotV1,
  type DebateCaseCardV1,
  type DebateEventKind,
  type DebateEventV1,
  type DebateEvidencePacketV1,
  type DebateFormalityId,
  type DebateFormatId,
  type DebateInterjectionRequest,
  type DebateJuryBallotV1,
  type DebateJuryStateV1,
  type DebateJurorSnapshotV1,
  type DebateMotionSlateV1,
  type DebatePlayerTurnRequest,
  type DebatePowerEffectPlanV1,
  type DebatePowerPlanV1,
  type DebateSessionCreateRequest,
  type DebateSessionListItemV1,
  type DebateSessionV1,
  type DebateSetupPresetId,
  type DebateSideId,
  type DebateSpeakerKind,
  type DebateTurnaboutActionRequest,
  type DebateTurnaboutContradictionV1,
  type DebateTurnaboutFormatStateV1,
  type DebateTurnaboutStatementV1,
  type DebateTurnTimingV1,
  type DebateVerdictRequest,
  type ResponseMode,
} from "@localai/shared";
import {
  AutoFallbackExhaustedError,
  runAutoFallbackChain,
  type AutoFallbackValidationResult,
} from "./auto-fallback.ts";
import { resolveSocialPowersForBots } from "./coffee-powers.ts";
import { parseRouterResponse, sanitizeCoffeeTableReply } from "./coffee.ts";
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

const GENERIC_DEBATE_JURORS = [
  {
    id: "prism-juror:evidence",
    name: "Evidence Prism",
    color: "#ff5f87",
    glyph: "lucideSearch",
    systemPrompt:
      "You are an evidence-first juror. You distrust unsupported certainty, reward claims tied to what was publicly presented, and stay willing to revise when better evidence appears.",
  },
  {
    id: "prism-juror:pragmatic",
    name: "Pragmatic Prism",
    color: "#ff934f",
    glyph: "lucideWrench",
    systemPrompt:
      "You are a pragmatic juror. You care about consequences, feasibility, tradeoffs, and what would actually work outside the debate.",
  },
  {
    id: "prism-juror:skeptical",
    name: "Skeptical Prism",
    color: "#f4ca4f",
    glyph: "lucideSearchCheck",
    systemPrompt:
      "You are a skeptical juror. You test assumptions, notice missing links, and resist charisma when the underlying case is weak.",
  },
  {
    id: "prism-juror:procedural",
    name: "Procedural Prism",
    color: "#58d889",
    glyph: "lucideLandmark",
    systemPrompt:
      "You are a procedural juror. You value fair burdens, consistent standards, concessions, and arguments that answer the exact motion.",
  },
  {
    id: "prism-juror:compassionate",
    name: "Compassionate Prism",
    color: "#54c7df",
    glyph: "lucideHandHeart",
    systemPrompt:
      "You are a compassionate juror. You pay close attention to human cost, dignity, vulnerability, and who bears the consequences of each position.",
  },
  {
    id: "prism-juror:idealist",
    name: "Idealist Prism",
    color: "#6f82ff",
    glyph: "lucideSparkles",
    systemPrompt:
      "You are an idealistic juror. You care about principles, long horizons, moral coherence, and whether a case points toward a better standard.",
  },
  {
    id: "prism-juror:contrarian",
    name: "Contrarian Prism",
    color: "#bd6cff",
    glyph: "lucideShuffle",
    systemPrompt:
      "You are a contrarian juror. You probe consensus, surface neglected counterarguments, and only dissent when your own reasoning genuinely calls for it.",
  },
] as const;

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

function debateUsesInstitutionalRegister(
  formality: DebateFormalityId,
): boolean {
  return formality === "parliamentary";
}

function debateUsesStructuredRegister(formality: DebateFormalityId): boolean {
  return formality === "structured";
}

function debatePublicMaterialLabel(formality: DebateFormalityId): string {
  if (debateUsesInstitutionalRegister(formality)) return "public record";
  if (debateUsesStructuredRegister(formality)) return "documented exchange";
  return "public exchange";
}

function debatePublicMaterialDescription(formality: DebateFormalityId): string {
  if (debateUsesInstitutionalRegister(formality)) return "the public record";
  if (debateUsesStructuredRegister(formality)) return "the documented exchange";
  return "what everyone publicly heard and saw";
}

function debateUsesDaytimeShowdown(
  session: Pick<DebateSessionV1, "format" | "formality" | "setupPresetId">,
): boolean {
  return (
    session.setupPresetId === "daytime-showdown" &&
    session.format === "forum" &&
    session.formality === "free_for_all"
  );
}

function daytimeShowdownPerformancePrompt(
  session: Pick<DebateSessionV1, "format" | "formality" | "setupPresetId">,
  role: DebateBotSnapshotV1["role"],
): string {
  if (!debateUsesDaytimeShowdown(session)) return "";
  if (role === "moderator") {
    return [
      "Daytime Showdown contract: host this like a volatile live daytime confrontation show, not a polite panel.",
      "Be the sharp, neutral traffic cop: use names, call out dodges and interruptions as conduct rather than argument, issue punchy warnings, and decisively restore the floor.",
      "Do not sanitize the advocates' personality conflict, argue either side, or lapse into parliamentary and courtroom boilerplate.",
    ].join(" ");
  }
  if (role === "juror") {
    return [
      "Daytime Showdown contract: react naturally to the room's memorable clashes, hypocrisy calls, interruptions, and credibility attacks.",
      "The spectacle may shape what you notice, but your verdict must still rest on the public argument rather than likability, volume, or private assumptions.",
    ].join(" ");
  }
  return [
    "Daytime Showdown contract: this is full-contact verbal sparring, not a polite policy panel.",
    "Address the other advocate directly and attack the live weak point with vivid mockery, accusations of hypocrisy or evasion, credibility jabs, and personal needling that this persona would naturally use.",
    "Make the conflict feel specific: callback to what they actually said, their visible performance, or public persona material already supplied to you. A memorable insult is welcome; generic disagreement is not enough.",
    "Never invent biography or misconduct. No threats, slurs, dehumanization, sexual humiliation, or attacks on protected traits. Keep every factual claim inside the frozen packet and public exchange.",
  ].join(" ");
}

function debateProductionPrompt(
  session: Pick<DebateSessionV1, "format" | "formality" | "setupPresetId">,
  role: DebateBotSnapshotV1["role"],
): string {
  const publicMaterial = debatePublicMaterialDescription(session.formality);
  if (role === "juror") {
    return [
      "Production voice — Jury Chamber: you are an independent juror following and discussing the public debate.",
      "Speak naturally to the other jurors, answer the strongest recent point, and remain recognizably yourself. You are not an advocate, witness, moderator, or judge.",
      "Do not introduce private history, unseen evidence, numeric scoring, or formal courtroom theatrics. You may revise your view when another juror gives an in-character reason.",
      `The chamber changes social cadence, not the frozen evidence, ${publicMaterial}, persona, Powers, or reasoning ability.`,
      daytimeShowdownPerformancePrompt(session, role),
    ]
      .concat(debateFormalityGuidance(session.formality))
      .join("\n");
  }
  if (session.format === "turnabout") {
    const parliamentary = debateUsesInstitutionalRegister(session.formality);
    const structured = debateUsesStructuredRegister(session.formality);
    return [
      parliamentary
        ? "Production voice — Court of Record: this is an original, heightened courtroom examination. Keep the language taut, immediate, theatrical, and bound to the public record as pressure builds."
        : structured
          ? "Production voice — Turnabout floor: this is a disciplined live examination built around pressable claims, evidence challenges, and immediate decisions."
          : "Production voice — Turnabout floor: this is a fast live confrontation built around claims that can be pressed, evidence that can be challenged, and immediate moderator calls.",
      role === "moderator"
        ? parliamentary
          ? "You are the neutral presiding judge. Control the room with concise judicial authority; refer naturally to the court, the record, the active statement, and the evidence. Use sustained or overruled only for an actual recorded ruling."
          : "You are the neutral moderator. Control the exchange concisely, focus attention on the active claim and available evidence, and make direct calls without courtroom boilerplate."
        : parliamentary
          ? "You are an advocate giving or defending testimony under examination. Answer the exact statement under pressure, with decisive turns and earned reversals rather than generic debate speech."
          : "You are an advocate giving or defending a pressable claim. Answer the exact point under pressure, with decisive turns and earned reversals rather than generic debate speech.",
      "Never imitate a named character or game, quote a signature catchphrase, or borrow protected writing or presentation.",
      "The production changes cadence and procedural vocabulary, not frozen evidence, identity, floor ownership, ballots, the persona's own voice, or the persona's reasoning ability.",
    ]
      .concat(debateFormalityGuidance(session.formality))
      .join("\n");
  }
  const parliamentary = session.formality === "parliamentary";
  const structured = session.formality === "structured";
  return [
    parliamentary
      ? "Production voice — Assembly Chamber: this is a live parliamentary forum. Keep the language measured, public-minded, procedurally crisp, and rhetorically energetic."
      : structured
        ? "Production voice — Debate floor: this is a formal, direct public debate with clean rounds and responsive rebuttal."
        : "Production voice — Debate floor: this is a live public clash, not a parliamentary or courtroom proceeding.",
    role === "moderator"
      ? parliamentary
        ? "You are the neutral chair. Call the chamber to order, state the motion before the chamber, recognize each speaker, and yield or restore the floor without arguing either side."
        : "You are the neutral moderator. State the motion, keep the turns fair, and restore the scheduled floor without arguing either side."
      : parliamentary
        ? "You are a recognized member addressing the chamber. Speak to the motion, answer the opposing case directly, and use parliamentary address naturally without turning every sentence into ceremony."
        : "You are an advocate. Speak to the motion, answer the opposing case directly, and let your persona—not generic debate polish—set the diction.",
    parliamentary
      ? "Do not recast Forum as a courtroom: avoid witnesses, testimony, objections, evidence rulings, sustained, and overruled unless those words are themselves part of the public record."
      : "Avoid House, record, proceedings, parliamentary procedure, court rulings, witnesses, testimony, objections, sustained, and overruled unless the player explicitly used those words.",
    daytimeShowdownPerformancePrompt(session, role),
    "The production changes cadence and procedural vocabulary, not frozen evidence, identity, floor ownership, ballots, the persona's own voice, or the persona's reasoning ability.",
  ]
    .concat(debateFormalityGuidance(session.formality))
    .join("\n");
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
  if (start < 0 || end <= start)
    throw new Error("Model response was not JSON.");
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
    voice: [row.authored_audio_voice_profile, row.audio_voice_profile_override],
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
  const rows = db
    .prepare(sql)
    .all(userId, ...uniqueIds) as unknown as DebateBotRow[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  return uniqueIds.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

function allLibraryBotRows(db: DatabaseSync, userId: string): DebateBotRow[] {
  return db
    .prepare(
      DEBATE_BOT_SELECT.replace(
        "AND id IN (__IDS__)",
        "ORDER BY updated_at DESC, id ASC",
      ),
    )
    .all(userId) as unknown as DebateBotRow[];
}

function shuffled<T>(values: readonly T[]): T[] {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [next[index], next[swapIndex]] = [next[swapIndex]!, next[index]!];
  }
  return next;
}

function genericJurorSnapshot(
  definition: (typeof GENERIC_DEBATE_JURORS)[number],
  lane: DebateGenerationLane,
  defaultVoiceProfile: BotAudioVoiceProfileV1,
): DebateJurorSnapshotV1 {
  return {
    version: DEBATE_SCHEMA_VERSION,
    id: definition.id,
    name: definition.name,
    systemPrompt: definition.systemPrompt,
    role: "juror",
    sideId: null,
    source: "generic",
    color: definition.color,
    glyph: definition.glyph,
    avatarDetails: null,
    voiceProfile: defaultVoiceProfile,
    powers: [],
    provider: lane.providerName,
    model: lane.model,
    revision: hashJson({
      version: "generic-juror-v1",
      id: definition.id,
      voiceProfile: defaultVoiceProfile,
    }),
  };
}

function libraryJurorSnapshot(
  row: DebateBotRow,
  lane: DebateGenerationLane,
): DebateJurorSnapshotV1 {
  return {
    ...snapshotBot(row, "juror", null, lane),
    role: "juror",
    sideId: null,
    source: "library",
  };
}

function sampledDebateJurors(
  db: DatabaseSync,
  userId: string,
  excludedBotIds: readonly string[],
  lane: DebateGenerationLane,
): DebateJurorSnapshotV1[] {
  const excluded = new Set(excludedBotIds);
  const library = shuffled(
    allLibraryBotRows(db, userId).filter((row) => !excluded.has(row.id)),
  )
    .slice(0, DEBATE_JURY_SIZE)
    .map((row) => libraryJurorSnapshot(row, lane));
  const defaultVoiceProfile = frozenPrismDefaultVoiceProfile(db, userId);
  const generic = shuffled(GENERIC_DEBATE_JURORS)
    .slice(0, Math.max(0, DEBATE_JURY_SIZE - library.length))
    .map((definition) =>
      genericJurorSnapshot(definition, lane, defaultVoiceProfile),
    );
  return shuffled([...library, ...generic]).slice(0, DEBATE_JURY_SIZE);
}

function frozenPrismDefaultVoiceProfile(
  db: DatabaseSync,
  userId: string,
): BotAudioVoiceProfileV1 {
  const row = db
    .prepare(
      "SELECT prism_default_bot_audio_voice_profile AS profile FROM users WHERE id = ?",
    )
    .get(userId) as { profile?: string | null } | undefined;
  return (
    parseStoredBotAudioVoiceProfileV1(row?.profile ?? null) ??
    normalizeBotAudioVoiceProfileV1(undefined)
  );
}

function playerJudgeModeratorSnapshot(
  db: DatabaseSync,
  userId: string,
  lane: DebateGenerationLane,
): DebateBotSnapshotV1 {
  const voiceProfile = frozenPrismDefaultVoiceProfile(db, userId);
  return {
    version: DEBATE_SCHEMA_VERSION,
    id: DEBATE_PLAYER_JUDGE_BOT_ID,
    name: "Prism",
    systemPrompt: [
      "You are Prism, the neutral procedural proxy for the human Judge in this Debate.",
      "Moderate fairly and concisely, but never invent the player's beliefs, questions, evidence, or final ruling.",
      "The human Judge alone supplies player turns and the binding verdict.",
    ].join(" "),
    role: "moderator",
    sideId: null,
    color: "#2fd3e3",
    glyph: "triangle",
    avatarDetails: null,
    voiceProfile,
    powers: [],
    provider: lane.providerName,
    model: lane.model,
    revision: hashJson({
      version: "debate-player-judge-prism-v1",
      voiceProfile,
    }),
  };
}

function resolvedSetupPresetId(args: {
  requested: unknown;
  format: DebateFormatId;
  formality: DebateFormalityId;
  playerRole: DebateSessionV1["playerRole"];
  juryEnabled: boolean;
}): DebateSetupPresetId | "custom" {
  const requested =
    args.requested === undefined || args.requested === null
      ? args.format === "forum" &&
        args.formality === "parliamentary" &&
        args.playerRole === "judge" &&
        args.juryEnabled === false
        ? "classic-duel"
        : "custom"
      : normalizeDebateSetupPresetId(args.requested);
  if (requested === "custom") return "custom";
  const preset = DEBATE_SETUP_PRESETS.find(
    (candidate) => candidate.id === requested,
  );
  return preset &&
    preset.format === args.format &&
    preset.formality === args.formality &&
    preset.playerRole === args.playerRole &&
    preset.juryEnabled === args.juryEnabled
    ? preset.id
    : "custom";
}

function initialDebateJuryState(
  jurors: DebateJurorSnapshotV1[],
): DebateJuryStateV1 {
  if (jurors.length !== DEBATE_JURY_SIZE) return defaultDebateJuryStateV1();
  return {
    ...defaultDebateJuryStateV1(),
    enabled: true,
    phase: "waiting",
    jurors,
    forepersonBotId: jurors[0]?.id ?? null,
  };
}

function selectedLane(runtime: DebateAiRuntime): DebateGenerationLane {
  return (
    runtime.lanes?.[0] ??
    (runtime.preferredProvider !== "local" && runtime.online
      ? runtime.online
      : runtime.local)
  );
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
  formalityRaw: unknown,
  runtime: DebateAiRuntime,
): Promise<DebateMotionSlateV1[]> {
  const topic = compactText(topicRaw, 1_000);
  const formality = normalizeDebateFormalityId(formalityRaw);
  if (!topic) throw new HttpError(400, "Enter a topic to synthesize.");
  const generation = await generateJson(
    runtime.lanes ?? selectedLane(runtime),
    [
      {
        role: "system",
        content:
          "You design fair, vivid two-sided motions for a short two-sided debate. Return JSON only.",
      },
      {
        role: "user",
        content: [
          `Topic: ${topic}`,
          debateFormalityGuidance(formality),
          "Create exactly three genuinely distinct, balanced debate slates.",
          "Each slate needs: id, motion, forSide {label, brief}, againstSide {label, brief}.",
          "Each side label must be a clean 1–3 word public name, no more than 24 characters.",
          "The motion must be editable, specific, and arguable by reasonable people.",
          formality === "parliamentary"
            ? "Parliamentary motion syntax such as “This House believes…” is welcome when natural."
            : "Use plain motion wording. Do not default to “This House believes…” or other parliamentary framing.",
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
    throw new HttpError(
      502,
      "Prism could not produce three complete debate slates.",
    );
  }
  return slates;
}

async function roleCheck(
  bot: DebateBotRow,
  sideId: DebateSideId,
  motion: DebateMotionSlateV1,
  format: DebateFormatId,
  formality: DebateFormalityId,
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
          `The proposed Debate format is ${format === "turnabout" ? "Turnabout: pressable claims, frozen-evidence challenges, and immediate neutral moderator decisions" : "Forum: opening arguments, direct challenges, rebuttals, closings, and a verdict"}.`,
          debateFormalityGuidance(formality),
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
    formality,
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
    formality?: unknown;
    motion: unknown;
    forAdvocateBotId: unknown;
    againstAdvocateBotId: unknown;
  },
  runtime: DebateAiRuntime,
): Promise<DebateAdvocacyConsent[]> {
  const motion = normalizeDebateMotionSlateV1(request.motion);
  if (!completeMotion(motion))
    throw new HttpError(400, "Complete the motion and both side briefs.");
  const forId = compactText(request.forAdvocateBotId, 200);
  const againstId = compactText(request.againstAdvocateBotId, 200);
  if (!forId || !againstId || forId === againstId) {
    throw new HttpError(400, "Choose two different advocates.");
  }
  const rows = botRows(db, userId, [forId, againstId]);
  if (rows.length !== 2)
    throw new HttpError(404, "One or more advocates were not found.");
  const format: DebateFormatId =
    request.format === "turnabout" ? "turnabout" : "forum";
  const formality = normalizeDebateFormalityId(request.formality);
  return Promise.all([
    roleCheck(rows[0]!, "for", motion, format, formality, runtime),
    roleCheck(rows[1]!, "against", motion, format, formality, runtime),
  ]);
}

function debatePowerPolicy(
  type: DebatePowerEffectPlanV1["effect"]["type"],
): DebatePowerEffectPlanV1["policy"] {
  if (
    type === "mute" ||
    type === "intermittent_mute" ||
    type === "hearing_repeat"
  ) {
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
  const jury = normalizeDebateJuryStateV1(parsed.jury);
  const formality = normalizeDebateFormalityId(parsed.formality);
  const setupPresetId = resolvedSetupPresetId({
    requested: parsed.setupPresetId,
    format,
    formality,
    playerRole: parsed.playerRole,
    juryEnabled: jury.enabled,
  });
  return {
    ...parsed,
    provider: parsed.provider ?? parsed.moderator.provider,
    model: parsed.model ?? parsed.moderator.model,
    responseMode:
      parsed.responseMode ??
      ((parsed.provider ?? parsed.moderator.provider) === "local"
        ? "local"
        : "online"),
    generationChain:
      Array.isArray(parsed.generationChain) && parsed.generationChain.length > 0
        ? parsed.generationChain
        : [
            {
              provider: parsed.provider ?? parsed.moderator.provider,
              model: parsed.model ?? parsed.moderator.model,
            },
          ],
    format,
    formatVersion: DEBATE_FORMAT_SCHEMA_VERSION,
    formatState: normalizeDebateFormatStateV1(parsed.formatState, format),
    formality,
    setupPresetId,
    jury,
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

export function debateSessionForPlayer(
  session: DebateSessionV1,
  perspective: "live" | "replay" = "live",
): DebateSessionV1 {
  const events = session.events.flatMap((event) => {
    if (
      session.jury.enabled &&
      session.playerRole === "participant" &&
      (event.kind === "jury_deliberation" ||
        (event.kind === "ballot" && event.speakerKind === "juror"))
    ) {
      return [];
    }
    if (
      session.jury.enabled &&
      session.playerRole === "participant" &&
      event.kind === "jury_verdict"
    ) {
      return [
        {
          ...event,
          speakerKind: "system" as const,
          speakerBotId: null,
          content:
            session.jury.majoritySideId && session.jury.finalBallots.length > 0
              ? `The sealed Jury returns ${session.jury.forVotes}–${session.jury.againstVotes} for ${sideLabel(
                  session,
                  session.jury.majoritySideId,
                )}.`
              : "The sealed Jury has returned its aggregate verdict.",
        },
      ];
    }
    return [projectDebateEventForObserver(session, event, perspective)];
  });
  const ballots = session.ballots.map((ballot) =>
    debateBotObserverProjection(session, ballot.voterBotId, perspective).audible
      ? ballot
      : { ...ballot, reason: null, privateReason: true },
  );
  return {
    ...session,
    ...(session.jury.enabled && session.playerRole === "participant"
      ? {
          jury: {
            ...session.jury,
            initialBallots: [],
            finalBallots: [],
            speakerCounts: {},
          },
        }
      : {}),
    ballots,
    events,
  };
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
    let formality: DebateFormalityId = "parliamentary";
    let setupPresetId: DebateSetupPresetId | "custom" = "custom";
    let juryEnabled = false;
    try {
      const parsed = JSON.parse(row.session_json) as {
        format?: unknown;
        formality?: unknown;
        setupPresetId?: unknown;
        playerRole?: unknown;
        jury?: unknown;
      };
      if (isDebateFormatId(parsed.format)) format = parsed.format;
      formality = normalizeDebateFormalityId(parsed.formality);
      const jury = normalizeDebateJuryStateV1(parsed.jury);
      juryEnabled = jury.enabled;
      setupPresetId = resolvedSetupPresetId({
        requested: parsed.setupPresetId,
        format,
        formality,
        playerRole:
          parsed.playerRole === "judge" ||
          parsed.playerRole === "participant" ||
          parsed.playerRole === "spectator"
            ? parsed.playerRole
            : row.player_role,
        juryEnabled,
      });
    } catch {
      format = "forum";
    }
    return {
      id: row.id,
      format,
      formality,
      status: row.status,
      phase: row.phase,
      motion: row.motion,
      setupPresetId,
      juryEnabled,
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
  formality: DebateFormalityId,
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
      (consent.format ?? "forum") !== format ||
      normalizeDebateFormalityId(consent.formality) !== formality
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
  if (!idempotencyKey)
    throw new HttpError(400, "A stable idempotency key is required.");
  const existing = db
    .prepare(
      "SELECT id FROM debate_sessions WHERE user_id = ? AND create_idempotency_key = ?",
    )
    .get(userId, idempotencyKey) as { id?: string } | undefined;
  if (existing?.id) return getDebateSession(db, userId, existing.id);

  const motion = normalizeDebateMotionSlateV1(request.motion);
  if (!completeMotion(motion))
    throw new HttpError(400, "Complete the motion and both side briefs.");
  const format: DebateFormatId =
    request.format === "turnabout" ? "turnabout" : "forum";
  const formality = normalizeDebateFormalityId(request.formality);
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
  const playerJudgeUsesPrism =
    request.playerRole === "judge" && request.playerJudgeUsesPrism === true;
  const moderatorBotId = playerJudgeUsesPrism
    ? DEBATE_PLAYER_JUDGE_BOT_ID
    : compactText(request.moderatorBotId, 200);
  const castIds = [
    moderatorBotId,
    compactText(request.forAdvocateBotId, 200),
    compactText(request.againstAdvocateBotId, 200),
  ].map((id) => compactText(id, 200));
  if (new Set(castIds).size !== 3 || castIds.some((id) => !id)) {
    throw new HttpError(
      400,
      playerJudgeUsesPrism
        ? "Choose two different advocate bots."
        : "Choose exactly three different owned bots.",
    );
  }
  const ownedCastIds = playerJudgeUsesPrism ? castIds.slice(1) : castIds;
  const rows = botRows(db, userId, ownedCastIds);
  if (rows.length !== ownedCastIds.length)
    throw new HttpError(404, "One or more cast bots were not found.");
  const moderatorRow = playerJudgeUsesPrism ? null : rows[0]!;
  const forRow = rows[playerJudgeUsesPrism ? 0 : 1]!;
  const againstRow = rows[playerJudgeUsesPrism ? 1 : 2]!;
  const advocacyConsent = validateConsents(
    request.advocacyConsent,
    motion,
    [forRow, againstRow],
    format,
    formality,
  );
  const now = new Date().toISOString();
  const lane = selectedLane(runtime);
  const juryEnabled = request.jury?.enabled === true;
  const jury = juryEnabled
    ? initialDebateJuryState(sampledDebateJurors(db, userId, castIds, lane))
    : defaultDebateJuryStateV1();
  const setupPresetId = resolvedSetupPresetId({
    requested: request.presetId,
    format,
    formality,
    playerRole: request.playerRole,
    juryEnabled: jury.enabled,
  });
  const powerPlan = debatePowerPlan(
    db,
    userId,
    [...castIds, ...jury.jurors.map((juror) => juror.id)],
    request.theme === "dark" ? "dark" : "light",
  );
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
    formality,
    setupPresetId,
    playerRole: request.playerRole,
    playerSideId,
    motion,
    evidence: freezeEvidence(request.evidence, now),
    moderator: playerJudgeUsesPrism
      ? playerJudgeModeratorSnapshot(db, userId, lane)
      : snapshotBot(moderatorRow!, "moderator", null, lane),
    forAdvocate: snapshotBot(forRow, "advocate", "for", lane),
    againstAdvocate: snapshotBot(againstRow, "advocate", "against", lane),
    advocacyConsent,
    powerPlan,
    caseBoard: [],
    ballots: [],
    jury,
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
    { response_json?: string } | undefined;
  if (!row?.response_json) return null;
  const parsed = JSON.parse(row.response_json) as DebateSessionV1;
  const format: DebateFormatId = isDebateFormatId(parsed.format)
    ? parsed.format
    : "forum";
  const jury = normalizeDebateJuryStateV1(parsed.jury);
  return {
    ...parsed,
    format,
    formality: normalizeDebateFormalityId(parsed.formality),
    formatVersion: DEBATE_FORMAT_SCHEMA_VERSION,
    formatState: normalizeDebateFormatStateV1(parsed.formatState, format),
    setupPresetId: resolvedSetupPresetId({
      requested: parsed.setupPresetId,
      format,
      formality: normalizeDebateFormalityId(parsed.formality),
      playerRole: parsed.playerRole,
      juryEnabled: jury.enabled,
    }),
    jury,
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
  if (!idempotencyKey)
    throw new HttpError(400, "A stable idempotency key is required.");
  const replay = mutationReplay(db, userId, sessionId, idempotencyKey);
  const session = getDebateSession(db, userId, sessionId);
  if (replay) return { session, idempotencyKey, replay };
  if (
    !Number.isInteger(request.expectedRevision) ||
    request.expectedRevision < 1
  ) {
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
      throw new HttpError(
        409,
        "Debate changed while this turn was being prepared. Refresh and retry.",
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
        "Debate changed while this turn was being prepared. Refresh and retry.",
      );
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
      .run(JSON.stringify(revisedEvent), revisedEvent.id, userId, previous.id);
    if (Number(eventUpdate.changes) !== 1) {
      throw new HttpError(
        409,
        "The interrupted floor event is no longer current.",
      );
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
    timing?: DebateTurnTimingV1;
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
    ...(args.timing ? { timing: args.timing } : {}),
    createdAt: new Date().toISOString(),
  };
}

function botForSide(
  session: DebateSessionV1,
  sideId: DebateSideId,
): DebateBotSnapshotV1 {
  return sideId === "for" ? session.forAdvocate : session.againstAdvocate;
}

function debateBots(session: DebateSessionV1): DebateBotSnapshotV1[] {
  return [
    session.moderator,
    session.forAdvocate,
    session.againstAdvocate,
    ...session.jury.jurors,
  ];
}

function sideLabel(session: DebateSessionV1, sideId: DebateSideId): string {
  return sideId === "for"
    ? session.motion.forSide.label
    : session.motion.againstSide.label;
}

function moderatorIsHardMuted(session: DebateSessionV1): boolean {
  return session.powerPlan.bots[session.moderator.id]?.hardMuted === true;
}

function debateBotPerception(
  session: DebateSessionV1,
  subjectBotId: string,
  observerBotId: string,
  options: { holderSpeaking?: boolean } = {},
): { visible: boolean; audible: boolean } {
  const frozen = session.powerPlan.bots[subjectBotId];
  const effects = frozen?.effects.map(({ effect }) => effect) ?? [];
  const perception = botPowerPairwisePerceptionFromEffectsV1(
    effects,
    (target) => target.kind === "bot" && target.botId === observerBotId,
    options,
  );
  const hasAwarenessEffect = effects.some(
    (effect) => effect.type === "awareness",
  );
  const hasSpeechAudienceEffect = effects.some(
    (effect) => effect.type === "speech_audience",
  );
  return {
    visible:
      perception.visible &&
      (hasAwarenessEffect ||
        frozen?.visibleToBotIds === null ||
        frozen?.visibleToBotIds === undefined ||
        frozen.visibleToBotIds.includes(observerBotId)),
    audible:
      perception.audible &&
      (hasSpeechAudienceEffect ||
        frozen?.speechAudienceBotIds === null ||
        frozen?.speechAudienceBotIds === undefined ||
        frozen.speechAudienceBotIds.includes(observerBotId)),
  };
}

function debateEventIsCommonlyAudible(
  session: DebateSessionV1,
  event: DebateEventV1,
): boolean {
  if (!event.speakerBotId) return true;
  const listeners = debateBots(session).filter(
    (bot) => bot.id !== event.speakerBotId,
  );
  return listeners.every(
    (listener) =>
      debateBotPerception(session, event.speakerBotId!, listener.id, {
        holderSpeaking: event.content !== BOT_POWER_CANONICAL_SILENCE_V1,
      }).audible,
  );
}

function latestModeratorEvent(
  session: DebateSessionV1,
  openingOnly = false,
): DebateEventV1 | null {
  return (
    [...session.events]
      .reverse()
      .find(
        (event) =>
          event.speakerBotId === session.moderator.id &&
          (!openingOnly ||
            event.stepKey === "intro" ||
            event.stepKey === "turnabout_intro"),
      ) ?? null
  );
}

function moderatorEventPerception(
  session: DebateSessionV1,
  event: DebateEventV1,
  observerBotId: string,
): {
  visible: boolean;
  audible: boolean;
  canonicalSilence: boolean;
} {
  const canonicalSilence = event.content === BOT_POWER_CANONICAL_SILENCE_V1;
  const perception = debateBotPerception(
    session,
    session.moderator.id,
    observerBotId,
    { holderSpeaking: !canonicalSilence },
  );
  return { ...perception, canonicalSilence };
}

function observablePowerEncounterPrompt(): string {
  return [
    "Observable Power consequences are part of this live encounter, not setup errors.",
    "When another participant visibly falls silent, becomes strange, or otherwise behaves unexpectedly, let that observation shape one brief persona-specific reaction when natural, then continue the required substance.",
    "React only to public words, silence, timing, and visible behavior. Never name a hidden Power, infer unspoken content or intent, or claim an inaudible instruction was given.",
    "Do not repeat the same reaction on every turn.",
  ].join("\n");
}

function moderatorOpeningPerceptionCue(
  session: DebateSessionV1,
  observerBotId: string,
): string {
  const event = latestModeratorEvent(session, true);
  if (!event) return "";
  const perception = moderatorEventPerception(session, event, observerBotId);
  if (perception.audible) return "";
  const observation = perception.visible
    ? perception.canonicalSilence
      ? `The moderator opened with only visible canonical silence: ${BOT_POWER_CANONICAL_SILENCE_V1}`
      : "The moderator appeared to address the debate, but no words were audible to you."
    : "The moderator's podium appeared empty and no opening words were perceptible to you.";
  return [
    observation,
    "Begin with at most one short reaction that only this persona would have to that observable absence or silence, without naming a Power or inventing an explanation, instruction, or hidden intent.",
    !perception.visible
      ? "The reaction may state only the sensory fact that the podium is empty or no opening words arrived. Do not guess who is absent, name a person who might be absent, or speculate why."
      : "",
    "That reaction must not consume the turn. In the same response, immediately take the unexpectedly open floor and deliver at least two substantive sentences of the required argument, including a clear position and one concrete reason.",
    "A response containing only the reaction is invalid.",
  ]
    .filter(Boolean)
    .join(" ");
}

function challengeResponseInstruction(
  session: DebateSessionV1,
  observerBotId: string,
  ordinaryInstruction: string,
): string {
  const event = latestModeratorEvent(session);
  if (!event) return ordinaryInstruction;
  const perception = moderatorEventPerception(session, event, observerBotId);
  if (perception.audible) return ordinaryInstruction;
  const observation = perception.visible
    ? perception.canonicalSilence
      ? "The moderator offered only visible canonical silence instead of a challenge."
      : "The moderator appeared to speak, but no challenge was audible to you."
    : "The moderator's podium remained empty and no challenge was perceptible to you.";
  return [
    observation,
    "Do not invent, quote, or answer a question that was never spoken.",
    !perception.visible
      ? "Observe only that the podium is empty or no challenge arrived. Do not guess who is absent, name a person who might be absent, or speculate why."
      : "",
    "Briefly react in character to the open floor if natural, then identify one serious vulnerability in your own public case and answer it, or sharpen one contested point.",
  ]
    .filter(Boolean)
    .join(" ");
}

function neutralModeratorProcedureLine(
  session: DebateSessionV1,
  event: DebateEventV1,
): string {
  if (event.kind === "ballot" && event.sideId) {
    return `A moderator ballot is recorded for ${sideLabel(session, event.sideId)}.`;
  }
  if (event.kind === "moderator_ruling") {
    if (event.ruling) {
      if (debateUsesInstitutionalRegister(session.formality)) {
        return `The public record marks the objection ${event.ruling}.`;
      }
      return event.ruling === "sustained"
        ? "The evidence challenge is accepted."
        : "The evidence challenge is rejected.";
    }
    return debateUsesInstitutionalRegister(session.formality)
      ? "The public record restores the scheduled floor."
      : "The moderator restores the scheduled floor.";
  }
  if (event.stepKey === "intro" || event.stepKey === "turnabout_intro") {
    return `The moderator's podium remains empty and silent. The proceeding opens and the floor passes to ${sideLabel(session, "for")}.`;
  }
  if (
    event.stepKey.includes("challenge") &&
    event.stepKey.endsWith("_prompt")
  ) {
    const sideId: DebateSideId = event.stepKey.includes("against")
      ? "against"
      : session.playerRole === "participant" &&
          event.stepKey === "challenge_participant_prompt"
        ? (session.playerSideId ?? "for")
        : "for";
    return `No moderator challenge is perceptible. The floor opens to ${sideLabel(session, sideId)}.`;
  }
  if (event.stepKey === "moderator_to_rebuttal") {
    return `The proceeding advances to rebuttal. The floor opens to ${sideLabel(session, "against")}.`;
  }
  if (event.stepKey === "moderator_to_closing") {
    return "The proceeding advances to closing statements.";
  }
  return "The moderator's turn passes without any perceptible words.";
}

function debateBotObserverProjection(
  session: DebateSessionV1,
  subjectBotId: string,
  perspective: "live" | "replay",
  holderSpeaking = true,
) {
  const effects =
    session.powerPlan.bots[subjectBotId]?.effects.map(({ effect }) => effect) ??
    [];
  const participatingBotIds = new Set(debateBots(session).map((bot) => bot.id));
  return botPowerObserverProjectionFromEffectsV1(
    effects,
    perspective,
    (target) =>
      target.kind === "bot" &&
      typeof target.botId === "string" &&
      participatingBotIds.has(target.botId),
    { holderSpeaking },
  );
}

function projectDebateEventForObserver(
  session: DebateSessionV1,
  event: DebateEventV1,
  perspective: "live" | "replay",
): DebateEventV1 {
  if (!event.speakerBotId || event.speakerKind === "player") return event;
  const projection = debateBotObserverProjection(
    session,
    event.speakerBotId,
    perspective,
    event.content !== BOT_POWER_CANONICAL_SILENCE_V1,
  );
  if (projection.audible) return event;
  if (
    event.content === BOT_POWER_CANONICAL_SILENCE_V1 &&
    projection.visibility !== "hidden"
  ) {
    return event;
  }
  const content =
    event.speakerBotId === session.moderator.id
      ? neutralModeratorProcedureLine(session, event)
      : event.kind === "ballot" && event.sideId
        ? `A sealed ballot is recorded for ${sideLabel(session, event.sideId)}.`
        : projection.visibility !== "hidden"
          ? debateUsesInstitutionalRegister(session.formality)
            ? "The scheduled speaker visibly takes the floor, but no words reach the public record."
            : "The scheduled speaker visibly takes the floor, but no words reach the room."
          : "The scheduled floor passes without a perceptible contribution.";
  return {
    ...event,
    speakerKind: "system",
    content,
    sourceIds: [],
  };
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
  const notes = evidence.notes
    ? `Player notes:\n${evidence.notes}`
    : "Player notes: none.";
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
  const strongCues =
    description.match(CONCRETE_PERSONA_STRONG_CUE)?.length ?? 0;
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
          typeof value.content === "string" && value.content.trim().length > 0,
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
          "interjection",
        ])
      : new Set([
          "intro",
          "speech",
          "silence",
          "player_turn",
          "moderator_ruling",
          "reaction",
          "interjection",
        ]);
  const events = session.events
    .filter((event) => publicKinds.has(event.kind))
    .slice(-18);
  if (events.length === 0) return "No public speech yet.";
  const lines = events.flatMap((event) => {
    if (!event.speakerBotId || event.speakerKind === "player") {
      return [
        `${event.speakerKind === "player" ? "Player" : "System"}: ${event.content}`,
      ];
    }
    const speaker =
      event.speakerBotId === session.moderator.id
        ? session.moderator.name
        : event.speakerBotId === session.forAdvocate.id
          ? session.forAdvocate.name
          : event.speakerBotId === session.againstAdvocate.id
            ? session.againstAdvocate.name
            : (session.jury.jurors.find(
                (juror) => juror.id === event.speakerBotId,
              )?.name ?? "System");
    const ownSpeech = observerBotId === event.speakerBotId && includeOwnSpeech;
    const perception = observerBotId
      ? debateBotPerception(session, event.speakerBotId, observerBotId, {
          holderSpeaking: event.content !== BOT_POWER_CANONICAL_SILENCE_V1,
        })
      : null;
    const audible = ownSpeech
      ? true
      : observerBotId
        ? perception?.audible === true
        : debateEventIsCommonlyAudible(session, event);
    if (audible) return [`${speaker}: ${event.content}`];
    if (
      event.content === BOT_POWER_CANONICAL_SILENCE_V1 &&
      perception?.visible
    ) {
      return [`${speaker}: ${BOT_POWER_CANONICAL_SILENCE_V1}`];
    }
    if (event.speakerBotId === session.moderator.id) {
      return [`System: ${neutralModeratorProcedureLine(session, event)}`];
    }
    if (perception?.visible) {
      return [
        `System: ${speaker} visibly took the floor, but no words were audible.`,
      ];
    }
    return [
      "System: The scheduled floor passed without a perceptible contribution.",
    ];
  });
  if (lines.length === 0) return "No public speech yet.";
  return lines.join("\n");
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
    "Assigned role and scheduled floor remain bound to your stable bot ID. Interruptions may only appear as one brief between-turn reaction.",
  ].join("\n");
}

function devilAdvocateNames(session: DebateSessionV1): string[] {
  return session.advocacyConsent
    .filter((consent) => consent.status === "devils_advocate")
    .map((consent) => botForSide(session, consent.sideId).name);
}

function advocacyDisclosure(session: DebateSessionV1): string {
  const devils = devilAdvocateNames(session);
  return devils.length > 0
    ? `Briefly disclose once that ${devils.join(" and ")} ${
        devils.length === 1 ? "is" : "are"
      } serving as an explicit Devil's Advocate.`
    : "No Devil's Advocate disclosure is needed.";
}

function debateAdvocateTurnTimeLimitMs(
  session: DebateSessionV1,
  snapshot: DebateBotSnapshotV1,
): number | null {
  if (session.format !== "forum" || snapshot.role !== "advocate") return null;
  if (session.stepKey.startsWith("opening_")) return 20_000;
  if (
    session.stepKey.includes("challenge") &&
    session.stepKey.endsWith("_answer")
  ) {
    return 12_000;
  }
  if (session.stepKey.startsWith("rebuttal_")) return 15_000;
  if (session.stepKey.startsWith("closing_")) return 15_000;
  return null;
}

function debateTurnTimingPrompt(limitMs: number | null): string {
  if (limitMs === null) return "";
  const seconds = Math.round(limitMs / 1_000);
  return [
    `An audible floor clock gives you ${seconds} seconds for this turn.`,
    "Try to land your point before the signal, but stay in character: an impulsive, verbose, distracted, heated, or stubborn persona may naturally keep talking past time.",
    "Never mention these production instructions or deliberately announce that you plan to overrun.",
  ].join(" ");
}

function debateTurnTiming(
  session: DebateSessionV1,
  snapshot: DebateBotSnapshotV1,
  content: string,
): DebateTurnTimingV1 | undefined {
  const limitMs = debateAdvocateTurnTimeLimitMs(session, snapshot);
  if (limitMs === null || content === BOT_POWER_CANONICAL_SILENCE_V1) {
    return undefined;
  }
  const estimatedDurationMs = debateEstimatedSpeechDurationMs(content);
  const overtimeMs = Math.max(0, estimatedDurationMs - limitMs);
  return {
    limitMs,
    estimatedDurationMs,
    overtimeMs,
    status: overtimeMs > 0 ? "overtime" : "within_limit",
  };
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
            ? "You are participating in PRISM Debate: Turnabout."
            : "You are participating in PRISM Debate: Forum.",
          debateProductionPrompt(session, snapshot.role),
          `Motion: ${session.motion.motion}`,
          `For brief: ${session.motion.forSide.brief}`,
          `Against brief: ${session.motion.againstSide.brief}`,
          "Use only the frozen prep packet below. Never claim live research.",
          "Cite a frozen source only as [[source:id]]. Never invent a source ID.",
          "Stay in your assigned role, but perform it only as well as this persona naturally could.",
          personaVoicePrompt(snapshot),
          personaCapabilityPrompt(snapshot),
          observablePowerEncounterPrompt(),
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
          debateTurnTimingPrompt(
            debateAdvocateTurnTimeLimitMs(session, snapshot),
          ),
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
  if (session.stepKey === "intro" || session.stepKey === "turnabout_intro") {
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
    (claim) => !frozenRecord.includes(normalizeTurnaboutRecordText(claim)),
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
      "Your previous draft could not be accepted because it attributed unsupported evidence or used a quantity absent from the frozen material.",
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
  prefix = prefix
    .trimEnd()
    .replace(/[,:;–—-]+$/gu, "")
    .trimEnd();
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
    botPowerTextRequestsRepeat(event.content) ||
    (event.speakerBotId !== null &&
      !debateEventIsCommonlyAudible(session, event))
  ) {
    return session.caseBoard;
  }
  const speakerEffects = event.speakerBotId
    ? (session.powerPlan.bots[event.speakerBotId]?.effects ?? [])
    : [];
  if (
    speakerEffects.some(({ effect }) => effect.type === "speech_obfuscation")
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
  const validStatuses = new Set(["challenged", "conceded", "unanswered"]);
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
      !stored.caseBoard.some((card) => card.createdEventId === sourceEvent.id)
    ) {
      db.exec("ROLLBACK");
      return;
    }
    const updatedAt = new Date().toISOString();
    const caseBoard = stored.caseBoard.map((card) => ({
      ...card,
      summary: card.createdEventId === sourceEvent.id ? summary : card.summary,
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
    ).run(serializeSessionState({ ...stored, caseBoard }), sessionId, userId);
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

function earlyConclusionLead(session: DebateSessionV1): string {
  if (session.formality === "free_for_all") return "The Debate closes early.";
  if (session.formality === "heated")
    return "The Debate breaks for an early conclusion.";
  if (session.formality === "plainspoken") return "The Debate ends early.";
  if (session.formality === "structured") return "The debate concludes early.";
  return session.format === "turnabout"
    ? "The Court of Record closes examination early."
    : "The Assembly Chamber closes debate early.";
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

function enterModeratedRebuttal(session: DebateSessionV1): DebateSessionV1 {
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
  return debateBotPerception(session, event.speakerBotId, listenerBotId, {
    holderSpeaking: event.content !== BOT_POWER_CANONICAL_SILENCE_V1,
  }).audible;
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

const DAYTIME_SHOWDOWN_FLOOR_BREAK_STEPS = new Set([
  "opening_against",
  "rebuttal_against",
  "rebuttal_for",
  "closing_against",
]);

function interruptionCandidate(
  session: DebateSessionV1,
  speaker: DebateBotSnapshotV1,
): DebateBotSnapshotV1 | null {
  const strengthRank = { small: 1, medium: 2, large: 3 } as const;
  const powerInterrupter =
    debateBots(session)
      .filter(
        (candidate) => candidate.id !== speaker.id && candidate.sideId !== null,
      )
      .flatMap((candidate) => {
        const plan = session.powerPlan.bots[candidate.id];
        if (
          plan?.hardMuted ||
          !botHeardEvent(
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
          )
        ) {
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
  if (powerInterrupter) return powerInterrupter;
  if (
    !debateUsesDaytimeShowdown(session) ||
    speaker.role !== "advocate" ||
    !DAYTIME_SHOWDOWN_FLOOR_BREAK_STEPS.has(session.stepKey)
  ) {
    return null;
  }
  return (
    debateBots(session)
      .filter(
        (candidate) =>
          candidate.role === "advocate" &&
          candidate.sideId !== null &&
          candidate.sideId !== speaker.sideId &&
          !session.powerPlan.bots[candidate.id]?.hardMuted &&
          botHeardEvent(
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
          ),
      )
      .sort((left, right) => left.id.localeCompare(right.id))[0] ?? null
  );
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
  const daytimeShowdown = debateUsesDaytimeShowdown(session);
  const cutoffRatio =
    (daytimeShowdown ? 0.42 : 0.54) +
    stablePowerChance(
      `${session.id}:${session.stepKey}:${interrupter.id}:cutoff`,
    ) *
      (daytimeShowdown ? 0.16 : 0.18);
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
      daytimeShowdown
        ? [
            `Cut off ${speaker.name} now with one explosive personal counterpunch of no more than 16 words.`,
            "Answer only the heard public fragment. A taunt, hypocrisy call, dodge accusation, or credibility jab is welcome.",
            "Do not add facts, threats, slurs, or attacks on protected traits.",
            "",
            "Heard fragment:",
            cutoff,
          ].join("\n")
        : `Break the floor now and cut off ${speaker.name}. Respond only to the heard public fragment below in one forceful sentence. Do not introduce an unrelated argument.\n\nHeard fragment:\n${cutoff}`,
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
      daytimeShowdown
        ? `${interrupter.name} just talked over ${speaker.name}. In one or two punchy sentences, call out ${interrupter.name} by name, warn them, and forcefully restore the scheduled floor. Sound like a live host regaining control, not a clerk, and do not argue either side.`
        : `${interrupter.name} broke the floor and cut off ${speaker.name}. Give a brief procedural ruling in one or two sentences. Acknowledge that only the heard fragment is public, enforce the scheduled order, and do not argue either side.`,
      runtime,
    );
    const rulingEvent = makeEvent(rulingSession, {
      kind: ruling.silent ? "silence" : "moderator_ruling",
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

async function moderatorOvertimeCorrection(
  session: DebateSessionV1,
  speaker: DebateBotSnapshotV1,
  speechEvent: DebateEventV1,
  runtime: DebateAiRuntime,
): Promise<DebateEventV1> {
  const overtimeSeconds = Math.max(
    1,
    Math.ceil((speechEvent.timing?.overtimeMs ?? 0) / 1_000),
  );
  let correction: Awaited<ReturnType<typeof generateSpeech>>;
  try {
    correction = await generateSpeech(
      session,
      session.moderator,
      [
        `${speaker.name} continued roughly ${overtimeSeconds} seconds beyond the allotted floor time.`,
        "Correct the overrun in one concise procedural sentence and restore the scheduled order.",
        "Do not evaluate, rebut, or summarize the substance of the argument.",
      ].join(" "),
      runtime,
    );
  } catch {
    correction = {
      content: `Time, ${speaker.name}. The scheduled order resumes now.`,
      sourceIds: [],
      silent: false,
    };
  }
  return makeEvent(session, {
    kind: correction.silent ? "silence" : "moderator_ruling",
    speakerKind: "moderator",
    speakerBotId: session.moderator.id,
    sideId: null,
    content: correction.content,
    sourceIds: [],
    parentEventId: speechEvent.id,
    provider: correction.provider,
    model: correction.model,
    autoRecovery: correction.autoRecovery,
  });
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
    timing: debateTurnTiming(session, snapshot, speech.content),
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
  if (floorBreak) {
    event = {
      ...floorBreak.speechEvent,
      timing: debateTurnTiming(
        session,
        snapshot,
        floorBreak.speechEvent.content,
      ),
    };
  }
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
  const overtimeCorrection =
    !floorBreak && event.timing?.status === "overtime"
      ? await moderatorOvertimeCorrection(withBoard, snapshot, event, runtime)
      : null;
  if (overtimeCorrection) {
    overtimeCorrection.sequence = withBoard.events.length + 1;
    withBoard.events.push(overtimeCorrection);
  }
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
      ...(overtimeCorrection ? [overtimeCorrection] : []),
      ...(repeat ? [repeat] : []),
      ...(floorBreak ? [floorBreak.interjectionEvent] : []),
      ...(floorBreak?.rulingEvent ? [floorBreak.rulingEvent] : []),
    ],
  };
}

async function moderatorOpeningTransition(
  session: DebateSessionV1,
  instruction: string,
  runtime: DebateAiRuntime,
  next: (session: DebateSessionV1) => DebateSessionV1,
): Promise<{ session: DebateSessionV1; events: DebateEventV1[] }> {
  const transitioned = await speechTransition(
    session,
    session.moderator,
    null,
    instruction,
    runtime,
    next,
  );
  const opening = transitioned.events.find(
    (event) => event.speakerBotId === session.moderator.id,
  );
  const devils = devilAdvocateNames(session);
  if (
    !opening ||
    devils.length === 0 ||
    debateEventIsCommonlyAudible(session, opening)
  ) {
    return transitioned;
  }
  const disclosure = makeEvent(
    {
      ...session,
      events: [...session.events, ...transitioned.events],
    },
    {
      kind: "intro",
      speakerKind: "system",
      content: `Docket notice: ${devils.join(" and ")} ${
        devils.length === 1 ? "is" : "are"
      } serving as an explicit Devil's Advocate.`,
      parentEventId: opening.id,
    },
  );
  return {
    session: transitioned.session,
    events: [...transitioned.events, disclosure],
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

function botBallotPrompt(
  session: DebateSessionV1,
  voter: DebateBotSnapshotV1,
): string {
  const publicMaterial = debatePublicMaterialDescription(session.formality);
  const parliamentary = debateUsesInstitutionalRegister(session.formality);
  const structured = debateUsesStructuredRegister(session.formality);
  const criteria =
    session.format === "turnabout" && !parliamentary
      ? "statement consistency, grounded evidence use, responsive clarification, concessions, and clarity"
      : session.format === "turnabout"
        ? TURNABOUT_CRITERIA
        : DEBATE_CRITERIA;
  return [
    "Advocacy has ended. Vote independently for either for or against.",
    `Judge only ${criteria}; do not vote for your assigned side by default.`,
    session.format === "turnabout"
      ? parliamentary
        ? "Treat sustained and overruled objections exactly as the public moderator recorded them. Do not invent a contradiction or use an unpresented evidence item."
        : "Treat the moderator's accepted and rejected challenges exactly as they were publicly decided. Do not invent a contradiction or use an unpresented evidence item."
      : "",
    session.endedEarlyAt
      ? `The debate ended early. Judge only the limited ${debatePublicMaterialLabel(session.formality)} that exists. Do not penalize either side for rounds that were never heard.`
      : "",
    session.format === "turnabout"
      ? parliamentary
        ? "Voice the reason as a concise finding from the Court of Record: identify the decisive recorded statement, clarification, contradiction, or concession. Do not add courtroom theatrics to the canonical ruling."
        : structured
          ? "Give a concise finding from the documented exchange: identify the decisive claim, clarification, contradiction, or concession."
          : `Give one plain, concise reason grounded in ${publicMaterial}. Do not sound like a court or parliament.`
      : parliamentary
        ? "Voice the reason as a concise Assembly Chamber finding: identify which side carried the motion through the public exchange. Do not use courtroom vocabulary."
        : structured
          ? "Give a concise finding that identifies which side carried the documented exchange."
          : `Give one plain, concise reason grounded in ${publicMaterial}. Do not sound like a court or parliament.`,
    debateFormalityGuidance(session.formality),
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
      validate: (value) => value.sideId === "for" || value.sideId === "against",
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

function jurorForId(
  session: DebateSessionV1,
  botId: string,
): DebateJurorSnapshotV1 {
  const juror = session.jury.jurors.find((candidate) => candidate.id === botId);
  if (!juror) throw new HttpError(409, "The frozen juror is unavailable.");
  return juror;
}

function juryDiscussionEvents(session: DebateSessionV1): DebateEventV1[] {
  return session.events.filter((event) => event.kind === "jury_deliberation");
}

function juryDiscussionTranscript(
  session: DebateSessionV1,
  observerBotId?: string,
): string {
  const events = juryDiscussionEvents(session)
    .filter(
      (event) => !observerBotId || botHeardEvent(session, event, observerBotId),
    )
    .slice(-12);
  if (events.length === 0) return "The Jury has not spoken yet.";
  return events
    .map((event) => {
      const speaker = event.speakerBotId
        ? (session.jury.jurors.find((juror) => juror.id === event.speakerBotId)
            ?.name ?? "Juror")
        : "Jury";
      return `${speaker}: ${event.content}`;
    })
    .join("\n");
}

function juryBallotPrompt(
  session: DebateSessionV1,
  juror: DebateJurorSnapshotV1,
  stage: DebateJuryBallotV1["stage"],
): string {
  const publicMaterial = debatePublicMaterialDescription(session.formality);
  const parliamentary = debateUsesInstitutionalRegister(session.formality);
  const criteria =
    session.format === "turnabout" && !parliamentary
      ? "statement consistency, grounded evidence use, responsive clarification, concessions, and clarity"
      : session.format === "turnabout"
        ? TURNABOUT_CRITERIA
        : DEBATE_CRITERIA;
  return [
    stage === "initial"
      ? "Form a private initial leaning before the Jury speaks. No one else will see it."
      : "Cast your final independent Jury ballot after considering the discussion you could perceive.",
    `Choose either for or against using only ${criteria}.`,
    "Your persona may shape what you find persuasive, how certain you feel, and whether another juror changes your mind. It never changes the value of your single vote.",
    session.endedEarlyAt
      ? `The debate ended early. Judge only the limited ${debatePublicMaterialLabel(session.formality)}. Do not penalize either side for rounds that were never heard.`
      : "",
    debateFormalityGuidance(session.formality),
    `Do not use relationship memory, Coffee history, hidden intent, private speech, or evidence outside the frozen packet and ${publicMaterial}.`,
    personaVoicePrompt(juror),
    personaCapabilityPrompt(juror),
    powerPrompt(session, juror.id),
    `Motion: ${session.motion.motion}`,
    `For: ${session.motion.forSide.label}`,
    `Against: ${session.motion.againstSide.label}`,
    "",
    "Public proceeding you could perceive:",
    publicTranscript(session, juror.id, false),
    stage === "final"
      ? `\nJury discussion you could perceive:\n${juryDiscussionTranscript(
          session,
          juror.id,
        )}`
      : "",
    `Return JSON only: {"sideId":"for|against","confidence":0.0,"personaInstinct":"one private sentence about what your persona notices","reason":"one concise reason grounded in ${debatePublicMaterialLabel(session.formality)}"}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function generateJuryBallot(
  session: DebateSessionV1,
  juror: DebateJurorSnapshotV1,
  stage: DebateJuryBallotV1["stage"],
  runtime: DebateAiRuntime,
): Promise<DebateJuryBallotV1> {
  const generation = await generateJson(
    lanesForSession(runtime, session),
    [
      {
        role: "system",
        content: [
          juror.systemPrompt,
          "You are serving as one independent PRISM juror. Keep your own values and limitations. Do not perform consensus or advocate for an assigned side.",
        ].join("\n"),
      },
      { role: "user", content: juryBallotPrompt(session, juror, stage) },
    ],
    {
      maxTokens: stage === "initial" ? 220 : 300,
      temperature: stage === "initial" ? 0.35 : 0.25,
      validate: (value) => value.sideId === "for" || value.sideId === "against",
    },
  );
  const confidenceRaw =
    typeof generation.value.confidence === "number"
      ? generation.value.confidence
      : 0.5;
  return {
    version: DEBATE_SCHEMA_VERSION,
    jurorBotId: juror.id,
    stage,
    sideId: generation.value.sideId === "against" ? "against" : "for",
    confidence: Math.max(0, Math.min(1, confidenceRaw)),
    personaInstinct:
      compactText(generation.value.personaInstinct, 500) ||
      `I am weighing ${debatePublicMaterialDescription(session.formality)} through my own priorities.`,
    reason:
      compactText(generation.value.reason, 700) ||
      "That side made the more persuasive public case.",
    provider: generation.provider,
    model: generation.model,
    ...(generation.autoRecovery
      ? { autoRecovery: generation.autoRecovery }
      : {}),
    createdAt: new Date().toISOString(),
  };
}

function eligibleJurySpeakers(
  session: DebateSessionV1,
): DebateJurorSnapshotV1[] {
  const counts = session.jury.speakerCounts;
  const spoken = new Set(
    Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([id]) => id),
  );
  const remaining =
    session.jury.discussionTurnTarget - session.jury.discussionTurnCount;
  const distinctNeeded = Math.max(0, DEBATE_JURY_SIZE - spoken.size);
  let eligible = session.jury.jurors.filter(
    (juror) => (counts[juror.id] ?? 0) < 2,
  );
  if (distinctNeeded >= remaining) {
    const unused = eligible.filter((juror) => !spoken.has(juror.id));
    if (unused.length > 0) eligible = unused;
  }
  const lastSpeakerId = [...juryDiscussionEvents(session)]
    .reverse()
    .find((event) => event.speakerBotId)?.speakerBotId;
  const withoutRepeat = eligible.filter((juror) => juror.id !== lastSpeakerId);
  return withoutRepeat.length > 0 ? withoutRepeat : eligible;
}

async function selectJurySpeaker(
  session: DebateSessionV1,
  runtime: DebateAiRuntime,
): Promise<{ juror: DebateJurorSnapshotV1; directive: string | null }> {
  const eligible = eligibleJurySpeakers(session);
  if (eligible.length === 0) {
    throw new HttpError(409, "The Jury has no eligible next speaker.");
  }
  const allowed = eligible.map((juror) => ({
    id: juror.id,
    name: juror.name,
  }));
  try {
    const generation = await generateJson(
      lanesForSession(runtime, session),
      [
        {
          role: "system",
          content: [
            "You silently route one natural turn in a five-person Jury discussion.",
            "Choose the juror whose persona can most usefully answer, complicate, or redirect the latest point.",
            "Respect the allowed list. Do not write the juror's speech.",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            "Eligible jurors:",
            ...eligible.map(
              (juror) =>
                `- ${juror.id} | ${juror.name} | ${compactText(
                  juror.systemPrompt,
                  220,
                )}`,
            ),
            "",
            "Discussion so far:",
            juryDiscussionTranscript(session),
            "",
            'Return JSON only: {"botId":"eligible id","reason":"brief routing reason","directive":"optional conversational direction"}.',
          ].join("\n"),
        },
      ],
      {
        maxTokens: 150,
        temperature: 0.35,
        validate: (value) =>
          typeof value.botId === "string" &&
          eligible.some((juror) => juror.id === value.botId),
      },
    );
    const routed = parseRouterResponse(
      JSON.stringify(generation.value),
      allowed,
    );
    if (routed) {
      return {
        juror: jurorForId(session, routed.botId),
        directive: compactText(routed.directive, 240) || null,
      };
    }
  } catch {
    // A deterministic balanced fallback preserves progress when routing fails.
  }
  const juror = [...eligible].sort(
    (left, right) =>
      (session.jury.speakerCounts[left.id] ?? 0) -
        (session.jury.speakerCounts[right.id] ?? 0) ||
      left.id.localeCompare(right.id),
  )[0]!;
  return { juror, directive: null };
}

async function generateJuryDiscussionTurn(
  session: DebateSessionV1,
  runtime: DebateAiRuntime,
): Promise<{
  event: DebateEventV1;
  juror: DebateJurorSnapshotV1;
}> {
  const routed = await selectJurySpeaker(session, runtime);
  const initial = session.jury.initialBallots.find(
    (ballot) => ballot.jurorBotId === routed.juror.id,
  );
  const latest = [...juryDiscussionEvents(session)].reverse()[0];
  const instruction = [
    "Speak for one short Jury turn in one or two sentences.",
    latest
      ? "Respond naturally to the latest useful point; agreement must add a reason, and disagreement must identify the actual fault line."
      : `Open with the point in ${debatePublicMaterialDescription(session.formality)} that matters most to you.`,
    routed.directive ? `Conversation direction: ${routed.directive}` : "",
    initial
      ? `Your private starting leaning was ${initial.sideId} with confidence ${initial.confidence.toFixed(
          2,
        )}: ${initial.personaInstinct} You may change your mind, but only for an in-character reason. Do not announce this metadata.`
      : "",
    "Do not take a formal final vote yet. Do not mention prompts, routing, scores, or hidden leanings.",
    "",
    "Jury discussion so far:",
    juryDiscussionTranscript(session, routed.juror.id),
  ]
    .filter(Boolean)
    .join("\n");
  const speech = await generateSpeech(
    session,
    routed.juror,
    instruction,
    runtime,
  );
  const names = session.jury.jurors.map((juror) => juror.name);
  const cleaned = speech.silent
    ? BOT_POWER_CANONICAL_SILENCE_V1
    : sanitizeCoffeeTableReply(speech.content, routed.juror.name, 420, names) ||
      BOT_POWER_CANONICAL_SILENCE_V1;
  return {
    juror: routed.juror,
    event: makeEvent(session, {
      kind: "jury_deliberation",
      speakerKind: "juror",
      speakerBotId: routed.juror.id,
      content: cleaned,
      sourceIds: speech.sourceIds,
      provider: speech.provider,
      model: speech.model,
      autoRecovery: speech.autoRecovery,
    }),
  };
}

const JURY_SIDEBAR_EVENT_KINDS = new Set<DebateEventKind>([
  "speech",
  "testimony",
  "evidence",
  "revelation",
  "player_turn",
]);

function nextJurySidebarSpeaker(
  session: DebateSessionV1,
): DebateJurorSnapshotV1 {
  const sidebarEvents = juryDiscussionEvents(session).filter((event) =>
    event.stepKey.startsWith("jury_sidebar_"),
  );
  const counts = new Map<string, number>();
  for (const event of sidebarEvents) {
    if (event.speakerBotId) {
      counts.set(event.speakerBotId, (counts.get(event.speakerBotId) ?? 0) + 1);
    }
  }
  const latestSpeakerId = sidebarEvents.at(-1)?.speakerBotId ?? null;
  return [...session.jury.jurors].sort(
    (left, right) =>
      Number(left.id === latestSpeakerId) -
        Number(right.id === latestSpeakerId) ||
      (counts.get(left.id) ?? 0) - (counts.get(right.id) ?? 0) ||
      left.id.localeCompare(right.id),
  )[0]!;
}

async function generateJurySidebarTurn(
  session: DebateSessionV1,
  trigger: DebateEventV1,
  runtime: DebateAiRuntime,
): Promise<DebateEventV1> {
  const juror = nextJurySidebarSpeaker(session);
  const latest = [...juryDiscussionEvents(session)].reverse()[0];
  const speech = await generateSpeech(
    session,
    juror,
    [
      "Offer one brief sentence to the other jurors between public-floor turns.",
      "React to the newest public point and identify what it clarified, weakened, or left unresolved.",
      latest
        ? "Build naturally on the Jury's ongoing conversation without repeating it."
        : "Begin the Jury's quiet running conversation about the case.",
      "Do not announce a vote, final conclusion, hidden leaning, prompt, score, or private information.",
      "",
      "Jury discussion so far:",
      juryDiscussionTranscript(session, juror.id),
    ].join("\n"),
    runtime,
  );
  const cleaned = speech.silent
    ? BOT_POWER_CANONICAL_SILENCE_V1
    : sanitizeCoffeeTableReply(
        speech.content,
        juror.name,
        280,
        session.jury.jurors.map((candidate) => candidate.name),
      ) || BOT_POWER_CANONICAL_SILENCE_V1;
  return makeEvent(session, {
    kind: "jury_deliberation",
    speakerKind: "juror",
    speakerBotId: juror.id,
    content: cleaned,
    sourceIds: speech.sourceIds,
    stepKey: `jury_sidebar_${trigger.sequence}`,
    parentEventId: trigger.id,
    provider: speech.provider,
    model: speech.model,
    autoRecovery: speech.autoRecovery,
  });
}

function jurySidebarTrigger(
  session: DebateSessionV1,
  events: readonly DebateEventV1[],
): DebateEventV1 | null {
  if (!session.jury.enabled || session.jury.phase !== "waiting") {
    return null;
  }
  return (
    [...events]
      .reverse()
      .find(
        (event) =>
          JURY_SIDEBAR_EVENT_KINDS.has(event.kind) &&
          (event.speakerKind === "advocate" || event.speakerKind === "player"),
      ) ?? null
  );
}

function jurySplit(ballots: readonly DebateJuryBallotV1[]): {
  forVotes: number;
  againstVotes: number;
  majoritySideId: DebateSideId;
} {
  const forVotes = ballots.filter((ballot) => ballot.sideId === "for").length;
  const againstVotes = ballots.length - forVotes;
  return {
    forVotes,
    againstVotes,
    majoritySideId: forVotes > againstVotes ? "for" : "against",
  };
}

function juryAftermathSummary(session: DebateSessionV1): string {
  if (!session.jury.majoritySideId) {
    throw new HttpError(409, "The Jury has not returned a verdict.");
  }
  return `${session.jury.forVotes}–${session.jury.againstVotes} for ${sideLabel(
    session,
    session.jury.majoritySideId,
  )}`;
}

async function juryAdvocateReactionTransition(
  session: DebateSessionV1,
  sideId: DebateSideId,
  runtime: DebateAiRuntime,
): Promise<{ session: DebateSessionV1; events: DebateEventV1[] }> {
  const advocate = botForSide(session, sideId);
  const participantPrivacy =
    session.playerRole === "participant"
      ? [
          "This was a sealed Jury. You know only the aggregate winning side and split stated above.",
          "Never mention or imply any juror identity, individual vote, speech, reaction, reasoning, or deliberation detail.",
        ].join(" ")
      : "Do not quote or summarize individual jurors; react to the result as a whole.";
  const reaction = await generateSpeech(
    session,
    advocate,
    [
      `The Jury has returned ${juryAftermathSummary(session)}.`,
      `Give ${advocate.name}'s immediate public reaction in one or two concise sentences.`,
      sideId === session.jury.majoritySideId
        ? "Acknowledge the win without restarting the argument."
        : "Acknowledge the loss honestly without appealing or relitigating the case.",
      participantPrivacy,
      "Stay in persona. Add no new evidence, source, major argument, or procedural instruction.",
    ].join(" "),
    runtime,
  );
  const event = makeEvent(session, {
    kind: reaction.silent ? "silence" : "reaction",
    speakerKind: "advocate",
    speakerBotId: advocate.id,
    sideId,
    content: reaction.content,
    sourceIds: reaction.sourceIds,
    provider: reaction.provider,
    model: reaction.model,
    autoRecovery: reaction.autoRecovery,
  });
  const nextStep =
    sideId === "for"
      ? "jury_aftermath_against"
      : session.playerRole === "judge"
        ? session.format === "turnabout"
          ? "turnabout_verdict_player"
          : "verdict_player"
        : "jury_closing_moderator";
  const status =
    sideId === "against" && session.playerRole === "judge"
      ? "waiting_for_player"
      : "live";
  let next: DebateSessionV1 = {
    ...session,
    stepKey: nextStep,
    status,
  };
  if (next.format === "turnabout") {
    next = withTurnaboutState(next, {
      ...turnaboutState(next),
      phase: "resolution",
      activeStatementId: null,
      floorOwnerBotId: status === "waiting_for_player" ? null : advocate.id,
    });
  }
  return { session: next, events: [event] };
}

async function juryModeratorClosingTransition(
  session: DebateSessionV1,
  runtime: DebateAiRuntime,
): Promise<{ session: DebateSessionV1; events: DebateEventV1[] }> {
  const closing = await generateSpeech(
    session,
    session.moderator,
    [
      `The Jury returned ${juryAftermathSummary(session)}, and both advocates have now responded.`,
      "Close the proceeding formally in two or three concise sentences.",
      "State the aggregate result, thank both sides, and declare the debate closed.",
      "Remain neutral in tone. Add no new argument, evidence, juror detail, or invitation to continue.",
    ].join(" "),
    runtime,
  );
  const event = makeEvent(session, {
    kind: closing.silent ? "silence" : "phase",
    speakerKind: "moderator",
    speakerBotId: session.moderator.id,
    content: closing.content,
    sourceIds: closing.sourceIds,
    provider: closing.provider,
    model: closing.model,
    autoRecovery: closing.autoRecovery,
  });
  const completedAt = new Date().toISOString();
  let next: DebateSessionV1 = {
    ...session,
    stepKey: "completed",
    status: "completed",
    winnerSideId: session.jury.majoritySideId,
    completedAt,
  };
  if (next.format === "turnabout") {
    next = withTurnaboutState(next, {
      ...turnaboutState(next),
      phase: "resolution",
      activeStatementId: null,
      floorOwnerBotId: null,
    });
  }
  return { session: next, events: [event] };
}

function turnaboutState(
  session: DebateSessionV1,
): DebateTurnaboutFormatStateV1 {
  if (session.format !== "turnabout") {
    throw new HttpError(409, "This action belongs to the Turnabout format.");
  }
  const state = normalizeDebateFormatStateV1(session.formatState, "turnabout");
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

function startJuryResolution(
  session: DebateSessionV1,
  discussionTurnTarget = DEBATE_JURY_DISCUSSION_TURNS,
): DebateSessionV1 {
  if (
    !session.jury.enabled ||
    session.jury.jurors.length !== DEBATE_JURY_SIZE
  ) {
    throw new HttpError(409, "This Debate has no frozen five-seat Jury.");
  }
  const jury: DebateJuryStateV1 = {
    ...session.jury,
    phase: "initial_ballots",
    initialBallots: [],
    finalBallots: [],
    discussionTurnTarget,
    discussionTurnCount: 0,
    speakerCounts: {},
    majoritySideId: null,
    forVotes: 0,
    againstVotes: 0,
    calledVoteAt: null,
    completedAt: null,
  };
  const base: DebateSessionV1 = {
    ...session,
    phase: "verdict",
    stepKey: "jury_initial_0",
    status: "live",
    jury,
    error: null,
  };
  if (session.format !== "turnabout") return base;
  return withTurnaboutState(base, {
    ...turnaboutState(session),
    phase: "resolution",
    activeStatementId: null,
    floorOwnerBotId: session.jury.forepersonBotId,
  });
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
  if (session.jury.enabled) return startJuryResolution(session);
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
  update: (statement: DebateTurnaboutStatementV1) => DebateTurnaboutStatementV1,
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
        debateUsesInstitutionalRegister(session.formality)
          ? `Deliver testimony statement ${index + 1} of ${DEBATE_TURNABOUT_STATEMENTS_PER_SIDE} for ${sideLabel(session, sideId)} into the Court of Record.`
          : `Deliver pressable claim ${index + 1} of ${DEBATE_TURNABOUT_STATEMENTS_PER_SIDE} for ${sideLabel(session, sideId)} in this Turnabout.`,
        sideId === "for" && index === 0
          ? moderatorOpeningPerceptionCue(session, speaker.id)
          : "",
        "State one claim this persona can actually notice and explain. It may be simple, literal, mistaken, or oddly reasoned when that fits the saved persona.",
        index === 0
          ? "Give their own most natural reason for this side."
          : "Add a different natural reason if this persona can think of one; do not force a sophisticated second line of argument.",
        `Keep it to 1-3 sentences. Use only the frozen evidence packet and ${debatePublicMaterialDescription(session.formality)}, and cite frozen sources with valid markers.`,
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
  if (actor === "moderator" && moderatorIsHardMuted(session)) {
    const silence = makeEvent(session, {
      kind: "silence",
      speakerKind: "moderator",
      speakerBotId: session.moderator.id,
      content: BOT_POWER_CANONICAL_SILENCE_V1,
      statementId: statement.id,
      parentEventId: statement.createdEventId,
    });
    return {
      state: replaceTurnaboutStatement(state, statement.id, (current) => ({
        ...current,
        status: "resolved",
      })),
      events: [silence],
    };
  }
  const press = makeEvent(session, {
    kind: "press",
    speakerKind: actor,
    speakerBotId: actor === "moderator" ? session.moderator.id : null,
    sideId: actor === "player" ? session.playerSideId : null,
    content:
      actor === "moderator"
        ? debateUsesInstitutionalRegister(session.formality)
          ? `The court presses statement ${statement.id.slice(0, 8)} for a clearer account.`
          : `The moderator presses claim ${statement.id.slice(0, 8)} for a clearer answer.`
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
      `Your earlier claim was: ${statement.content}`,
      debateUsesInstitutionalRegister(session.formality)
        ? "The court has pressed it."
        : "The moderator has pressed it.",
      "Answer only as well as this persona can understand the question, in 1-3 sentences.",
      `Narrow or concede only if this persona would naturally recognize and express that move. Do not introduce evidence outside the frozen packet or ${debatePublicMaterialDescription(session.formality)}.`,
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
    kind: moderatorIsHardMuted(session) ? "silence" : "moderator_ruling",
    speakerKind: "moderator",
    speakerBotId: session.moderator.id,
    content: moderatorIsHardMuted(session)
      ? BOT_POWER_CANONICAL_SILENCE_V1
      : clarification.silent
        ? debateUsesInstitutionalRegister(session.formality)
          ? "The court records canonical silence. The original statement remains on the public record."
          : "No answer was audible. The original claim still stands."
        : debateUsesInstitutionalRegister(session.formality)
          ? "Entered. The original statement remains subject to a frozen-evidence objection."
          : "Noted. The original claim can still be challenged with frozen evidence.",
    parentEventId: clarificationEvent.id,
    statementId: statement.id,
  });
  return {
    state: replaceTurnaboutStatement(state, statement.id, (current) => ({
      ...current,
      status: actor === "moderator" ? "resolved" : "pressed",
    })),
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

async function advanceJuryStep(
  session: DebateSessionV1,
  runtime: DebateAiRuntime,
): Promise<{ session: DebateSessionV1; events: DebateEventV1[] }> {
  if (!session.jury.enabled) {
    throw new HttpError(409, "This Debate does not have a Jury.");
  }
  if (session.stepKey.startsWith("jury_initial_")) {
    const juror = session.jury.jurors[session.jury.initialBallots.length];
    if (!juror) {
      throw new HttpError(
        409,
        "The Jury's initial ballot position is invalid.",
      );
    }
    const ballot = await generateJuryBallot(session, juror, "initial", runtime);
    const initialBallots = [...session.jury.initialBallots, ballot];
    const complete = initialBallots.length === DEBATE_JURY_SIZE;
    return {
      session: {
        ...session,
        stepKey: complete
          ? "jury_deliberation_0"
          : `jury_initial_${initialBallots.length}`,
        jury: {
          ...session.jury,
          phase: complete ? "deliberating" : "initial_ballots",
          initialBallots,
        },
      },
      events: [],
    };
  }
  if (session.stepKey.startsWith("jury_deliberation_")) {
    const { event, juror } = await generateJuryDiscussionTurn(session, runtime);
    const discussionTurnCount = session.jury.discussionTurnCount + 1;
    const complete = discussionTurnCount >= session.jury.discussionTurnTarget;
    const next: DebateSessionV1 = {
      ...session,
      stepKey: complete
        ? "jury_final_0"
        : `jury_deliberation_${discussionTurnCount}`,
      jury: {
        ...session.jury,
        phase: complete ? "final_ballots" : "deliberating",
        discussionTurnCount,
        speakerCounts: {
          ...session.jury.speakerCounts,
          [juror.id]: (session.jury.speakerCounts[juror.id] ?? 0) + 1,
        },
      },
    };
    return {
      session:
        next.format === "turnabout"
          ? withTurnaboutState(next, {
              ...turnaboutState(next),
              floorOwnerBotId: juror.id,
            })
          : next,
      events: [event],
    };
  }
  if (session.stepKey.startsWith("jury_final_")) {
    const juror = session.jury.jurors[session.jury.finalBallots.length];
    if (!juror) {
      throw new HttpError(409, "The Jury's final ballot position is invalid.");
    }
    const ballot = await generateJuryBallot(session, juror, "final", runtime);
    const ballotEvent = makeEvent(session, {
      kind: "ballot",
      speakerKind: "juror",
      speakerBotId: juror.id,
      sideId: ballot.sideId,
      content:
        session.powerPlan.bots[juror.id]?.hardMuted === true
          ? BOT_POWER_CANONICAL_SILENCE_V1
          : ballot.reason,
      provider: ballot.provider,
      model: ballot.model,
      autoRecovery: ballot.autoRecovery,
    });
    const finalBallots = [...session.jury.finalBallots, ballot];
    if (finalBallots.length < DEBATE_JURY_SIZE) {
      return {
        session: {
          ...session,
          stepKey: `jury_final_${finalBallots.length}`,
          jury: {
            ...session.jury,
            phase: "final_ballots",
            finalBallots,
          },
        },
        events: [ballotEvent],
      };
    }
    const split = jurySplit(finalBallots);
    const completedAt = new Date().toISOString();
    const foreperson =
      session.jury.jurors.find(
        (candidate) => candidate.id === session.jury.forepersonBotId,
      ) ?? session.jury.jurors[0]!;
    let resolved: DebateSessionV1 = {
      ...session,
      jury: {
        ...session.jury,
        phase: "complete",
        finalBallots,
        ...split,
        completedAt,
      },
      stepKey: "jury_aftermath_for",
      status: "live",
      winnerSideId:
        session.playerRole === "judge" ? null : split.majoritySideId,
      completedAt: null,
    };
    if (resolved.format === "turnabout") {
      resolved = withTurnaboutState(resolved, {
        ...turnaboutState(resolved),
        phase: "resolution",
        activeStatementId: null,
        floorOwnerBotId: foreperson.id,
      });
    }
    const verdictEvent = makeEvent(
      { ...session, events: [...session.events, ballotEvent] },
      {
        kind: "jury_verdict",
        speakerKind: "juror",
        speakerBotId: foreperson.id,
        sideId: split.majoritySideId,
        content:
          session.playerRole === "judge"
            ? `The Jury advises ${split.forVotes}–${split.againstVotes} for ${sideLabel(
                session,
                split.majoritySideId,
              )}. The final ruling remains with the Judge.`
            : `By ${split.forVotes}–${split.againstVotes}, the Jury finds for ${sideLabel(
                session,
                split.majoritySideId,
              )}.`,
      },
    );
    return { session: resolved, events: [ballotEvent, verdictEvent] };
  }
  if (session.stepKey === "jury_aftermath_for") {
    return juryAdvocateReactionTransition(session, "for", runtime);
  }
  if (session.stepKey === "jury_aftermath_against") {
    return juryAdvocateReactionTransition(session, "against", runtime);
  }
  if (session.stepKey === "jury_closing_moderator") {
    return juryModeratorClosingTransition(session, runtime);
  }
  throw new HttpError(409, "This Jury step is unavailable.");
}

function skipJuryDiscussion(session: DebateSessionV1): DebateSessionV1 {
  if (!session.stepKey.startsWith("jury_deliberation_")) {
    throw new HttpError(
      409,
      "Only Jury discussion turns may be skipped. Ballots are Retry-only.",
    );
  }
  const discussionTurnCount = session.jury.discussionTurnCount + 1;
  const complete = discussionTurnCount >= session.jury.discussionTurnTarget;
  return {
    ...session,
    stepKey: complete
      ? "jury_final_0"
      : `jury_deliberation_${discussionTurnCount}`,
    jury: {
      ...session.jury,
      phase: complete ? "final_ballots" : "deliberating",
      discussionTurnCount,
    },
  };
}

async function advanceTurnaboutStep(
  session: DebateSessionV1,
  runtime: DebateAiRuntime,
): Promise<{ session: DebateSessionV1; events: DebateEventV1[] }> {
  if (session.stepKey.startsWith("jury_")) {
    return advanceJuryStep(session, runtime);
  }
  const state = turnaboutState(session);
  switch (session.stepKey) {
    case "turnabout_intro": {
      const parliamentary = debateUsesInstitutionalRegister(session.formality);
      const structured = debateUsesStructuredRegister(session.formality);
      return moderatorOpeningTransition(
        withTurnaboutState(session, {
          ...state,
          phase: "testimony",
          floorOwnerBotId: session.moderator.id,
        }),
        [
          parliamentary
            ? "Call the Court of Record to order and open this Turnabout in 3-5 sentences."
            : structured
              ? "Open this Turnabout cleanly in 3-5 sentences."
              : "Get this Turnabout started in 3-5 direct sentences. Do not use courtroom or parliamentary ceremony.",
          `State the exact motion and identify ${session.forAdvocate.name} and ${session.againstAdvocate.name}.`,
          parliamentary
            ? "Explain that each side will enter two pressable statements, objections must identify one statement and one frozen evidence item, and you will rule immediately from the public record."
            : "Explain that each side gets two claims that can be pressed; an evidence challenge must point to one claim and one frozen evidence item, and you will decide it immediately from what everyone heard and saw.",
          session.evidence.sources.length > 0
            ? `The frozen evidence packet contains ${session.evidence.sources.length} presentable item${session.evidence.sources.length === 1 ? "" : "s"}.`
            : "The frozen evidence packet contains no presentable items. Say clearly that Press and Pass remain available, but Object and Present Evidence are unavailable.",
          parliamentary
            ? "Do not say testimony must cite evidence. Testimony is a pressable advocacy claim; only a formal evidence presentation needs a frozen item."
            : "Do not say every claim must cite evidence. A claim can be pressed on its own; only Present Evidence needs a frozen item.",
          "Remain neutral. Do not invent evidence or imply odds.",
          advocacyDisclosure(session),
        ].join(" "),
        runtime,
        (next) => ({ ...next, stepKey: "turnabout_testimony_for" }),
      );
    }
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
        return {
          session: turnaboutResolutionStart(session, state),
          events: [],
        };
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
      if (!winnerSideId)
        throw new Error("The Turnabout resolution is missing.");
      const verdictEvent = makeEvent(
        { ...session, events: [...session.events, event] },
        {
          kind: "verdict",
          speakerKind: "system",
          sideId: winnerSideId,
          content:
            session.playerRole === "judge"
              ? debateUsesInstitutionalRegister(session.formality)
                ? `From the public record, the Court finds for ${sideLabel(session, winnerSideId)}. The Judge's ruling resolves the Turnabout; bot ballots remain an agreement-and-dissent epilogue.`
                : `${sideLabel(session, winnerSideId)} wins the Judge's decision. The bot ballots remain an agreement-and-dissent epilogue.`
              : debateUsesInstitutionalRegister(session.formality)
                ? `On the public record, ${sideLabel(session, winnerSideId)} carries the Turnabout by the three-bot majority.`
                : `${sideLabel(session, winnerSideId)} takes the Turnabout by the three-bot majority.`,
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

function skippedTurnaboutTransition(session: DebateSessionV1): DebateSessionV1 {
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
  if (step.startsWith("rebuttal_against"))
    return nextAfterRebuttal(session, "against");
  if (step.startsWith("rebuttal_for")) return nextAfterRebuttal(session, "for");
  if (step === "moderator_to_closing") {
    return { ...session, stepKey: "closing_against", status: "live" };
  }
  if (step === "closing_against") return { ...session, stepKey: "closing_for" };
  if (step === "closing_for") {
    if (session.jury.enabled) return startJuryResolution(session);
    const nextStep =
      session.playerRole === "judge" ? "verdict_player" : "ballot_moderator";
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
  if (session.stepKey.startsWith("jury_")) {
    return advanceJuryStep(session, runtime);
  }
  switch (session.stepKey) {
    case "intro": {
      const parliamentary = debateUsesInstitutionalRegister(session.formality);
      return moderatorOpeningTransition(
        session,
        [
          parliamentary
            ? "Call the Assembly Chamber to order and open the Forum in 3-5 sentences."
            : debateUsesDaytimeShowdown(session)
              ? "Open Daytime Showdown in 3-5 punchy sentences like a volatile live confrontation show. Make clear that personal shots and interruptions may happen, but facts still matter and you control the floor."
              : "Start the debate in 3-5 direct sentences. Do not use House, chamber, record, or parliamentary ceremony.",
          parliamentary
            ? `State the exact motion as the question before the chamber, recognize ${session.forAdvocate.name} for ${session.motion.forSide.label} and ${session.againstAdvocate.name} for ${session.motion.againstSide.label}, and name the judging criteria: ${DEBATE_CRITERIA}.`
            : `State the exact topic, introduce ${session.forAdvocate.name} for ${session.motion.forSide.label} and ${session.againstAdvocate.name} for ${session.motion.againstSide.label}, and name the judging criteria: ${DEBATE_CRITERIA}.`,
          advocacyDisclosure(session),
        ].join(" "),
        runtime,
        (next) => ({ ...next, stepKey: "opening_for" }),
      );
    }
    case "opening_for":
      return speechTransition(
        session,
        session.forAdvocate,
        "for",
        [
          moderatorOpeningPerceptionCue(session, session.forAdvocate.id),
          debateUsesInstitutionalRegister(session.formality)
            ? `Give the ${session.motion.forSide.label} opening address to the chamber. Establish a focused thesis and make the strongest frozen-evidence-supported case.`
            : `Give the ${session.motion.forSide.label} opening argument. Establish a focused position and make the strongest frozen-evidence-supported case.`,
        ]
          .filter(Boolean)
          .join(" "),
        runtime,
        (next) => ({ ...next, stepKey: "opening_against" }),
      );
    case "opening_against":
      return speechTransition(
        session,
        session.againstAdvocate,
        "against",
        debateUsesInstitutionalRegister(session.formality)
          ? `Respond with the ${session.motion.againstSide.label} opening address to the chamber. Establish a distinct thesis and engage what the For side actually said.`
          : `Respond with the ${session.motion.againstSide.label} opening argument. Establish a distinct position and engage what the For side actually said.`,
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
        challengeResponseInstruction(
          session,
          botForSide(session, session.playerSideId ?? "for").id,
          "The participant passed their Challenge answer back to you. Answer the moderator directly for your shared side.",
        ),
        runtime,
        (next) => ({ ...next, stepKey: "challenge_opponent_prompt" }),
      );
    case "challenge_opponent_prompt": {
      const sideId: DebateSideId =
        session.playerSideId === "against" ? "for" : "against";
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
      const sideId: DebateSideId =
        session.playerSideId === "against" ? "for" : "against";
      return speechTransition(
        session,
        botForSide(session, sideId),
        sideId,
        challengeResponseInstruction(
          session,
          botForSide(session, sideId).id,
          "Answer the moderator's latest challenge directly. Acknowledge any fair premise before defending or narrowing your claim.",
        ),
        runtime,
        (next) => enterModeratedRebuttal(next),
      );
    }
    case "challenge_for_prompt":
    case "challenge_against_prompt":
    case "challenge_judge_pass_for_prompt":
    case "challenge_judge_pass_against_prompt": {
      const sideId: DebateSideId = session.stepKey.includes("against")
        ? "against"
        : "for";
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
      const sideId: DebateSideId = session.stepKey.includes("against")
        ? "against"
        : "for";
      return speechTransition(
        session,
        botForSide(session, sideId),
        sideId,
        challengeResponseInstruction(
          session,
          botForSide(session, sideId).id,
          "Answer the moderator's latest challenge directly. Make one clear concession if the challenge warrants it.",
        ),
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
      const sideId: DebateSideId =
        question?.sideId === "against" ? "for" : "against";
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
      const sideId: DebateSideId =
        question?.sideId === "against" ? "for" : "against";
      return speechTransition(
        session,
        botForSide(session, sideId),
        sideId,
        challengeResponseInstruction(
          session,
          botForSide(session, sideId).id,
          "Answer the moderator's latest challenge directly.",
        ),
        runtime,
        (next) => enterModeratedRebuttal(next),
      );
    }
    case "moderator_to_rebuttal":
      return moderatorPhaseTransition(
        session,
        [
          debateUsesInstitutionalRegister(session.formality)
            ? "Move the Assembly Chamber into rebuttal in one or two concise sentences."
            : "Move the debate into rebuttal in one or two concise sentences.",
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
          debateUsesInstitutionalRegister(session.formality)
            ? "Move the Assembly Chamber into closing addresses in one or two concise sentences."
            : "Move the debate into closing arguments in one or two concise sentences.",
          debateUsesInstitutionalRegister(session.formality)
            ? "Identify the single question still before the chamber, recognize the Against closing first, and reserve the final reply for For."
            : "Identify the single question still unresolved, give Against the first closing, and reserve the final reply for For.",
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
          : session.playerRole === "participant" &&
              session.playerSideId === "against"
            ? "Give the final reply for the For side. Answer the participant's public contributions and make no new major argument."
            : "Give the final reply for the For side. Synthesize the decisive clash and make no new major argument.",
        runtime,
        (next) => {
          if (next.jury.enabled) return startJuryResolution(next);
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
              session.stepKey === "ballot_moderator"
                ? "ballot_for"
                : "ballot_against",
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
              ? debateUsesInstitutionalRegister(session.formality)
                ? `The chair records the Judge's decision for ${sideLabel(session, winnerSideId)}. Bot ballots remain an agreement-and-dissent epilogue only.`
                : `${sideLabel(session, winnerSideId)} wins the Judge's decision. Bot ballots remain an agreement-and-dissent epilogue only.`
              : debateUsesInstitutionalRegister(session.formality)
                ? `${sideLabel(session, winnerSideId)} carries the motion by the three-bot majority.`
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
    if (session.stepKey.startsWith("jury_")) {
      const event = makeEvent(session, {
        kind: "jury_deliberation",
        speakerKind: "system",
        content:
          "A Jury discussion turn was skipped. No dialogue was fabricated.",
      });
      const next = skipJuryDiscussion(session);
      return commitMutation(
        db,
        userId,
        session,
        { ...next, events: session.events },
        checked.idempotencyKey,
        [event],
      );
    }
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
    let events = transitioned.events;
    const trigger = jurySidebarTrigger(
      transitioned.session,
      transitioned.events,
    );
    if (trigger) {
      const juryContext: DebateSessionV1 = {
        ...transitioned.session,
        events: [...session.events, ...transitioned.events],
      };
      try {
        events = [
          ...transitioned.events,
          await generateJurySidebarTurn(juryContext, trigger, runtime),
        ];
      } catch {
        // A sidebar reaction is atmospheric. It must never pause the floor.
      }
    }
    const committed = commitMutation(
      db,
      userId,
      session,
      transitioned.session,
      checked.idempotencyKey,
      events,
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
      content:
        "Turn unavailable. Retry or skip this turn; no dialogue was fabricated.",
    });
    const pauseEvent = debatePauseAnnouncementEvent({
      ...session,
      events: [...session.events, event],
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
      [event, pauseEvent],
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
    throw new HttpError(409, "This Turnabout is not waiting for your action.");
  }
  const state = turnaboutState(session);
  const statementId = compactText(request.statementId, 120);
  const statement = state.statements.find(
    (candidate) =>
      candidate.id === statementId && candidate.id === state.activeStatementId,
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
      content: debateUsesInstitutionalRegister(session.formality)
        ? "Pass. The statement stands on the public record."
        : "Pass. The claim stands as given.",
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
    content: debateUsesInstitutionalRegister(session.formality)
      ? `Objection to statement ${statement.id.slice(0, 8)}.`
      : `Evidence challenge to claim ${statement.id.slice(0, 8)}.`,
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
  const silentModerator = moderatorIsHardMuted(session);
  const rulingEvent = makeEvent(withEvidence, {
    kind: "moderator_ruling",
    speakerKind: silentModerator ? "system" : "moderator",
    speakerBotId: silentModerator ? null : session.moderator.id,
    content: debateUsesInstitutionalRegister(session.formality)
      ? contradiction.ruling === "sustained"
        ? `${silentModerator ? "Public record: " : ""}Sustained. The statement says “${contradiction.statementQuote}”; the frozen evidence says “${contradiction.evidenceQuote}”. The contradiction is entered.`
        : `${silentModerator ? "Public record: " : ""}Overruled. The submitted contradiction is not grounded in both the recorded statement and the frozen evidence. The statement remains open.`
      : contradiction.ruling === "sustained"
        ? `${silentModerator ? "Public exchange: " : ""}That challenge holds up. The claim says “${contradiction.statementQuote}”; the frozen evidence says “${contradiction.evidenceQuote}”. The conflict is clear.`
        : `${silentModerator ? "Public exchange: " : ""}That challenge does not hold up. It is not grounded in both the claim and the frozen evidence, so the claim remains open.`,
    sourceIds: contradiction.ruling === "sustained" ? [evidenceSourceId] : [],
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
  const newEvents: DebateEventV1[] = [objection, evidenceEvent, rulingEvent];
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
  const rawContent = multilineText(
    request.content,
    DEBATE_PLAYER_TURN_MAX_LENGTH,
  );
  if (!pass && !rawContent)
    throw new HttpError(400, "Enter your contribution or choose Pass.");
  if (session.stepKey === "verdict_player") {
    throw new HttpError(409, "Use the verdict action for the Judge's ruling.");
  }
  const sanitized = sanitizeDebateStatementSources(
    rawContent,
    session.evidence,
  );
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
    (event) => event.sequence > target.sequence && event.kind !== "case_board",
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
  if (!prefix)
    throw new HttpError(409, "The speaker has not completed a phrase.");
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
  const rulingEvent = makeEvent(withInterjection, {
    kind: ruling.silent ? "silence" : "moderator_ruling",
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
  if (!isDebateSideId(request.sideId))
    throw new HttpError(400, "Choose For or Against.");
  const reason = compactText(request.reason, 1_200);
  const event = makeEvent(session, {
    kind: "verdict",
    speakerKind: "player",
    sideId: request.sideId,
    content:
      reason || `The Judge rules for ${sideLabel(session, request.sideId)}.`,
  });
  if (session.jury.enabled) {
    const completedAt = new Date().toISOString();
    let nextSession: DebateSessionV1 = {
      ...session,
      playerVerdict: request.sideId,
      winnerSideId: request.sideId,
      stepKey: "completed",
      status: "completed",
      completedAt,
    };
    if (nextSession.format === "turnabout") {
      nextSession = withTurnaboutState(nextSession, {
        ...turnaboutState(nextSession),
        phase: "resolution",
        activeStatementId: null,
        floorOwnerBotId: null,
      });
    }
    return commitMutation(
      db,
      userId,
      session,
      nextSession,
      checked.idempotencyKey,
      [event],
    );
  }
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

function debatePauseAnnouncementEvent(session: DebateSessionV1): DebateEventV1 {
  const hardMuted = moderatorIsHardMuted(session);
  return makeEvent(session, {
    kind: hardMuted ? "silence" : "moderator_ruling",
    speakerKind: "moderator",
    speakerBotId: session.moderator.id,
    sideId: null,
    stepKey: "pause",
    content: hardMuted
      ? BOT_POWER_CANONICAL_SILENCE_V1
      : "This debate is now paused.",
  });
}

export function pauseDebateSession(
  db: DatabaseSync,
  userId: string,
  sessionId: string,
  request: { expectedRevision: number; idempotencyKey: string },
): DebateSessionV1 {
  const checked = assertMutation(db, userId, sessionId, request);
  if (checked.replay) return checked.replay;
  const session = checked.session;
  if (session.status === "completed" || session.status === "cancelled") {
    throw new HttpError(409, "This Debate is already finished.");
  }
  const pauseEvent = debatePauseAnnouncementEvent(session);
  return commitMutation(
    db,
    userId,
    session,
    { ...session, status: "paused" },
    checked.idempotencyKey,
    [pauseEvent],
  );
}

function skippedJuryDeliberationSession(
  session: DebateSessionV1,
): DebateSessionV1 {
  if (
    !session.jury.enabled ||
    !session.stepKey.startsWith("jury_deliberation_")
  ) {
    throw new HttpError(
      409,
      "Jury deliberation can only be skipped while the chamber is discussing the case.",
    );
  }
  const calledVoteAt = new Date().toISOString();
  return {
    ...session,
    stepKey: "jury_final_0",
    status: "live",
    jury: {
      ...session.jury,
      phase: "final_ballots",
      discussionTurnTarget: session.jury.discussionTurnCount,
      calledVoteAt,
    },
  };
}

export function skipDebateJuryDeliberation(
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
  const nextSession = skippedJuryDeliberationSession(session);
  const event = makeEvent(nextSession, {
    kind: "jury_deliberation",
    speakerKind: "system",
    stepKey: "jury_skip_deliberation",
    content:
      "The player skips the remaining Jury discussion. All five jurors proceed to final ballots.",
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
    session.jury.enabled &&
    session.stepKey.startsWith("jury_deliberation_")
  ) {
    const nextSession = skippedJuryDeliberationSession(session);
    const event = makeEvent(nextSession, {
      kind: "jury_deliberation",
      speakerKind: "system",
      stepKey: "jury_skip_deliberation",
      content:
        "The remaining Jury discussion is skipped. All five jurors proceed to final ballots.",
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
  if (
    session.phase === "verdict" ||
    session.stepKey.includes("verdict") ||
    session.stepKey.includes("ballot")
  ) {
    throw new HttpError(409, "This Debate is already concluding.");
  }

  const endedEarlyAt = new Date().toISOString();
  if (session.jury.enabled) {
    const nextSession = startJuryResolution(
      { ...session, endedEarlyAt },
      DEBATE_JURY_EARLY_DISCUSSION_TURNS,
    );
    const event = makeEvent(nextSession, {
      kind: "phase",
      speakerKind: "system",
      stepKey: "early_conclusion",
      content: `${earlyConclusionLead(nextSession)} The Jury will deliberate briefly from the limited ${debatePublicMaterialLabel(nextSession.formality)} and will not penalize either side for unheard rounds.`,
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
    content: `${earlyConclusionLead(nextSession)} ${
      session.playerRole === "judge"
        ? `The Judge must decide which side made the stronger case from the limited ${debatePublicMaterialLabel(nextSession.formality)} so far.`
        : `The panel will decide which side made the stronger case from the limited ${debatePublicMaterialLabel(nextSession.formality)} so far.`
    }`,
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
    if (session.status !== "paused")
      throw new HttpError(409, "This Debate is not paused.");
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
    throw new HttpError(
      409,
      "The quarantined Debate changed before it could be restored.",
    );
  }
  return restored;
}

export function debateStatementSourceIds(
  session: DebateSessionV1,
  content: string,
): string[] {
  return debateSourceIdsFromText(content, session.evidence);
}
