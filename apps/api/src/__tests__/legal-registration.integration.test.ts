import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { getAppConfig } from "@localai/config";
import {
  PRISM_EULA_ACCEPTANCE_SNAPSHOT,
  PRISM_EULA_CONTENT_SHA256,
  PRISM_EULA_DOCUMENT_ID,
  PRISM_EULA_VERSION,
} from "@localai/shared";

import { createTestDatabase } from "../test-support.ts";

process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.ENCRYPTION_MASTER_KEY = "legal-registration-test-master-key";

const { createPrismRequestHandler } = await import("../server.ts");
const db = createTestDatabase();
const handler = createPrismRequestHandler({
  db,
  config: {
    ...getAppConfig(),
    apiPort: 0,
    sessionCookieName: "prism_legal_registration_session",
    lanAccessEnabled: false,
    discoveryEnabled: false,
    openAiApiKey: "",
    anthropicApiKey: "",
    elevenLabsApiKey: "",
  },
});

interface DirectResponse {
  status: number;
  headers: Map<string, string>;
  payload: Record<string, unknown>;
}

function registrationBody(
  username: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    username,
    password: "legal-registration-password",
    minimumAgeConfirmed: true,
    eulaAccepted: true,
    eulaVersion: PRISM_EULA_VERSION,
    ...overrides,
  };
}

async function register(body: Record<string, unknown>): Promise<DirectResponse> {
  const rawBody = JSON.stringify(body);
  const req = Readable.from([Buffer.from(rawBody)]) as IncomingMessage;
  req.method = "POST";
  req.url = "/api/auth/register";
  req.headers = { host: "localhost", "content-type": "application/json" };

  const headers = new Map<string, string>();
  let responseBody = "";
  const res = {
    statusCode: 200,
    writableEnded: false,
    destroyed: false,
    setHeader(name: string, value: string | number | readonly string[]) {
      headers.set(
        name.toLowerCase(),
        Array.isArray(value) ? value.join(", ") : String(value),
      );
      return this;
    },
    end(chunk?: string | Buffer) {
      if (chunk !== undefined) responseBody += chunk.toString();
      this.writableEnded = true;
      return this;
    },
  } as unknown as ServerResponse<IncomingMessage>;

  await handler(req, res);
  return {
    status: res.statusCode,
    headers,
    payload: JSON.parse(responseBody) as Record<string, unknown>,
  };
}

after(() => {
  db.close();
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.ENCRYPTION_MASTER_KEY;
});

describe("signup EULA enforcement", () => {
  it("creates no account or session when age or agreement consent is missing", async () => {
    const cases: Array<{
      username: string;
      overrides: Record<string, unknown>;
      expectedStatus: number;
    }> = [
      {
        username: "legal-no-age@example.com",
        overrides: { minimumAgeConfirmed: false },
        expectedStatus: 400,
      },
      {
        username: "legal-no-consent@example.com",
        overrides: { eulaAccepted: false },
        expectedStatus: 400,
      },
      {
        username: "legal-stale-version@example.com",
        overrides: { eulaVersion: "2026-01-01" },
        expectedStatus: 409,
      },
    ];

    for (const testCase of cases) {
      const response = await register(
        registrationBody(testCase.username, testCase.overrides),
      );
      assert.equal(response.status, testCase.expectedStatus);
      assert.equal(response.headers.get("set-cookie"), undefined);
      const user = db
        .prepare("SELECT id FROM users WHERE email = ?")
        .get(testCase.username);
      assert.equal(user, undefined);
    }
    const acceptanceCount = db
      .prepare("SELECT COUNT(*) AS count FROM legal_acceptances")
      .get() as { count: number };
    assert.equal(acceptanceCount.count, 0);
  });

  it("atomically stores the exact agreement evidence before creating a session", async () => {
    const acceptedAfter = Date.now();
    const response = await register(
      registrationBody("legal-accepted@example.com"),
    );
    assert.equal(response.status, 201);
    assert.match(
      response.headers.get("set-cookie") ?? "",
      /prism_legal_registration_session=/u,
    );
    const payload = response.payload as unknown as { user: { id: string } };
    const acceptance = db
      .prepare(
        `SELECT document_id, document_version, document_hash,
                document_snapshot, acceptance_method,
                minimum_age_confirmed, accepted_at
           FROM legal_acceptances
          WHERE user_id = ?`,
      )
      .get(payload.user.id) as
      | {
          document_id: string;
          document_version: string;
          document_hash: string;
          document_snapshot: string;
          acceptance_method: string;
          minimum_age_confirmed: number;
          accepted_at: string;
        }
      | undefined;

    assert.ok(acceptance);
    assert.deepEqual({ ...acceptance }, {
      document_id: PRISM_EULA_DOCUMENT_ID,
      document_version: PRISM_EULA_VERSION,
      document_hash: PRISM_EULA_CONTENT_SHA256,
      document_snapshot: PRISM_EULA_ACCEPTANCE_SNAPSHOT,
      acceptance_method: "signup_clickwrap",
      minimum_age_confirmed: 1,
      accepted_at: acceptance.accepted_at,
    });
    const acceptedAtMs = Date.parse(acceptance.accepted_at);
    assert.ok(Number.isFinite(acceptedAtMs));
    assert.ok(acceptedAtMs >= acceptedAfter);
    assert.ok(acceptedAtMs <= Date.now());
  });
});
