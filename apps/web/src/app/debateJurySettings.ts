export interface DebateJurySettings {
  autoDeliberationEnabled: boolean;
  decisionTimeoutMs: number;
}

export const DEBATE_JURY_DECISION_TIMEOUT_MIN_MS = 3_000;
export const DEBATE_JURY_DECISION_TIMEOUT_MAX_MS = 15_000;
export const DEBATE_JURY_DECISION_TIMEOUT_STEP_MS = 1_000;

export const DEFAULT_DEBATE_JURY_SETTINGS: DebateJurySettings = {
  autoDeliberationEnabled: true,
  decisionTimeoutMs: 6_000,
};

export function debateJurySettingsStorageKey(storageScopeId: string): string {
  return `prism:debate-jury-settings:${storageScopeId.trim() || "signed-out"}`;
}

export function normalizeDebateJurySettings(
  value: Partial<DebateJurySettings> | null | undefined,
): DebateJurySettings {
  const timeout = Number(value?.decisionTimeoutMs);
  const decisionTimeoutMs = Number.isFinite(timeout)
    ? Math.round(
        Math.min(
          DEBATE_JURY_DECISION_TIMEOUT_MAX_MS,
          Math.max(DEBATE_JURY_DECISION_TIMEOUT_MIN_MS, timeout),
        ) / DEBATE_JURY_DECISION_TIMEOUT_STEP_MS,
      ) * DEBATE_JURY_DECISION_TIMEOUT_STEP_MS
    : DEFAULT_DEBATE_JURY_SETTINGS.decisionTimeoutMs;
  return {
    autoDeliberationEnabled:
      typeof value?.autoDeliberationEnabled === "boolean"
        ? value.autoDeliberationEnabled
        : DEFAULT_DEBATE_JURY_SETTINGS.autoDeliberationEnabled,
    decisionTimeoutMs,
  };
}

export function readDebateJurySettings(
  storageScopeId: string,
): DebateJurySettings {
  if (typeof window === "undefined") return DEFAULT_DEBATE_JURY_SETTINGS;
  try {
    const raw = window.localStorage.getItem(
      debateJurySettingsStorageKey(storageScopeId),
    );
    if (!raw) return DEFAULT_DEBATE_JURY_SETTINGS;
    return normalizeDebateJurySettings(
      JSON.parse(raw) as Partial<DebateJurySettings>,
    );
  } catch {
    return DEFAULT_DEBATE_JURY_SETTINGS;
  }
}

export function writeDebateJurySettings(
  storageScopeId: string,
  value: Partial<DebateJurySettings>,
): DebateJurySettings {
  const normalized = normalizeDebateJurySettings(value);
  if (typeof window === "undefined") return normalized;
  try {
    window.localStorage.setItem(
      debateJurySettingsStorageKey(storageScopeId),
      JSON.stringify(normalized),
    );
  } catch {
    // Debate still uses the chosen values for this visit when storage is blocked.
  }
  return normalized;
}
