import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type AddressInfo } from "node:http";
import { performance } from "node:perf_hooks";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getAppConfig } from "@localai/config";
import { PRISM_EULA_VERSION } from "@localai/shared";
import { createTestDatabase } from "../../apps/api/src/test-support.ts";
import type { LlmProvider } from "../../apps/api/src/providers.ts";

const ITERATIONS = 200;
const CHAT_ITERATIONS = 50;
const CONCURRENCY = 20;
const HEALTH_P95_BUDGET_MS = 200;
const READ_P95_BUDGET_MS = 500;
const CHAT_P95_BUDGET_MS = 1_500;

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

async function measure(
  label: string,
  work: () => void | Promise<void>,
  iterations = ITERATIONS
): Promise<number> {
  const samples: number[] = [];
  for (let index = 0; index < iterations; index += 1) {
    const startedAt = performance.now();
    await work();
    samples.push(performance.now() - startedAt);
  }
  const p95 = percentile(samples, 0.95);
  console.log(`${label}: p50=${percentile(samples, 0.5).toFixed(2)}ms p95=${p95.toFixed(2)}ms`);
  return p95;
}

const tempDir = mkdtempSync(join(tmpdir(), "prism-perf-"));
process.env.DB_PATH = join(tempDir, "perf.db");
process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.ENCRYPTION_MASTER_KEY = "performance-test-master-key";

try {
  const { createPrismRequestHandler } = await import("../../apps/api/src/server.ts");
  const db = createTestDatabase();
  const deterministicProvider: LlmProvider = {
    name: "local",
    async generateResponse(): Promise<string> {
      return "Performance stub response.";
    },
    async embedText(): Promise<number[]> {
      return [0];
    },
  };
  const providerFactory = (): LlmProvider => deterministicProvider;
  const networkStub: typeof fetch = async () =>
    new Response(JSON.stringify({ error: "network disabled in performance tests" }), {
      status: 503,
      headers: { "content-type": "application/json" },
    });
  const config = {
    ...getAppConfig(),
    apiPort: 0,
    lanAccessEnabled: false,
    discoveryEnabled: false,
    sessionCookieName: "prism_perf_session",
  };
  const server = createServer(
    createPrismRequestHandler({
      db,
      config,
      fetchImpl: networkStub,
      providerFactory,
      auxiliaryProviderFactory: providerFactory,
    })
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const registration = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      username: "perf@example.com",
      password: "perf-password",
      minimumAgeConfirmed: true,
      eulaAccepted: true,
      eulaVersion: PRISM_EULA_VERSION,
    }),
  });
  if (!registration.ok) throw new Error(`Performance registration failed: ${registration.status}`);
  const registered = (await registration.json()) as { user: { id: string } };
  const cookie = (registration.headers.get("set-cookie") ?? "").split(";", 1)[0] ?? "";
  db.prepare(
    "INSERT INTO conversations (id, user_id, title, conversation_mode, created_at, updated_at) VALUES (?, ?, ?, 'chat', ?, ?)"
  ).run(
    "perf-conversation",
    registered.user.id,
    "Performance conversation",
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T00:00:00.000Z"
  );
  for (let index = 0; index < 10_000; index += 1) {
    db.prepare(
      "INSERT INTO messages (id, conversation_id, user_id, role, content, created_at) VALUES (?, ?, ?, 'user', ?, ?)"
    ).run(
      `perf-message-${index}`,
      "perf-conversation",
      registered.user.id,
      `Performance message ${index}`,
      `2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`
    );
    db.prepare(
      "INSERT INTO memories (id, user_id, ciphertext, iv, tag, confidence, category, tier, durability, source, source_message_ids, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      `perf-memory-${index}`,
      registered.user.id,
      "ciphertext",
      "iv",
      "tag",
      0.9,
      "general",
      "long_term",
      0.9,
      "direct",
      "[]",
      `2026-01-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`
    );
  }

  const queryPlans = [
    db
      .prepare(
        "EXPLAIN QUERY PLAN SELECT id, title, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50"
      )
      .all(registered.user.id),
    db
      .prepare(
        "EXPLAIN QUERY PLAN SELECT id, content, created_at FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
      )
      .all(registered.user.id),
    db
      .prepare(
        "EXPLAIN QUERY PLAN SELECT id, confidence, created_at FROM memories WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
      )
      .all(registered.user.id),
  ] as Array<Array<{ detail?: string }>>;
  const queryPlanDetails = queryPlans.flat().map((row) => row.detail ?? "");
  console.log(`SQLite query plans: ${queryPlanDetails.join(" | ")}`);
  for (const indexName of [
    "idx_conversations_user_updated",
    "idx_messages_user_created",
    "idx_memories_user_created",
  ]) {
    if (!queryPlanDetails.some((detail) => detail.includes(indexName))) {
      throw new Error(`Expected SQLite query plan to use ${indexName}.`);
    }
  }

  const healthP95 = await measure("SQLite health-style probe", () => {
    db.prepare("SELECT 1 AS ok").get();
  });
  const readP95 = await measure("Authenticated conversation read", () => {
    db.prepare(
      "SELECT id, title, updated_at FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50"
    ).all(registered.user.id);
  });
  const messageReadP95 = await measure("10,000-row message read", () => {
    db.prepare(
      "SELECT id, role, content, created_at FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"
    ).all(registered.user.id);
  });

  const httpHealthP95 = await measure("HTTP API root probe", async () => {
    const response = await fetch(`${baseUrl}/`);
    if (!response.ok) throw new Error(`HTTP root returned ${response.status}`);
    await response.text();
  });
  const httpReadP95 = await measure("HTTP authenticated conversation read", async () => {
    const response = await fetch(`${baseUrl}/api/conversations`, {
      headers: { cookie },
    });
    if (!response.ok) throw new Error(`HTTP conversations returned ${response.status}`);
    await response.arrayBuffer();
  });

  const chatP95 = await measure(
    "HTTP deterministic stubbed chat",
    async () => {
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          message: "Performance chat probe",
          mode: "zen",
          preferredProvider: "local",
          incognito: true,
          ephemeralMessages: [],
        }),
      });
      if (!response.ok) throw new Error(`HTTP chat returned ${response.status}`);
      await response.arrayBuffer();
    },
    CHAT_ITERATIONS
  );

  const concurrentStartedAt = performance.now();
  const concurrentResponses = await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      const response = await fetch(`${baseUrl}/api/conversations`, {
        headers: { cookie },
      });
      return response.ok;
    })
  );
  const concurrentFailures = concurrentResponses.filter((ok) => !ok).length;
  console.log(
    `Concurrent HTTP probe (${CONCURRENCY} workers): ${(performance.now() - concurrentStartedAt).toFixed(2)}ms failures=${concurrentFailures}`
  );
  if (concurrentFailures > 0) {
    throw new Error(`Concurrent HTTP probe had ${concurrentFailures} failures.`);
  }

  if (healthP95 > HEALTH_P95_BUDGET_MS) {
    throw new Error(`Health probe exceeded ${HEALTH_P95_BUDGET_MS}ms p95 budget.`);
  }
  if (readP95 > READ_P95_BUDGET_MS) {
    throw new Error(`Authenticated read exceeded ${READ_P95_BUDGET_MS}ms p95 budget.`);
  }
  if (messageReadP95 > READ_P95_BUDGET_MS) {
    throw new Error(`10,000-row message read exceeded ${READ_P95_BUDGET_MS}ms p95 budget.`);
  }
  if (httpHealthP95 > HEALTH_P95_BUDGET_MS) {
    throw new Error(`HTTP root probe exceeded ${HEALTH_P95_BUDGET_MS}ms p95 budget.`);
  }
  if (httpReadP95 > READ_P95_BUDGET_MS) {
    throw new Error(`HTTP authenticated read exceeded ${READ_P95_BUDGET_MS}ms p95 budget.`);
  }
  if (chatP95 > CHAT_P95_BUDGET_MS) {
    throw new Error(`Deterministic stubbed chat exceeded ${CHAT_P95_BUDGET_MS}ms p95 budget.`);
  }
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  db.close();
} finally {
  delete process.env.DB_PATH;
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.ENCRYPTION_MASTER_KEY;
  rmSync(tempDir, { recursive: true, force: true });
}
