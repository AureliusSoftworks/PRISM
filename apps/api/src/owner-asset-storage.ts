import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { resolveDbPath } from "./db.ts";
import {
  loadOrCreateOwnerFileRootKeyV1,
  openOwnerFileBufferV1,
  ownerOpaqueBoundAssetFileNameV1,
  ownerOpaqueDirectoryNameV1,
  sealOwnerFileBufferV1,
  type OwnerFileBindingV1,
} from "./owner-file-vault.ts";
import type { VaultMasterKeyContextV2 } from "./user-vault-keyring.ts";

const OWNER_ASSET_STORAGE_SUBDIR_V1 = "account-vault-media-v1";

export interface OwnerAssetStorageRecordV1 {
  localRelativePath: string;
  tenantContentHash: string;
  plaintextBytes: number;
  ciphertextBytes: number;
}

export interface OwnerAssetStorageIdentityV1 extends OwnerFileBindingV1 {
  db: DatabaseSync;
  context: VaultMasterKeyContextV2;
}

function dataRoot(): string {
  return dirname(resolveDbPath());
}

function absoluteUnderDataRoot(relativePath: string): string {
  const trimmed = relativePath.trim();
  if (!trimmed || trimmed.includes("..") || trimmed.startsWith("/")) {
    throw new Error("Owner asset is unavailable.");
  }
  const root = resolve(dataRoot());
  const absolute = resolve(root, trimmed);
  const rel = relative(root, absolute);
  if (!rel || rel.startsWith("..")) {
    throw new Error("Owner asset is unavailable.");
  }
  return absolute;
}

function withOwnerRoot<T>(
  identity: OwnerAssetStorageIdentityV1,
  operation: (rootKey: Buffer, binding: OwnerFileBindingV1) => T,
): T {
  const rootKey = loadOrCreateOwnerFileRootKeyV1({
    db: identity.db,
    ownerUserId: identity.ownerUserId,
    context: identity.context,
  });
  const binding: OwnerFileBindingV1 = {
    ownerUserId: identity.ownerUserId,
    assetClass: identity.assetClass,
    stableAssetId: identity.stableAssetId,
  };
  try {
    return operation(rootKey, binding);
  } finally {
    rootKey.fill(0);
  }
}

function relativePathFor(
  rootKey: Uint8Array,
  binding: OwnerFileBindingV1,
): string {
  return `${OWNER_ASSET_STORAGE_SUBDIR_V1}/${ownerOpaqueDirectoryNameV1(
    rootKey,
  )}/${ownerOpaqueBoundAssetFileNameV1(rootKey, binding)}`;
}

export function ownerAssetRelativePathV1(
  identity: OwnerAssetStorageIdentityV1,
): string {
  return withOwnerRoot(identity, (rootKey, binding) =>
    relativePathFor(rootKey, binding),
  );
}

function assertExpectedPath(
  rootKey: Uint8Array,
  binding: OwnerFileBindingV1,
  localRelativePath: string,
): string {
  const expected = relativePathFor(rootKey, binding);
  if (localRelativePath !== expected) {
    throw new Error("Owner asset is unavailable.");
  }
  return absoluteUnderDataRoot(expected);
}

function writeCiphertextAtomically(args: {
  absolutePath: string;
  ciphertext: Buffer;
  exclusive: boolean;
}): void {
  mkdirSync(dirname(args.absolutePath), { recursive: true });
  if (args.exclusive && existsSync(args.absolutePath)) {
    throw new Error("Owner asset already exists.");
  }
  const temporaryPath = `${args.absolutePath}.${randomBytes(16).toString("hex")}.tmp`;
  let descriptor: number | null = null;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, args.ciphertext);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    if (args.exclusive && existsSync(args.absolutePath)) {
      throw new Error("Owner asset already exists.");
    }
    renameSync(temporaryPath, args.absolutePath);
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

export function writeOwnerAssetBytesV1(args: {
  identity: OwnerAssetStorageIdentityV1;
  bytes: Uint8Array;
  exclusive?: boolean;
}): OwnerAssetStorageRecordV1 {
  return withOwnerRoot(args.identity, (rootKey, binding) => {
    const sealed = sealOwnerFileBufferV1({
      rootKey,
      binding,
      plaintext: args.bytes,
    });
    const localRelativePath = relativePathFor(rootKey, binding);
    try {
      writeCiphertextAtomically({
        absolutePath: absoluteUnderDataRoot(localRelativePath),
        ciphertext: sealed.ciphertext,
        exclusive: args.exclusive === true,
      });
      return Object.freeze({
        localRelativePath,
        tenantContentHash: sealed.report.tenantContentHash,
        plaintextBytes: sealed.report.plaintextBytes,
        ciphertextBytes: sealed.report.ciphertextBytes,
      });
    } finally {
      sealed.ciphertext.fill(0);
    }
  });
}

export function readOwnerAssetBytesV1(args: {
  identity: OwnerAssetStorageIdentityV1;
  localRelativePath: string;
}): Buffer {
  return withOwnerRoot(args.identity, (rootKey, binding) => {
    const absolutePath = assertExpectedPath(
      rootKey,
      binding,
      args.localRelativePath,
    );
    const serialized = readFileSync(absolutePath);
    try {
      return openOwnerFileBufferV1({
        rootKey,
        binding,
        ciphertext: serialized,
      }).plaintext;
    } finally {
      serialized.fill(0);
    }
  });
}

export function ownerAssetCiphertextSizeBytesV1(args: {
  identity: OwnerAssetStorageIdentityV1;
  localRelativePath: string;
}): number {
  return withOwnerRoot(args.identity, (rootKey, binding) =>
    statSync(
      assertExpectedPath(rootKey, binding, args.localRelativePath),
    ).size,
  );
}

export function deleteOwnerAssetV1(args: {
  identity: OwnerAssetStorageIdentityV1;
  localRelativePath: string;
}): boolean {
  return withOwnerRoot(args.identity, (rootKey, binding) => {
    const absolutePath = assertExpectedPath(
      rootKey,
      binding,
      args.localRelativePath,
    );
    if (!existsSync(absolutePath)) return false;
    unlinkSync(absolutePath);
    return true;
  });
}

/** Call before deleting the owner row so the encrypted root can resolve its opaque directory. */
export function deleteAllOwnerAssetsV1(args: {
  db: DatabaseSync;
  context: VaultMasterKeyContextV2;
  ownerUserId: string;
}): boolean {
  const rootKey = loadOrCreateOwnerFileRootKeyV1({
    db: args.db,
    context: args.context,
    ownerUserId: args.ownerUserId,
  });
  try {
    const relativePath = `${OWNER_ASSET_STORAGE_SUBDIR_V1}/${ownerOpaqueDirectoryNameV1(rootKey)}`;
    const absolutePath = absoluteUnderDataRoot(relativePath);
    if (!existsSync(absolutePath)) return false;
    rmSync(absolutePath, { recursive: true, force: false });
    return true;
  } finally {
    rootKey.fill(0);
  }
}

export function ownerAssetAbsolutePathForTestsV1(
  localRelativePath: string,
): string {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("Owner asset test path is unavailable.");
  }
  return absoluteUnderDataRoot(localRelativePath);
}
