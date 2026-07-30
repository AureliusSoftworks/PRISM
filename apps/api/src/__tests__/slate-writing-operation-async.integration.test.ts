import assert from "node:assert/strict";
import { createServer, type AddressInfo } from "node:http";
import { after, describe, it } from "node:test";
import { getAppConfig } from "@localai/config";
import type {
  GenerateOptions,
  LlmProvider,
  ProviderMessage,
} from "../providers.ts";
import {
  createFetchRecorder,
  createTestDatabase,
  withTestRegistrationAcceptance,
} from "../test-support.ts";

process.env.PRISM_API_DISABLE_AUTOSTART = "1";
process.env.ENCRYPTION_MASTER_KEY = "slate-async-operation-test-key";
const requestFetch = globalThis.fetch.bind(globalThis);

interface PendingGeneration {
  signal: AbortSignal | undefined;
  resolve(value: string): void;
  reject(error: Error): void;
}

class GatedProvider implements LlmProvider {
  readonly name = "local" as const;
  readonly calls: ProviderMessage[][] = [];
  readonly pending: PendingGeneration[] = [];
  private immediateResponses: string[] = [];

  generateResponse(
    messages: ProviderMessage[],
    options?: GenerateOptions,
  ): Promise<string> {
    this.calls.push(messages.map((message) => ({ ...message })));
    const immediate = this.immediateResponses.shift();
    if (immediate !== undefined) return Promise.resolve(immediate);
    return new Promise<string>((resolve, reject) => {
      const pending = { signal: options?.signal, resolve, reject };
      this.pending.push(pending);
      options?.signal?.addEventListener(
        "abort",
        () => {
          const index = this.pending.indexOf(pending);
          if (index >= 0) this.pending.splice(index, 1);
          reject(new Error("generation aborted"));
        },
        { once: true },
      );
    });
  }

  async embedText(): Promise<number[]> {
    return [];
  }

  respondNext(value: string): void {
    const pending = this.pending.shift();
    if (pending) {
      pending.resolve(value);
      return;
    }
    this.immediateResponses.push(value);
  }
}

const { createPrismRequestHandler } = await import("../server.ts");
const db = createTestDatabase();
const provider = new GatedProvider();
const server = createServer(
  createPrismRequestHandler({
    db,
    config: {
      ...getAppConfig(),
      apiPort: 0,
      sessionCookieName: "prism_slate_async_operation_session",
      lanAccessEnabled: false,
      discoveryEnabled: false,
      openAiApiKey: "",
      anthropicApiKey: "",
      elevenLabsApiKey: "",
    },
    fetchImpl: createFetchRecorder(),
    providerFactory: () => provider,
    auxiliaryProviderFactory: () => provider,
  }),
);
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address() as AddressInfo;
const baseUrl = `http://127.0.0.1:${address.port}`;

function createClient() {
  let cookie = "";
  return {
    async request(path: string, init: RequestInit = {}) {
      init = withTestRegistrationAcceptance(path, init);
      const headers = new Headers(init.headers);
      if (cookie) headers.set("cookie", cookie);
      const response = await requestFetch(`${baseUrl}${path}`, {
        ...init,
        headers,
      });
      const setCookie = response.headers.get("set-cookie");
      if (setCookie) cookie = setCookie.split(";", 1)[0] ?? "";
      return response;
    },
  };
}

function jsonInit(
  value: Record<string, unknown>,
  method = "POST",
): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  };
}

async function jsonBody<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function waitForPending(count: number): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (provider.pending.length < count) {
    if (Date.now() >= deadline) {
      throw new Error(`Provider did not reach ${count} pending call(s).`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}

after(async () => {
  for (const pending of provider.pending.splice(0)) {
    pending.reject(new Error("test cleanup"));
  }
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  db.close();
  delete process.env.PRISM_API_DISABLE_AUTOSTART;
  delete process.env.ENCRYPTION_MASTER_KEY;
});

describe("Slate asynchronous writing operations", () => {
  it("exposes an operation before generation, stops in flight, and redirects without letting cancelled prose win", async () => {
    const client = createClient();
    assert.equal(
      (
        await client.request(
          "/api/auth/register",
          jsonInit({
            username: "async-slate-writer@example.com",
            password: "async-slate-writer-password",
          }),
        )
      ).status,
      201,
    );
    const project = await jsonBody<{ project: { id: string } }>(
      await client.request(
        "/api/slate/projects",
        jsonInit({
          title: "The Reachable Stop Button",
          spark: "A bell waits while the writer changes course.",
        }),
      ),
    );
    const projectId = project.project.id;
    assert.equal(
      (
        await client.request(
          `/api/slate/projects/${projectId}`,
          jsonInit(
            {
              structure: [
                {
                  id: "async-scene",
                  kind: "scene",
                  title: "The Bell",
                  summary: "The bell waits.",
                  direction: "",
                  status: "planned",
                  locked: false,
                },
              ],
            },
            "PATCH",
          ),
        )
      ).status,
      200,
    );
    const section = (
      await jsonBody<{ sections: Array<{ id: string }> }>(
        await client.request(`/api/slate/projects/${projectId}/sections`),
      )
    ).sections[0]!;

    const createResponse = await client.request(
      `/api/slate/projects/${projectId}/writing-operations`,
      jsonInit({
        sectionId: section.id,
        operation: "draft",
        direction: "Begin with the bell.",
        scope: "beat",
        idempotencyKey: "async-create-stop",
      }),
    );
    assert.equal(createResponse.status, 202);
    const created = await jsonBody<{
      operation: {
        id: string;
        status: string;
        revisionFingerprint: { value: string };
      };
    }>(createResponse);
    assert.equal(created.operation.status, "generating");

    const runPromise = client.request(
      `/api/slate/projects/${projectId}/writing-operations/${created.operation.id}/run`,
      jsonInit({
        revisionFingerprint: created.operation.revisionFingerprint.value,
        idempotencyKey: "async-run-stop",
      }),
    );
    await waitForPending(1);
    const activeSignal = provider.pending[0]!.signal;
    assert.equal(activeSignal?.aborted, false);
    const stopResponse = await client.request(
      `/api/slate/projects/${projectId}/writing-operations/${created.operation.id}/stop`,
      jsonInit({
        revisionFingerprint: created.operation.revisionFingerprint.value,
        idempotencyKey: "async-stop",
      }),
    );
    const stopText = await stopResponse.clone().text();
    assert.equal(stopResponse.status, 200, stopText);
    const stopped = await jsonBody<{
      operation?: { status: string };
    }>(stopResponse);
    assert.ok(stopped.operation, stopText);
    assert.equal(
      stopped.operation.status,
      "interrupted",
    );
    assert.equal(activeSignal?.aborted, true);
    const stoppedRun = await runPromise;
    assert.equal(stoppedRun.status, 200);
    assert.equal(
      (
        await jsonBody<{ operation: { status: string; proposal: null } }>(
          stoppedRun,
        )
      ).operation.status,
      "interrupted",
    );

    const secondCreate = await jsonBody<{
      operation: {
        id: string;
        status: string;
        revisionFingerprint: { value: string };
      };
    }>(
      await client.request(
        `/api/slate/projects/${projectId}/writing-operations`,
        jsonInit({
          sectionId: section.id,
          operation: "draft",
          direction: "Begin with rain.",
          scope: "beat",
          idempotencyKey: "async-create-redirect",
        }),
      ),
    );
    const secondRunPromise = client.request(
      `/api/slate/projects/${projectId}/writing-operations/${secondCreate.operation.id}/run`,
      jsonInit({
        revisionFingerprint: secondCreate.operation.revisionFingerprint.value,
        idempotencyKey: "async-run-redirected",
      }),
    );
    await waitForPending(1);
    const redirectedSignal = provider.pending[0]!.signal;
    const redirectResponse = await client.request(
      `/api/slate/projects/${projectId}/writing-operations/${secondCreate.operation.id}/redirect`,
      jsonInit({
        revisionFingerprint:
          secondCreate.operation.revisionFingerprint.value,
        idempotencyKey: "async-redirect",
        direction: "Begin with sunlight instead.",
      }),
    );
    assert.equal(redirectResponse.status, 202);
    const redirected = await jsonBody<{
      operation: {
        id: string;
        redirectOfOperationId: string | null;
        status: string;
        revisionFingerprint: { value: string };
      };
    }>(redirectResponse);
    assert.notEqual(redirected.operation.id, secondCreate.operation.id);
    assert.equal(
      redirected.operation.redirectOfOperationId,
      secondCreate.operation.id,
    );
    assert.equal(redirected.operation.status, "generating");
    assert.equal(redirectedSignal?.aborted, true);
    const cancelledRun = await secondRunPromise;
    assert.equal(cancelledRun.status, 200);
    assert.equal(
      (
        await jsonBody<{ operation: { status: string } }>(cancelledRun)
      ).operation.status,
      "cancelled",
    );

    provider.respondNext(
      "Sunlight touched the waiting bell before anyone reached the rope.",
    );
    const redirectedRun = await client.request(
      `/api/slate/projects/${projectId}/writing-operations/${redirected.operation.id}/run`,
      jsonInit({
        revisionFingerprint: redirected.operation.revisionFingerprint.value,
        idempotencyKey: "async-run-redirect",
      }),
    );
    assert.equal(redirectedRun.status, 200);
    const completed = await jsonBody<{
      operation: {
        status: string;
        proposal: { prose: string };
      };
    }>(redirectedRun);
    assert.equal(completed.operation.status, "proposed");
    assert.match(completed.operation.proposal.prose, /^Sunlight/u);
    assert.equal(
      (
        await jsonBody<{ section: { prose: string } }>(
          await client.request(
            `/api/slate/projects/${projectId}/sections/${section.id}`,
          ),
        )
      ).section.prose,
      "",
    );
  });
});
