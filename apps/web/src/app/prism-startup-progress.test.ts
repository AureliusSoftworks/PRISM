import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PRISM_STARTUP_WORKSPACE_BASE_PROGRESS,
  appendPrismStartupLogWithStatusRetention,
  prismStartupOpticsProgress,
  prismStartupProgressFromLogs,
  type PrismStartupProgressLog,
} from "./prismStartupProgress.ts";

describe("PRISM startup optical progress", () => {
  it("continues at the exact native-to-workspace handoff milestone", () => {
    assert.equal(
      prismStartupProgressFromLogs([
        { text: "Boot log continuing in the workspace." },
        { text: "Web interface ready." },
        { text: "Checking saved account session..." },
      ]),
      PRISM_STARTUP_WORKSPACE_BASE_PROGRESS,
    );
  });

  it("advances only for genuine account completion milestones", () => {
    const progress = prismStartupProgressFromLogs([
      { text: "Saved account session verified." },
      { text: "Pouring coffee...", kind: "flavor" },
      { text: "Conversations ready." },
      { text: "Bot library ready · 142 bots." },
    ]);

    assert.equal(progress, 0.84);
  });

  it("completes only when the private workspace is ready", () => {
    assert.equal(
      prismStartupProgressFromLogs([{ text: "Private workspace ready." }]),
      1,
    );
  });

  it("finishes the incoming beam before revealing the spectrum", () => {
    assert.deepEqual(prismStartupOpticsProgress(0.36), {
      total: 0.36,
      beam: 0.5,
      spectrum: 0,
    });
    assert.deepEqual(prismStartupOpticsProgress(0.72), {
      total: 0.72,
      beam: 1,
      spectrum: 0,
    });
    assert.deepEqual(prismStartupOpticsProgress(1), {
      total: 1,
      beam: 1,
      spectrum: 1,
    });
  });

  it("retains authoritative milestones when ambient logs reach the cap", () => {
    const status = { text: "Account settings ready." } as const;
    let logs: PrismStartupProgressLog[] = [status];
    for (let index = 0; index < 5; index += 1) {
      logs = appendPrismStartupLogWithStatusRetention(
        logs,
        { text: `Flavor ${index}`, kind: "flavor" as const },
        3,
      );
    }

    assert.ok(logs.includes(status));
    assert.equal(logs.length, 3);
  });
});
