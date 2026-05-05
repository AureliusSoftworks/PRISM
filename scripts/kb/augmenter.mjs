import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadCache, saveCache } from "./cache.mjs";

const SUMMARY_START = "<!-- kb:summary:start -->";
const SUMMARY_END = "<!-- kb:summary:end -->";
const RELATED_START = "<!-- kb:related:start -->";
const RELATED_END = "<!-- kb:related:end -->";

function replaceBetweenMarkers(content, startMarker, endMarker, replacement) {
  const start = content.indexOf(startMarker);
  const end = content.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    return content;
  }
  const prefix = content.slice(0, start + startMarker.length);
  const suffix = content.slice(end);
  return `${prefix}\n${replacement}\n${suffix}`;
}

function createSummaryPrompt(record) {
  return [
    "You are summarizing a generated engineering knowledge-base note.",
    "Write 1-2 concise sentences in plain language.",
    "Focus on why this note matters in PRISM.",
    "Do not use markdown bullets.",
    "",
    `Title: ${record.title}`,
    `Type: ${record.type}`,
    `Source: ${record.sourcePath}`,
    "",
    "Content snippet:",
    record.embeddingText.slice(0, 3500),
  ].join("\n");
}

async function requestOllamaSummary({ host, model, prompt }) {
  const response = await fetch(`${host.replace(/\/$/, "")}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: 0.2 },
    }),
  });
  if (!response.ok) {
    throw new Error(`Ollama summary request failed (${response.status})`);
  }
  const payload = await response.json();
  return String(payload.response ?? "").trim();
}

async function requestOllamaEmbedding({ host, model, input }) {
  const response = await fetch(`${host.replace(/\/$/, "")}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: input.slice(0, 6000),
    }),
  });
  if (!response.ok) {
    throw new Error(`Ollama embedding request failed (${response.status})`);
  }
  const payload = await response.json();
  const vector = payload.embedding ?? payload.data?.[0]?.embedding;
  if (!Array.isArray(vector) || !vector.length) {
    throw new Error("Embedding response did not include a vector");
  }
  return vector;
}

async function ensureQdrantCollection({ qdrantUrl, collection, vectorSize }) {
  const base = qdrantUrl.replace(/\/$/, "");
  await fetch(`${base}/collections/${collection}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vectors: {
        size: vectorSize,
        distance: "Cosine",
      },
    }),
  });
}

async function upsertQdrantPoint({ qdrantUrl, collection, point }) {
  const base = qdrantUrl.replace(/\/$/, "");
  const response = await fetch(
    `${base}/collections/${collection}/points?wait=true`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        points: [point],
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Qdrant upsert failed (${response.status})`);
  }
}

async function searchQdrantRelated({ qdrantUrl, collection, vector, limit }) {
  const base = qdrantUrl.replace(/\/$/, "");
  const response = await fetch(
    `${base}/collections/${collection}/points/search`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vector,
        limit,
        with_payload: true,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Qdrant search failed (${response.status})`);
  }
  const payload = await response.json();
  return payload.result ?? [];
}

export async function augmentVault({
  repoRoot,
  vaultDir,
  changedSourcePaths = null,
  maxNotes = 40,
}) {
  const manifestPath = path.join(repoRoot, vaultDir, ".kb-manifest.json");
  const manifestRaw = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(manifestRaw);
  const cache = await loadCache(repoRoot);

  const ollamaHost = process.env.OLLAMA_HOST?.trim() || "";
  const qdrantUrl = process.env.QDRANT_URL?.trim() || "";
  const summaryModel = process.env.OLLAMA_MODEL?.trim() || "llama3.2";
  const embedModel = process.env.OLLAMA_EMBED_MODEL?.trim() || "nomic-embed-text";
  const collection = process.env.KB_QDRANT_COLLECTION?.trim() || "prism_kb";

  const doAugment = Boolean(ollamaHost) && Boolean(qdrantUrl);
  const shouldProcessRecord = (record) => {
    if (!changedSourcePaths || !changedSourcePaths.size) {
      return true;
    }
    return changedSourcePaths.has(record.sourcePath);
  };

  const notesToUpdate = [];
  const recordsToProcess = manifest.records.filter((record) =>
    shouldProcessRecord(record),
  );
  const boundedRecords =
    maxNotes > 0 ? recordsToProcess.slice(0, maxNotes) : recordsToProcess;
  const skippedNotes = Math.max(recordsToProcess.length - boundedRecords.length, 0);
  let qdrantReady = false;
  let vectorSize = null;

  for (const record of boundedRecords) {
    const notePath = path.join(repoRoot, vaultDir, record.noteRelPath);
    let noteContent = await readFile(notePath, "utf8");

    if (!doAugment) {
      const noAiSummary = "_AI augmentation skipped (missing OLLAMA_HOST or QDRANT_URL)._";
      const noAiRelated = "_Semantic related links skipped (AI augmentation disabled)._";
      noteContent = replaceBetweenMarkers(noteContent, SUMMARY_START, SUMMARY_END, noAiSummary);
      noteContent = replaceBetweenMarkers(noteContent, RELATED_START, RELATED_END, noAiRelated);
      const previous = await readFile(notePath, "utf8");
      if (previous !== noteContent) {
        await writeFile(notePath, noteContent, "utf8");
      }
      continue;
    }

    const hashChanged = cache.hashes[record.id] !== record.hash;
    if (hashChanged || !cache.summaries[record.id]) {
      const prompt = createSummaryPrompt(record);
      try {
        cache.summaries[record.id] = await requestOllamaSummary({
          host: ollamaHost,
          model: summaryModel,
          prompt,
        });
      } catch {
        cache.summaries[record.id] = "_Summary unavailable (Ollama request failed)._";
      }
    }

    let relatedLinks = cache.related[record.id] ?? [];
    try {
      const embedding = await requestOllamaEmbedding({
        host: ollamaHost,
        model: embedModel,
        input: `${record.title}\n${record.embeddingText}`,
      });
      if (!qdrantReady) {
        vectorSize = embedding.length;
        await ensureQdrantCollection({
          qdrantUrl,
          collection,
          vectorSize,
        });
        qdrantReady = true;
      }
      await upsertQdrantPoint({
        qdrantUrl,
        collection,
        point: {
          id: record.id,
          vector: embedding,
          payload: {
            id: record.id,
            title: record.title,
            noteRelPath: record.noteRelPath,
            sourcePath: record.sourcePath,
          },
        },
      });
      const related = await searchQdrantRelated({
        qdrantUrl,
        collection,
        vector: embedding,
        limit: 6,
      });
      relatedLinks = related
        .filter((item) => item.payload?.id && item.payload.id !== record.id)
        .map((item) => item.payload.noteRelPath)
        .filter(Boolean)
        .slice(0, 5)
        .map((noteRelPath) => `[[${noteRelPath.replace(/\.md$/, "")}]]`);
      cache.related[record.id] = relatedLinks;
    } catch {
      relatedLinks = cache.related[record.id] ?? [];
    }

    const summaryText = cache.summaries[record.id] || "_Summary unavailable._";
    const relatedText = relatedLinks.length
      ? relatedLinks.map((item) => `- ${item}`).join("\n")
      : "_No semantic related links yet._";

    noteContent = replaceBetweenMarkers(
      noteContent,
      SUMMARY_START,
      SUMMARY_END,
      summaryText,
    );
    noteContent = replaceBetweenMarkers(
      noteContent,
      RELATED_START,
      RELATED_END,
      relatedText,
    );
    notesToUpdate.push({ notePath, noteContent });

    cache.hashes[record.id] = record.hash;
  }

  for (const item of notesToUpdate) {
    await writeFile(item.notePath, item.noteContent, "utf8");
  }

  await saveCache(repoRoot, cache);
  return {
    processedNotes: notesToUpdate.length,
    aiEnabled: doAugment,
    skippedNotes,
  };
}
