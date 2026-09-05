import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  backendHealthPollDelayMs,
  backendReconnectDelayMs,
  backendRecoveryPlan,
} from "./connectionRecovery.ts";

describe("backend connection recovery", () => {
  it("keeps an authenticated workspace entirely in memory", () => {
    assert.deepEqual(backendRecoveryPlan(true), {
      bootstrapAuth: false,
      refreshWorkspace: false,
    });
  });

  it("bootstraps auth only when recovery began without a user", () => {
    assert.deepEqual(backendRecoveryPlan(false), {
      bootstrapAuth: true,
      refreshWorkspace: false,
    });
  });

  it("keeps unavailable retries frequent and caps the delay at two seconds", () => {
    assert.deepEqual(
      [0, 1, 2, 3, 4, 50].map(backendReconnectDelayMs),
      [500, 750, 1_000, 1_500, 2_000, 2_000],
    );
  });

  it("checks healthy foreground sessions often without hot-looping hidden tabs", () => {
    assert.equal(backendHealthPollDelayMs(false), 2_000);
    assert.equal(backendHealthPollDelayMs(true), 10_000);
  });

  it("proactively checks health before another API action reports a failure", () => {
    const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    assert.match(
      pageSource,
      /if \(backendUnavailable\) return;[\s\S]*?requestApiWithLoopbackFallback\("\/api\/health"\)[\s\S]*?backendHealthPollDelayMs\(document\.hidden\)[\s\S]*?addEventListener\("visibilitychange"/,
    );
  });

  it("keeps the authenticated auxiliary lane warm without surfacing background failures", () => {
    const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const heartbeatStart = pageSource.indexOf(
      "if (!user?.id || backendUnavailable) return;",
    );
    const heartbeatEnd = pageSource.indexOf(
      "if (!backendUnavailable) {",
      heartbeatStart,
    );
    assert.notEqual(heartbeatStart, -1);
    assert.notEqual(heartbeatEnd, -1);
    const heartbeatSource = pageSource.slice(heartbeatStart, heartbeatEnd);
    assert.match(heartbeatSource, /requestRunning/u);
    assert.match(heartbeatSource, /"\/api\/models\/auxiliary\/keep-warm"/u);
    assert.match(heartbeatSource, /scheduleKeepWarm\(0\)/u);
    assert.match(heartbeatSource, /addEventListener\("visibilitychange"/u);
    assert.match(heartbeatSource, /addEventListener\("online"/u);
    assert.match(
      heartbeatSource,
      /settings\?\.experimentalDualOllamaEnabled,[\s\S]*?settings\?\.prismDefaultLlmModel,[\s\S]*?settings\?\.secondaryOllamaHost/u,
    );
  });

  it("keeps ordinary reconnects out of workspace hydration and browser reload paths", () => {
    const pageSource = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const start = pageSource.indexOf("const recoverBackendConnection");
    const end = pageSource.indexOf(
      "async function restartBackendFromConnectionNotice",
      start,
    );

    assert.notEqual(start, -1);
    assert.notEqual(end, -1);
    const recoverySource = pageSource.slice(start, end);
    assert.match(recoverySource, /backendRecoveryPlan\(userRef\.current !== null\)/);
    assert.match(recoverySource, /plan\.bootstrapAuth/);
    assert.doesNotMatch(recoverySource, /refreshAll|location\.reload|router\./);
  });
});
