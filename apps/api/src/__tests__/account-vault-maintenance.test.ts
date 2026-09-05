import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppConfig } from "@localai/config";
import {
  AccountVaultMaintenanceGate,
  buildAccountVaultMaintenanceStatusPayload,
  buildAccountVaultMaintenanceUnavailablePayload,
} from "../account-vault-maintenance.ts";
import { createTestDatabase } from "../test-support.ts";
import { deriveMasterKey, encryptText } from "../security.ts";

const tempDir = mkdtempSync(join(tmpdir(), "prism-vault-maintenance-test-"));
process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.DB_PATH = join(tempDir, "module.db");
process.env.ENCRYPTION_MASTER_KEY = "vault-maintenance-test-master-key";

const { createPrismRequestHandler } = await import("../server.ts");

const config: AppConfig = {
  apiPort: 0,
  serverName: "Vault maintenance test",
  sessionCookieName: "prism_vault_test_session",
  sessionTtlHours: 24,
  encryptionMasterKey: "vault-maintenance-test-master-key",
  ollamaHost: "http://127.0.0.1:9",
  ollamaModel: "llama3.2",
  openAiApiKey: "",
  qdrantUrl: "http://127.0.0.1:9",
};

after(() => {
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.DB_PATH;
  delete process.env.ENCRYPTION_MASTER_KEY;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("account Vault maintenance contract", () => {
  it("is dormant by default and rejects arbitrary identity/content fields", () => {
    const gate = new AccountVaultMaintenanceGate();
    assert.equal(gate.allows("maintenance-safe"), true);
    assert.equal(gate.allows("account-content"), true);
    assert.deepEqual(gate.status(), {
      contractVersion: 1,
      active: false,
      phase: "idle",
      progress: { completedUnits: 0, totalUnits: 0, percent: 0 },
      failureCode: "none",
      retryAfterSeconds: 0,
    });

    assert.throws(
      () =>
        gate.transition({
          phase: "migrating",
          completedUnits: 1,
          totalUnits: 4,
          accountId: "must-never-enter-status",
        } as never),
      /unsupported field/u,
    );
    assert.deepEqual(gate.status().phase, "idle");
  });

  it("flips fail-closed while health/status access stays available", () => {
    const gate = new AccountVaultMaintenanceGate();
    gate.transition({
      phase: "migrating",
      completedUnits: 3,
      totalUnits: 8,
    });
    assert.equal(gate.allows("maintenance-safe"), true);
    assert.equal(gate.allows("account-content"), false);
    assert.deepEqual(buildAccountVaultMaintenanceStatusPayload(gate), {
      ok: true,
      vaultMaintenance: {
        contractVersion: 1,
        active: true,
        phase: "migrating",
        progress: { completedUnits: 3, totalUnits: 8, percent: 37 },
        failureCode: "none",
        retryAfterSeconds: 5,
      },
    });
    assert.equal(
      buildAccountVaultMaintenanceUnavailablePayload(gate).code,
      "account_vault_maintenance",
    );
  });
});

interface RouteExerciseResult {
  inactiveAuthenticatedStatus: number;
  blockedAuthenticatedStatus: number;
  blockedPayload: Record<string, unknown>;
  healthStatus: number;
  statusPayload: Record<string, unknown>;
}

interface CapturedHandlerResponse {
  status: number;
  headers: ReadonlyMap<string, string | number | readonly string[]>;
  body: string;
}

async function requestHandlerDirectly(
  handler: ReturnType<typeof createPrismRequestHandler>,
  path: string,
  headers: IncomingHttpHeaders = {},
): Promise<CapturedHandlerResponse> {
  const capturedHeaders = new Map<string, string | number | readonly string[]>();
  let body = "";
  const request = {
    method: "GET",
    url: path,
    headers: { host: "localhost", ...headers },
  } as IncomingMessage;
  const response = {
    statusCode: 200,
    writableEnded: false,
    destroyed: false,
    setHeader(name: string, value: string | number | readonly string[]) {
      capturedHeaders.set(name.toLowerCase(), value);
      return this;
    },
    end(value?: string | Uint8Array) {
      body = typeof value === "string" ? value : value ? Buffer.from(value).toString("utf8") : "";
      this.writableEnded = true;
      return this;
    },
  } as unknown as ServerResponse<IncomingMessage>;
  await handler(request, response);
  return {
    status: response.statusCode,
    headers: capturedHeaders,
    body,
  };
}

async function exerciseRoutes(accountCount: 2 | 4): Promise<RouteExerciseResult> {
  const db = createTestDatabase();
  // Exercise the supported legacy-token migration boundary: this fixture is
  // intentionally populated before the request handler activates Auth Vault.
  db.exec(`
    DROP TABLE sessions;
    CREATE TABLE sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  const secretAccountValues: string[] = [];
  const now = new Date().toISOString();
  for (let index = 0; index < accountCount; index += 1) {
    const userId = `private-account-${accountCount}-${index}`;
    const email = `private-${accountCount}-${index}@example.test`;
    const displayName = `Secret Player ${accountCount}-${index}`;
    secretAccountValues.push(userId, email, displayName);
    const userDek = randomBytes(32);
    const masterKey = deriveMasterKey(config.encryptionMasterKey);
    const wrapped = encryptText(userDek.toString("base64"), masterKey);
    userDek.fill(0);
    masterKey.fill(0);
    db.prepare(
      `INSERT INTO users (
         id, email, display_name, password_hash, password_salt,
         wrapped_user_key, wrapped_user_key_iv, wrapped_user_key_tag,
         created_at, last_active_at
       ) VALUES (?, ?, ?, 'hash', 'salt', ?, ?, ?, ?, ?)`,
    ).run(
      userId,
      email,
      displayName,
      wrapped.ciphertext,
      wrapped.iv,
      wrapped.tag,
      now,
      now,
    );
  }
  const sessionToken = `private-session-${accountCount}`;
  secretAccountValues.push(sessionToken);
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    sessionToken,
    `private-account-${accountCount}-0`,
    new Date(Date.now() + 60_000).toISOString(),
  );

  const gate = new AccountVaultMaintenanceGate();
  const handler = createPrismRequestHandler({
    db,
    config,
    fetchImpl: async () => new Response("{}", { status: 200 }),
    vaultMaintenanceGate: gate,
  });
  const authenticatedHeaders = {
    cookie: `${config.sessionCookieName}=${sessionToken}`,
  };

  try {
    const inactiveAuthenticated = await requestHandlerDirectly(
      handler,
      "/api/conversations",
      authenticatedHeaders,
    );
    gate.transition({
      phase: "migrating",
      completedUnits: 3,
      totalUnits: 8,
    });
    const blockedAuthenticated = await requestHandlerDirectly(
      handler,
      "/api/conversations",
      authenticatedHeaders,
    );
    const blockedPayload = JSON.parse(blockedAuthenticated.body) as Record<
      string,
      unknown
    >;
    const health = await requestHandlerDirectly(handler, "/api/health");
    const status = await requestHandlerDirectly(
      handler,
      "/api/vault-maintenance/status",
    );
    const statusPayload = JSON.parse(status.body) as Record<string, unknown>;

    const publicPayloads = JSON.stringify({ blockedPayload, statusPayload });
    for (const secret of secretAccountValues) {
      assert.equal(publicPayloads.includes(secret), false);
    }
    assert.equal(publicPayloads.includes("userId"), false);
    assert.equal(publicPayloads.includes("accountId"), false);
    assert.equal(publicPayloads.includes("content"), false);

    return {
      inactiveAuthenticatedStatus: inactiveAuthenticated.status,
      blockedAuthenticatedStatus: blockedAuthenticated.status,
      blockedPayload,
      healthStatus: health.status,
      statusPayload,
    };
  } finally {
    db.close();
  }
}

describe("account Vault maintenance HTTP boundary", () => {
  it("guards authenticated content and remains two/four-account neutral", async () => {
    const twoAccounts = await exerciseRoutes(2);
    const fourAccounts = await exerciseRoutes(4);

    for (const result of [twoAccounts, fourAccounts]) {
      assert.equal(result.inactiveAuthenticatedStatus, 200);
      assert.equal(result.blockedAuthenticatedStatus, 503);
      assert.equal(result.healthStatus, 200);
      assert.deepEqual(result.statusPayload, {
        ok: true,
        vaultMaintenance: {
          contractVersion: 1,
          active: true,
          phase: "migrating",
          progress: { completedUnits: 3, totalUnits: 8, percent: 37 },
          failureCode: "none",
          retryAfterSeconds: 5,
        },
      });
    }
    assert.deepEqual(twoAccounts.statusPayload, fourAccounts.statusPayload);
    assert.deepEqual(twoAccounts.blockedPayload, fourAccounts.blockedPayload);
  });
});
