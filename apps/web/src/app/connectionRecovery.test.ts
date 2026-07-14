import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
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

  it("backs off automatic probes and caps the delay", () => {
    assert.deepEqual(
      [0, 1, 2, 3, 4, 50].map(backendReconnectDelayMs),
      [750, 1_250, 2_000, 3_000, 5_000, 5_000],
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
