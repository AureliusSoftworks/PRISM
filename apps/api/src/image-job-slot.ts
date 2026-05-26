/**
 * Single in-flight image generation slot per user (chat `sendGeneratedImage` + Images panel).
 * Per-user mutex serializes acquire/release so two tabs cannot double-book.
 */
import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ChatMessage, ChatMode } from "@localai/shared";
import {
  hydrateAssistantMessageParts,
  serializeAssistantToolPayload,
} from "@localai/shared";
import { randomId } from "./security.ts";
import {
  runAssistantSentImageGeneration,
  type AssistantSentImageUserPrefs,
} from "./assistant-sent-image.ts";
import { getAuxiliaryProvider, type LlmProvider } from "./providers.ts";

function resolveImageJobWallMs(): number {
  const raw = process.env.PRISM_IMAGE_JOB_WALL_MS?.trim();
  if (raw && /^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n >= 120_000 && n <= 1_800_000) return n;
  }
  return 900_000;
}

const IMAGE_JOB_WALL_MS = resolveImageJobWallMs();
const FOLLOW_UP_MAX_TOKENS = 140;
const FOLLOW_UP_TEMPERATURE = 0.38;

class PerUserMutex {
  private tail: Promise<void> = Promise.resolve();

  runExclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    const prev = this.tail;
    let release!: () => void;
    const gate = new Promise<void>((res) => {
      release = res;
    });
    this.tail = prev.then(() => gate);
    return prev.then(() => fn()).finally(() => {
      release();
    });
  }
}

const userMutexes = new Map<string, PerUserMutex>();

function mutexFor(userId: string): PerUserMutex {
  let m = userMutexes.get(userId);
  if (!m) {
    m = new PerUserMutex();
    userMutexes.set(userId, m);
  }
  return m;
}

export type ImageJobSource = "chat_tool" | "images_panel";

export type RunningImageJob = {
  id: string;
  userId: string;
  conversationId: string | null;
  botId: string | null;
  mode: ChatMode;
  incognito: boolean;
  captionPrompt: string;
  userMessage: string;
  source: ImageJobSource;
  requestedSize: string;
  startedAt: string;
  abortController: AbortController;
};

const runningByUser = new Map<string, RunningImageJob>();
const runningByJobId = new Map<string, RunningImageJob>();

type CompletedImageJobPoll =
  | { status: "succeeded"; messages: ChatMessage[] }
  | { status: "failed"; error: string };

type CompletedWithOwner = CompletedImageJobPoll & { userId: string };

const completedWithOwner = new Map<string, CompletedWithOwner>();

/** Stale read OK — used only for LLM prompt hints. */
export function peekActiveImageJobForUser(userId: string): RunningImageJob | undefined {
  return runningByUser.get(userId);
}

export async function tryAcquireImageSlot(args: {
  userId: string;
  conversationId: string | null;
  botId: string | null;
  mode: ChatMode;
  incognito: boolean;
  captionPrompt: string;
  userMessage: string;
  source: ImageJobSource;
  requestedSize?: string;
}): Promise<{ ok: true; job: RunningImageJob } | { ok: false; busyJob: RunningImageJob }> {
  return mutexFor(args.userId).runExclusive(() => {
    const existing = runningByUser.get(args.userId);
    if (existing) {
      return { ok: false, busyJob: existing };
    }
    const job: RunningImageJob = {
      id: randomUUID(),
      userId: args.userId,
      conversationId: args.conversationId,
      botId: args.botId,
      mode: args.mode,
      incognito: args.incognito,
      captionPrompt: args.captionPrompt.trim(),
      userMessage: args.userMessage.trim(),
      source: args.source,
      requestedSize: args.requestedSize?.trim() || "1024x1024",
      startedAt: new Date().toISOString(),
      abortController: new AbortController(),
    };
    runningByUser.set(args.userId, job);
    runningByJobId.set(job.id, job);
    return { ok: true, job };
  });
}

export async function releaseImageSlot(userId: string): Promise<void> {
  return mutexFor(userId).runExclusive(() => {
    const job = runningByUser.get(userId);
    if (job) {
      runningByUser.delete(userId);
      runningByJobId.delete(job.id);
    }
  });
}

export async function finishImageJob(jobId: string, userId: string, result: CompletedImageJobPoll): Promise<void> {
  return mutexFor(userId).runExclusive(() => {
    const live = runningByUser.get(userId);
    if (!live || live.id !== jobId) return;
    runningByUser.delete(userId);
    runningByJobId.delete(jobId);
    completedWithOwner.set(jobId, { ...result, userId });
  });
}

export type ImageJobPollResponse =
  | { ok: true; status: "running" }
  | { ok: true; status: "succeeded"; messages: ChatMessage[] }
  | { ok: true; status: "failed"; error: string }
  | { ok: false; error: "not_found" | "forbidden" };

export function pollImageJobForUser(userId: string, jobId: string): ImageJobPollResponse {
  const running = runningByJobId.get(jobId);
  if (running) {
    if (running.userId !== userId) return { ok: false, error: "forbidden" };
    return { ok: true, status: "running" };
  }
  const done = completedWithOwner.get(jobId);
  if (!done || done.userId !== userId) {
    return { ok: false, error: "not_found" };
  }
  completedWithOwner.delete(jobId);
  if (done.status === "succeeded") {
    return { ok: true, status: "succeeded", messages: done.messages };
  }
  return { ok: true, status: "failed", error: done.error };
}

export function conversationIdForImageGeneration(
  job: Pick<RunningImageJob, "conversationId" | "incognito">
): string | null {
  return job.incognito ? null : job.conversationId;
}

type MessageRow = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider: string | null;
  model: string | null;
  bot_name: string | null;
  bot_color: string | null;
  bot_glyph: string | null;
  tool_payload: string | null;
  created_at: string;
};

function rowToChatMessage(row: MessageRow): ChatMessage {
  const base: ChatMessage = {
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    provider:
      row.provider === "local" || row.provider === "openai" ? row.provider : undefined,
    model: row.model ?? undefined,
    botName: row.bot_name ?? undefined,
    botColor: row.bot_color ?? undefined,
    botGlyph: row.bot_glyph ?? undefined,
  };
  if (row.role !== "assistant") return base;
  const assembled = hydrateAssistantMessageParts({
    content: row.content,
    toolPayload: row.tool_payload,
  });
  return {
    ...base,
    content: assembled.content,
    ...(assembled.moodKey ? { moodKey: assembled.moodKey } : {}),
    ...(assembled.moodConfidence !== undefined ? { moodConfidence: assembled.moodConfidence } : {}),
    ...(assembled.askQuestion ? { askQuestion: assembled.askQuestion } : {}),
    ...(assembled.sentGeneratedImage ? { sentGeneratedImage: assembled.sentGeneratedImage } : {}),
  };
}

function fetchHydratedMessagesByIds(
  db: DatabaseSync,
  userId: string,
  ids: readonly string[]
): ChatMessage[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `SELECT m.id, m.role, m.content, m.provider, m.model, m.tool_payload, m.created_at,
              b.name AS bot_name, b.color AS bot_color, b.glyph AS bot_glyph
         FROM messages m
         LEFT JOIN bots b ON b.id = m.bot_id
        WHERE m.user_id = ? AND m.id IN (${placeholders})
        ORDER BY m.created_at ASC`
    )
    .all(userId, ...ids) as MessageRow[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => {
    const row = byId.get(id);
    if (!row) {
      throw new Error(`Missing message row for id ${id}`);
    }
    return rowToChatMessage(row);
  });
}

function clampPersonaSnippet(text: string, max = 1800): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

async function inferImageReadyFollowUpText(args: {
  auxiliaryProvider: LlmProvider;
  botName: string | undefined;
  botSystemPrompt: string | undefined;
  userMessage: string;
  captionPrompt: string;
}): Promise<string> {
  const name = args.botName?.trim() || "Assistant";
  const persona = clampPersonaSnippet(args.botSystemPrompt?.trim() ?? "");
  const system = [
    `You are ${name}, continuing a chat.`,
    persona ? `Persona (stay in voice; excerpt):\n${persona}` : "",
    "The user's requested image just finished generating and will appear as the next bubble in the thread.",
    "Write ONE short follow-up (1–3 sentences): tell them it's ready, stay in character, warm and natural.",
    "Do not paste the full image prompt. No JSON, no tools, no markdown code fences.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const userBlock = [
    `User's last message: ${args.userMessage}`,
    `Image topic (for context only): ${args.captionPrompt}`,
  ].join("\n");
  try {
    const raw = await args.auxiliaryProvider.generateResponse(
      [
        { role: "system", content: system },
        { role: "user", content: userBlock },
      ],
      {
        temperature: FOLLOW_UP_TEMPERATURE,
        maxTokens: FOLLOW_UP_MAX_TOKENS,
      }
    );
    const line = raw.trim().replace(/\s+/g, " ");
    if (line.length > 0 && line.length < 1200) return line;
  } catch {
    /* fall through */
  }
  return "Here's that image you asked for — it should show up just below.";
}

async function failJobWithDbNote(args: {
  db: DatabaseSync;
  job: RunningImageJob;
  chatProviderName: string;
  chatModelUsed: string;
  errorUserLine: string;
}): Promise<void> {
  const { db, job, chatProviderName, chatModelUsed, errorUserLine } = args;
  if (!job.conversationId || job.incognito) {
    await finishImageJob(job.id, job.userId, { status: "failed", error: errorUserLine });
    return;
  }
  const failId = randomId(12);
  const ts = new Date().toISOString();
  try {
    db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      db.prepare(
        `INSERT INTO messages (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
         VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, NULL, ?)`
      ).run(failId, job.conversationId, job.userId, errorUserLine, chatProviderName, chatModelUsed, job.botId, ts);
      db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?").run(
        ts,
        job.conversationId,
        job.userId
      );
      db.exec("COMMIT");
    } catch {
      db.exec("ROLLBACK");
      throw new Error("tx");
    }
    const hydrated = fetchHydratedMessagesByIds(db, job.userId, [failId]);
    await finishImageJob(job.id, job.userId, { status: "succeeded", messages: hydrated });
  } catch {
    await finishImageJob(job.id, job.userId, { status: "failed", error: errorUserLine });
  }
}

async function finishJobWithAssistantNote(args: {
  db: DatabaseSync;
  job: RunningImageJob;
  chatProviderName: string;
  chatModelUsed: string;
  content: string;
}): Promise<void> {
  const { db, job, chatProviderName, chatModelUsed, content } = args;
  const ts = new Date().toISOString();
  const prov =
    chatProviderName === "local" || chatProviderName === "openai" ? chatProviderName : undefined;
  if (!job.conversationId || job.incognito) {
    await finishImageJob(job.id, job.userId, {
      status: "succeeded",
      messages: [
        {
          id: randomId(12),
          role: "assistant",
          content,
          createdAt: ts,
          provider: prov,
          model: chatModelUsed,
        },
      ],
    });
    return;
  }

  const noteId = randomId(12);
  try {
    db.exec("BEGIN IMMEDIATE TRANSACTION");
    try {
      db.prepare(
        `INSERT INTO messages (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
         VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, NULL, ?)`
      ).run(
        noteId,
        job.conversationId,
        job.userId,
        content,
        chatProviderName,
        chatModelUsed,
        job.botId,
        ts
      );
      db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?").run(
        ts,
        job.conversationId,
        job.userId
      );
      db.exec("COMMIT");
    } catch {
      db.exec("ROLLBACK");
      throw new Error("tx");
    }
    const hydrated = fetchHydratedMessagesByIds(db, job.userId, [noteId]);
    await finishImageJob(job.id, job.userId, { status: "succeeded", messages: hydrated });
  } catch {
    await finishImageJob(job.id, job.userId, {
      status: "succeeded",
      messages: [
        {
          id: randomId(12),
          role: "assistant",
          content,
          createdAt: ts,
          provider: prov,
          model: chatModelUsed,
        },
      ],
    });
  }
}

/**
 * Fire-and-forget: generates image, follow-up line, persists messages (or in-memory envelope for incognito).
 */
export function startChatImageBackgroundJob(args: {
  db: DatabaseSync;
  job: RunningImageJob;
  preferredProvider: "local" | "openai";
  openAiApiKey: string | undefined;
  prefs: AssistantSentImageUserPrefs;
  prismDefaultLlmModel: string | null | undefined;
  chatModelUsed: string;
  chatProviderName: string;
  botName?: string;
  botSystemPrompt?: string;
}): void {
  const {
    db,
    job,
    preferredProvider,
    openAiApiKey,
    prefs,
    prismDefaultLlmModel,
    chatModelUsed,
    chatProviderName,
    botName,
    botSystemPrompt,
  } = args;

  const wallTimer = setTimeout(() => {
    job.abortController.abort();
  }, IMAGE_JOB_WALL_MS);

  void (async () => {
    const auxiliaryProvider = getAuxiliaryProvider(prismDefaultLlmModel);
    try {
      const result = await runAssistantSentImageGeneration({
        db,
        userId: job.userId,
        mode: job.mode,
        conversationId: conversationIdForImageGeneration(job),
        botIdTriState: job.botId,
        userMessage: job.userMessage,
        captionPrompt: job.captionPrompt,
        requestedSize: job.requestedSize,
        preferredProvider,
        openAiApiKey,
        prefs,
        promptRepairProvider: auxiliaryProvider,
        signal: job.abortController.signal,
      });

      if (result.status === "denied") {
        await finishJobWithAssistantNote({
          db,
          job,
          chatProviderName,
          chatModelUsed,
          content: result.message,
        });
        return;
      }

      if (result.status !== "succeeded") {
        await failJobWithDbNote({
          db,
          job,
          chatProviderName,
          chatModelUsed,
          errorUserLine:
            "I couldn't finish that image — something went wrong with generation or settings. You can try again in a bit.",
        });
        return;
      }

      const payload = result.payload;

      const followUp = await inferImageReadyFollowUpText({
        auxiliaryProvider,
        botName,
        botSystemPrompt,
        userMessage: job.userMessage,
        captionPrompt: job.captionPrompt,
      });

      const imageModelTag = payload.imageModel?.trim() || chatModelUsed;
      const toolPayloadImage = serializeAssistantToolPayload({ sentGeneratedImage: payload });

      if (job.incognito || !job.conversationId) {
        const tFollow = new Date().toISOString();
        const tImg = new Date(Date.now() + 2).toISOString();
        const followId = randomId(12);
        const imageRowId = randomId(12);
        const prov =
          chatProviderName === "local" || chatProviderName === "openai" ? chatProviderName : undefined;
        const messages: ChatMessage[] = [
          {
            id: followId,
            role: "assistant",
            content: followUp,
            createdAt: tFollow,
            provider: prov,
            model: chatModelUsed,
          },
          {
            id: imageRowId,
            role: "assistant",
            content: "",
            createdAt: tImg,
            provider: prov,
            model: imageModelTag,
            sentGeneratedImage: payload,
          },
        ];
        await finishImageJob(job.id, job.userId, { status: "succeeded", messages });
        return;
      }

      const followUpId = randomId(12);
      const imageMsgId = randomId(12);
      const tFollow = new Date().toISOString();
      const tImg = new Date(Date.now() + 2).toISOString();

      db.exec("BEGIN IMMEDIATE TRANSACTION");
      try {
        db.prepare(
          `INSERT INTO messages (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
           VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, NULL, ?)`
        ).run(
          followUpId,
          job.conversationId,
          job.userId,
          followUp,
          chatProviderName,
          chatModelUsed,
          job.botId,
          tFollow
        );
        db.prepare(
          `INSERT INTO messages (id, conversation_id, user_id, role, content, provider, model, bot_id, tool_payload, created_at)
           VALUES (?, ?, ?, 'assistant', '', ?, ?, ?, ?, ?)`
        ).run(
          imageMsgId,
          job.conversationId,
          job.userId,
          chatProviderName,
          imageModelTag,
          job.botId,
          toolPayloadImage,
          tImg
        );
        db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ? AND user_id = ?").run(
          tImg,
          job.conversationId,
          job.userId
        );
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }

      const hydrated = fetchHydratedMessagesByIds(db, job.userId, [followUpId, imageMsgId]);
      await finishImageJob(job.id, job.userId, { status: "succeeded", messages: hydrated });
    } catch (err) {
      const aborted = job.abortController.signal.aborted;
      const msg = err instanceof Error ? err.message : String(err);
      await failJobWithDbNote({
        db,
        job,
        chatProviderName,
        chatModelUsed,
        errorUserLine: aborted
          ? "That image took too long and was stopped. Try again with a simpler prompt or check ComfyUI."
          : `I couldn't finish that image (${msg.slice(0, 200)}).`,
      });
    } finally {
      clearTimeout(wallTimer);
    }
  })().catch((err) => {
    console.warn("[image-job-slot] background job crashed:", err);
    void finishImageJob(job.id, job.userId, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    });
  });
}
