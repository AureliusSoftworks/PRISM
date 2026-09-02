import type { DatabaseSync } from "node:sqlite";
import {
  accountAuthVaultIsActiveV2,
  rewrapAccountAuthInstallationKeyV2,
} from "./account-auth-vault.ts";
import { coreContentVaultIsActiveV2 } from "./core-content-vault.ts";
import { decryptText, deriveMasterKey, encryptText } from "./security.ts";
import {
  deriveVaultMasterKeyContextV2,
  rewrapUserVaultKeyringMasterV2,
} from "./user-vault-keyring.ts";
import { VaultKeyLifecycleError } from "./vault-envelope-v2.ts";

export interface InstallationMasterRewrapReportV2 {
  ownerCount: number;
  legacyOwnerKeyCount: number;
  vaultKeyCount: number;
  accountAuthInstallationKeyCount: 1;
}

interface LegacyOwnerKeyRow {
  id: string;
  wrapped_user_key: string;
  wrapped_user_key_iv: string;
  wrapped_user_key_tag: string;
}

function checkedLegacyOwnerDek(
  row: LegacyOwnerKeyRow,
  oldMasterKey: Buffer,
): Buffer {
  const encoded = decryptText(
    {
      ciphertext: row.wrapped_user_key,
      iv: row.wrapped_user_key_iv,
      tag: row.wrapped_user_key_tag,
    },
    oldMasterKey,
  );
  const dek = Buffer.from(encoded, "base64");
  if (dek.length !== 32 || dek.toString("base64") !== encoded) {
    dek.fill(0);
    throw new VaultKeyLifecycleError("corrupt_key_record");
  }
  return dek;
}

/**
 * Atomically moves every installation-master wrapping boundary to a new
 * secret. Account ciphertext and bearer/login blind indexes are deliberately
 * unchanged: only wrapped key material is replaced.
 *
 * Run this against a freshly opened database before installing Auth/Core
 * Vault TEMP views, then reopen the application with the new master secret.
 * Refusing an active runtime prevents an in-memory old context from being used
 * after the durable cutover.
 */
export function rewrapInstallationMasterKeyV2(args: {
  db: DatabaseSync;
  oldMasterSecret: string;
  newMasterSecret: string;
}): InstallationMasterRewrapReportV2 {
  if (
    args.db.isTransaction ||
    accountAuthVaultIsActiveV2(args.db) ||
    coreContentVaultIsActiveV2(args.db)
  ) {
    throw new VaultKeyLifecycleError("transaction_conflict");
  }

  const owners = args.db
    .prepare(
      `SELECT id, wrapped_user_key, wrapped_user_key_iv,
              wrapped_user_key_tag
         FROM main.users
        ORDER BY id`,
    )
    .all() as unknown as LegacyOwnerKeyRow[];
  const oldContext = deriveVaultMasterKeyContextV2(
    args.db,
    args.oldMasterSecret,
  );
  const newContext = deriveVaultMasterKeyContextV2(
    args.db,
    args.newMasterSecret,
  );
  const oldMasterKey = deriveMasterKey(args.oldMasterSecret);
  const newMasterKey = deriveMasterKey(args.newMasterSecret);
  let legacyOwnerKeyCount = 0;
  let vaultKeyCount = 0;

  args.db.exec("BEGIN IMMEDIATE");
  try {
    // Put this first so a later owner-key failure proves that the installation
    // key and every already-processed owner are covered by the same rollback.
    rewrapAccountAuthInstallationKeyV2(args);
    for (const owner of owners) {
      const legacyDek = checkedLegacyOwnerDek(owner, oldMasterKey);
      try {
        const wrapped = encryptText(legacyDek.toString("base64"), newMasterKey);
        const updated = args.db
          .prepare(
            `UPDATE main.users
                SET wrapped_user_key = ?, wrapped_user_key_iv = ?,
                    wrapped_user_key_tag = ?
              WHERE id = ?`,
          )
          .run(wrapped.ciphertext, wrapped.iv, wrapped.tag, owner.id) as {
          changes?: number | bigint;
        };
        if (Number(updated.changes ?? 0) !== 1) {
          throw new VaultKeyLifecycleError("transaction_conflict");
        }
        legacyOwnerKeyCount += 1;
      } finally {
        legacyDek.fill(0);
      }
      vaultKeyCount += rewrapUserVaultKeyringMasterV2({
        db: args.db,
        ownerUserId: owner.id,
        oldContext,
        newContext,
      });
    }
    args.db.exec("COMMIT");
    return Object.freeze({
      ownerCount: owners.length,
      legacyOwnerKeyCount,
      vaultKeyCount,
      accountAuthInstallationKeyCount: 1 as const,
    });
  } catch (error) {
    if (args.db.isTransaction) args.db.exec("ROLLBACK");
    throw error;
  } finally {
    oldMasterKey.fill(0);
    newMasterKey.fill(0);
  }
}
