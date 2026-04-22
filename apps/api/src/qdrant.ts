import { getAppConfig } from "@localai/config";

const config = getAppConfig();

const COLLECTION_NAME = "memories";
const VECTOR_DIM = 1536;

async function qdrantFetch(path: string, options?: RequestInit): Promise<Response> {
  return fetch(`${config.qdrantUrl}${path}`, {
    headers: { "content-type": "application/json" },
    ...options,
  });
}

export async function ensureCollection(): Promise<void> {
  const check = await qdrantFetch(`/collections/${COLLECTION_NAME}`);
  if (check.ok) {
    return;
  }
  await qdrantFetch(`/collections/${COLLECTION_NAME}`, {
    method: "PUT",
    body: JSON.stringify({
      vectors: { size: VECTOR_DIM, distance: "Cosine" },
    }),
  });
}

export async function upsertVector(
  pointId: string,
  vector: number[],
  payload: Record<string, unknown>
): Promise<void> {
  const paddedVector = normalizeVector(vector, VECTOR_DIM);
  await qdrantFetch(`/collections/${COLLECTION_NAME}/points`, {
    method: "PUT",
    body: JSON.stringify({
      points: [{ id: pointId, vector: paddedVector, payload }],
    }),
  });
}

export async function searchVectors(
  vector: number[],
  userId: string,
  limit = 5
): Promise<Array<{ id: string; score: number; payload: Record<string, unknown> }>> {
  const paddedVector = normalizeVector(vector, VECTOR_DIM);
  const response = await qdrantFetch(`/collections/${COLLECTION_NAME}/points/search`, {
    method: "POST",
    body: JSON.stringify({
      vector: paddedVector,
      limit,
      filter: {
        must: [{ key: "userId", match: { value: userId } }],
      },
      with_payload: true,
    }),
  });
  if (!response.ok) {
    return [];
  }
  const body = (await response.json()) as {
    result?: Array<{ id: string | number; score: number; payload?: Record<string, unknown> }>;
  };
  return (body.result ?? []).map((r) => ({
    id: String(r.id),
    score: r.score,
    payload: r.payload ?? {},
  }));
}

export async function deleteVector(pointId: string): Promise<void> {
  await qdrantFetch(`/collections/${COLLECTION_NAME}/points/delete`, {
    method: "POST",
    body: JSON.stringify({ points: [pointId] }),
  });
}

export async function deleteVectorsForUser(userId: string): Promise<void> {
  await qdrantFetch(`/collections/${COLLECTION_NAME}/points/delete`, {
    method: "POST",
    body: JSON.stringify({
      filter: {
        must: [{ key: "userId", match: { value: userId } }],
      },
    }),
  });
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
