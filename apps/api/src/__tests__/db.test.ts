import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { resolveDbPath } from "../db.ts";

describe("resolveDbPath", () => {
  it("prefers DB_PATH for existing explicit deployments", () => {
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = "/tmp/prism-explicit.db";
    process.env.LOCALAI_DATA_DIR = "/tmp/prism-data";

    try {
      assert.equal(resolveDbPath(), "/tmp/prism-explicit.db");
    } finally {
      restoreEnv("DB_PATH", previousDbPath);
      restoreEnv("LOCALAI_DATA_DIR", previousDataDir);
    }
  });

  it("stores mac app data under LOCALAI_DATA_DIR when provided", () => {
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    delete process.env.DB_PATH;
    process.env.LOCALAI_DATA_DIR = "/tmp/prism-data";

    try {
      assert.equal(resolveDbPath(), join("/tmp/prism-data", "localai.db"));
    } finally {
      restoreEnv("DB_PATH", previousDbPath);
      restoreEnv("LOCALAI_DATA_DIR", previousDataDir);
    }
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
