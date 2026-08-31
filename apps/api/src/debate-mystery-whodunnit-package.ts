import { createHash, randomUUID } from "node:crypto";
import { existsSync, linkSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import {
  canonicalPortablePackageJsonV1,
  canonicalMansionLayoutV2,
  PORTABLE_MYSTERY_PACKAGE_FORMAT_MINOR_V1,
  portableMysteryPackageMajorIsSupportedV1,
  remapMansionLayoutV2Ids,
  validateDebateMysteryDialogueGraphV2,
  validateWhodunnitPackageManifestV1,
  type MansionPackageHeaderV1,
  type MansionLayoutV2,
  type DebateMysteryMansionSnapshotV2,
  type DebateMysteryDialogueGraphV2,
  type PortableMansionInstallationMetadataV1,
  type PortableMysteryAssetDescriptorV1,
  type PortableMysteryEncryptionModeV1,
  type PortablePackageJsonValueV1,
  type WhodunnitPackageManifestV1,
  type WhodunnitPackageRuntimeAssetBindingV1,
} from "@localai/shared";
import { unzipSync, zipSync } from "fflate";
import { getDebateSession } from "./debate.ts";
import {
  getDebateMysteryMansionBundleV2,
  retainDebateMysteryMansionSnapshotAssetsV2,
} from "./debate-mystery-mansion-bundles.ts";
import {
  decodeInternalMansionPackageV1,
  encodeInternalMansionPackageV1,
  importInternalMansionPackageToDbDetailedV1,
} from "./debate-mystery-mansion-codec.ts";
import { exportPortableMansionPackageV1 } from "./debate-mystery-mansion-package.ts";
import {
  decodeInternalCasePackageV1,
  encodeInternalCasePackageV1,
  exportPortableCasePackageV1,
  portableWhodunnitCompositionRecordV1,
} from "./debate-mystery-case-package.ts";
import {
  inspectPortableMysteryEnvelopeHeaderV1,
  openPortableMysteryEnvelopeV1,
  sealPortableMysteryEnvelopeV1,
} from "./debate-mystery-package-envelope.ts";
import {
  preflightPortableMysteryArchiveV1,
  sanitizePortableMansionMediaV1,
  validatePortableMansionMediaV1,
} from "./debate-mystery-package-safety.ts";
import { resolveAbsoluteUnderDataRoot, writeGeneratedImageBytesExclusive } from "./image-storage.ts";
import { decryptBytes, encryptBytes } from "./security.ts";

const MANIFEST_PATH = "manifest.json";
const MAX_INTERNAL_ARCHIVE_BYTES = 256 * 1024 * 1024;
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
  "providerTranscript",
  "prompt",
  "systemPrompt",
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

export class PortableWhodunnitPackageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortableWhodunnitPackageError";
  }
}

interface InternalWhodunnitPackageV1 {
  manifest: WhodunnitPackageManifestV1;
  assets: ReadonlyMap<string, Uint8Array>;
  components?: ReadonlyMap<string, Uint8Array>;
}

interface VaultRow {
  id: string;
  kind: "evidence" | "room";
  subject_id: string;
  status: "ready" | "fallback";
  source: "synthesized" | "bundled";
  mime_type: "image/png" | "image/webp";
  ciphertext: Buffer;
  cipher_iv: Buffer;
  cipher_tag: Buffer;
  sha256: string;
  byte_size: number;
}

interface AudioRow {
  line_id: string;
  cache_key: string;
  clip_path: string;
  mime_type: "audio/wav";
  sha256: string;
  byte_size: number;
  duration_ms: number;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function asJson(value: unknown): PortablePackageJsonValueV1 {
  return JSON.parse(JSON.stringify(value)) as PortablePackageJsonValueV1;
}

function asRecord(value: unknown, label: string): Record<string, PortablePackageJsonValueV1> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PortableWhodunnitPackageError(`${label} is invalid.`);
  }
  return value as Record<string, PortablePackageJsonValueV1>;
}

function refreshPortableMansionSnapshotHashes(
  holder: Record<string, PortablePackageJsonValueV1>,
): void {
  const config = holder.config;
  if (!config || typeof config !== "object" || Array.isArray(config)) return;
  const snapshot = config.mansionSnapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot) || snapshot.version !== 2) return;
  const layoutV2 = snapshot.layoutV2;
  snapshot.layoutSha256 = layoutV2 && typeof layoutV2 === "object" && !Array.isArray(layoutV2)
    ? sha256(canonicalMansionLayoutV2(layoutV2 as unknown as MansionLayoutV2))
    : sha256(canonicalPortablePackageJsonV1(snapshot.rooms ?? []));
  const presentation = snapshot.presentation;
  if (presentation && typeof presentation === "object" && !Array.isArray(presentation)) {
    snapshot.presentationSha256 = sha256(canonicalPortablePackageJsonV1(presentation));
  }
}

function deepForbiddenKeys(value: unknown, forbidden: ReadonlySet<string>, path = "value"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => deepForbiddenKeys(entry, forbidden, `${path}[${index}]`));
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, entry]) => [
    ...(forbidden.has(key) ? [`${path}.${key}`] : []),
    ...deepForbiddenKeys(entry, forbidden, `${path}.${key}`),
  ]);
}

function validateLeakage(manifest: WhodunnitPackageManifestV1): void {
  const publicLeaks = deepForbiddenKeys(manifest.publicCase, FORBIDDEN_PUBLIC_KEYS, "manifest.publicCase");
  const packageLeaks = deepForbiddenKeys(manifest, FORBIDDEN_PACKAGE_KEYS, "manifest");
  if (publicLeaks.length || packageLeaks.length) {
    throw new PortableWhodunnitPackageError(
      `Portable package contains forbidden private or account fields: ${[...publicLeaks, ...packageLeaks].slice(0, 8).join(", ")}.`,
    );
  }
}

function validateInternalPackage(input: InternalWhodunnitPackageV1): void {
  const errors = validateWhodunnitPackageManifestV1(input.manifest);
  if (errors.length) throw new PortableWhodunnitPackageError(errors.join("\n"));
  if (!portableMysteryPackageMajorIsSupportedV1(input.manifest.compatibility)) {
    throw new PortableWhodunnitPackageError("Whodunnit package format is not supported.");
  }
  validateLeakage(input.manifest);
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const descriptor of input.manifest.assets) {
    if (ids.has(descriptor.id)) throw new PortableWhodunnitPackageError(`Asset id ${descriptor.id} is duplicated.`);
    if (paths.has(descriptor.archivePath)) throw new PortableWhodunnitPackageError(`Asset path ${descriptor.archivePath} is duplicated.`);
    ids.add(descriptor.id);
    paths.add(descriptor.archivePath);
    const bytes = input.assets.get(descriptor.archivePath);
    if (!bytes || bytes.byteLength !== descriptor.byteLength || sha256(bytes) !== descriptor.sha256) {
      throw new PortableWhodunnitPackageError(`Asset integrity failed: ${descriptor.archivePath}.`);
    }
  }
  for (const path of input.assets.keys()) {
    if (!paths.has(path)) throw new PortableWhodunnitPackageError(`Package contains undeclared asset ${path}.`);
  }
  const mansionIds = new Set(input.manifest.mansionManifest.assets.map((asset) => asset.id));
  if (input.manifest.mansionManifest.assets.some((asset) => !ids.has(asset.id))) {
    throw new PortableWhodunnitPackageError("Embedded mansion references an undeclared parent asset.");
  }
  const bindingIds = new Set(input.manifest.runtime.assetBindings.map((binding) => binding.assetId));
  if ([...bindingIds].some((id) => !ids.has(id)) || [...mansionIds].some((id) => !ids.has(id))) {
    throw new PortableWhodunnitPackageError("Runtime asset binding is invalid.");
  }
  const mansionHash = sha256(canonicalPortablePackageJsonV1(asJson(input.manifest.mansionManifest)));
  if (mansionHash !== input.manifest.mansionManifestSha256) {
    throw new PortableWhodunnitPackageError("Embedded mansion manifest integrity failed.");
  }
  const componentPaths = new Set(input.components?.keys() ?? []);
  if (!input.manifest.composition) {
    if (componentPaths.size) {
      throw new PortableWhodunnitPackageError("Legacy Whodunnit contains undeclared components.");
    }
    return;
  }
  const expectedComponents = [
    input.manifest.composition.case,
    input.manifest.composition.mansion,
  ];
  if (componentPaths.size !== expectedComponents.length) {
    throw new PortableWhodunnitPackageError("Whodunnit composition is incomplete.");
  }
  for (const component of expectedComponents) {
    const bytes = input.components?.get(component.archivePath);
    if (!bytes || bytes.byteLength !== component.byteLength || sha256(bytes) !== component.sha256) {
      throw new PortableWhodunnitPackageError(`Whodunnit component integrity failed: ${component.archivePath}.`);
    }
    const opened = openPortableMysteryEnvelopeV1({ envelope: bytes });
    if (component.archivePath.endsWith(".case")) {
      if (opened.header.packageType !== "case") {
        throw new PortableWhodunnitPackageError("Embedded case component has the wrong package type.");
      }
      decodeInternalCasePackageV1(opened.payload);
    } else {
      if (opened.header.packageType !== "mansion") {
        throw new PortableWhodunnitPackageError("Embedded mansion component has the wrong package type.");
      }
      decodeInternalMansionPackageV1(opened.payload);
    }
  }
}

export function encodeInternalWhodunnitPackageV1(input: InternalWhodunnitPackageV1): Uint8Array {
  validateInternalPackage(input);
  const entries: Record<string, Uint8Array> = {
    [MANIFEST_PATH]: new TextEncoder().encode(canonicalPortablePackageJsonV1(asJson(input.manifest))),
  };
  for (const path of [...input.assets.keys()].sort()) entries[path] = Uint8Array.from(input.assets.get(path)!);
  for (const path of [...(input.components?.keys() ?? [])].sort()) {
    entries[path] = Uint8Array.from(input.components!.get(path)!);
  }
  const archive = zipSync(entries, { level: 9 });
  if (archive.byteLength > MAX_INTERNAL_ARCHIVE_BYTES) {
    throw new PortableWhodunnitPackageError("Whodunnit archive is too large.");
  }
  return archive;
}

export function decodeInternalWhodunnitPackageV1(archive: Uint8Array): InternalWhodunnitPackageV1 {
  if (!(archive instanceof Uint8Array) || archive.byteLength < 1 || archive.byteLength > MAX_INTERNAL_ARCHIVE_BYTES) {
    throw new PortableWhodunnitPackageError("Whodunnit archive is empty or too large.");
  }
  preflightPortableMysteryArchiveV1(archive);
  let entries: Record<string, Uint8Array>;
  try { entries = unzipSync(archive); }
  catch { throw new PortableWhodunnitPackageError("Whodunnit archive could not be decoded."); }
  const raw = entries[MANIFEST_PATH];
  if (!raw) throw new PortableWhodunnitPackageError("Whodunnit manifest is missing.");
  let manifest: WhodunnitPackageManifestV1;
  try {
    manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)) as WhodunnitPackageManifestV1;
  } catch {
    throw new PortableWhodunnitPackageError("Whodunnit manifest is invalid JSON.");
  }
  const assets = new Map<string, Uint8Array>();
  const components = new Map<string, Uint8Array>();
  for (const [path, bytes] of Object.entries(entries)) {
    if (path === MANIFEST_PATH) continue;
    if (path.startsWith("components/")) components.set(path, Uint8Array.from(bytes));
    else assets.set(path, Uint8Array.from(bytes));
  }
  const decoded = { manifest, assets, ...(components.size ? { components } : {}) };
  validateInternalPackage(decoded);
  return decoded;
}

function sanitizeBotSnapshots(value: PortablePackageJsonValueV1): PortablePackageJsonValueV1 {
  if (Array.isArray(value)) return value.map(sanitizeBotSnapshots);
  if (!value || typeof value !== "object") return value;
  const result: Record<string, PortablePackageJsonValueV1> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "systemPrompt") continue;
    else if (key === "provider") result[key] = "local";
    else if (key === "model") result[key] = "portable-whodunnit-v1";
    else if (key === "revision" && typeof entry === "string") result[key] = "portable-v1";
    else if (key === "imageId") result[key] = null;
    else result[key] = sanitizeBotSnapshots(entry);
  }
  return result;
}

function collectCast(session: Record<string, PortablePackageJsonValueV1>): WhodunnitPackageManifestV1["cast"] {
  const found = new Map<string, { id: string; name: string; presentation: Record<string, PortablePackageJsonValueV1>; voiceId: string | null }>();
  const visit = (value: PortablePackageJsonValueV1): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    const id = typeof value.id === "string" ? value.id : typeof value.botId === "string" ? value.botId : null;
    const name = typeof value.name === "string" ? value.name : null;
    if (id && name && (
      "voiceProfile" in value || "avatarDetails" in value || "faceStyle" in value || "role" in value
    )) {
      found.set(id, { id, name, presentation: value, voiceId: id });
    }
    Object.values(value).forEach(visit);
  };
  visit(session);
  return [...found.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function descriptorFor(args: {
  id: string;
  role: PortableMysteryAssetDescriptorV1["role"];
  mimeType: PortableMysteryAssetDescriptorV1["mimeType"];
  bytes: Uint8Array;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
}): PortableMysteryAssetDescriptorV1 {
  const digest = sha256(args.bytes);
  const extension = args.mimeType === "image/png" ? "png"
    : args.mimeType === "image/webp" ? "webp"
      : args.mimeType === "audio/mpeg" ? "mp3" : "wav";
  return {
    id: args.id,
    role: args.role,
    archivePath: `${args.mimeType.startsWith("audio/") ? "audio" : "assets"}/${digest}.${extension}`,
    sha256: digest,
    byteLength: args.bytes.byteLength,
    mimeType: args.mimeType,
    width: args.width ?? null,
    height: args.height ?? null,
    durationMs: args.durationMs ?? null,
  };
}

function proofContract(privateCase: Record<string, PortablePackageJsonValueV1>): Record<string, PortablePackageJsonValueV1> {
  const keys = [
    "sealedCulpritSeatId", "sealedAccompliceSeatId", "motive", "method",
    "eyewitnessSeatId", "eyewitnessResolution", "accusedAlibiSupportDiscoveryIds",
    "contradictionSemanticContractVersion", "graphValidation",
  ];
  return Object.fromEntries(keys.filter((key) => key in privateCase).map((key) => [key, privateCase[key]!]));
}

function evidenceAssignments(privateCase: Record<string, PortablePackageJsonValueV1>): Record<string, PortablePackageJsonValueV1> {
  const keys = [
    "recordItems", "evidenceRoomIdById", "examineNodeIdByHotspot",
    "presentNodeIdBySuspectRecord", "defaultPresentNodeIdBySuspect",
    "crimeSceneRoomId", "investigationRoomIds", "investigationHotspotIdsByRoom",
  ];
  return Object.fromEntries(keys.filter((key) => key in privateCase).map((key) => [key, privateCase[key]!]));
}

function courtContract(
  graph: Record<string, PortablePackageJsonValueV1>,
): Record<string, PortablePackageJsonValueV1> {
  return asRecord(asJson({
    witnessChapters: graph.witnessChapters ?? [],
    prosecutionChoices: graph.prosecutionChoices ?? [],
    verdictNodeIds: graph.verdictNodeIds ?? [],
  }), "Portable court contract");
}

function graphValidationForPortableCase(
  privateCase: Record<string, PortablePackageJsonValueV1>,
  graph: Record<string, PortablePackageJsonValueV1>,
): ReturnType<typeof validateDebateMysteryDialogueGraphV2> {
  const config = privateCase.config && typeof privateCase.config === "object" &&
      !Array.isArray(privateCase.config)
    ? privateCase.config as Record<string, unknown>
    : undefined;
  const actorAccounts = Array.isArray(privateCase.actorAccounts)
    ? privateCase.actorAccounts as Array<{ seatId?: unknown }>
    : [];
  const recordItems = Array.isArray(privateCase.recordItems)
    ? privateCase.recordItems as Array<{ reference?: unknown }>
    : [];
  // Older portable graphs were certified before exact player-bot ownership
  // became part of graph validation. Preserve their readable input boundary;
  // current cutscene graphs opt into the stronger ownership contract.
  const validatesOpeningExchangeOwnership = openingExchangeCount(graph) > 0;
  return validateDebateMysteryDialogueGraphV2({
    graph: graph as unknown as DebateMysteryDialogueGraphV2,
    suspectSeatIds: actorAccounts.flatMap((entry) =>
      typeof entry.seatId === "string" ? [entry.seatId] : []),
    recordReferences: recordItems.flatMap((entry) =>
      entry.reference && typeof entry.reference === "object"
        ? [entry.reference as Parameters<typeof validateDebateMysteryDialogueGraphV2>[0]["recordReferences"][number]]
        : []),
    playerRole: config?.playerRole === "spectator" ? "spectator" : "participant",
    roomIds: Array.isArray(privateCase.investigationRoomIds)
      ? privateCase.investigationRoomIds.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : undefined,
    personIds: Array.isArray(privateCase.investigationPersonIds)
      ? privateCase.investigationPersonIds.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : undefined,
    hotspotIdsByRoom:
      privateCase.investigationHotspotIdsByRoom as Record<string, string[]> | undefined,
    prosecutorBotId: validatesOpeningExchangeOwnership &&
        typeof config?.prosecutorBotId === "string"
      ? config.prosecutorBotId
      : null,
    rivalDefenseBotId: validatesOpeningExchangeOwnership &&
        typeof config?.rivalDefenseBotId === "string"
      ? config.rivalDefenseBotId
      : null,
    eyewitnessSeatId: typeof privateCase.eyewitnessSeatId === "string"
      ? privateCase.eyewitnessSeatId
      : null,
    accusedAlibiSupportDiscoveryIds: Array.isArray(privateCase.accusedAlibiSupportDiscoveryIds)
      ? privateCase.accusedAlibiSupportDiscoveryIds.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
  });
}

function sourceBundleId(db: DatabaseSync, userId: string, sessionId: string, configured: string | null): string {
  if (configured) {
    const owned = db.prepare("SELECT id FROM debate_mystery_mansion_bundles WHERE id = ? AND user_id = ?")
      .get(configured, userId) as { id: string } | undefined;
    if (owned) return owned.id;
  }
  const row = db.prepare(
    "SELECT id FROM debate_mystery_mansion_bundles WHERE user_id = ? AND source_session_id = ?",
  ).get(userId, sessionId) as { id: string } | undefined;
  if (!row) throw new PortableWhodunnitPackageError("Save this case's mansion before exporting the complete mystery.");
  return row.id;
}

export async function exportPortableWhodunnitPackageV1(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  sessionId: string;
  prismVersion: string;
  creatorName?: string;
  mode?: PortableMysteryEncryptionModeV1;
  password?: string;
}): Promise<Uint8Array> {
  const sourceSession = getDebateSession(args.db, args.userId, args.sessionId);
  if (
    sourceSession.formatState.format !== "whodunnit" ||
    sourceSession.formatState.version !== 2 ||
    sourceSession.status !== "completed" ||
    sourceSession.formatState.playPhase !== "verdict"
  ) {
    throw new PortableWhodunnitPackageError("Only complete Whodunnit V2 cases can be exported.");
  }
  const caseRow = args.db.prepare(
    `SELECT private_case_json, dialogue_graph_json, case_hash, graph_hash
       FROM debate_mystery_v2_cases WHERE session_id = ? AND user_id = ?`,
  ).get(args.sessionId, args.userId) as {
    private_case_json: string; dialogue_graph_json: string; case_hash: string; graph_hash: string;
  } | undefined;
  const job = args.db.prepare(
    `SELECT id, status, checkpoint_json FROM debate_mystery_v2_jobs
      WHERE session_id = ? AND user_id = ?`,
  ).get(args.sessionId, args.userId) as { id: string; status: string; checkpoint_json: string | null } | undefined;
  if (!caseRow || job?.status !== "complete" || !job.checkpoint_json ||
      sha256(caseRow.private_case_json) !== caseRow.case_hash ||
      sha256(caseRow.dialogue_graph_json) !== caseRow.graph_hash) {
    throw new PortableWhodunnitPackageError("The complete sealed case is unavailable or corrupted.");
  }
  const checkpoint = asRecord(JSON.parse(job.checkpoint_json), "Compiled checkpoint");
  const rawPrivateCase = asRecord(JSON.parse(caseRow.private_case_json), "Private case");
  const rawGraph = asRecord(JSON.parse(caseRow.dialogue_graph_json), "Dialogue graph");
  const checkpointPublicState = asRecord(checkpoint.publicState, "Compiled public state");
  const rawCompiledPublicState = asRecord({
    ...checkpointPublicState,
    playPhase: "title_card",
    compilation: {
      ...asRecord(asJson(sourceSession.formatState.compilation), "Compilation status"),
      jobId: "portable-job",
    },
    readiness: asJson(sourceSession.formatState.readiness),
    audioReady: sourceSession.formatState.audioReady,
    voicesEnabled: sourceSession.formatState.voicesEnabled,
    localAudioFailure: null,
    currentRoomId: checkpointPublicState.currentRoomId ?? null,
    roomView: "mansion",
    metSuspectSeatIds: [],
    discoveryIds: Array.isArray(checkpointPublicState.discoveryIds) ? checkpointPublicState.discoveryIds : [],
    record: Array.isArray(checkpointPublicState.record) ? checkpointPublicState.record : [],
    topics: Array.isArray(checkpointPublicState.topics) ? checkpointPublicState.topics : [],
    dialogueHistory: [],
    activeDialogueNodeId: null,
    theory: null,
    theoryFiledAt: null,
    court: null,
    verdict: null,
    calloutHistory: [],
    pendingCallout: null,
    pendingProsecutionChoice: null,
  }, "Compiled title-card state");

  const bundleId = sourceBundleId(
    args.db, args.userId, args.sessionId,
    typeof sourceSession.formatState.config.mansionBundleId === "string"
      ? sourceSession.formatState.config.mansionBundleId : null,
  );
  const sourceMansionRooms = sourceSession.formatState.config.mansionSnapshot?.rooms ??
    getDebateMysteryMansionBundleV2(args.db, args.userId, bundleId).rooms;
  const mansionComponent = await exportPortableMansionPackageV1({
    db: args.db,
    userKey: args.userKey,
    userId: args.userId,
    bundleId,
    prismVersion: args.prismVersion,
    creatorName: args.creatorName,
    mode: "spoiler_seal",
  });
  const openedMansionComponent = openPortableMysteryEnvelopeV1({ envelope: mansionComponent });
  const mansion = decodeInternalMansionPackageV1(openedMansionComponent.payload);
  const caseComponent = exportPortableCasePackageV1({
    db: args.db,
    userId: args.userId,
    sessionId: args.sessionId,
    prismVersion: args.prismVersion,
    creatorName: args.creatorName,
    mode: "spoiler_seal",
    mansionRooms: sourceMansionRooms.map((room) => asJson(room)),
  });
  const composition = portableWhodunnitCompositionRecordV1({
    caseArchive: caseComponent,
    mansionArchive: mansionComponent,
  });
  const assets = new Map<string, Uint8Array>();
  const descriptors: PortableMysteryAssetDescriptorV1[] = [];
  const assetByHash = new Map<string, PortableMysteryAssetDescriptorV1>();
  const addAsset = (descriptor: PortableMysteryAssetDescriptorV1, bytes: Uint8Array): PortableMysteryAssetDescriptorV1 => {
    const key = `${descriptor.mimeType}:${descriptor.sha256}`;
    const existing = assetByHash.get(key);
    if (existing) return existing;
    const normalized = { ...descriptor, id: `asset-${String(descriptors.length + 1).padStart(4, "0")}` };
    descriptors.push(normalized);
    assets.set(normalized.archivePath, Uint8Array.from(bytes));
    assetByHash.set(key, normalized);
    return normalized;
  };
  const mansionAssetIdMap = new Map<string, string>();
  for (const descriptor of mansion.manifest.assets) {
    const added = addAsset(descriptor, mansion.assets.get(descriptor.archivePath)!);
    mansionAssetIdMap.set(descriptor.id, added.id);
  }
  const mansionManifest = {
    ...mansion.manifest,
    packageId: randomUUID(),
    assets: mansion.manifest.assets.map((asset) => ({ ...asset, id: mansionAssetIdMap.get(asset.id)! })),
    rooms: mansion.manifest.rooms.map((room) => ({
      ...room,
      roomAssetId: room.roomAssetId ? mansionAssetIdMap.get(room.roomAssetId) ?? null : null,
      propAssetIds: room.propAssetIds.map((id) => mansionAssetIdMap.get(id)!).filter(Boolean),
    })),
    layoutV2: mansion.manifest.layoutV2
      ? JSON.parse(canonicalMansionLayoutV2(remapMansionLayoutV2Ids(
          mansion.manifest.layoutV2,
          (id) => id,
          (id) => mansionAssetIdMap.get(id) ?? null,
        ))) as MansionLayoutV2
      : undefined,
    previewAssetId: mansion.manifest.previewAssetId
      ? mansionAssetIdMap.get(mansion.manifest.previewAssetId) ?? null : null,
    investigationThemeAssetId: mansion.manifest.investigationThemeAssetId
      ? mansionAssetIdMap.get(mansion.manifest.investigationThemeAssetId) ?? null : null,
    ambience: mansion.manifest.ambience
      ? {
          ...mansion.manifest.ambience,
          assets: mansion.manifest.ambience.assets.map((reference) => ({
            ...reference,
            packageAssetId: reference.packageAssetId
              ? mansionAssetIdMap.get(reference.packageAssetId) ?? null
              : null,
          })),
        }
      : mansion.manifest.ambience,
  };
  const sourceRooms = sourceMansionRooms;
  const portableReplacements = new Map<string, string>([
    [args.sessionId, "portable-session"],
    [job.id, "portable-job"],
    [bundleId, mansionManifest.packageId],
  ]);
  sourceRooms.forEach((room, index) => {
    const portableRoom = mansionManifest.rooms[index];
    if (portableRoom) portableReplacements.set(room.id, portableRoom.id);
  });
  for (const snapshotAsset of sourceSession.formatState.config.mansionSnapshot?.presentation.assets ?? []) {
    const mansionAsset = mansion.manifest.assets.find(
      (asset) => asset.sha256 === snapshotAsset.sha256 && asset.mimeType === snapshotAsset.mimeType,
    );
    const portableAssetId = mansionAsset ? mansionAssetIdMap.get(mansionAsset.id) : null;
    if (portableAssetId) portableReplacements.set(snapshotAsset.id, portableAssetId);
  }
  const sourceBotIds = new Set<string>();
  const rawConfig = rawPrivateCase.config;
  if (rawConfig && typeof rawConfig === "object" && !Array.isArray(rawConfig)) {
    for (const [key, value] of Object.entries(rawConfig)) {
      if (key.endsWith("BotId") && typeof value === "string") sourceBotIds.add(value);
      if (key.endsWith("BotIds") && Array.isArray(value)) {
        value.filter((entry): entry is string => typeof entry === "string").forEach((entry) => sourceBotIds.add(entry));
      }
    }
  }
  for (const botId of sourceBotIds) {
    if (botId !== "prism:player-judge") portableReplacements.set(botId, `portable-bot:${randomUUID()}`);
  }
  const privateCase = asRecord(
    sanitizeBotSnapshots(replaceStrings(asJson(rawPrivateCase), portableReplacements)),
    "Portable private case",
  );
  delete privateCase.authoringRecoveryBySection;
  refreshPortableMansionSnapshotHashes(privateCase);
  // Portable replay owns only the performed transcript clips. Even a legacy
  // eager source becomes sparse after export so unused branches do not keep
  // consuming storage on every recipient installation.
  privateCase.audioPreparationMode = "lazy-on-demand-v1";
  const graph = asRecord(
    sanitizeBotSnapshots(replaceStrings(asJson(rawGraph), portableReplacements)),
    "Portable dialogue graph",
  );
  const compiledPublicState = asRecord(
    sanitizeBotSnapshots(replaceStrings(asJson(rawCompiledPublicState), portableReplacements)),
    "Portable compiled public state",
  );
  refreshPortableMansionSnapshotHashes(compiledPublicState);
  const completedState = asRecord(
    sanitizeBotSnapshots(replaceStrings(asJson(sourceSession.formatState), portableReplacements)),
    "Portable completed playthrough state",
  );
  refreshPortableMansionSnapshotHashes(completedState);
  const completedDiscoveryIds = Array.isArray(completedState.discoveryIds)
    ? completedState.discoveryIds.filter((entry): entry is string => typeof entry === "string")
    : [];
  const completedPlaythrough = {
    schema: "prism-whodunnit-playthrough-v1" as const,
    completedAt: sourceSession.completedAt ?? sourceSession.updatedAt,
    transcript: Array.isArray(completedState.dialogueHistory) ? completedState.dialogueHistory : [],
    discoveryIds: completedDiscoveryIds,
    prosecutionChoiceIds: completedDiscoveryIds
      .filter((entry) => entry.startsWith("choice:"))
      .map((entry) => entry.slice("choice:".length)),
    record: Array.isArray(completedState.record) ? completedState.record : [],
    theory: completedState.theory && typeof completedState.theory === "object" &&
      !Array.isArray(completedState.theory) ? completedState.theory : null,
    court: completedState.court && typeof completedState.court === "object" &&
      !Array.isArray(completedState.court) ? completedState.court : null,
    verdict: asRecord(completedState.verdict, "Portable completed verdict"),
    calloutHistory: Array.isArray(completedState.calloutHistory) ? completedState.calloutHistory : [],
  };

  const bindings: WhodunnitPackageRuntimeAssetBindingV1[] = [];
  const vaultRows = args.db.prepare(
    `SELECT id, kind, subject_id, status, source, mime_type, ciphertext,
            cipher_iv, cipher_tag, sha256, byte_size
       FROM debate_mystery_asset_vault
      WHERE session_id = ? AND user_id = ? AND status = 'ready'
      ORDER BY kind, subject_id`,
  ).all(args.sessionId, args.userId) as unknown as VaultRow[];
  for (const row of vaultRows) {
    if (!row.ciphertext || !row.cipher_iv || !row.cipher_tag || !row.sha256) {
      throw new PortableWhodunnitPackageError("A protected case visual is incomplete.");
    }
    const bytes = decryptBytes({ ciphertext: row.ciphertext, iv: row.cipher_iv, tag: row.cipher_tag }, args.userKey);
    if (bytes.byteLength !== row.byte_size || sha256(bytes) !== row.sha256) {
      throw new PortableWhodunnitPackageError("A protected case visual failed integrity verification.");
    }
    const descriptor = addAsset(descriptorFor({
      id: row.id, role: row.kind === "room" ? "room" : "prop", mimeType: row.mime_type,
      bytes, width: row.kind === "room" ? 1536 : 1024, height: 1024,
    }), bytes);
    bindings.push({
      assetId: descriptor.id, kind: row.kind, subjectId: row.subject_id, lineId: null,
      status: row.status, source: row.source,
    });
  }

  const storedAudio = args.db.prepare(
    "SELECT status, manifest_json FROM debate_mystery_audio_manifests WHERE session_id = ? AND user_id = ?",
  ).get(args.sessionId, args.userId) as { status: string; manifest_json: string } | undefined;
  const sourceAudioManifest = storedAudio
    ? JSON.parse(storedAudio.manifest_json) as {
        entries?: Array<{ lineId?: string; reusableCalloutKey?: string | null }>;
      }
    : null;
  const transcriptLineIds = new Set(
    sourceSession.formatState.dialogueHistory.flatMap((entry) =>
      entry.lineId && entry.delivery !== "text_only" ? [entry.lineId] : []),
  );
  const occurredCallouts = new Set<string>(
    sourceSession.formatState.calloutHistory.map((entry) => entry.callout),
  );
  for (const entry of sourceAudioManifest?.entries ?? []) {
    if (
      entry.lineId &&
      entry.reusableCalloutKey &&
      occurredCallouts.has(entry.reusableCalloutKey)
    ) transcriptLineIds.add(entry.lineId);
  }
  const exportedLineIds = [...transcriptLineIds].sort();
  const audioRows = exportedLineIds.length
    ? args.db.prepare(
        `SELECT refs.line_id, cache.cache_key, cache.clip_path, cache.mime_type,
                cache.sha256, cache.byte_size, cache.duration_ms
           FROM debate_mystery_audio_refs AS refs
           JOIN debate_mystery_audio_cache AS cache ON cache.cache_key = refs.cache_key
          WHERE refs.session_id = ? AND refs.user_id = ? AND cache.user_id = ?
            AND refs.line_id IN (${exportedLineIds.map(() => "?").join(", ")})
          ORDER BY refs.line_id`,
      ).all(
        args.sessionId,
        args.userId,
        args.userId,
        ...exportedLineIds,
      ) as unknown as AudioRow[]
    : [];
  for (const row of audioRows) {
    const bytes = readFileSync(resolveAbsoluteUnderDataRoot(row.clip_path));
    if (row.mime_type !== "audio/wav" || bytes.byteLength !== row.byte_size || sha256(bytes) !== row.sha256) {
      throw new PortableWhodunnitPackageError("A local voice clip failed integrity verification.");
    }
    const descriptor = addAsset(descriptorFor({
      id: row.cache_key, role: "voice", mimeType: "audio/wav", bytes, durationMs: row.duration_ms,
    }), bytes);
    bindings.push({
      assetId: descriptor.id, kind: "voice", subjectId: descriptor.id, lineId: row.line_id,
      status: "complete", source: "local",
    });
  }
  const packagedAudioLineIds = new Set(audioRows.map((row) => row.line_id));
  if (
    sourceSession.formatState.voicesEnabled &&
    (
      !storedAudio ||
      storedAudio.status !== "complete" ||
      [...transcriptLineIds].some((lineId) => !packagedAudioLineIds.has(lineId))
    )
  ) {
    throw new PortableWhodunnitPackageError("The complete local voice pack is unavailable.");
  }

  const resetSession = sanitizeBotSnapshots(replaceStrings(asJson({
    ...sourceSession,
    id: "portable-session",
    revision: 0,
    status: "waiting_for_player",
    phase: "opening",
    stepKey: "mystery_v2_title",
    provider: "local",
    model: "portable-whodunnit-v1",
    responseMode: "local",
    modelSelectionKind: "fixed",
    autoCandidateAllowlist: [],
    generationChain: [],
    formatState: compiledPublicState,
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
  }), portableReplacements));
  const publicCase = asRecord(resetSession, "Portable public case");
  const cast = collectCast(publicCase);
  const voiceProfiles = privateCase.audioVoiceProfilesByBotId;
  const voices = voiceProfiles && typeof voiceProfiles === "object" && !Array.isArray(voiceProfiles)
    ? Object.entries(voiceProfiles).map(([botId, profile]) => ({
        id: `voice-${sha256(botId).slice(0, 16)}`,
        castSnapshotId: botId,
        manifestAssetIds: [...new Set(
          bindings.filter((binding) => binding.kind === "voice").map((binding) => binding.assetId),
        )],
        profile: asRecord(profile, "Frozen voice profile"),
      }))
    : [];
  const title = typeof compiledPublicState.caseTitle === "string"
    ? compiledPublicState.caseTitle : "PRISM Whodunnit";
  const description = "A complete, finite PRISM Whodunnit for offline play.";
  const creator = { name: args.creatorName?.trim() || "PRISM creator", id: null, url: null };
  const compatibility = { minimumFormatMajor: 1, maximumFormatMajor: 1, minimumPrismVersion: args.prismVersion };
  const audioAssetIdByLine = new Map(
    bindings.filter((binding) => binding.kind === "voice" && binding.lineId)
      .map((binding) => [binding.lineId!, binding.assetId]),
  );
  const audioManifest = storedAudio
    ? asRecord(sanitizeBotSnapshots(replaceStrings(asJson(JSON.parse(storedAudio.manifest_json)), portableReplacements)), "Audio manifest")
    : null;
  if (audioManifest && Array.isArray(audioManifest.entries)) {
    audioManifest.entries = audioManifest.entries.filter((entry) =>
      entry &&
      typeof entry === "object" &&
      !Array.isArray(entry) &&
      typeof entry.lineId === "string" &&
      packagedAudioLineIds.has(entry.lineId)).map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry) || typeof entry.lineId !== "string") return entry;
      return { ...entry, clipPath: `portable:${audioAssetIdByLine.get(entry.lineId) ?? "missing"}` };
    });
    audioManifest.preparationMode = "lazy-on-demand-v1";
    audioManifest.caseId = "portable-session";
  }
  const manifest: WhodunnitPackageManifestV1 = {
    schema: "prism-whodunnit-package-v1",
    formatVersion: { major: 1, minor: PORTABLE_MYSTERY_PACKAGE_FORMAT_MINOR_V1 },
    packageId: randomUUID(),
    title,
    description,
    creator,
    provenance: { createdAt: new Date().toISOString(), prismVersion: args.prismVersion, generatedWith: [] },
    license: { name: "Private use", url: null, allowsRedistribution: false },
    contentWarnings: [],
    compatibility,
    composition,
    mansionManifest,
    mansionManifestSha256: sha256(canonicalPortablePackageJsonV1(asJson(mansionManifest))),
    cast,
    publicCase,
    privateCase,
    proofContract: proofContract(privateCase),
    dialogueGraph: graph,
    court: {
      witnessChapters: graph.witnessChapters ?? [],
      prosecutionChoices: graph.prosecutionChoices ?? [],
      verdictNodeIds: graph.verdictNodeIds ?? [],
    },
    evidenceAssignments: evidenceAssignments(privateCase),
    voices,
    assets: descriptors,
    runtime: {
      session: publicCase,
      compiledPublicState: asRecord(sanitizeBotSnapshots(compiledPublicState), "Compiled public state"),
      completedPlaythrough,
      audioManifest,
      assetBindings: bindings,
    },
    silent: !sourceSession.formatState.voicesEnabled,
  };
  const components = new Map<string, Uint8Array>([
    [composition.case.archivePath, caseComponent],
    [composition.mansion.archivePath, mansionComponent],
  ]);
  const payload = encodeInternalWhodunnitPackageV1({ manifest, assets, components });
  const preflight = preflightPortableMysteryArchiveV1(payload);
  await validatePortableMansionMediaV1({
    manifest: { ...mansionManifest, assets: descriptors },
    assets,
  });
  return sealPortableMysteryEnvelopeV1({
    payload,
    mode: args.mode ?? "spoiler_seal",
    password: args.password,
    metadata: {
      packageType: "whodunnit", title, creatorName: creator.name, compatibility,
      expandedBytes: preflight.expandedBytes, assetCount: descriptors.length, contentWarnings: [],
    },
  });
}

export function inspectPortableWhodunnitPackageV1(envelope: Uint8Array): MansionPackageHeaderV1 {
  const header = inspectPortableMysteryEnvelopeHeaderV1(envelope);
  if (header.packageType !== "whodunnit") throw new PortableWhodunnitPackageError("This package is not a Whodunnit.");
  return header;
}

async function openAndValidateWhodunnit(args: { envelope: Uint8Array; password?: string }): Promise<{
  header: MansionPackageHeaderV1; decoded: InternalWhodunnitPackageV1;
}> {
  const opened = openPortableMysteryEnvelopeV1(args);
  if (opened.header.packageType !== "whodunnit") throw new PortableWhodunnitPackageError("This package is not a Whodunnit.");
  const preflight = preflightPortableMysteryArchiveV1(opened.payload);
  const decoded = decodeInternalWhodunnitPackageV1(opened.payload);
  if (
    opened.header.expandedBytes !== preflight.expandedBytes ||
    opened.header.assetCount !== decoded.manifest.assets.length ||
    preflight.entryCount !== decoded.manifest.assets.length + 1 +
      (decoded.manifest.composition ? 2 : 0) ||
    opened.header.title !== decoded.manifest.title ||
    opened.header.creatorName !== decoded.manifest.creator.name ||
    JSON.stringify(opened.header.compatibility) !== JSON.stringify(decoded.manifest.compatibility) ||
    JSON.stringify(opened.header.contentWarnings) !== JSON.stringify(decoded.manifest.contentWarnings)
  ) throw new PortableWhodunnitPackageError("Package header does not match its authenticated contents.");
  await validatePortableMansionMediaV1({
    manifest: { ...decoded.manifest.mansionManifest, assets: decoded.manifest.assets },
    assets: decoded.assets,
  });
  const validation = graphValidationForPortableCase(
    decoded.manifest.privateCase,
    decoded.manifest.dialogueGraph,
  );
  if (!validation.valid) throw new PortableWhodunnitPackageError("Whodunnit dialogue graph is not playable.");
  if (
    canonicalPortablePackageJsonV1(asJson(decoded.manifest.proofContract)) !==
      canonicalPortablePackageJsonV1(asJson(proofContract(decoded.manifest.privateCase))) ||
    canonicalPortablePackageJsonV1(asJson(decoded.manifest.evidenceAssignments)) !==
      canonicalPortablePackageJsonV1(asJson(evidenceAssignments(decoded.manifest.privateCase))) ||
    canonicalPortablePackageJsonV1(asJson(decoded.manifest.publicCase)) !==
      canonicalPortablePackageJsonV1(asJson(decoded.manifest.runtime.session))
  ) {
    throw new PortableWhodunnitPackageError("Whodunnit replay contract is internally inconsistent.");
  }
  return { header: opened.header, decoded };
}

export async function previewPortableWhodunnitPackageV1(args: {
  envelope: Uint8Array; password?: string;
}): Promise<{ header: MansionPackageHeaderV1; title: string; description: string; creatorName: string; castCount: number; silent: boolean }> {
  const { header, decoded } = await openAndValidateWhodunnit(args);
  return {
    header, title: decoded.manifest.title, description: decoded.manifest.description,
    creatorName: decoded.manifest.creator.name, castCount: decoded.manifest.cast.length,
    silent: decoded.manifest.silent,
  };
}

export type PortableWhodunnitRoomCutsceneGraphMigrationV1 = (args: {
  scope: "whodunnit" | "case";
  graph: DebateMysteryDialogueGraphV2;
  prosecutorBotId: string;
}) => { graph: DebateMysteryDialogueGraphV2; changed: boolean };

export interface PortableWhodunnitRoomCutsceneUpgradeResultV1 {
  envelope: Uint8Array;
  changed: boolean;
  sourcePackageId: string;
  packageId: string;
  upgradedRoomCount: number;
}

const ROOM_CUTSCENE_MIGRATION_PROVENANCE_V1 =
  "PRISM Whodunnit first-entry room cutscenes v1";

function prosecutorBotIdForPortableCase(
  privateCase: Record<string, PortablePackageJsonValueV1>,
): string {
  const config = privateCase.config;
  const prosecutorBotId = config && typeof config === "object" && !Array.isArray(config) &&
      typeof config.prosecutorBotId === "string"
    ? config.prosecutorBotId.trim()
    : "";
  if (!prosecutorBotId) {
    throw new PortableWhodunnitPackageError(
      "Whodunnit package has no frozen Prosecutor bot for room cutscenes.",
    );
  }
  return prosecutorBotId;
}

function openingExchangeCount(graph: Record<string, PortablePackageJsonValueV1>): number {
  const introductions = graph.roomIntroductionNodeIdsByRoom;
  if (!introductions || typeof introductions !== "object" || Array.isArray(introductions)) return 0;
  return Object.values(introductions).filter((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const exchange = value.openingExchangeNodeIds;
    return Boolean(
      exchange && typeof exchange === "object" && !Array.isArray(exchange) &&
      typeof exchange.prosecutionOpeningNodeId === "string" &&
      typeof exchange.occupantResponseNodeId === "string" &&
      typeof exchange.prosecutionHandoffNodeId === "string",
    );
  }).length;
}

function openingExchangeSemantics(
  graph: Record<string, PortablePackageJsonValueV1>,
): string[] {
  const introductions = graph.roomIntroductionNodeIdsByRoom;
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const lines = Array.isArray(graph.lines) ? graph.lines : [];
  const nodeById = new Map(nodes.flatMap((value) =>
    value && typeof value === "object" && !Array.isArray(value) && typeof value.id === "string"
      ? [[value.id, value] as const]
      : []));
  const lineById = new Map(lines.flatMap((value) =>
    value && typeof value === "object" && !Array.isArray(value) && typeof value.id === "string"
      ? [[value.id, value] as const]
      : []));
  if (!introductions || typeof introductions !== "object" || Array.isArray(introductions)) return [];
  const lineSemantics = (nodeId: PortablePackageJsonValueV1 | undefined) => {
    const node = typeof nodeId === "string" ? nodeById.get(nodeId) : null;
    const line = node && typeof node.lineId === "string" ? lineById.get(node.lineId) : null;
    if (!line) return null;
    return {
      speakerKind: line.speakerKind ?? null,
      stageActionText: line.stageActionText ?? null,
      visibleText: line.visibleText ?? null,
      spokenText: line.spokenText ?? null,
      performance: line.performance ?? null,
      mode: line.mode ?? null,
    };
  };
  return Object.values(introductions).flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const exchange = value.openingExchangeNodeIds;
    if (!exchange || typeof exchange !== "object" || Array.isArray(exchange)) return [];
    return [canonicalPortablePackageJsonV1(asJson({
      opening: lineSemantics(exchange.prosecutionOpeningNodeId),
      occupant: lineSemantics(exchange.occupantResponseNodeId),
      handoff: lineSemantics(exchange.prosecutionHandoffNodeId),
    }))];
  }).sort();
}

function verifiedRoomCutsceneGraphMigration(args: {
  scope: "whodunnit" | "case";
  graph: Record<string, PortablePackageJsonValueV1>;
  privateCase: Record<string, PortablePackageJsonValueV1>;
  migrateGraph: PortableWhodunnitRoomCutsceneGraphMigrationV1;
}): { graph: Record<string, PortablePackageJsonValueV1>; changed: boolean } {
  const beforeCanonical = canonicalPortablePackageJsonV1(asJson(args.graph));
  const prosecutorBotId = prosecutorBotIdForPortableCase(args.privateCase);
  const migrated = args.migrateGraph({
    scope: args.scope,
    graph: asJson(args.graph) as unknown as DebateMysteryDialogueGraphV2,
    prosecutorBotId,
  });
  const graph = asRecord(asJson(migrated.graph), `${args.scope} migrated dialogue graph`);
  const afterCanonical = canonicalPortablePackageJsonV1(asJson(graph));
  if (migrated.changed !== (beforeCanonical !== afterCanonical)) {
    throw new PortableWhodunnitPackageError(
      `The ${args.scope} room-cutscene migration reported an inconsistent change result.`,
    );
  }
  const repeated = args.migrateGraph({
    scope: args.scope,
    graph: asJson(graph) as unknown as DebateMysteryDialogueGraphV2,
    prosecutorBotId,
  });
  if (
    repeated.changed ||
    canonicalPortablePackageJsonV1(asJson(repeated.graph)) !== afterCanonical
  ) {
    throw new PortableWhodunnitPackageError(
      `The ${args.scope} room-cutscene migration is not idempotent.`,
    );
  }
  return { graph, changed: migrated.changed };
}

function withRoomCutsceneProvenance(args: {
  provenance: WhodunnitPackageManifestV1["provenance"];
  prismVersion: string;
  createdAt: string;
}): WhodunnitPackageManifestV1["provenance"] {
  const generatedWith = Array.isArray(args.provenance.generatedWith)
    ? args.provenance.generatedWith.filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    ...args.provenance,
    createdAt: args.createdAt,
    prismVersion: args.prismVersion,
    generatedWith: [
      ...generatedWith.filter(
        (entry) => entry !== ROOM_CUTSCENE_MIGRATION_PROVENANCE_V1,
      ),
      ROOM_CUTSCENE_MIGRATION_PROVENANCE_V1,
    ],
  };
}

function canonicalWithoutGraphValidation(
  privateCase: Record<string, PortablePackageJsonValueV1>,
): string {
  const preserved = asRecord(asJson(privateCase), "Portable private case");
  delete preserved.graphValidation;
  return canonicalPortablePackageJsonV1(asJson(preserved));
}

function assertCanonicalPreserved(label: string, before: unknown, after: unknown): void {
  if (
    canonicalPortablePackageJsonV1(asJson(before)) !==
    canonicalPortablePackageJsonV1(asJson(after))
  ) {
    throw new PortableWhodunnitPackageError(
      `Room-cutscene upgrade changed protected ${label}.`,
    );
  }
}

/** Authenticates and upgrades both the flattened replay graph and embedded
 * certified `.case` graph. This boundary performs no provider or network work. */
export async function upgradePortableWhodunnitRoomCutscenesV1(args: {
  envelope: Uint8Array;
  password?: string;
  prismVersion: string;
  migrateGraph: PortableWhodunnitRoomCutsceneGraphMigrationV1;
}): Promise<PortableWhodunnitRoomCutsceneUpgradeResultV1> {
  const authenticated = await openAndValidateWhodunnit({
    envelope: args.envelope,
    password: args.password,
  });
  const source = authenticated.decoded;
  const composition = source.manifest.composition;
  const caseArchive = composition && source.components?.get(composition.case.archivePath);
  const mansionArchive = composition && source.components?.get(composition.mansion.archivePath);
  if (!composition || !caseArchive || !mansionArchive) {
    throw new PortableWhodunnitPackageError(
      "Room-cutscene upgrade requires a composed Whodunnit with certified case and mansion components.",
    );
  }

  const openedCase = openPortableMysteryEnvelopeV1({ envelope: caseArchive });
  if (openedCase.header.packageType !== "case") {
    throw new PortableWhodunnitPackageError("The embedded case component is invalid.");
  }
  const casePreflight = preflightPortableMysteryArchiveV1(openedCase.payload);
  const sourceCase = decodeInternalCasePackageV1(openedCase.payload);
  if (
    openedCase.header.expandedBytes !== casePreflight.expandedBytes ||
    openedCase.header.assetCount !== 0 ||
    casePreflight.entryCount !== 1 ||
    openedCase.header.title !== sourceCase.title ||
    openedCase.header.creatorName !== sourceCase.creator.name ||
    JSON.stringify(openedCase.header.compatibility) !== JSON.stringify(sourceCase.compatibility) ||
    JSON.stringify(openedCase.header.contentWarnings) !== JSON.stringify(sourceCase.contentWarnings)
  ) {
    throw new PortableWhodunnitPackageError(
      "The embedded case header does not match its authenticated contents.",
    );
  }

  const parentMigration = verifiedRoomCutsceneGraphMigration({
    scope: "whodunnit",
    graph: source.manifest.dialogueGraph,
    privateCase: source.manifest.privateCase,
    migrateGraph: args.migrateGraph,
  });
  const caseMigration = verifiedRoomCutsceneGraphMigration({
    scope: "case",
    graph: sourceCase.dialogueGraph,
    privateCase: sourceCase.privateCase,
    migrateGraph: args.migrateGraph,
  });
  if (parentMigration.changed !== caseMigration.changed) {
    throw new PortableWhodunnitPackageError(
      "Flattened Whodunnit and embedded case require different room-cutscene migrations.",
    );
  }
  if (!parentMigration.changed) {
    return {
      envelope: Uint8Array.from(args.envelope),
      changed: false,
      sourcePackageId: source.manifest.packageId,
      packageId: source.manifest.packageId,
      upgradedRoomCount: openingExchangeCount(source.manifest.dialogueGraph),
    };
  }

  const parentBeforeCount = openingExchangeCount(source.manifest.dialogueGraph);
  const caseBeforeCount = openingExchangeCount(sourceCase.dialogueGraph);
  const parentAfterCount = openingExchangeCount(parentMigration.graph);
  const caseAfterCount = openingExchangeCount(caseMigration.graph);
  if (
    parentAfterCount <= parentBeforeCount ||
    caseAfterCount <= caseBeforeCount ||
    parentAfterCount - parentBeforeCount !== caseAfterCount - caseBeforeCount ||
    parentAfterCount !== caseAfterCount ||
    canonicalPortablePackageJsonV1(asJson(openingExchangeSemantics(parentMigration.graph))) !==
      canonicalPortablePackageJsonV1(asJson(openingExchangeSemantics(caseMigration.graph)))
  ) {
    throw new PortableWhodunnitPackageError(
      "Flattened Whodunnit and embedded case produced different room-cutscene coverage.",
    );
  }

  const parentPrivate = asRecord(asJson(source.manifest.privateCase), "Whodunnit private case");
  const parentValidation = graphValidationForPortableCase(parentPrivate, parentMigration.graph);
  if (!parentValidation.valid) {
    throw new PortableWhodunnitPackageError(
      `Upgraded Whodunnit dialogue graph is not playable: ${parentValidation.errors.join(" ")}`,
    );
  }
  parentPrivate.graphValidation = asJson(parentValidation);
  const embeddedPrivate = asRecord(asJson(sourceCase.privateCase), "Embedded private case");
  const embeddedValidation = graphValidationForPortableCase(embeddedPrivate, caseMigration.graph);
  if (!embeddedValidation.valid) {
    throw new PortableWhodunnitPackageError(
      `Upgraded embedded case dialogue graph is not playable: ${embeddedValidation.errors.join(" ")}`,
    );
  }
  embeddedPrivate.graphValidation = asJson(embeddedValidation);
  if (
    canonicalWithoutGraphValidation(source.manifest.privateCase) !==
      canonicalWithoutGraphValidation(parentPrivate) ||
    canonicalWithoutGraphValidation(sourceCase.privateCase) !==
      canonicalWithoutGraphValidation(embeddedPrivate)
  ) {
    throw new PortableWhodunnitPackageError("Room-cutscene upgrade changed sealed case truth.");
  }

  const createdAt = new Date().toISOString();
  const embeddedPrivateCanonical = canonicalPortablePackageJsonV1(asJson(embeddedPrivate));
  const embeddedGraphCanonical = canonicalPortablePackageJsonV1(asJson(caseMigration.graph));
  const upgradedCase = {
    ...sourceCase,
    packageId: randomUUID(),
    provenance: withRoomCutsceneProvenance({
      provenance: sourceCase.provenance,
      prismVersion: args.prismVersion,
      createdAt,
    }),
    privateCase: embeddedPrivate,
    proofContract: proofContract(embeddedPrivate),
    dialogueGraph: caseMigration.graph,
    court: courtContract(caseMigration.graph),
    evidenceAssignments: evidenceAssignments(embeddedPrivate),
    certification: {
      ...sourceCase.certification,
      caseHash: sha256(embeddedPrivateCanonical),
      graphHash: sha256(embeddedGraphCanonical),
      graphValid: true as const,
    },
  };
  const upgradedCasePayload = encodeInternalCasePackageV1(upgradedCase);
  const upgradedCasePreflight = preflightPortableMysteryArchiveV1(upgradedCasePayload);
  const upgradedCaseArchive = sealPortableMysteryEnvelopeV1({
    payload: upgradedCasePayload,
    mode: openedCase.header.encryptionMode,
    metadata: {
      packageType: "case",
      title: upgradedCase.title,
      creatorName: upgradedCase.creator.name,
      compatibility: upgradedCase.compatibility,
      expandedBytes: upgradedCasePreflight.expandedBytes,
      assetCount: 0,
      contentWarnings: upgradedCase.contentWarnings,
    },
  });

  const upgradedComposition = portableWhodunnitCompositionRecordV1({
    caseArchive: upgradedCaseArchive,
    mansionArchive,
  });
  const runtimeAudioManifest = source.manifest.runtime.audioManifest
    ? asRecord(asJson(source.manifest.runtime.audioManifest), "Whodunnit audio manifest")
    : null;
  if (runtimeAudioManifest) {
    runtimeAudioManifest.caseHash = sha256(JSON.stringify(parentPrivate));
    runtimeAudioManifest.dialogueGraphHash = sha256(JSON.stringify(parentMigration.graph));
    runtimeAudioManifest.preparationMode = "lazy-on-demand-v1";
  }
  const upgradedManifest: WhodunnitPackageManifestV1 = {
    ...source.manifest,
    packageId: randomUUID(),
    provenance: withRoomCutsceneProvenance({
      provenance: source.manifest.provenance,
      prismVersion: args.prismVersion,
      createdAt,
    }),
    composition: upgradedComposition,
    privateCase: parentPrivate,
    proofContract: proofContract(parentPrivate),
    dialogueGraph: parentMigration.graph,
    court: courtContract(parentMigration.graph),
    evidenceAssignments: evidenceAssignments(parentPrivate),
    runtime: { ...source.manifest.runtime, audioManifest: runtimeAudioManifest },
  };

  assertCanonicalPreserved("mansion", source.manifest.mansionManifest, upgradedManifest.mansionManifest);
  assertCanonicalPreserved("cast", source.manifest.cast, upgradedManifest.cast);
  assertCanonicalPreserved("public case", source.manifest.publicCase, upgradedManifest.publicCase);
  assertCanonicalPreserved(
    "compiled public state",
    source.manifest.runtime.compiledPublicState,
    upgradedManifest.runtime.compiledPublicState,
  );
  assertCanonicalPreserved(
    "completed playthrough",
    source.manifest.runtime.completedPlaythrough ?? null,
    upgradedManifest.runtime.completedPlaythrough ?? null,
  );
  assertCanonicalPreserved("assets", source.manifest.assets, upgradedManifest.assets);
  assertCanonicalPreserved("embedded case public state", sourceCase.publicCase, upgradedCase.publicCase);
  assertCanonicalPreserved("embedded case requirements", sourceCase.mansionRequirements, upgradedCase.mansionRequirements);
  assertCanonicalPreserved("embedded case cast", sourceCase.cast, upgradedCase.cast);

  const components = new Map(source.components);
  components.set(upgradedComposition.case.archivePath, upgradedCaseArchive);
  components.set(upgradedComposition.mansion.archivePath, mansionArchive);
  const upgradedPayload = encodeInternalWhodunnitPackageV1({
    manifest: upgradedManifest,
    assets: source.assets,
    components,
  });
  const upgradedPreflight = preflightPortableMysteryArchiveV1(upgradedPayload);
  const envelope = sealPortableMysteryEnvelopeV1({
    payload: upgradedPayload,
    mode: authenticated.header.encryptionMode,
    password: args.password,
    metadata: {
      packageType: "whodunnit",
      title: upgradedManifest.title,
      creatorName: upgradedManifest.creator.name,
      compatibility: upgradedManifest.compatibility,
      expandedBytes: upgradedPreflight.expandedBytes,
      assetCount: upgradedManifest.assets.length,
      contentWarnings: upgradedManifest.contentWarnings,
    },
  });
  const verified = await openAndValidateWhodunnit({ envelope, password: args.password });
  if (verified.decoded.manifest.packageId !== upgradedManifest.packageId) {
    throw new PortableWhodunnitPackageError("Upgraded package identity failed verification.");
  }
  return {
    envelope,
    changed: true,
    sourcePackageId: source.manifest.packageId,
    packageId: upgradedManifest.packageId,
    upgradedRoomCount: parentAfterCount,
  };
}

/** Writes only a newly authenticated sibling package. Existing files and the
 * source path are never replaced. */
export async function upgradePortableWhodunnitRoomCutscenesFileV1(args: {
  inputPath: string;
  outputPath: string;
  password?: string;
  prismVersion: string;
  migrateGraph: PortableWhodunnitRoomCutsceneGraphMigrationV1;
}): Promise<PortableWhodunnitRoomCutsceneUpgradeResultV1 & {
  inputSha256: string;
  outputSha256: string | null;
  written: boolean;
}> {
  const inputPath = resolve(args.inputPath);
  const outputPath = resolve(args.outputPath);
  if (inputPath === outputPath) {
    throw new PortableWhodunnitPackageError(
      "Room-cutscene upgrade output must be a sibling path, never the source package.",
    );
  }
  if (existsSync(outputPath)) {
    throw new PortableWhodunnitPackageError(
      "Room-cutscene upgrade output already exists; no file was changed.",
    );
  }
  const sourceBytes = Uint8Array.from(readFileSync(inputPath));
  const inputSha256 = sha256(sourceBytes);
  const upgraded = await upgradePortableWhodunnitRoomCutscenesV1({
    envelope: sourceBytes,
    password: args.password,
    prismVersion: args.prismVersion,
    migrateGraph: args.migrateGraph,
  });
  if (!upgraded.changed) {
    return {
      ...upgraded,
      inputSha256,
      outputSha256: null,
      written: false,
    };
  }
  const temporaryPath = join(
    dirname(outputPath),
    `.${basename(outputPath)}.${randomUUID()}.tmp`,
  );
  try {
    writeFileSync(temporaryPath, upgraded.envelope, { flag: "wx" });
    linkSync(temporaryPath, outputPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new PortableWhodunnitPackageError(
        "Room-cutscene upgrade output already exists; no file was changed.",
      );
    }
    throw error;
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
  return {
    ...upgraded,
    inputSha256,
    outputSha256: sha256(upgraded.envelope),
    written: true,
  };
}

function replaceStrings(value: PortablePackageJsonValueV1, replacements: ReadonlyMap<string, string>): PortablePackageJsonValueV1 {
  const replaceString = (source: string): string => {
    const exact = replacements.get(source);
    if (exact) return exact;
    let result = source;
    for (const [from, to] of [...replacements.entries()].sort((left, right) => right[0].length - left[0].length)) {
      if (from && result.includes(from)) result = result.split(from).join(to);
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

function collectPortableBotIds(manifest: WhodunnitPackageManifestV1): string[] {
  const ids = new Set(manifest.cast.map((entry) => entry.id));
  for (const voice of manifest.voices) ids.add(voice.castSnapshotId);
  return [...ids].filter((id) => id !== "prism:player-judge");
}

function audioRelativePath(userId: string, cacheKey: string): string {
  return `debate-mystery-audio-v2/${sha256(userId).slice(0, 24)}/cache/${cacheKey}.wav`;
}

export async function importPortableWhodunnitPackageV1(args: {
  db: DatabaseSync;
  userKey: Buffer;
  userId: string;
  envelope: Uint8Array;
  password?: string;
  writeAudioFile?: (relativePath: string, bytes: Buffer) => void;
}): Promise<{ sessionId: string; mansionBundleId: string }> {
  const { header, decoded: authenticated } = await openAndValidateWhodunnit({
    envelope: args.envelope, password: args.password,
  });
  const sanitizedMedia = await sanitizePortableMansionMediaV1({
    manifest: { ...authenticated.manifest.mansionManifest, assets: authenticated.manifest.assets },
    assets: authenticated.assets,
  });
  const descriptorById = new Map(sanitizedMedia.manifest.assets.map((asset) => [asset.id, asset]));
  const mansionManifest = {
    ...authenticated.manifest.mansionManifest,
    assets: authenticated.manifest.mansionManifest.assets.map((asset) => descriptorById.get(asset.id)!),
  };
  const manifest: WhodunnitPackageManifestV1 = {
    ...authenticated.manifest,
    mansionManifest,
    mansionManifestSha256: sha256(canonicalPortablePackageJsonV1(asJson(mansionManifest))),
    assets: sanitizedMedia.manifest.assets,
  };
  const decoded: InternalWhodunnitPackageV1 = {
    manifest,
    assets: sanitizedMedia.assets,
    ...(authenticated.components ? { components: authenticated.components } : {}),
  };
  validateInternalPackage(decoded);

  const newSessionId = randomUUID();
  const newCaseFamilyId = randomUUID();
  const newJobId = randomUUID();
  const replacements = new Map<string, string>([
    ["portable-session", newSessionId],
    ["portable-job", newJobId],
  ]);
  for (const botId of collectPortableBotIds(manifest)) replacements.set(botId, `portable-bot:${randomUUID()}`);
  const remappedSession = asRecord(replaceStrings(asJson(manifest.runtime.session), replacements), "Imported session");
  const remappedPublic = asRecord(replaceStrings(asJson(manifest.runtime.compiledPublicState), replacements), "Imported public state");
  const remappedPrivate = asRecord(replaceStrings(asJson(manifest.privateCase), replacements), "Imported private case");
  const remappedGraph = asRecord(replaceStrings(asJson(manifest.dialogueGraph), replacements), "Imported dialogue graph");
  remappedSession.id = newSessionId;
  remappedSession.revision = 1;
  remappedSession.formatState = remappedPublic;
  const now = new Date().toISOString();
  remappedSession.createdAt = now;
  remappedSession.updatedAt = now;
  remappedSession.completedAt = null;
  const title = typeof remappedPublic.caseTitle === "string" ? remappedPublic.caseTitle : manifest.title;
  const playerRole = remappedSession.playerRole === "spectator" ? "spectator" : "participant";
  const motion = remappedSession.motion && typeof remappedSession.motion === "object" && !Array.isArray(remappedSession.motion)
    ? String(remappedSession.motion.motion ?? title) : title;

  const audioWrites: Array<{ path: string; bytes: Uint8Array }> = [];
  const audioRows: Array<{ lineId: string; cacheKey: string; path: string; descriptor: PortableMysteryAssetDescriptorV1 }> = [];
  for (const binding of manifest.runtime.assetBindings.filter((entry) => entry.kind === "voice")) {
    if (!binding.lineId) throw new PortableWhodunnitPackageError("Voice asset binding has no line id.");
    const descriptor = descriptorById.get(binding.assetId);
    if (!descriptor || descriptor.mimeType !== "audio/wav") throw new PortableWhodunnitPackageError("Voice asset binding is invalid.");
    const cacheKey = sha256(`${newSessionId}:${binding.lineId}:${descriptor.sha256}`);
    const path = audioRelativePath(args.userId, cacheKey);
    audioRows.push({ lineId: binding.lineId, cacheKey, path, descriptor });
    audioWrites.push({ path, bytes: decoded.assets.get(descriptor.archivePath)! });
  }
  const portableMetadata: PortableMansionInstallationMetadataV1 = {
    packageId: manifest.mansionManifest.packageId,
    payloadSha256: header.payloadSha256,
    description: manifest.mansionManifest.description,
    creator: manifest.creator,
    provenance: manifest.provenance,
    license: manifest.license,
    contentWarnings: manifest.contentWarnings,
    encryptionMode: header.encryptionMode,
    creatorSignature: header.creatorSignature,
  };
  const createdAudioPaths: string[] = [];
  const writeAudioFile = args.writeAudioFile ?? writeGeneratedImageBytesExclusive;
  let transactionStarted = false;
  try {
    args.db.exec("BEGIN IMMEDIATE");
    transactionStarted = true;
    for (const write of audioWrites) {
      const absolute = resolveAbsoluteUnderDataRoot(write.path);
      if (existsSync(absolute)) {
        throw new PortableWhodunnitPackageError("Imported audio path already exists.");
      }
      try {
        writeAudioFile(write.path, Buffer.from(write.bytes));
        createdAudioPaths.push(write.path);
      } catch (error) {
        const errorCode = error && typeof error === "object" && "code" in error
          ? String(error.code)
          : "";
        if (errorCode !== "EEXIST" && existsSync(absolute)) {
          try { unlinkSync(absolute); } catch { /* A later storage sweep can reclaim it. */ }
        }
        throw error;
      }
    }
    const mansionArchive = encodeInternalMansionPackageV1({
      manifest: manifest.mansionManifest,
      assets: new Map(manifest.mansionManifest.assets.map((asset) => [asset.archivePath, decoded.assets.get(asset.archivePath)!])),
    });
    const importedMansion = importInternalMansionPackageToDbDetailedV1({
      db: args.db, userKey: args.userKey, userId: args.userId, archive: mansionArchive,
      portableMetadata, manageTransaction: false,
    });
    for (const [portableRoomId, importedRoomId] of importedMansion.roomIdMap) {
      replacements.set(portableRoomId, importedRoomId);
    }
    for (const [portableAssetId, importedAssetId] of importedMansion.assetIdMap) {
      replacements.set(portableAssetId, importedAssetId);
    }
    replacements.set(manifest.mansionManifest.packageId, importedMansion.bundleId);
    const finalSession = asRecord(replaceStrings(asJson(remappedSession), replacements), "Imported session");
    const finalPublic = asRecord(replaceStrings(asJson(remappedPublic), replacements), "Imported public state");
    const finalPrivate = asRecord(replaceStrings(asJson(remappedPrivate), replacements), "Imported private case");
    const finalGraph = asRecord(replaceStrings(asJson(remappedGraph), replacements), "Imported dialogue graph");
    if (manifest.runtime.completedPlaythrough) {
      finalPrivate.portableCompletedPlaythrough = replaceStrings(
        asJson(manifest.runtime.completedPlaythrough),
        replacements,
      );
    }
    if (finalPublic.config && typeof finalPublic.config === "object" && !Array.isArray(finalPublic.config)) {
      finalPublic.config.mansionBundleId = importedMansion.bundleId;
    }
    if (finalPrivate.config && typeof finalPrivate.config === "object" && !Array.isArray(finalPrivate.config)) {
      finalPrivate.config.mansionBundleId = importedMansion.bundleId;
    }
    refreshPortableMansionSnapshotHashes(finalPublic);
    refreshPortableMansionSnapshotHashes(finalPrivate);
    const importedSnapshot = finalPublic.config && typeof finalPublic.config === "object" &&
      !Array.isArray(finalPublic.config) && finalPublic.config.mansionSnapshot &&
      typeof finalPublic.config.mansionSnapshot === "object" &&
      !Array.isArray(finalPublic.config.mansionSnapshot)
        ? finalPublic.config.mansionSnapshot as unknown as DebateMysteryMansionSnapshotV2
        : null;
    if (importedSnapshot?.version === 2) {
      retainDebateMysteryMansionSnapshotAssetsV2(
        args.db,
        args.userId,
        newSessionId,
        importedSnapshot,
      );
    }
    finalSession.formatState = finalPublic;
    const privateJson = JSON.stringify(finalPrivate);
    const graphJson = JSON.stringify(finalGraph);
    args.db.prepare(
      `INSERT INTO debate_sessions
         (id, user_id, revision, status, phase, step_key, player_role,
          player_side_id, create_idempotency_key, motion, winner_side_id,
          session_json, error, created_at, updated_at, completed_at)
       VALUES (?, ?, 1, 'waiting_for_player', 'opening', 'mystery_v2_title', ?,
               NULL, ?, ?, NULL, ?, NULL, ?, ?, NULL)`,
    ).run(
      newSessionId, args.userId, playerRole,
      `portable-whodunnit:${manifest.packageId}:${newSessionId}`, motion,
      JSON.stringify(finalSession), now, now,
    );
    args.db.prepare(
      `INSERT INTO debate_mystery_v2_cases
         (session_id, user_id, case_family_id, run_ordinal, schema_version,
          private_case_json, dialogue_graph_json, case_hash, graph_hash,
          validation_json, created_at, updated_at)
       VALUES (?, ?, ?, 1, 2, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      newSessionId, args.userId, newCaseFamilyId, privateJson, graphJson,
      sha256(privateJson), sha256(graphJson), JSON.stringify(finalPrivate.graphValidation ?? {}), now, now,
    );
    const checkpoint = { kind: "compiled-v1", privateCase: finalPrivate, graph: finalGraph, publicState: finalPublic };
    args.db.prepare(
      `INSERT INTO debate_mystery_v2_jobs
         (id, user_id, session_id, status, stage, attempt, completed_passes,
          total_passes, prepared_audio_count, required_audio_count, public_message,
          private_error, input_json, checkpoint_json, lease_owner, leased_until,
          cancellation_requested, created_at, updated_at)
       VALUES (?, ?, ?, 'complete', 'complete', 0, 5, 5, ?, ?,
               'Imported offline case is ready', NULL, '{}', ?, NULL, NULL, 0, ?, ?)`,
    ).run(newJobId, args.userId, newSessionId, audioRows.length, audioRows.length, JSON.stringify(checkpoint), now, now);

    for (const binding of manifest.runtime.assetBindings.filter((entry) => entry.kind !== "voice")) {
      const descriptor = descriptorById.get(binding.assetId);
      if (!descriptor || !descriptor.mimeType.startsWith("image/")) throw new PortableWhodunnitPackageError("Case visual binding is invalid.");
      const bytes = Buffer.from(decoded.assets.get(descriptor.archivePath)!);
      const encrypted = encryptBytes(bytes, args.userKey);
      args.db.prepare(
        `INSERT INTO debate_mystery_asset_vault
           (id, user_id, session_id, kind, subject_id, status, source, mime_type,
            ciphertext, cipher_iv, cipher_tag, sha256, byte_size, provider, model,
            review_json, revealed_at, saved_image_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                 'package-import', 'portable-whodunnit-v1', '{}', NULL, NULL, ?, ?)`,
      ).run(
        randomUUID(), args.userId, newSessionId, binding.kind,
        String(replaceStrings(binding.subjectId, replacements)), binding.status,
        binding.source, descriptor.mimeType, encrypted.ciphertext, encrypted.iv,
        encrypted.tag, descriptor.sha256, descriptor.byteLength, now, now,
      );
    }

    for (const audio of audioRows) {
      args.db.prepare(
        `INSERT INTO debate_mystery_audio_cache
           (cache_key, user_id, clip_path, mime_type, sha256, byte_size,
            duration_ms, ref_count, created_at, last_used_at)
         VALUES (?, ?, ?, 'audio/wav', ?, ?, ?, 0, ?, ?)`,
      ).run(
        audio.cacheKey, args.userId, audio.path, audio.descriptor.sha256,
        audio.descriptor.byteLength, audio.descriptor.durationMs, now, now,
      );
      args.db.prepare(
        `INSERT INTO debate_mystery_audio_refs
           (session_id, user_id, line_id, cache_key, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(newSessionId, args.userId, String(replaceStrings(audio.lineId, replacements)), audio.cacheKey, now);
    }
    args.db.prepare(
      `UPDATE debate_mystery_audio_cache SET ref_count = (
         SELECT COUNT(*) FROM debate_mystery_audio_refs AS refs
          WHERE refs.user_id = debate_mystery_audio_cache.user_id
            AND refs.cache_key = debate_mystery_audio_cache.cache_key)
       WHERE user_id = ?`,
    ).run(args.userId);
    if (manifest.runtime.audioManifest) {
      const audioManifest = asRecord(replaceStrings(asJson(manifest.runtime.audioManifest), replacements), "Imported audio manifest");
      audioManifest.caseId = newSessionId;
      audioManifest.caseHash = sha256(privateJson);
      audioManifest.dialogueGraphHash = sha256(graphJson);
      if (Array.isArray(audioManifest.entries)) {
        const rowByLine = new Map(audioRows.map((row) => [String(replaceStrings(row.lineId, replacements)), row]));
        audioManifest.entries = audioManifest.entries.map((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry) || typeof entry.lineId !== "string") return entry;
          const row = rowByLine.get(entry.lineId);
          return row ? { ...entry, clipPath: row.path, sha256: row.descriptor.sha256,
            byteSize: row.descriptor.byteLength, durationMs: row.descriptor.durationMs } : entry;
        });
      }
      args.db.prepare(
        `INSERT INTO debate_mystery_audio_manifests
           (session_id, user_id, status, manifest_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(newSessionId, args.userId, manifest.silent ? "silent" : "complete", JSON.stringify(audioManifest), now, now);
    }
    args.db.exec("COMMIT");
    transactionStarted = false;
    return { sessionId: newSessionId, mansionBundleId: importedMansion.bundleId };
  } catch (error) {
    if (transactionStarted && args.db.isTransaction) args.db.exec("ROLLBACK");
    for (const path of createdAudioPaths) {
      const absolute = resolveAbsoluteUnderDataRoot(path);
      if (existsSync(absolute)) {
        try { unlinkSync(absolute); } catch { /* A later storage sweep can reclaim it. */ }
      }
    }
    throw error;
  }
}
