export type ContinuityFrameworkStatus = "planned" | "preview" | "active";

export interface ContinuityProducerVersions {
  continuity: string;
  schema: number;
  extraction: number;
  reconciliation: number;
  contextCompilation: number;
  recap: number;
  atmosphere: number;
}

/**
 * Continuity advances independently from Slate because its canon and narrative
 * contracts will be shared by projects, series, background jobs, and exports.
 */
export const CONTINUITY_FRAMEWORK = {
  name: "Continuity",
  version: "0.0",
  status: "planned",
} as const satisfies {
  name: "Continuity";
  version: string;
  status: ContinuityFrameworkStatus;
};

/**
 * Internal versions are persisted with every derived Continuity artifact.
 * They may advance without changing the writer-facing capability version.
 */
export const CONTINUITY_INTERNAL_VERSIONS = Object.freeze({
  schema: 1,
  extraction: 1,
  reconciliation: 1,
  contextCompilation: 1,
  recap: 2,
  atmosphere: 1,
});

export function continuityFrameworkVersionLabel(): string {
  return `v${CONTINUITY_FRAMEWORK.version}`;
}

export function currentContinuityProducerVersions(): ContinuityProducerVersions {
  return {
    continuity: CONTINUITY_FRAMEWORK.version,
    ...CONTINUITY_INTERNAL_VERSIONS,
  };
}
