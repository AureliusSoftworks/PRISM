import { getAppConfig } from "@localai/config";

const config = getAppConfig();

const COLLECTION_NAME = "memories";
const VECTOR_DIM = 1536;
const DEFAULT_QDRANT_REQUEST_TIMEOUT_MS = 1_000;

export interface QdrantRequestOptions {
  timeoutMs?: number;
}

async function qdrantFetch(
  path: string,
  operation: string,
  requestInit: RequestInit = {},
  requestOptions: QdrantRequestOptions = {},
): Promise<Response> {
  const requestedTimeoutMs =
    requestOptions.timeoutMs ?? DEFAULT_QDRANT_REQUEST_TIMEOUT_MS;
  const timeoutMs = Math.max(
    1,
    Number.isFinite(requestedTimeoutMs)
      ? Math.round(requestedTimeoutMs)
      : DEFAULT_QDRANT_REQUEST_TIMEOUT_MS,
  );
  const controller = new AbortController();
  let timedOut = false;
  let timeout: NodeJS.Timeout | null = null;
  const timeoutFailure = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(
        new Error(`Qdrant ${operation} timed out after ${timeoutMs}ms.`),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      fetch(`${config.qdrantUrl}${path}`, {
        ...requestInit,
        headers: {
          "content-type": "application/json",
          ...requestInit.headers,
        },
        signal: controller.signal,
      }),
      timeoutFailure,
    ]);
  } catch (error) {
    if (timedOut) {
      throw new Error(`Qdrant ${operation} timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function requireQdrantOk(response: Response, operation: string): void {
  if (!response.ok) {
    throw new Error(
      `Qdrant ${operation} failed with HTTP ${response.status}.`,
    );
  }
}

export async function ensureCollection(
  requestOptions: QdrantRequestOptions = {},
): Promise<void> {
  const check = await qdrantFetch(
    `/collections/${COLLECTION_NAME}`,
    "collection check",
    {},
    requestOptions,
  );
  if (check.ok) {
    return;
  }
  if (check.status !== 404) {
    requireQdrantOk(check, "collection check");
  }
  const create = await qdrantFetch(
    `/collections/${COLLECTION_NAME}`,
    "collection creation",
    {
      method: "PUT",
      body: JSON.stringify({
        vectors: { size: VECTOR_DIM, distance: "Cosine" },
      }),
    },
    requestOptions,
  );
  requireQdrantOk(create, "collection creation");
}

export async function upsertVector(
  pointId: string,
  vector: number[],
  payload: Record<string, unknown>,
  requestOptions: QdrantRequestOptions = {},
): Promise<void> {
  const paddedVector = normalizeVector(vector, VECTOR_DIM);
  const response = await qdrantFetch(
    `/collections/${COLLECTION_NAME}/points`,
    "point upsert",
    {
      method: "PUT",
      body: JSON.stringify({
        points: [{ id: pointId, vector: paddedVector, payload }],
      }),
    },
    requestOptions,
  );
  requireQdrantOk(response, "point upsert");
}

export async function searchVectors(
  vector: number[],
  userId: string,
  limit = 5,
  requestOptions: QdrantRequestOptions = {},
): Promise<Array<{ id: string; score: number; payload: Record<string, unknown> }>> {
  const paddedVector = normalizeVector(vector, VECTOR_DIM);
  const response = await qdrantFetch(
    `/collections/${COLLECTION_NAME}/points/search`,
    "point search",
    {
      method: "POST",
      body: JSON.stringify({
        vector: paddedVector,
        limit,
        filter: {
          must: [{ key: "userId", match: { value: userId } }],
        },
        with_payload: true,
      }),
    },
    requestOptions,
  );
  requireQdrantOk(response, "point search");
  const body = (await response.json()) as {
    result?: Array<{ id: string | number; score: number; payload?: Record<string, unknown> }>;
  };
  return (body.result ?? []).map((r) => ({
    id: String(r.id),
    score: r.score,
    payload: r.payload ?? {},
  }));
}

export async function deleteVector(
  pointId: string,
  requestOptions: QdrantRequestOptions = {},
): Promise<void> {
  const response = await qdrantFetch(
    `/collections/${COLLECTION_NAME}/points/delete`,
    "point deletion",
    {
      method: "POST",
      body: JSON.stringify({ points: [pointId] }),
    },
    requestOptions,
  );
  requireQdrantOk(response, "point deletion");
}

export async function deleteVectorsForUser(
  userId: string,
  requestOptions: QdrantRequestOptions = {},
): Promise<void> {
  const response = await qdrantFetch(
    `/collections/${COLLECTION_NAME}/points/delete`,
    "tenant point deletion",
    {
      method: "POST",
      body: JSON.stringify({
        filter: {
          must: [{ key: "userId", match: { value: userId } }],
        },
      }),
    },
    requestOptions,
  );
  requireQdrantOk(response, "tenant point deletion");
}

function normalizeVector(vec: number[], targetDim: number): number[] {
  if (vec.length === targetDim) {
    return vec;
  }
  if (vec.length > targetDim) {
    return vec.slice(0, targetDim);
  }
  const padded = new Array<number>(targetDim).fill(0);
  for (let i = 0; i < vec.length; i++) {
    padded[i] = vec[i];
  }
  return padded;
}
