import { spawn } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import {
  access,
  mkdtemp,
  open,
  readdir,
  rm,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser, type Page } from "playwright";
import {
  REPLAY_VIDEO_HEIGHT,
  REPLAY_VIDEO_WIDTH,
  type ReplayTimelineV1,
} from "@localai/shared";
import { resolveAbsoluteUnderDataRoot } from "./image-storage.ts";
import { replayRenderAudioRelativePath } from "./replay-storage.ts";
import type {
  ReplayRenderChildJob,
  ReplayRenderChildResponse,
} from "./replay-render-worker-client.ts";

type BrowserRenderResult = {
  durationMs: number;
  timeline: ReplayTimelineV1;
  warning: string | null;
};

function send(response: ReplayRenderChildResponse): void {
  if (process.connected) process.send?.(response);
}

function isRenderJob(value: unknown): value is ReplayRenderChildJob {
  if (!value || typeof value !== "object") return false;
  const job = value as Partial<ReplayRenderChildJob>;
  return (
    job.type === "render" &&
    typeof job.id === "string" &&
    typeof job.userId === "string" &&
    typeof job.sessionToken === "string" &&
    typeof job.recordingId === "string" &&
    typeof job.sourceId === "string" &&
    typeof job.renderToken === "string" &&
    (job.renderKind === "standard" || job.renderKind === "premium") &&
    typeof job.webOrigin === "string"
  );
}

async function executable(path: string): Promise<boolean> {
  return access(path, fsConstants.X_OK).then(() => true).catch(() => false);
}

function defaultPlaywrightBrowserRoot(): string {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Caches", "ms-playwright");
  }
  if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA ?? homedir(), "ms-playwright");
  }
  return join(homedir(), ".cache", "ms-playwright");
}

async function findPlaywrightFfmpeg(): Promise<string> {
  const explicit = process.env.PRISM_FFMPEG_PATH?.trim();
  if (explicit && (await executable(explicit))) return explicit;
  const playwrightPackageRoot = dirname(
    fileURLToPath(import.meta.resolve("playwright-core/package.json")),
  );
  const configuredRoot = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim();
  const roots = [
    configuredRoot === "0"
      ? join(playwrightPackageRoot, ".local-browsers")
      : configuredRoot,
    defaultPlaywrightBrowserRoot(),
  ].filter((value): value is string => Boolean(value));
  const binaryNames =
    process.platform === "win32"
      ? ["ffmpeg.exe", "ffmpeg-win64.exe"]
      : process.platform === "darwin"
        ? ["ffmpeg-mac", "ffmpeg"]
        : ["ffmpeg-linux", "ffmpeg"];
  for (const root of roots) {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    const ffmpegDirectories = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("ffmpeg-"))
      .sort((a, b) => b.name.localeCompare(a.name));
    for (const directory of ffmpegDirectories) {
      for (const binaryName of binaryNames) {
        const candidate = join(root, directory.name, binaryName);
        if (await executable(candidate)) return candidate;
      }
    }
  }
  throw new Error(
    "PRISM could not find Playwright's FFmpeg runtime. Reinstall the Chromium render runtime.",
  );
}

export function replayMuxArguments(args: {
  visualPath: string;
  audioPath: string;
  outputPath: string;
  durationMs: number;
  title: string;
}): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    args.visualPath,
    "-i",
    args.audioPath,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "copy",
    "-t",
    (Math.max(1, args.durationMs) / 1_000).toFixed(3),
    "-metadata",
    `title=${args.title}`,
    "-metadata",
    "artist=PRISM",
    args.outputPath,
  ];
}

async function runCommand(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr = `${stderr}${chunk}`.slice(-4_000);
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(
            `Replay mux failed (${signal ?? code ?? "unknown"})${stderr.trim() ? `: ${stderr.trim()}` : "."}`,
          ),
        );
      }
    });
  });
}

function renderUrl(job: ReplayRenderChildJob): string {
  const url = new URL("/", job.webOrigin);
  url.searchParams.set("view", "botcast");
  url.searchParams.set("prismRenderRecording", job.recordingId);
  url.searchParams.set("prismRenderSource", job.sourceId);
  url.searchParams.set("prismRenderKind", job.renderKind);
  return url.toString();
}

async function waitForRenderState(
  page: Page,
  accepted: readonly string[],
  timeout: number,
): Promise<string> {
  await page.waitForFunction(
    (states) => {
      const root = document.querySelector<HTMLElement>(
        "[data-signal-background-render]",
      );
      const state = root?.dataset.signalBackgroundRenderState ?? "";
      return states.includes(state) || state === "failed";
    },
    accepted,
    { timeout },
  );
  const snapshot = await page.locator("[data-signal-background-render]").evaluate(
    (element) => ({
      state:
        (element as HTMLElement).dataset.signalBackgroundRenderState ?? "",
      error: (element as HTMLElement).dataset.signalBackgroundRenderError ?? "",
    }),
  );
  if (snapshot.state === "failed") {
    throw new Error(snapshot.error || "Signal background render failed.");
  }
  return snapshot.state;
}

async function uploadVideo(job: ReplayRenderChildJob, path: string): Promise<void> {
  const file = await open(path, "r");
  const chunk = Buffer.allocUnsafe(4 * 1024 * 1024);
  let position = 0;
  try {
    while (true) {
      const { bytesRead } = await file.read(chunk, 0, chunk.byteLength, position);
      if (bytesRead === 0) break;
      const response = await fetch(
        new URL(
          `/api/replays/${encodeURIComponent(job.recordingId)}/render-chunk`,
          job.webOrigin,
        ),
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${job.sessionToken}`,
            "content-type": "application/octet-stream",
            "x-prism-replay-token": job.renderToken,
            "x-prism-replay-position": String(position),
          },
          body: chunk.subarray(0, bytesRead),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? `Replay upload failed (${response.status}).`);
      }
      position += bytesRead;
    }
  } finally {
    await file.close();
  }
}

async function replayJson(
  job: ReplayRenderChildJob,
  path: string,
  method: "PATCH" | "POST",
  body: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(new URL(path, job.webOrigin), {
    method,
    headers: {
      authorization: `Bearer ${job.sessionToken}`,
      "content-type": "application/json",
      "x-prism-replay-token": job.renderToken,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(payload?.error ?? `Replay request failed (${response.status}).`);
  }
}

async function runReplay(job: ReplayRenderChildJob): Promise<void> {
  const workDirectory = await mkdtemp(join(tmpdir(), "prism-signal-render-"));
  const visualPath = join(workDirectory, "visual.webm");
  const outputPath = join(workDirectory, "episode.webm");
  const audioPath = resolveAbsoluteUnderDataRoot(
    replayRenderAudioRelativePath(
      job.userId,
      job.recordingId,
      job.renderToken,
    ),
  );
  let browser: Browser | null = null;
  let screencastStarted = false;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required"],
    });
    const context = await browser.newContext({
      viewport: { width: REPLAY_VIDEO_WIDTH, height: REPLAY_VIDEO_HEIGHT },
      deviceScaleFactor: 1,
      serviceWorkers: "block",
      reducedMotion: "no-preference",
      extraHTTPHeaders: {
        authorization: `Bearer ${job.sessionToken}`,
        "x-prism-replay-token": job.renderToken,
      },
    });
    await context.addInitScript(
      ({ token }) => {
        window.sessionStorage.setItem("prism_replay_render_token", token);
      },
      { token: job.renderToken },
    );
    const page = await context.newPage();
    await page.goto(renderUrl(job), {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await waitForRenderState(page, ["ready"], 5 * 60_000);
    await access(audioPath, fsConstants.R_OK);

    await page.screencast.start({
      path: visualPath,
      size: { width: REPLAY_VIDEO_WIDTH, height: REPLAY_VIDEO_HEIGHT },
      quality: 90,
    });
    screencastStarted = true;
    const started = await page.evaluate(() =>
      window.__PRISM_SIGNAL_BACKGROUND_RENDER__?.start() ?? false,
    );
    if (!started) throw new Error("Signal studio did not start its render clock.");
    await waitForRenderState(
      page,
      ["complete"],
      Math.max(10 * 60_000, job.durationMs * 2 + 5 * 60_000),
    );
    const result = await page.evaluate(
      () => window.__PRISM_SIGNAL_BACKGROUND_RENDER__?.result() ?? null,
    ) as BrowserRenderResult | null;
    if (!result?.timeline || !Number.isFinite(result.durationMs)) {
      throw new Error("Signal studio returned an invalid render result.");
    }
    await page.screencast.stop();
    screencastStarted = false;

    const ffmpeg = await findPlaywrightFfmpeg();
    await runCommand(
      ffmpeg,
      replayMuxArguments({
        visualPath,
        audioPath,
        outputPath,
        durationMs: result.durationMs,
        title: `PRISM Signal ${job.recordingId}`,
      }),
    );
    await replayJson(
      job,
      `/api/replays/${encodeURIComponent(job.recordingId)}/progress`,
      "PATCH",
      {
        renderToken: job.renderToken,
        status: "rendering",
        progress: 0.99,
      },
    );
    await uploadVideo(job, outputPath);
    await replayJson(
      job,
      `/api/replays/${encodeURIComponent(job.recordingId)}/complete`,
      "POST",
      {
        renderToken: job.renderToken,
        contentType: "video/webm",
        codec: "playwright-screencast/opus",
        durationMs: result.durationMs,
        warning: result.warning,
        timeline: result.timeline,
      },
    );
  } finally {
    if (screencastStarted && browser) {
      const pages = browser.contexts().flatMap((context) => context.pages());
      await Promise.all(
        pages.map((page) => page.screencast.stop().catch(() => undefined)),
      );
    }
    await browser?.close().catch(() => undefined);
    await rm(workDirectory, { recursive: true, force: true });
  }
}

let queue = Promise.resolve();
process.on("message", (message: unknown) => {
  if (!isRenderJob(message)) return;
  queue = queue.then(async () => {
    try {
      await runReplay(message);
      send({ type: "complete", id: message.id });
    } catch (error) {
      send({
        type: "error",
        id: message.id,
        message:
          error instanceof Error
            ? error.message
            : "Background replay rendering failed.",
      });
    }
  });
});

process.on("disconnect", () => process.removeAllListeners("message"));

declare global {
  interface Window {
    __PRISM_SIGNAL_BACKGROUND_RENDER__?: {
      start: () => boolean;
      result: () => BrowserRenderResult | null;
    };
  }
}
