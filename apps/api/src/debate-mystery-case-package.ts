import { createHash, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  PORTABLE_CASE_PACKAGE_SCHEMA_V1,
  PORTABLE_MYSTERY_PACKAGE_FORMAT_MINOR_V1,
  canonicalPortablePackageJsonV1,
  portableMysteryPackageMajorIsSupportedV1,
  proceduralPortableCaseThumbnailV1,
  validateDebateMysteryDialogueGraphV2,
  validatePortableCasePackageManifestV1,
  type DebateWhodunnitFormatStateV2,
  type PortableCaseInstallationMetadataV1,
  type PortableCaseLibrarySummaryV1,
  type PortableCasePackageManifestV1,
  type PortableCasePackagePreviewV1,
  type PortableMysteryEncryptionModeV1,
  type PortablePackageJsonValueV1,
  type WhodunnitPackageCastSnapshotV1,
} from "@localai/shared";
import { unzipSync, zipSync } from "fflate";
import { getDebateSession } from "./debate.ts";
import {
  freezeDebateMysteryMansionSnapshotV2,
  getDebateMysteryMansionBundleV2,
  retainDebateMysteryMansionSnapshotAssetsV2,
} from "./debate-mystery-mansion-bundles.ts";
import { assertDebateMysteryMansionNotHeldByOngoingCaseV1 } from "./debate-mystery-mansion-archive-hold.ts";
import {
  inspectPortableMysteryEnvelopeHeaderV1,
  openPortableMysteryEnvelopeV1,
  sealPortableMysteryEnvelopeV1,
} from "./debate-mystery-package-envelope.ts";
import { preflightPortableMysteryArchiveV1 } from "./debate-mystery-package-safety.ts";
import { decryptBytes, encryptBytes } from "./security.ts";
import { HttpError } from "./utils.http.ts";
import {
  remapMysteryPersonaPairContextBotIdsV1,
  validateMysteryPersonaPairContextMapV1,
  type MysteryPersonaPairContextMapV1,
} from "./debate-mystery-persona-relationship.ts";

const MANIFEST_PATH = "manifest.json";
const MAX_CASE_ARCHIVE_BYTES = 32 * 1024 * 1024;
const FORBIDDEN_PUBLIC_KEYS = new Set([
  "sealedCulpritSeatId",
  "sealedAccompliceSeatId",
  "sealedResponsibleSeatIds",
  "responsibleSeatIds",
  "incidentPlan",
  "privateCase",
  "proofContract",
  "evidenceRoomIdById",
  "presentNodeIdBySuspectRecord",
  "prosecutorInternalReasoning",
  "personaPairContext",
]);
const FORBIDDEN_PACKAGE_KEYS = new Set([
  "userId",
  "user_id",
  "sourceTenantId",
  "apiKey",
  "openaiKey",
  "anthropicKey",
  "elevenlabsKey",
  "inputJson",
  "privateError",
  "provenanceBySection",
  "recoveryBySection",
  "authoringRecoveryBySection",
]);

export class PortableCasePackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortableCasePackageError";
  }
}

interface StoredCaseRow {
  id: string;
  source_session_id: string | null;
  title: string;
  description: string;
  story_tags_json: string;
  creator_name: string;
  difficulty: PortableCasePackageManifestV1["difficulty"];
  trial_type: PortableCasePackageManifestV1["trialType"];
  suspect_count: number;
  minimum_room_count: number;
  minimum_floor_count: number;
  thumbnail_json: string;
  manifest_ciphertext: Buffer;
  manifest_iv: Buffer;
  manifest_tag: Buffer;
  payload_sha256: string;
  portable_metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

interface PortableCasePublicMetadataV1 {
  description: string;
  storyTags: string[];
}

const LEGACY_CASE_DESCRIPTION = /^A certified reusable (?:casual|classic|mastermind) PRISM case for \d+ suspects?\.?$/iu;
const INCIDENT_STORY_TAGS: Readonly<Record<string, string>> = {
  homicide: "Homicide",
  theft: "Theft",
  fraud: "Fraud",
  sabotage: "Sabotage",
  espionage: "Espionage",
  disappearance: "Disappearance",
  blackmail: "Blackmail",
};
const CASE_STORY_TAG_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ["Disappearance", /\b(?:disappear\w*|missing|vanish\w*)\b/iu],
  ["Technology", /\b(?:algorithm|android|broadcast|digital|laborator\w*|prototype|quantum|radio|robot\w*|satellite|signal|transmission)\b/iu],
  ["Archive", /\b(?:archive|artifact|curator|gallery|library|manuscript|museum|painting|sculpture)\b/iu],
  ["Closed circle", /\b(?:blizzard|isolated|locked|sealed|snowed in|stormbound|trapped)\b/iu],
  ["Occult", /\b(?:curse\w*|ghost\w*|haunt\w*|occult|ritual|séance|seance)\b/iu],
  ["Masquerade", /\b(?:ball|costume\w*|mask\w*|masquerade)\b/iu],
  ["Political", /\b(?:ambassador|campaign|diplomat\w*|embassy|minister|politic\w*|senator)\b/iu],
  ["Maritime", /\b(?:coast|harbou?r|island|lighthouse|ocean|sea|ship)\b/iu],
  ["Transit", /\b(?:rail|station|train)\b/iu],
];

function optionalRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function publicCaseCharge(value: unknown): Record<string, unknown> | null {
  const publicCase = optionalRecord(value);
  const formatState = optionalRecord(publicCase?.formatState);
  return optionalRecord(formatState?.caseCharge);
}

function publicSynopsis(value: unknown, fallback: string): string {
  const prose = typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";
  if (!prose) return fallback;
  const sentences = prose.match(/[^.!?]+(?:[.!?]+|$)/gu)?.map((sentence) => sentence.trim()) ?? [prose];
  let synopsis = sentences[0] ?? prose;
  if (synopsis.length < 88 && sentences[1] && `${synopsis} ${sentences[1]}`.length <= 230) {
    synopsis = `${synopsis} ${sentences[1]}`;
  }
  if (synopsis.length <= 240) return synopsis;
  const clipped = synopsis.slice(0, 237).replace(/\s+\S*$/u, "").trimEnd();
  return `${clipped || synopsis.slice(0, 237)}…`;
}

function normalizeStoryTags(values: readonly unknown[]): string[] {
  const tags: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const tag = value.replace(/\s+/gu, " ").trim().slice(0, 32);
    if (!tag || tags.some((candidate) => candidate.toLocaleLowerCase() === tag.toLocaleLowerCase())) continue;
    tags.push(tag);
    if (tags.length === 4) break;
  }
  return tags;
}

function portableCasePublicMetadataV1(args: {
  title: string;
  description?: unknown;
  storyTags?: readonly unknown[];
  publicOpening?: unknown;
  caseCharge?: Record<string, unknown> | null;
}): PortableCasePublicMetadataV1 {
  const existingDescription = typeof args.description === "string" ? args.description.trim() : "";
  const fallbackDescription = existingDescription && !LEGACY_CASE_DESCRIPTION.test(existingDescription)
    ? existingDescription
    : `A closed-circle mystery whose public trail begins with ${args.title}.`;
  const description = publicSynopsis(args.publicOpening, fallbackDescription);
  const providedTags = normalizeStoryTags(args.storyTags ?? []);
  if (providedTags.length) return { description, storyTags: providedTags };

  const chargeKind = typeof args.caseCharge?.kind === "string" ? args.caseCharge.kind : "";
  const chargeSubject = typeof args.caseCharge?.subject === "string" ? args.caseCharge.subject : "";
  const storyText = `${args.title} ${description} ${chargeSubject}`;
  const derived = normalizeStoryTags([
    INCIDENT_STORY_TAGS[chargeKind],
    ...CASE_STORY_TAG_PATTERNS.filter(([, pattern]) => pattern.test(storyText)).map(([tag]) => tag),
  ]);
  return {
    description,
    storyTags: derived.length ? derived.slice(0, 3) : ["Closed circle"],
  };
}

function portableCaseManifestPublicMetadataV1(
  manifest: PortableCasePackageManifestV1,
): PortableCasePublicMetadataV1 {
  return portableCasePublicMetadataV1({
    title: manifest.title,
    description: manifest.description,
    storyTags: manifest.storyTags,
    publicOpening: manifest.privateCase.publicOpening,
    caseCharge: publicCaseCharge(manifest.publicCase),
  });
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function asJson(value: unknown): PortablePackageJsonValueV1 {
  return JSON.parse(JSON.stringify(value)) as PortablePackageJsonValueV1;
}

function asRecord(value: unknown, label: string): Record<string, PortablePackageJsonValueV1> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PortableCasePackageError(`${label} is invalid.`);
  }
  return value as Record<string, PortablePackageJsonValueV1>;
}

function replaceStrings(
  value: PortablePackageJsonValueV1,
  replacements: ReadonlyMap<string, string>,
): PortablePackageJsonValueV1 {
  const replaceString = (source: string): string => {
    const exact = replacements.get(source);
    if (exact) return exact;
    let result = source;
    for (const [from, to] of [...replacements.entries()]
      .filter(([from]) => Boolean(from))
      .sort((left, right) => right[0].length - left[0].length)) {
      if (result.includes(from)) result = result.split(from).join(to);
    }
    return result;
  };
  if (typeof value === "string") return replaceString(value);
  if (Array.isArray(value)) return value.map((entry) => replaceStrings(entry, replacements));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
    replaceString(key),
    replaceStrings(entry, replacements),
  ]));
}

function deepForbiddenKeys(
  value: unknown,
  forbidden: ReadonlySet<string>,
  path = "value",
): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => deepForbiddenKeys(entry, forbidden, `${path}[${index}]`));
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, entry]) => [
    ...(forbidden.has(key) ? [`${path}.${key}`] : []),
    ...deepForbiddenKeys(entry, forbidden, `${path}.${key}`),
  ]);
}

function portablePrivateCaseCastBotIdsV1(
  privateCase: Record<string, PortablePackageJsonValueV1>,
): Set<string> {
  const config = privateCase.config &&
      typeof privateCase.config === "object" &&
      !Array.isArray(privateCase.config)
    ? privateCase.config
    : null;
  if (!config) return new Set();
  const singleIds = [
    config.prosecutorBotId,
    config.rivalDefenseBotId,
    config.judgeBotId,
  ];
  const listIds = [
    config.suspectBotIds,
    config.jurorBotIds,
  ];
  return new Set([
    ...singleIds.filter((value): value is string => typeof value === "string"),
    ...listIds.flatMap((value) =>
      Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string")
        : []
    ),
  ]);
}

function validateCaseManifest(manifest: PortableCasePackageManifestV1): void {
  const errors = validatePortableCasePackageManifestV1(manifest);
  if (!portableMysteryPackageMajorIsSupportedV1(manifest.compatibility)) {
    errors.push("Case package format is not supported.");
  }
  const publicLeaks = deepForbiddenKeys(manifest.publicCase, FORBIDDEN_PUBLIC_KEYS, "manifest.publicCase");
  const packageLeaks = deepForbiddenKeys(manifest, FORBIDDEN_PACKAGE_KEYS, "manifest");
  errors.push(...publicLeaks, ...packageLeaks);
  const privateCase = manifest.privateCase;
  const actorAccounts = Array.isArray(privateCase.actorAccounts)
    ? privateCase.actorAccounts as Array<{ seatId?: unknown }>
    : [];
  const recordItems = Array.isArray(privateCase.recordItems)
    ? privateCase.recordItems as Array<{ reference?: unknown }>
    : [];
  const config = privateCase.config && typeof privateCase.config === "object" &&
      !Array.isArray(privateCase.config)
    ? privateCase.config as Record<string, unknown>
    : undefined;
  if (privateCase.personaPairContext) {
    try {
      validateMysteryPersonaPairContextMapV1(
        privateCase.personaPairContext,
        portablePrivateCaseCastBotIdsV1(privateCase),
      );
    } catch {
      errors.push("Private persona pair context is invalid.");
    }
  }
  const graphValidation = validateDebateMysteryDialogueGraphV2({
    graph: manifest.dialogueGraph as unknown as Parameters<typeof validateDebateMysteryDialogueGraphV2>[0]["graph"],
    suspectSeatIds: actorAccounts.flatMap((entry) =>
      typeof entry.seatId === "string" ? [entry.seatId] : []),
    recordReferences: recordItems.flatMap((entry) =>
      entry.reference && typeof entry.reference === "object"
        ? [entry.reference as Parameters<typeof validateDebateMysteryDialogueGraphV2>[0]["recordReferences"][number]]
        : []),
    playerRole: config?.playerRole === "spectator" ? "spectator" : "participant",
    prosecutorBotId: typeof config?.prosecutorBotId === "string"
      ? config.prosecutorBotId
      : null,
    directRecipientContractVersion: privateCase.personaPairContext ? 1 : null,
    rivalDefenseBotId: typeof config?.rivalDefenseBotId === "string"
      ? config.rivalDefenseBotId
      : null,
    roomIds: manifest.mansionRequirements.rooms.map((room) => room.id),
    personIds: Array.isArray(privateCase.investigationPersonIds)
      ? privateCase.investigationPersonIds.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : undefined,
    hotspotIdsByRoom:
      privateCase.investigationHotspotIdsByRoom as Record<string, string[]> | undefined,
    eyewitnessSeatId: typeof privateCase.eyewitnessSeatId === "string"
      ? privateCase.eyewitnessSeatId
      : null,
    accusedAlibiSupportDiscoveryIds: Array.isArray(privateCase.accusedAlibiSupportDiscoveryIds)
      ? privateCase.accusedAlibiSupportDiscoveryIds.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
    defenseFrame: portableDefenseFrameValidationV1(privateCase, config),
  });
  if (!graphValidation.valid) errors.push("Case dialogue graph is not playable.");
  const privateCanonical = canonicalPortablePackageJsonV1(asJson(manifest.privateCase));
  const graphCanonical = canonicalPortablePackageJsonV1(asJson(manifest.dialogueGraph));
  if (sha256(privateCanonical) !== manifest.certification.caseHash) {
    errors.push("Case truth integrity failed.");
  }
  if (sha256(graphCanonical) !== manifest.certification.graphHash) {
    errors.push("Case dialogue integrity failed.");
  }
  if (errors.length) throw new PortableCasePackageError(errors.join("\n"));
}

export function encodeInternalCasePackageV1(
  manifest: PortableCasePackageManifestV1,
): Uint8Array {
  validateCaseManifest(manifest);
  const archive = zipSync({
    [MANIFEST_PATH]: new TextEncoder().encode(
      canonicalPortablePackageJsonV1(asJson(manifest)),
    ),
  }, { level: 9 });
  if (archive.byteLength > MAX_CASE_ARCHIVE_BYTES) {
    throw new PortableCasePackageError("Case archive is too large.");
  }
  return archive;
}

export function decodeInternalCasePackageV1(
  archive: Uint8Array,
): PortableCasePackageManifestV1 {
  if (!(archive instanceof Uint8Array) || archive.byteLength < 1 ||
      archive.byteLength > MAX_CASE_ARCHIVE_BYTES) {
    throw new PortableCasePackageError("Case archive is empty or too large.");
  }
  preflightPortableMysteryArchiveV1(archive);
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(archive);
  } catch {
    throw new PortableCasePackageError("Case archive could not be decoded.");
  }
  if (Object.keys(entries).some((path) => path !== MANIFEST_PATH)) {
    throw new PortableCasePackageError("Case archives cannot contain executable or presentation assets.");
  }
  const raw = entries[MANIFEST_PATH];
  if (!raw) throw new PortableCasePackageError("Case manifest is missing.");
  let manifest: PortableCasePackageManifestV1;
  try {
    manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)) as PortableCasePackageManifestV1;
  } catch {
    throw new PortableCasePackageError("Case manifest is invalid JSON.");
  }
  validateCaseManifest(manifest);
  return manifest;
}

function sanitizeBotSnapshots(value: PortablePackageJsonValueV1): PortablePackageJsonValueV1 {
  if (Array.isArray(value)) return value.map(sanitizeBotSnapshots);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, PortablePackageJsonValueV1> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "systemPrompt") continue;
    if (key === "provider") result[key] = "local";
    else if (key === "model") result[key] = "portable-case-v1";
    else if (key === "imageId") result[key] = null;
    else result[key] = sanitizeBotSnapshots(entry);
  }
  return result;
}

function collectCast(
  session: Record<string, PortablePackageJsonValueV1>,
): WhodunnitPackageCastSnapshotV1[] {
  const found = new Map<string, WhodunnitPackageCastSnapshotV1>();
  const visit = (value: PortablePackageJsonValueV1): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const id = typeof value.id === "string"
      ? value.id
      : typeof value.botId === "string" ? value.botId : null;
    const name = typeof value.name === "string" ? value.name : null;
    if (id && name && (
      "voiceProfile" in value || "avatarDetails" in value ||
      "faceStyle" in value || "role" in value
    )) {
      found.set(id, { id, name, presentation: value, voiceId: id });
    }
    Object.values(value).forEach(visit);
  };
  visit(session);
  return [...found.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function proofContract(
  privateCase: Record<string, PortablePackageJsonValueV1>,
): Record<string, PortablePackageJsonValueV1> {
  const keys = [
    "sealedCulpritSeatId", "sealedAccompliceSeatId", "sealedResponsibleSeatIds",
    "motive", "method", "eyewitnessSeatId", "eyewitnessResolution",
    "accusedAlibiSupportDiscoveryIds", "defenseFrame", "contradictionSemanticContractVersion",
    "graphValidation",
  ];
  return Object.fromEntries(keys.filter((key) => key in privateCase).map((key) => [key, privateCase[key]!]));
}

/** Defense-stance validator input from a portable private case; null for prosecution cases. */
function portableDefenseFrameValidationV1(
  privateCase: Record<string, PortablePackageJsonValueV1>,
  config: Record<string, unknown> | undefined,
): Parameters<typeof validateDebateMysteryDialogueGraphV2>[0]["defenseFrame"] {
  const frame = privateCase.defenseFrame;
  if (!frame || typeof frame !== "object" || Array.isArray(frame)) return null;
  const record = frame as Record<string, unknown>;
  const defendantSeatId =
    typeof record.defendantSeatId === "string" ? record.defendantSeatId.trim() : "";
  if (!defendantSeatId) return null;
  return {
    defendantSeatId,
    frameEvidenceId: typeof record.frameEvidenceId === "string" ? record.frameEvidenceId : null,
    alibiSupportDiscoveryIds: Array.isArray(record.alibiSupportDiscoveryIds)
      ? record.alibiSupportDiscoveryIds.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
    investigation: config?.investigationMode !== "court_only",
  };
}

function evidenceAssignments(
  privateCase: Record<string, PortablePackageJsonValueV1>,
): Record<string, PortablePackageJsonValueV1> {
  const keys = [
    "recordItems", "evidenceRoomIdById", "examineNodeIdByHotspot",
    "presentNodeIdBySuspectRecord", "defaultPresentNodeIdBySuspect",
    "crimeSceneRoomId", "investigationRoomIds", "investigationHotspotIdsByRoom",
  ];
  return Object.fromEntries(keys.filter((key) => key in privateCase).map((key) => [key, privateCase[key]!]));
}

function resetPublicCase(
  state: Record<string, PortablePackageJsonValueV1>,
): Record<string, PortablePackageJsonValueV1> {
  const config = asRecord(asJson(state.config), "Case config");
  const rooms = Array.isArray(state.rooms) ? state.rooms.map((value) => {
    const room = asRecord(asJson(value), "Case room");
    return {
      ...room,
      imageId: null,
      sealedAsset: null,
      accessState: room.id === state.crimeSceneRoomId ? "ready_to_enter" : "hidden",
      unlocked: room.id === state.crimeSceneRoomId,
      visited: false,
      hotspots: Array.isArray(room.hotspots) ? room.hotspots.map((hotspotValue) => {
        const hotspot = asRecord(asJson(hotspotValue), "Case hotspot");
        return { ...hotspot, examined: false };
      }) : [],
    };
  }) : [];
  const compilation = asRecord(asJson(state.compilation), "Compilation state");
  return asRecord(asJson({
    ...state,
    playPhase: "title_card",
    config: {
      ...config,
      // Packages written before the stance flag are prosecution cases.
      playerStance: config.playerStance === "defense" ? "defense" : "prosecution",
      mansionBundleId: null,
      mansionSnapshot: null,
      assetSynthesis: {
        evidence: false,
        rooms: false,
        illustratedRooms: false,
        music: false,
        ambience: false,
      },
    },
    compilation: {
      ...compilation,
      jobId: "portable-case-job",
      stage: "complete",
      retryable: false,
      publicFailureCode: null,
      publicFailureStage: null,
      spoilerSafeMessage: "Reusable case logic is ready for assembly",
    },
    rooms,
    mansionExterior: null,
    currentRoomId: state.crimeSceneRoomId ?? null,
    roomView: "mansion",
    metSuspectSeatIds: [],
    discoveryIds: Array.isArray(state.discoveryIds) ? state.discoveryIds : [],
    record: Array.isArray(state.record) ? state.record : [],
    topics: Array.isArray(state.topics) ? state.topics : [],
    dialogueHistory: [],
    activeDialogueNodeId: null,
    theoryAvailable: false,
    theory: null,
    theoryFiledAt: null,
    court: null,
    verdict: null,
    caseCheck: null,
    publicActions: [],
    publicActionHistoryComplete: true,
    calloutHistory: [],
    pendingCallout: null,
    pendingProsecutionChoice: null,
    audioReady: false,
    voicesEnabled: false,
    localAudioFailure: null,
  }), "Reset public case");
}

export function portableCaseManifestFromSessionV1(args: {
  db: DatabaseSync;
  userId: string;
  sessionId: string;
  prismVersion: string;
  creatorName?: string;
  /** Compatibility input used only by a complete .whodunnit export whose
   * early compiled checkpoint predates public room projections. */
  mansionRooms?: PortablePackageJsonValueV1[];
}): PortableCasePackageManifestV1 {
  const sourceSession = getDebateSession(args.db, args.userId, args.sessionId);
  if (
    sourceSession.formatState.format !== "whodunnit" ||
    sourceSession.formatState.version !== 2 ||
    sourceSession.formatState.config.investigationMode !== "full" ||
    !sourceSession.formatState.theoryFiledAt ||
    (sourceSession.formatState.playPhase !== "trial" &&
      sourceSession.formatState.playPhase !== "verdict")
  ) {
    throw new PortableCasePackageError(
      "A reusable case can be exported only after its mansion investigation is complete.",
    );
  }
  const row = args.db.prepare(
    `SELECT private_case_json, dialogue_graph_json, case_hash, graph_hash, validation_json
       FROM debate_mystery_v2_cases WHERE session_id = ? AND user_id = ?`,
  ).get(args.sessionId, args.userId) as {
    private_case_json: string;
    dialogue_graph_json: string;
    case_hash: string;
    graph_hash: string;
    validation_json: string;
  } | undefined;
  const job = args.db.prepare(
    `SELECT status, checkpoint_json FROM debate_mystery_v2_jobs
      WHERE session_id = ? AND user_id = ?`,
  ).get(args.sessionId, args.userId) as {
    status: string;
    checkpoint_json: string | null;
  } | undefined;
  if (!row || job?.status !== "complete" || !job.checkpoint_json ||
      sha256(row.private_case_json) !== row.case_hash ||
      sha256(row.dialogue_graph_json) !== row.graph_hash) {
    throw new PortableCasePackageError("The certified sealed case is unavailable or corrupted.");
  }
  const checkpoint = asRecord(JSON.parse(job.checkpoint_json), "Compiled checkpoint");
  const checkpointPublic = asRecord(checkpoint.publicState, "Compiled public state");
  const completedPublic = asRecord(asJson(sourceSession.formatState), "Completed public state");
  const frozenMansionRooms = sourceSession.formatState.config.mansionSnapshot?.rooms ?? [];
  const reusableMansionRooms = args.mansionRooms?.length
    ? args.mansionRooms
    : frozenMansionRooms.map((room) => asJson(room));
  const fallbackRooms: Array<Record<string, PortablePackageJsonValueV1>> =
    reusableMansionRooms.map((entry) => {
    const room = asRecord(asJson(entry), "Fallback mansion room");
    return asRecord(asJson({
      ...room,
      imageId: room.imageId ?? null,
      bundledAssetPath: room.bundledAssetPath ?? null,
      sealedAsset: null,
      accessState: "hidden",
      unlocked: false,
      visited: false,
      hotspots: [],
    }), "Fallback public room");
  });
  // Early V2 checkpoints did not always carry the room/suspect projection.
  // Recover those public identities from the completed session while keeping
  // all discovery/progress arrays anchored to the clean checkpoint.
  const sourcePublic = asRecord(asJson({
    ...checkpointPublic,
    rooms: Array.isArray(checkpointPublic.rooms) && checkpointPublic.rooms.length
      ? checkpointPublic.rooms
      : Array.isArray(completedPublic.rooms) && completedPublic.rooms.length
        ? completedPublic.rooms
        : fallbackRooms,
    suspects: Array.isArray(checkpointPublic.suspects) && checkpointPublic.suspects.length
      ? checkpointPublic.suspects
      : completedPublic.suspects,
    crimeSceneRoomId: checkpointPublic.crimeSceneRoomId ?? completedPublic.crimeSceneRoomId ??
      (fallbackRooms.find((room) => !room["assignedSuspectSeatId"])?.["id"] ??
        fallbackRooms[0]?.["id"] ?? null),
  }), "Reusable public state");
  const sourcePrivate = asRecord(JSON.parse(row.private_case_json), "Private case");
  const sourcePersonaPairContext = sourcePrivate.personaPairContext
    ? validateMysteryPersonaPairContextMapV1(sourcePrivate.personaPairContext)
    : null;
  const sourceGraph = asRecord(JSON.parse(row.dialogue_graph_json), "Dialogue graph");
  const sourceRooms = Array.isArray(sourcePublic.rooms)
    ? sourcePublic.rooms.map((value) => asRecord(value, "Compiled room"))
    : [];
  const sourceSuspects = Array.isArray(sourcePublic.suspects)
    ? sourcePublic.suspects.map((value) => asRecord(value, "Compiled suspect"))
    : [];
  if (!sourceRooms.length || !sourceSuspects.length) {
    throw new PortableCasePackageError(
      `The certified case has no reusable mansion requirements (${sourceRooms.length} rooms, ${sourceSuspects.length} suspects).`,
    );
  }
  const packageId = randomUUID();
  const roomReplacements = new Map<string, string>();
  sourceRooms.forEach((room, index) => {
    if (typeof room.id !== "string") throw new PortableCasePackageError("A compiled room has no identity.");
    roomReplacements.set(room.id, `case-room-${String(index + 1).padStart(2, "0")}`);
  });
  const sourceCast = collectCast(asRecord(asJson(sourceSession), "Source cast"));
  sourceCast.forEach((entry, index) => {
    if (entry.id !== "prism:player-judge") {
      roomReplacements.set(entry.id, `portable-case-bot-${String(index + 1).padStart(2, "0")}`);
    }
  });
  const normalizedPublic = asRecord(
    replaceStrings(asJson(resetPublicCase(sourcePublic)), roomReplacements),
    "Portable public case",
  );
  const normalizedPrivate = asRecord(
    replaceStrings(asJson(sourcePrivate), roomReplacements),
    "Portable private case",
  );
  if (sourcePersonaPairContext) {
    normalizedPrivate.personaPairContext = asJson(
      remapMysteryPersonaPairContextBotIdsV1(
        sourcePersonaPairContext,
        roomReplacements,
      ),
    );
  }
  const normalizedGraph = asRecord(
    replaceStrings(asJson(sourceGraph), roomReplacements),
    "Portable dialogue graph",
  );
  for (const holder of [normalizedPrivate]) {
    delete holder.authoringRecoveryBySection;
    const config = holder.config;
    if (config && typeof config === "object" && !Array.isArray(config)) {
      config.mansionBundleId = null;
      config.mansionSnapshot = null;
    }
    if (Array.isArray(holder.recordItems)) {
      holder.recordItems = holder.recordItems.map((value) => {
        const item = asRecord(value, "Portable record item");
        return { ...item, imageId: null, sealedAsset: null };
      });
    }
  }
  let fallbackSuspectIndex = 0;
  const requirementRooms = sourceRooms.map((room, index) => {
    const id = `case-room-${String(index + 1).padStart(2, "0")}`;
    const suspect = sourceSuspects.find((candidate) => candidate.roomId === room.id) ??
      (room.assignedSuspectSeatId ? sourceSuspects[fallbackSuspectIndex++] : undefined);
    return {
      id,
      role: room.id === sourcePublic.crimeSceneRoomId
        ? "crime_scene" as const
        : suspect ? "suspect" as const : "search" as const,
      templateId: typeof room.templateId === "string" ? room.templateId : "unknown",
      suspectSeatId: suspect && typeof suspect.seatId === "string" ? suspect.seatId : null,
      hotspotCount: Array.isArray(room.hotspots) ? Math.max(1, room.hotspots.length) : 1,
    };
  });
  const normalizedPrivateCanonical = canonicalPortablePackageJsonV1(asJson(normalizedPrivate));
  const normalizedGraphCanonical = canonicalPortablePackageJsonV1(asJson(normalizedGraph));
  const difficulty = sourceSession.formatState.config.difficulty;
  const normalizedActorAccounts = Array.isArray(normalizedPrivate.actorAccounts)
    ? normalizedPrivate.actorAccounts as Array<{ seatId?: unknown }>
    : [];
  const normalizedRecordItems = Array.isArray(normalizedPrivate.recordItems)
    ? normalizedPrivate.recordItems as Array<{ reference?: unknown }>
    : [];
  const normalizedConfig = normalizedPrivate.config && typeof normalizedPrivate.config === "object" &&
      !Array.isArray(normalizedPrivate.config)
    ? normalizedPrivate.config as Record<string, unknown>
    : undefined;
  const graphValidation = validateDebateMysteryDialogueGraphV2({
    graph: normalizedGraph as unknown as Parameters<typeof validateDebateMysteryDialogueGraphV2>[0]["graph"],
    suspectSeatIds: normalizedActorAccounts.flatMap((entry) =>
      typeof entry.seatId === "string" ? [entry.seatId] : []),
    recordReferences: normalizedRecordItems.flatMap((entry) =>
      entry.reference && typeof entry.reference === "object"
        ? [entry.reference as Parameters<typeof validateDebateMysteryDialogueGraphV2>[0]["recordReferences"][number]]
        : []),
    playerRole: normalizedConfig?.playerRole === "spectator" ? "spectator" : "participant",
    prosecutorBotId: typeof normalizedConfig?.prosecutorBotId === "string"
      ? normalizedConfig.prosecutorBotId
      : null,
    directRecipientContractVersion: normalizedPrivate.personaPairContext
      ? 1
      : null,
    rivalDefenseBotId: typeof normalizedConfig?.rivalDefenseBotId === "string"
      ? normalizedConfig.rivalDefenseBotId
      : null,
    roomIds: requirementRooms.map((room) => room.id),
    personIds: Array.isArray(normalizedPrivate.investigationPersonIds)
      ? normalizedPrivate.investigationPersonIds.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
    hotspotIdsByRoom:
      normalizedPrivate.investigationHotspotIdsByRoom as Record<string, string[]> | undefined,
    eyewitnessSeatId: typeof normalizedPrivate.eyewitnessSeatId === "string"
      ? normalizedPrivate.eyewitnessSeatId
      : null,
    accusedAlibiSupportDiscoveryIds: Array.isArray(normalizedPrivate.accusedAlibiSupportDiscoveryIds)
      ? normalizedPrivate.accusedAlibiSupportDiscoveryIds.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
    defenseFrame: portableDefenseFrameValidationV1(normalizedPrivate, normalizedConfig),
  });
  if (!graphValidation.valid) {
    throw new PortableCasePackageError("The certified case dialogue graph is not reusable.");
  }
  const portableSession = asRecord(sanitizeBotSnapshots(replaceStrings(asJson({
    ...sourceSession,
    id: "portable-case-session",
    revision: 0,
    status: "waiting_for_player",
    phase: "opening",
    stepKey: "mystery_v2_title",
    provider: "local",
    model: "portable-case-v1",
    responseMode: "local",
    modelSelectionKind: "fixed",
    autoCandidateAllowlist: [],
    generationChain: [],
    formatState: normalizedPublic,
    events: [],
    caseBoard: [],
    ballots: [],
    playerVerdict: null,
    winnerSideId: null,
    error: null,
    endedEarlyAt: null,
    completedAt: null,
    synopsis: null,
    liveBake: null,
  }), roomReplacements)), "Portable case session");
  const title = sourceSession.formatState.caseTitle ?? "PRISM Case";
  const publicMetadata = portableCasePublicMetadataV1({
    title,
    publicOpening: normalizedPrivate.publicOpening,
    caseCharge: optionalRecord(sourceSession.formatState.caseCharge),
  });
  const manifest: PortableCasePackageManifestV1 = {
    schema: PORTABLE_CASE_PACKAGE_SCHEMA_V1,
    formatVersion: { major: 1, minor: PORTABLE_MYSTERY_PACKAGE_FORMAT_MINOR_V1 },
    packageId,
    title,
    description: publicMetadata.description,
    storyTags: publicMetadata.storyTags,
    creator: { name: args.creatorName?.trim() || "PRISM player", id: null, url: null },
    provenance: {
      createdAt: new Date().toISOString(),
      prismVersion: args.prismVersion,
      generatedWith: ["PRISM Case Forge", "certified investigation"],
    },
    license: { name: "Private share", url: null, allowsRedistribution: true },
    contentWarnings: [],
    compatibility: { minimumFormatMajor: 1, maximumFormatMajor: 1, minimumPrismVersion: args.prismVersion },
    difficulty,
    trialType: sourceSession.formatState.config.trialType,
    investigationMode: "full",
    thumbnail: proceduralPortableCaseThumbnailV1(`case-${packageId}`),
    mansionRequirements: {
      version: 1,
      suspectCount: sourceSuspects.length,
      minimumRoomCount: sourceRooms.length,
      minimumFloorCount: Math.max(1, ...sourceRooms.map((room) =>
        typeof room.floor === "number" ? room.floor : 1)),
      rooms: requirementRooms,
    },
    certification: {
      version: 1,
      investigationCompletedAt: sourceSession.formatState.theoryFiledAt,
      caseHash: sha256(normalizedPrivateCanonical),
      graphHash: sha256(normalizedGraphCanonical),
      graphValid: true,
      validatorVersion: 1,
    },
    cast: collectCast(portableSession),
    publicCase: portableSession,
    privateCase: normalizedPrivate,
    proofContract: proofContract(normalizedPrivate),
    dialogueGraph: normalizedGraph,
    court: asRecord(asJson(normalizedGraph.witnessChapters ? {
      witnessChapters: normalizedGraph.witnessChapters,
      prosecutionChoices: normalizedGraph.prosecutionChoices ?? [],
      verdictNodeIds: normalizedGraph.verdictNodeIds ?? [],
    } : {}), "Portable court"),
    evidenceAssignments: evidenceAssignments(normalizedPrivate),
  };
  validateCaseManifest(manifest);
  return manifest;
}

export function exportPortableCasePackageV1(args: {
  db: DatabaseSync;
  userId: string;
  sessionId: string;
  prismVersion: string;
  creatorName?: string;
  mansionRooms?: PortablePackageJsonValueV1[];
  mode?: PortableMysteryEncryptionModeV1;
  password?: string;
}): Uint8Array {
  const manifest = portableCaseManifestFromSessionV1(args);
  const payload = encodeInternalCasePackageV1(manifest);
  const preflight = preflightPortableMysteryArchiveV1(payload);
  return sealPortableMysteryEnvelopeV1({
    payload,
    mode: args.mode ?? "spoiler_seal",
    password: args.password,
    metadata: {
      packageType: "case",
      title: manifest.title,
      creatorName: manifest.creator.name,
      compatibility: manifest.compatibility,
      expandedBytes: preflight.expandedBytes,
      assetCount: 0,
      contentWarnings: manifest.contentWarnings,
    },
  });
}

export function inspectPortableCasePackageV1(envelope: Uint8Array) {
  const header = inspectPortableMysteryEnvelopeHeaderV1(envelope);
  if (header.packageType !== "case") throw new PortableCasePackageError("This package is not a reusable case.");
  return header;
}

function openPortableCasePackageV1(args: {
  envelope: Uint8Array;
  password?: string;
}): { header: ReturnType<typeof inspectPortableCasePackageV1>; manifest: PortableCasePackageManifestV1 } {
  const opened = openPortableMysteryEnvelopeV1(args);
  if (opened.header.packageType !== "case") throw new PortableCasePackageError("This package is not a reusable case.");
  const preflight = preflightPortableMysteryArchiveV1(opened.payload);
  const manifest = decodeInternalCasePackageV1(opened.payload);
  if (
    opened.header.expandedBytes !== preflight.expandedBytes ||
    opened.header.assetCount !== 0 ||
    preflight.entryCount !== 1 ||
    opened.header.title !== manifest.title ||
    opened.header.creatorName !== manifest.creator.name ||
    JSON.stringify(opened.header.compatibility) !== JSON.stringify(manifest.compatibility) ||
    JSON.stringify(opened.header.contentWarnings) !== JSON.stringify(manifest.contentWarnings)
  ) throw new PortableCasePackageError("Package header does not match its authenticated contents.");
  return { header: opened.header, manifest };
}

function storedPortableMetadata(value: string | null): PortableCaseInstallationMetadataV1 | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as PortableCaseInstallationMetadataV1;
  } catch {
    return null;
  }
}

function storedStoryTags(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? normalizeStoryTags(parsed) : [];
  } catch {
    return [];
  }
}

function storedCaseManifest(
  row: StoredCaseRow,
  userKey: Buffer,
): PortableCasePackageManifestV1 | null {
  try {
    const manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(
      decryptBytes({
        ciphertext: row.manifest_ciphertext,
        iv: row.manifest_iv,
        tag: row.manifest_tag,
      }, userKey),
    )) as PortableCasePackageManifestV1;
    validateCaseManifest(manifest);
    return manifest;
  } catch {
    return null;
  }
}

function summary(
  row: StoredCaseRow,
  publicMetadata?: PortableCasePublicMetadataV1,
): PortableCaseLibrarySummaryV1 {
  return {
    id: row.id,
    title: row.title,
    description: publicMetadata?.description ?? row.description,
    storyTags: publicMetadata?.storyTags ?? storedStoryTags(row.story_tags_json),
    creatorName: row.creator_name,
    difficulty: row.difficulty,
    trialType: row.trial_type,
    suspectCount: row.suspect_count,
    minimumRoomCount: row.minimum_room_count,
    minimumFloorCount: row.minimum_floor_count,
    thumbnail: JSON.parse(row.thumbnail_json) as PortableCaseLibrarySummaryV1["thumbnail"],
    portable: storedPortableMetadata(row.portable_metadata_json),
    sourceSessionId: row.source_session_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const CASE_ROW_COLUMNS = `id, source_session_id, title, description, story_tags_json, creator_name,
  difficulty, trial_type, suspect_count, minimum_room_count, minimum_floor_count,
  thumbnail_json, manifest_ciphertext, manifest_iv, manifest_tag, payload_sha256,
  portable_metadata_json, created_at, updated_at`;

export function listPortableCaseLibraryV1(
  db: DatabaseSync,
  userKey: Buffer,
  userId: string,
): PortableCaseLibrarySummaryV1[] {
  const rows = db.prepare(
    `SELECT ${CASE_ROW_COLUMNS} FROM debate_mystery_case_packages
      WHERE user_id = ? ORDER BY updated_at DESC`,
  ).all(userId) as unknown as StoredCaseRow[];
  return rows.map((row) => {
    const storedTags = storedStoryTags(row.story_tags_json);
    if (storedTags.length && !LEGACY_CASE_DESCRIPTION.test(row.description)) return summary(row);
    const manifest = storedCaseManifest(row, userKey);
    return summary(row, manifest ? portableCaseManifestPublicMetadataV1(manifest) : undefined);
  });
}

export function previewPortableCasePackageV1(args: {
  db: DatabaseSync;
  userId: string;
  envelope: Uint8Array;
  password?: string;
}): PortableCasePackagePreviewV1 {
  const { header, manifest } = openPortableCasePackageV1(args);
  const publicMetadata = portableCaseManifestPublicMetadataV1(manifest);
  const duplicate = args.db.prepare(
    "SELECT id FROM debate_mystery_case_packages WHERE user_id = ? AND payload_sha256 = ?",
  ).get(args.userId, header.payloadSha256) as { id: string } | undefined;
  return {
    title: manifest.title,
    description: publicMetadata.description,
    storyTags: publicMetadata.storyTags,
    creatorName: manifest.creator.name,
    difficulty: manifest.difficulty,
    trialType: manifest.trialType,
    suspectCount: manifest.mansionRequirements.suspectCount,
    minimumRoomCount: manifest.mansionRequirements.minimumRoomCount,
    minimumFloorCount: manifest.mansionRequirements.minimumFloorCount,
    thumbnail: manifest.thumbnail,
    provenance: manifest.provenance,
    license: manifest.license,
    duplicateCaseId: duplicate?.id ?? null,
  };
}

export function importPortableCasePackageV1(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  envelope: Uint8Array;
  password?: string;
}): PortableCaseLibrarySummaryV1 {
  const { header, manifest } = openPortableCasePackageV1(args);
  const duplicate = args.db.prepare(
    `SELECT ${CASE_ROW_COLUMNS} FROM debate_mystery_case_packages
      WHERE user_id = ? AND payload_sha256 = ?`,
  ).get(args.userId, header.payloadSha256) as StoredCaseRow | undefined;
  const publicMetadata = portableCaseManifestPublicMetadataV1(manifest);
  if (duplicate) return summary(duplicate, publicMetadata);
  const id = randomUUID();
  const now = new Date().toISOString();
  const encrypted = encryptBytes(
    Buffer.from(canonicalPortablePackageJsonV1(asJson(manifest)), "utf8"),
    args.userKey,
  );
  const portable: PortableCaseInstallationMetadataV1 = {
    packageId: manifest.packageId,
    payloadSha256: header.payloadSha256,
    encryptionMode: header.encryptionMode,
    creatorSignature: header.creatorSignature,
    creator: manifest.creator,
    provenance: manifest.provenance,
    license: manifest.license,
    contentWarnings: manifest.contentWarnings,
  };
  args.db.prepare(
    `INSERT INTO debate_mystery_case_packages
       (id, user_id, source_session_id, title, description, story_tags_json, creator_name,
        difficulty, trial_type, suspect_count, minimum_room_count, minimum_floor_count,
        thumbnail_json, manifest_ciphertext, manifest_iv, manifest_tag,
        payload_sha256, portable_metadata_json, created_at, updated_at)
     VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id, args.userId, manifest.title, publicMetadata.description,
    JSON.stringify(publicMetadata.storyTags), manifest.creator.name,
    manifest.difficulty, manifest.trialType, manifest.mansionRequirements.suspectCount,
    manifest.mansionRequirements.minimumRoomCount,
    manifest.mansionRequirements.minimumFloorCount,
    JSON.stringify(manifest.thumbnail), encrypted.ciphertext, encrypted.iv, encrypted.tag,
    header.payloadSha256, JSON.stringify(portable), now, now,
  );
  const row = args.db.prepare(
    `SELECT ${CASE_ROW_COLUMNS} FROM debate_mystery_case_packages
      WHERE id = ? AND user_id = ?`,
  ).get(id, args.userId) as unknown as StoredCaseRow;
  return summary(row, publicMetadata);
}

export function portableCaseManifestForLibraryIdV1(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  caseId: string;
}): PortableCasePackageManifestV1 {
  const row = args.db.prepare(
    `SELECT ${CASE_ROW_COLUMNS} FROM debate_mystery_case_packages
      WHERE id = ? AND user_id = ?`,
  ).get(args.caseId, args.userId) as StoredCaseRow | undefined;
  if (!row) throw new HttpError(404, "That reusable case was not found.");
  const manifest = storedCaseManifest(row, args.userKey);
  if (!manifest) {
    throw new PortableCasePackageError("The installed case could not be opened.");
  }
  return manifest;
}

export function deletePortableCaseLibraryV1(
  db: DatabaseSync,
  userId: string,
  caseId: string,
): void {
  const result = db.prepare(
    "DELETE FROM debate_mystery_case_packages WHERE id = ? AND user_id = ?",
  ).run(caseId, userId);
  if (result.changes < 1) throw new HttpError(404, "That reusable case was not found.");
}

export function assemblePortableCasePackageV1(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  caseId: string;
  mansionBundleId: string;
  idempotencyKey: string;
}): { sessionId: string; mansionBundleId: string } {
  const stableKey = args.idempotencyKey.trim().slice(0, 200);
  if (!stableKey) throw new HttpError(400, "A stable assembly key is required.");
  const createKey = `portable-case:${args.caseId}:${args.mansionBundleId}:${stableKey}`;
  const existing = args.db.prepare(
    "SELECT id FROM debate_sessions WHERE user_id = ? AND create_idempotency_key = ?",
  ).get(args.userId, createKey) as { id: string } | undefined;
  if (existing) return { sessionId: existing.id, mansionBundleId: args.mansionBundleId };

  const manifest = portableCaseManifestForLibraryIdV1(args);
  const mansion = getDebateMysteryMansionBundleV2(args.db, args.userId, args.mansionBundleId);
  assertDebateMysteryMansionNotHeldByOngoingCaseV1(args.db, args.userId, args.mansionBundleId);
  const requirements = manifest.mansionRequirements;
  if (mansion.suspectCount !== requirements.suspectCount) {
    throw new HttpError(409, `This case needs exactly ${requirements.suspectCount} suspect rooms.`);
  }
  if (mansion.totalRooms !== requirements.minimumRoomCount) {
    throw new HttpError(
      409,
      `This first reusable-case format needs a ${requirements.minimumRoomCount}-room mansion so every room remains meaningful.`,
    );
  }
  if (mansion.floors < requirements.minimumFloorCount) {
    throw new HttpError(409, `This case needs at least ${requirements.minimumFloorCount} mansion floors.`);
  }

  const remaining = [...mansion.rooms].sort((left, right) =>
    left.floor - right.floor || left.y - right.y || left.x - right.x || left.id.localeCompare(right.id));
  const targetByCaseRoom = new Map<string, typeof remaining[number]>();
  const takeRoom = (requirement: PortableCasePackageManifestV1["mansionRequirements"]["rooms"][number]) => {
    const needsSuspect = requirement.role === "suspect";
    const roleMatch = (room: typeof remaining[number]) =>
      Boolean(room.assignedSuspectSeatId) === needsSuspect;
    let index = remaining.findIndex((room) =>
      roleMatch(room) && room.templateId === requirement.templateId);
    if (index < 0) index = remaining.findIndex(roleMatch);
    if (index < 0) {
      throw new HttpError(409, `The selected mansion cannot host the case's ${requirement.role} room.`);
    }
    const [room] = remaining.splice(index, 1);
    targetByCaseRoom.set(requirement.id, room!);
  };
  requirements.rooms.filter((room) => room.role === "suspect").forEach(takeRoom);
  requirements.rooms.filter((room) => room.role === "crime_scene").forEach(takeRoom);
  requirements.rooms.filter((room) => room.role === "search").forEach(takeRoom);
  if (remaining.length) throw new HttpError(409, "The selected mansion has unmapped rooms.");

  const sourceSession = asRecord(asJson(manifest.publicCase), "Portable case session");
  const sourcePublic = asRecord(sourceSession.formatState, "Portable case state");
  const sourceRooms = Array.isArray(sourcePublic.rooms)
    ? sourcePublic.rooms.map((entry) => asRecord(entry, "Portable case room"))
    : [];
  const newSessionId = randomUUID();
  const newJobId = randomUUID();
  const replacements = new Map<string, string>([
    ["portable-case-session", newSessionId],
    ["portable-case-job", newJobId],
  ]);
  for (const requirement of requirements.rooms) {
    const target = targetByCaseRoom.get(requirement.id)!;
    replacements.set(requirement.id, target.id);
    const sourceRoom = sourceRooms.find((room) => room.id === requirement.id);
    if (sourceRoom && typeof sourceRoom.name === "string" && sourceRoom.name !== target.name) {
      replacements.set(sourceRoom.name, target.name);
    }
  }
  for (const cast of manifest.cast) {
    if (cast.id !== "prism:player-judge") replacements.set(cast.id, `portable-bot:${randomUUID()}`);
  }
  const finalSession = asRecord(replaceStrings(asJson(sourceSession), replacements), "Assembled session");
  const finalPublic = asRecord(finalSession.formatState, "Assembled case state");
  const finalPrivate = asRecord(
    replaceStrings(asJson(manifest.privateCase), replacements),
    "Assembled private case",
  );
  if (manifest.privateCase.personaPairContext) {
    finalPrivate.personaPairContext = asJson(
      remapMysteryPersonaPairContextBotIdsV1(
        validateMysteryPersonaPairContextMapV1(
          manifest.privateCase.personaPairContext,
        ),
        replacements,
      ),
    );
  }
  const finalGraph = asRecord(
    replaceStrings(asJson(manifest.dialogueGraph), replacements),
    "Assembled dialogue graph",
  );
  const targetRoomById = new Map(mansion.rooms.map((room) => [room.id, room]));
  if (!Array.isArray(finalPublic.rooms)) throw new PortableCasePackageError("The case room plan is missing.");
  finalPublic.rooms = finalPublic.rooms.map((entry) => {
    const room = asRecord(entry, "Assembled room");
    const target = typeof room.id === "string" ? targetRoomById.get(room.id) : undefined;
    if (!target) throw new PortableCasePackageError("The case room binding is incomplete.");
    return {
      ...room,
      id: target.id,
      templateId: target.templateId,
      name: target.name,
      floor: target.floor,
      x: target.x,
      y: target.y,
      width: target.width,
      height: target.height,
      neighborIds: target.neighborIds,
      emoji: target.emoji,
      imageId: target.imageId,
      bundledAssetPath: target.bundledAssetPath,
      sealedAsset: null,
    };
  });
  const suspectSeatIdByTargetRoomId = new Map(
    requirements.rooms.flatMap((requirement) => {
      const target = targetByCaseRoom.get(requirement.id);
      return target && requirement.role === "suspect" && requirement.suspectSeatId
        ? [[target.id, requirement.suspectSeatId] as const]
        : [];
    }),
  );
  const frozenSnapshot = freezeDebateMysteryMansionSnapshotV2(mansion);
  const snapshot = {
    ...frozenSnapshot,
    rooms: frozenSnapshot.rooms.map((room) => ({
      ...room,
      assignedSuspectSeatId: suspectSeatIdByTargetRoomId.get(room.id) ?? null,
    })),
  };
  for (const holder of [finalPublic, finalPrivate]) {
    const config = asRecord(holder.config, "Assembled case config");
    config.mansionBundleId = mansion.id;
    config.mansionSnapshot = asJson(snapshot);
    config.floors = mansion.floors;
    config.totalRooms = mansion.totalRooms;
    config.scaleClass = mansion.scaleClass;
    config.houseStyle = asJson(mansion.houseStyle);
  }
  finalPublic.mansionExterior = null;
  finalPublic.audioReady = false;
  finalPublic.voicesEnabled = false;
  finalPublic.localAudioFailure = null;
  const privateActorAccounts = Array.isArray(finalPrivate.actorAccounts)
    ? finalPrivate.actorAccounts as Array<{ seatId?: unknown }>
    : [];
  const privateRecordItems = Array.isArray(finalPrivate.recordItems)
    ? finalPrivate.recordItems as Array<{ reference?: unknown }>
    : [];
  const finalConfig = asRecord(finalPrivate.config, "Assembled case config");
  const graphValidation = validateDebateMysteryDialogueGraphV2({
    graph: finalGraph as unknown as Parameters<typeof validateDebateMysteryDialogueGraphV2>[0]["graph"],
    suspectSeatIds: privateActorAccounts.flatMap((entry) =>
      typeof entry.seatId === "string" ? [entry.seatId] : []),
    recordReferences: privateRecordItems.flatMap((entry) =>
      entry.reference && typeof entry.reference === "object"
        ? [entry.reference as Parameters<typeof validateDebateMysteryDialogueGraphV2>[0]["recordReferences"][number]]
        : []),
    playerRole: finalSession.playerRole === "spectator" ? "spectator" : "participant",
    prosecutorBotId: typeof finalConfig.prosecutorBotId === "string"
      ? finalConfig.prosecutorBotId
      : null,
    directRecipientContractVersion: finalPrivate.personaPairContext ? 1 : null,
    rivalDefenseBotId: typeof finalConfig.rivalDefenseBotId === "string"
      ? finalConfig.rivalDefenseBotId
      : null,
    roomIds: Array.isArray(finalPrivate.investigationRoomIds)
      ? finalPrivate.investigationRoomIds.filter((entry): entry is string => typeof entry === "string")
      : [],
    personIds: Array.isArray(finalPrivate.investigationPersonIds)
      ? finalPrivate.investigationPersonIds.filter((entry): entry is string => typeof entry === "string")
      : [],
    hotspotIdsByRoom: finalPrivate.investigationHotspotIdsByRoom as Record<string, string[]> | undefined,
    eyewitnessSeatId: typeof finalPrivate.eyewitnessSeatId === "string" ? finalPrivate.eyewitnessSeatId : null,
    accusedAlibiSupportDiscoveryIds: Array.isArray(finalPrivate.accusedAlibiSupportDiscoveryIds)
      ? finalPrivate.accusedAlibiSupportDiscoveryIds.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
    defenseFrame: portableDefenseFrameValidationV1(finalPrivate, finalConfig),
  });
  if (!graphValidation.valid) {
    throw new PortableCasePackageError("The case could not be safely bound to this mansion.");
  }

  const now = new Date().toISOString();
  finalSession.id = newSessionId;
  finalSession.revision = 1;
  finalSession.status = "waiting_for_player";
  finalSession.phase = "opening";
  finalSession.stepKey = "mystery_v2_title";
  finalSession.provider = "local";
  finalSession.model = "portable-case-v1";
  finalSession.responseMode = "local";
  finalSession.formatState = finalPublic;
  finalSession.createdAt = now;
  finalSession.updatedAt = now;
  finalSession.completedAt = null;
  const title = typeof finalPublic.caseTitle === "string" ? finalPublic.caseTitle : manifest.title;
  const motion = finalSession.motion && typeof finalSession.motion === "object" &&
      !Array.isArray(finalSession.motion) && typeof finalSession.motion.motion === "string"
    ? finalSession.motion.motion
    : title;
  const playerRole = finalSession.playerRole === "spectator" ? "spectator" : "participant";
  const privateJson = JSON.stringify(finalPrivate);
  const graphJson = JSON.stringify(finalGraph);
  const checkpoint = {
    kind: "compiled-v1",
    privateCase: finalPrivate,
    graph: finalGraph,
    publicState: finalPublic,
  };
  let transactionStarted = false;
  try {
    args.db.exec("BEGIN IMMEDIATE");
    transactionStarted = true;
    args.db.prepare(
      `INSERT INTO debate_sessions
         (id, user_id, revision, status, phase, step_key, player_role,
          player_side_id, create_idempotency_key, motion, winner_side_id,
          session_json, error, created_at, updated_at, completed_at)
       VALUES (?, ?, 1, 'waiting_for_player', 'opening', 'mystery_v2_title', ?,
               NULL, ?, ?, NULL, ?, NULL, ?, ?, NULL)`,
    ).run(newSessionId, args.userId, playerRole, createKey, motion, JSON.stringify(finalSession), now, now);
    args.db.prepare(
      `INSERT INTO debate_mystery_v2_cases
         (session_id, user_id, case_family_id, run_ordinal, schema_version,
          private_case_json, dialogue_graph_json, case_hash, graph_hash,
          validation_json, created_at, updated_at)
       VALUES (?, ?, ?, 1, 2, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newSessionId,
      args.userId,
      randomUUID(),
      privateJson,
      graphJson,
      sha256(privateJson),
      sha256(graphJson),
      JSON.stringify(graphValidation),
      now,
      now,
    );
    args.db.prepare(
      `INSERT INTO debate_mystery_v2_jobs
         (id, user_id, session_id, status, stage, attempt, completed_passes,
          total_passes, prepared_audio_count, required_audio_count, public_message,
          private_error, input_json, checkpoint_json, lease_owner, leased_until,
          cancellation_requested, created_at, updated_at)
       VALUES (?, ?, ?, 'complete', 'complete', 0, 5, 5, 0, 0,
               'Reusable case assembled locally', NULL, '{}', ?, NULL, NULL, 0, ?, ?)`,
    ).run(newJobId, args.userId, newSessionId, JSON.stringify(checkpoint), now, now);
    retainDebateMysteryMansionSnapshotAssetsV2(args.db, args.userId, newSessionId, snapshot);
    args.db.exec("COMMIT");
    transactionStarted = false;
    return { sessionId: newSessionId, mansionBundleId: mansion.id };
  } catch (error) {
    if (transactionStarted && args.db.isTransaction) args.db.exec("ROLLBACK");
    throw error;
  }
}

/** Spoiler-safe public composition record embedded by new .whodunnit exports. */
export function portableWhodunnitCompositionRecordV1(args: {
  caseArchive: Uint8Array;
  mansionArchive: Uint8Array;
}): {
  version: 1;
  case: { archivePath: "components/case.case"; sha256: string; byteLength: number };
  mansion: { archivePath: "components/mansion.mansion"; sha256: string; byteLength: number };
} {
  return {
    version: 1,
    case: {
      archivePath: "components/case.case",
      sha256: sha256(args.caseArchive),
      byteLength: args.caseArchive.byteLength,
    },
    mansion: {
      archivePath: "components/mansion.mansion",
      sha256: sha256(args.mansionArchive),
      byteLength: args.mansionArchive.byteLength,
    },
  };
}

export const portableCasePackageInternalsV1 = {
  replaceStrings,
  asJson,
  asRecord,
};
