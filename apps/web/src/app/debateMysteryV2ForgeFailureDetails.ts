import type { DebateMysteryCompilationStatusV2 } from "@localai/shared";

/** Formats only the durable public compilation projection: no sealed case data crosses this boundary. */
export function formatDebateMysteryV2ForgeErrorDetails(
  sessionId: string,
  compilation: DebateMysteryCompilationStatusV2,
): string {
  const stage = compilation.publicFailureStage ?? compilation.stage;
  const stageLabel = stage
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return [
    "PRISM Case Forge error details",
    `Code: ${compilation.publicFailureCode ?? "CASE_FORGE_COMPILATION_STOPPED"}`,
    `Message: ${compilation.spoilerSafeMessage}`,
    `Session reference: ${sessionId}`,
    `Case reference: ${compilation.jobId}`,
    `Failed stage: ${stageLabel} (${stage})`,
    `Attempt: ${compilation.attempt}`,
    `Timestamp: ${compilation.updatedAt}`,
  ].join("\n");
}
