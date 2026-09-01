export const ACCOUNT_VAULT_MAINTENANCE_CONTRACT_VERSION = 1 as const;

export type AccountVaultMigrationPhase =
  | "idle"
  | "preparing"
  | "migrating"
  | "verifying"
  | "blocked"
  | "complete";

export type AccountVaultMigrationFailureCode =
  | "none"
  | "storage-unavailable"
  | "migration-failed"
  | "verification-failed";

export type AccountVaultRouteAccess = "maintenance-safe" | "account-content";

export interface AccountVaultMaintenanceTransition {
  phase: AccountVaultMigrationPhase;
  completedUnits: number;
  totalUnits: number;
  failureCode?: AccountVaultMigrationFailureCode;
}

export interface AccountVaultMaintenanceStatus {
  contractVersion: typeof ACCOUNT_VAULT_MAINTENANCE_CONTRACT_VERSION;
  active: boolean;
  phase: AccountVaultMigrationPhase;
  progress: {
    completedUnits: number;
    totalUnits: number;
    percent: number;
  };
  failureCode: AccountVaultMigrationFailureCode;
  retryAfterSeconds: number;
}

const ACTIVE_PHASES = new Set<AccountVaultMigrationPhase>([
  "preparing",
  "migrating",
  "verifying",
  "blocked",
]);
const PHASES = new Set<AccountVaultMigrationPhase>([
  "idle",
  ...ACTIVE_PHASES,
  "complete",
]);
const FAILURE_CODES = new Set<AccountVaultMigrationFailureCode>([
  "none",
  "storage-unavailable",
  "migration-failed",
  "verification-failed",
]);
const TRANSITION_KEYS = new Set([
  "phase",
  "completedUnits",
  "totalUnits",
  "failureCode",
]);
const MAX_PROGRESS_UNITS = 1_000_000_000;

function boundedProgressInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= MAX_PROGRESS_UNITS
    ? Number(value)
    : null;
}

function parseTransition(value: unknown): Required<AccountVaultMaintenanceTransition> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Vault maintenance transition is invalid.");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !TRANSITION_KEYS.has(key))) {
    throw new TypeError("Vault maintenance transition contains an unsupported field.");
  }
  if (typeof record.phase !== "string" || !PHASES.has(record.phase as AccountVaultMigrationPhase)) {
    throw new TypeError("Vault maintenance phase is invalid.");
  }
  const completedUnits = boundedProgressInteger(record.completedUnits);
  const totalUnits = boundedProgressInteger(record.totalUnits);
  if (completedUnits === null || totalUnits === null || completedUnits > totalUnits) {
    throw new TypeError("Vault maintenance progress is invalid.");
  }
  const failureCode = record.failureCode ?? "none";
  if (
    typeof failureCode !== "string" ||
    !FAILURE_CODES.has(failureCode as AccountVaultMigrationFailureCode)
  ) {
    throw new TypeError("Vault maintenance failure code is invalid.");
  }
  const phase = record.phase as AccountVaultMigrationPhase;
  if (phase === "blocked" && failureCode === "none") {
    throw new TypeError("Blocked Vault maintenance requires a bounded failure code.");
  }
  if (phase !== "blocked" && failureCode !== "none") {
    throw new TypeError("Vault maintenance failure code is only valid while blocked.");
  }
  if (phase === "complete" && completedUnits !== totalUnits) {
    throw new TypeError("Completed Vault maintenance must report complete progress.");
  }
  return {
    phase,
    completedUnits,
    totalUnits,
    failureCode: failureCode as AccountVaultMigrationFailureCode,
  };
}

function percentOf(completedUnits: number, totalUnits: number, phase: AccountVaultMigrationPhase): number {
  if (totalUnits === 0) return phase === "complete" ? 100 : 0;
  return Math.min(100, Math.floor((completedUnits / totalUnits) * 100));
}

/**
 * Content-free fail-closed boundary for the future Vault migrator.
 *
 * The gate is dormant by default. Its transition parser accepts only enums and
 * bounded aggregate counts, so status responses cannot accidentally acquire an
 * account identifier, path, row ID, prompt, or arbitrary error message.
 */
export class AccountVaultMaintenanceGate {
  #state: Required<AccountVaultMaintenanceTransition> = {
    phase: "idle",
    completedUnits: 0,
    totalUnits: 0,
    failureCode: "none",
  };

  transition(value: AccountVaultMaintenanceTransition): AccountVaultMaintenanceStatus {
    this.#state = parseTransition(value);
    return this.status();
  }

  status(): AccountVaultMaintenanceStatus {
    const state = this.#state;
    return Object.freeze({
      contractVersion: ACCOUNT_VAULT_MAINTENANCE_CONTRACT_VERSION,
      active: ACTIVE_PHASES.has(state.phase),
      phase: state.phase,
      progress: Object.freeze({
        completedUnits: state.completedUnits,
        totalUnits: state.totalUnits,
        percent: percentOf(state.completedUnits, state.totalUnits, state.phase),
      }),
      failureCode: state.failureCode,
      retryAfterSeconds: ACTIVE_PHASES.has(state.phase) ? 5 : 0,
    });
  }

  allows(access: AccountVaultRouteAccess): boolean {
    return access === "maintenance-safe" || !ACTIVE_PHASES.has(this.#state.phase);
  }
}

export function buildAccountVaultMaintenanceStatusPayload(
  gate: AccountVaultMaintenanceGate,
): { ok: true; vaultMaintenance: AccountVaultMaintenanceStatus } {
  return Object.freeze({ ok: true, vaultMaintenance: gate.status() });
}

export function buildAccountVaultMaintenanceUnavailablePayload(
  gate: AccountVaultMaintenanceGate,
): {
  ok: false;
  code: "account_vault_maintenance";
  error: "Account Vault maintenance is in progress.";
  vaultMaintenance: AccountVaultMaintenanceStatus;
} {
  return Object.freeze({
    ok: false,
    code: "account_vault_maintenance",
    error: "Account Vault maintenance is in progress.",
    vaultMaintenance: gate.status(),
  });
}
