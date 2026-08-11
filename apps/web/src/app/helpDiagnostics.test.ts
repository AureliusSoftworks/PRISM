import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildHelpDiagnosticReport } from "./helpDiagnostics.ts";

describe("Help diagnostics", () => {
  it("builds a bounded content-free support report", () => {
    const report = buildHelpDiagnosticReport({
      version: "0.11.0",
      surface: "chat\ntranscript: excluded",
      provider: "local",
      botCount: 4,
      conversationCount: 8,
      memoryCount: 12,
      backendState: "connected",
      rendering: {
        rendererStatus: "webgl",
        lifecycle: "running",
        quality: "balanced",
        targetFps: 60,
        observedFps: 58.25,
        p95FrameIntervalMs: 19.4,
        missedFramePercentage: 2.5,
        effectiveDpr: 1.5,
        contextLossCount: 0,
      },
      runtime: {
        route: "/",
        online: true,
        language: "en-US",
        timeZone: "America/Los_Angeles",
        viewportWidth: 1280,
        viewportHeight: 800,
        devicePixelRatio: 2,
        userAgent: "PRISM Desktop",
      },
      timestamp: "2026-08-11T12:34:56.000Z",
    });

    assert.match(report, /^PRISM support report/u);
    assert.match(report, /version: 0\.11\.0/u);
    assert.match(report, /backend: connected/u);
    assert.match(report, /fpsTargetObserved: 60 \/ 58\.3/u);
    assert.match(report, /viewport: 1280x800/u);
    assert.doesNotMatch(report, /\ntranscript:/u);
    assert.doesNotMatch(report, /private conversation|account@example\.com/iu);
  });
});
