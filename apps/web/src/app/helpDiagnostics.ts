export type HelpConnectionState = "idle" | "checking" | "connected" | "error";

export type HelpDiagnosticReportInput = {
  version: string;
  surface: string;
  provider: string;
  botCount: number;
  conversationCount: number;
  memoryCount: number;
  backendState: HelpConnectionState;
  rendering: {
    rendererStatus: string;
    lifecycle: string;
    quality: string;
    targetFps: number;
    observedFps: number;
    p95FrameIntervalMs: number;
    missedFramePercentage: number;
    effectiveDpr: number;
    contextLossCount: number;
  };
  runtime: {
    route: string;
    online: boolean;
    language: string;
    timeZone: string;
    viewportWidth: number;
    viewportHeight: number;
    devicePixelRatio: number;
    userAgent: string;
  };
  timestamp?: string;
};

function safeText(value: string, maxLength = 500): string {
  const normalized = value.replace(/[\r\n]+/gu, " ").trim();
  return normalized.slice(0, maxLength);
}

function finiteMetric(value: number, digits = 1): string {
  return Number.isFinite(value) ? value.toFixed(digits) : "unavailable";
}

/** Builds a content-free support snapshot: no prompts, transcripts, IDs, or credentials. */
export function buildHelpDiagnosticReport(
  input: HelpDiagnosticReportInput,
): string {
  return [
    "PRISM support report",
    "reportFormat: 1",
    "Privacy note: This report excludes prompts, transcripts, account details, identifiers, credentials, cookies, and request bodies.",
    "",
    "App",
    `timestamp: ${safeText(input.timestamp ?? new Date().toISOString())}`,
    `version: ${safeText(input.version)}`,
    `surface: ${safeText(input.surface)}`,
    `provider: ${safeText(input.provider)}`,
    `backend: ${input.backendState}`,
    `bots: ${Math.max(0, Math.trunc(input.botCount))}`,
    `conversations: ${Math.max(0, Math.trunc(input.conversationCount))}`,
    `memories: ${Math.max(0, Math.trunc(input.memoryCount))}`,
    "",
    "Rendering",
    `renderer: ${safeText(input.rendering.rendererStatus)}`,
    `lifecycle: ${safeText(input.rendering.lifecycle)}`,
    `quality: ${safeText(input.rendering.quality)}`,
    `fpsTargetObserved: ${Math.max(0, Math.trunc(input.rendering.targetFps))} / ${finiteMetric(input.rendering.observedFps)}`,
    `frameP95Ms: ${finiteMetric(input.rendering.p95FrameIntervalMs)}`,
    `missedFramesPercent: ${finiteMetric(input.rendering.missedFramePercentage)}`,
    `effectiveDpr: ${finiteMetric(input.rendering.effectiveDpr, 2)}`,
    `contextLossCount: ${Math.max(0, Math.trunc(input.rendering.contextLossCount))}`,
    "",
    "Runtime",
    `route: ${safeText(input.runtime.route)}`,
    `online: ${input.runtime.online}`,
    `language: ${safeText(input.runtime.language)}`,
    `timeZone: ${safeText(input.runtime.timeZone)}`,
    `viewport: ${Math.max(0, Math.trunc(input.runtime.viewportWidth))}x${Math.max(0, Math.trunc(input.runtime.viewportHeight))}`,
    `devicePixelRatio: ${finiteMetric(input.runtime.devicePixelRatio, 2)}`,
    `userAgent: ${safeText(input.runtime.userAgent)}`,
  ].join("\n");
}
