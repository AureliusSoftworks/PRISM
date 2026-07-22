import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import { dirname } from "node:path";
import { resolveAbsoluteUnderDataRoot } from "./image-storage.ts";

const REPLAY_MEDIA_SUBDIR = "replay-media";
const SAFE_SEGMENT = /^[a-zA-Z0-9_-]+$/u;

function assertReplayPathSegment(value: string): string {
  if (!SAFE_SEGMENT.test(value)) throw new Error("Invalid replay media path segment.");
  return value;
}

export function replayRecordingRelativeDirectory(
  userId: string,
  recordingId: string,
): string {
  return `${REPLAY_MEDIA_SUBDIR}/${assertReplayPathSegment(userId)}/${assertReplayPathSegment(recordingId)}`;
}

export function replayVoiceTakeRelativePath(args: {
  userId: string;
  recordingId: string;
  takeId: string;
  contentType: string;
}): string {
  const extension = args.contentType.includes("mpeg")
    ? "mp3"
    : args.contentType.includes("ogg")
      ? "ogg"
      : args.contentType.includes("webm")
        ? "webm"
        : "wav";
  return `${replayRecordingRelativeDirectory(args.userId, args.recordingId)}/takes/${assertReplayPathSegment(args.takeId)}.${extension}`;
}

export function replayUploadRelativePath(
  userId: string,
  recordingId: string,
  renderToken: string,
): string {
  return `${replayRecordingRelativeDirectory(userId, recordingId)}/render-${assertReplayPathSegment(renderToken)}.upload`;
}

export function replayVideoRelativePath(args: {
  userId: string;
  recordingId: string;
  contentType: string;
}): string {
  const extension = args.contentType.includes("webm") ? "webm" : "mp4";
  return `${replayRecordingRelativeDirectory(args.userId, args.recordingId)}/replay.${extension}`;
}

export function writeReplayBytesAtomically(
  relativePath: string,
  bytes: Uint8Array,
): void {
  const absolutePath = resolveAbsoluteUnderDataRoot(relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.${randomBytes(8).toString("hex")}.tmp`;
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    renameSync(temporaryPath, absolutePath);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

export function writeReplayRenderChunk(args: {
  relativePath: string;
  position: number;
  bytes: Uint8Array;
}): number {
  if (
    !Number.isSafeInteger(args.position) ||
    args.position < 0 ||
    args.position > 2_147_483_647
  ) {
    throw new Error("Invalid replay render chunk position.");
  }
  const absolutePath = resolveAbsoluteUnderDataRoot(args.relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  const descriptor = openSync(absolutePath, existsSync(absolutePath) ? "r+" : "w+", 0o600);
  try {
    const written = writeSync(
      descriptor,
      args.bytes,
      0,
      args.bytes.byteLength,
      args.position,
    );
    if (written !== args.bytes.byteLength) {
      throw new Error("Replay render chunk was only partially written.");
    }
    return Math.max(statSync(absolutePath).size, args.position + written);
  } finally {
    closeSync(descriptor);
  }
}

export function finalizeReplayUpload(args: {
  uploadRelativePath: string;
  videoRelativePath: string;
}): { sizeBytes: number } {
  const uploadAbsolutePath = resolveAbsoluteUnderDataRoot(args.uploadRelativePath);
  const videoAbsolutePath = resolveAbsoluteUnderDataRoot(args.videoRelativePath);
  if (!existsSync(uploadAbsolutePath)) throw new Error("Replay upload is missing.");
  const sizeBytes = statSync(uploadAbsolutePath).size;
  if (sizeBytes <= 0) throw new Error("Replay upload is empty.");
  mkdirSync(dirname(videoAbsolutePath), { recursive: true });
  if (existsSync(videoAbsolutePath)) unlinkSync(videoAbsolutePath);
  renameSync(uploadAbsolutePath, videoAbsolutePath);
  return { sizeBytes };
}

export function removeReplayFile(relativePath: string | null | undefined): void {
  if (!relativePath) return;
  try {
    const absolutePath = resolveAbsoluteUnderDataRoot(relativePath);
    if (existsSync(absolutePath)) unlinkSync(absolutePath);
  } catch {
    // Media cleanup is best-effort; database truth still prevents later access.
  }
}

export function removeReplayRecordingDirectory(
  userId: string,
  recordingId: string,
): void {
  const relativeDirectory = replayRecordingRelativeDirectory(userId, recordingId);
  const absoluteDirectory = resolveAbsoluteUnderDataRoot(relativeDirectory);
  if (existsSync(absoluteDirectory)) rmSync(absoluteDirectory, { recursive: true });
}

export function listReplayRecordingDirectoryIds(userId: string): string[] {
  const ownerRelativeDirectory = `${REPLAY_MEDIA_SUBDIR}/${assertReplayPathSegment(userId)}`;
  const ownerAbsoluteDirectory = resolveAbsoluteUnderDataRoot(ownerRelativeDirectory);
  if (!existsSync(ownerAbsoluteDirectory)) return [];
  return readdirSync(ownerAbsoluteDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && SAFE_SEGMENT.test(entry.name))
    .map((entry) => entry.name);
}

export function removeReplayMediaForUser(userId: string): void {
  const ownerRelativeDirectory = `${REPLAY_MEDIA_SUBDIR}/${assertReplayPathSegment(userId)}`;
  const ownerAbsoluteDirectory = resolveAbsoluteUnderDataRoot(ownerRelativeDirectory);
  if (existsSync(ownerAbsoluteDirectory)) rmSync(ownerAbsoluteDirectory, { recursive: true });
}
