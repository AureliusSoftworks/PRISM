export type ContinuityFrameworkStatus = "planned" | "preview" | "active";

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

export function continuityFrameworkVersionLabel(): string {
  return `v${CONTINUITY_FRAMEWORK.version}`;
}
