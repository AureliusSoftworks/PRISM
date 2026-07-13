import { DatabaseSync } from "node:sqlite";
import { initializeDatabase } from "./db.ts";
import type { LlmProvider, ProviderMessage } from "./providers.ts";

/** Create an isolated database using the exact production schema and migrations. */
export function createTestDatabase(): DatabaseSync {
  return initializeDatabase(new DatabaseSync(":memory:"));
}

export function closeTestDatabase(db: DatabaseSync): void {
  db.close();
}

export function createDeterministicProvider(
  responses: readonly string[] = ["Deterministic test response."]
): LlmProvider & { calls: ProviderMessage[][] } {
  const queue = [...responses];
  const calls: ProviderMessage[][] = [];
  return {
    name: "local",
    calls,
    async generateResponse(messages: ProviderMessage[]): Promise<string> {
      calls.push(messages.map((message) => ({ ...message })));
      return queue.shift() ?? responses[responses.length - 1] ?? "";
    },
    async embedText(): Promise<number[]> {
      return [];
    },
  };
}

export interface FetchCallRecord {
  input: string;
  init?: RequestInit;
}

export function createFetchRecorder(
  response: Response = new Response("{}", { status: 200 })
): typeof fetch & { calls: FetchCallRecord[] } {
  const calls: FetchCallRecord[] = [];
  const fetchRecorder = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return response.clone();
  }) as typeof fetch & { calls: FetchCallRecord[] };
  fetchRecorder.calls = calls;
  return fetchRecorder;
}
