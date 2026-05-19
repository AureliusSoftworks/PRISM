import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { homedir } from "node:os";
import type { AppConfig } from "@localai/config";

type SetupServiceState = "ready" | "needs_setup";

export interface SetupAutomationReport {
  steps: string[];
  services: {
    ollama: SetupServiceState;
    qdrant: SetupServiceState;
  };
}

export interface OllamaSetupStatus {
  cliInstalled: boolean;
  appInstalled: boolean;
  serviceReachable: boolean;
  llama31Installed: boolean;
  canAutoInstallCli: boolean;
  installerUrl: string;
}

const WAIT_SLICE_MS = 1_000;
const OLLAMA_WAIT_TIMEOUT_MS = 20_000;
const QDRANT_WAIT_TIMEOUT_MS = 15_000;
const QDRANT_FALLBACK_VERSION = process.env.QDRANT_VERSION?.trim() || "1.17.1";
const OLLAMA_INSTALLER_URL = "https://ollama.com/download";
const OLLAMA_REQUIRED_MODEL = "llama3.1";

function safeTrim(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function commandExists(command: string): boolean {
  const probe =
    process.platform === "win32"
      ? spawnSync("where", [command], { stdio: "ignore" })
      : spawnSync("which", [command], { stdio: "ignore" });
  return probe.status === 0;
}

function runCommand(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? -1}.`));
    });
  });
}

function startDetached(command: string, args: string[], envExtras?: Record<string, string>): void {
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      ...(envExtras ?? {}),
    },
  });
  child.unref();
}

function findExecutableRecursive(root: string, fileName: string): string | null {
  if (!existsSync(root)) return null;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    let entries: string[] = [];
    try {
      entries = readdirSync(current);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = join(current, entry);
      let info: ReturnType<typeof statSync> | null = null;
      try {
        info = statSync(fullPath);
      } catch {
        info = null;
      }
      if (!info) continue;
      if (info.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (info.isFile() && entry === fileName) {
        return fullPath;
      }
    }
  }
  return null;
}

function qdrantArchiveName(): string | null {
  if (process.platform === "darwin" && process.arch === "arm64") {
    return "qdrant-aarch64-apple-darwin.tar.gz";
  }
  if (process.platform === "darwin" && process.arch === "x64") {
    return "qdrant-x86_64-apple-darwin.tar.gz";
  }
  if (process.platform === "linux" && process.arch === "x64") {
    return "qdrant-x86_64-unknown-linux-gnu.tar.gz";
  }
  if (process.platform === "linux" && process.arch === "arm64") {
    return "qdrant-aarch64-unknown-linux-gnu.tar.gz";
  }
  return null;
}

function resolveLocalDataRoot(): string {
  const envRoot = safeTrim(process.env.LOCALAI_DATA_DIR);
  if (envRoot) {
    return envRoot;
  }

  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "Prism");
  }
  if (process.platform === "win32") {
    const localAppData = safeTrim(process.env.LOCALAPPDATA);
    if (localAppData) {
      return join(localAppData, "Prism");
    }
  }
  return join(homedir(), ".local", "share", "prism");
}

async function ensureDownloadedQdrantBinary(steps: string[]): Promise<string | null> {
  const archive = qdrantArchiveName();
  if (!archive) {
    steps.push(`No direct-download Qdrant archive mapping for ${process.platform}/${process.arch}.`);
    return null;
  }

  const dataDir = resolveLocalDataRoot();
  const binDir = join(dataDir, "bin");
  const outName = process.platform === "win32" ? "qdrant.exe" : "qdrant";
  const targetBinary = join(binDir, outName);
  mkdirSync(binDir, { recursive: true });

  const workDir = mkdtempSync(join(tmpdir(), "prism-qdrant-"));
  const archivePath = join(workDir, archive);
  const releaseUrl = `https://github.com/qdrant/qdrant/releases/download/v${QDRANT_FALLBACK_VERSION}/${archive}`;
  try {
    steps.push(`Downloading Qdrant ${QDRANT_FALLBACK_VERSION}...`);
    await runCommand("curl", ["--fail", "--location", "--show-error", releaseUrl, "--output", archivePath]);
    await runCommand("tar", ["-xzf", archivePath, "-C", workDir]);
    const extracted = findExecutableRecursive(workDir, outName) ?? findExecutableRecursive(workDir, "qdrant");
    if (!extracted) {
      steps.push("Qdrant download succeeded but the executable was not found in the archive.");
      return null;
    }
    copyFileSync(extracted, targetBinary);
    chmodSync(targetBinary, 0o755);
    steps.push(`Downloaded Qdrant binary to ${targetBinary}.`);
    return targetBinary;
  } catch (error) {
    const message = error instanceof Error ? error.message : "download failed";
    steps.push(`Direct Qdrant download failed: ${message}`);
    return null;
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

async function checkUrlOk(url: URL, timeoutMs = 2_500): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function ollamaTagsUrl(baseHost: string): URL {
  const url = new URL(baseHost);
  url.pathname = "/api/tags";
  url.search = "";
  return url;
}

function qdrantReadyzUrl(baseHost: string): URL {
  const url = new URL(baseHost);
  url.pathname = "/readyz";
  url.search = "";
  return url;
}

async function waitUntil(
  predicate: () => Promise<boolean>,
  timeoutMs: number
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_SLICE_MS));
  }
  return false;
}

async function fetchOllamaModelNames(ollamaHost: string): Promise<string[]> {
  const url = ollamaTagsUrl(ollamaHost);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return [];
    }
    const payload = (await response.json()) as {
      models?: Array<{ name?: unknown }>;
    };
    const models = (payload.models ?? [])
      .map((entry) => (typeof entry.name === "string" ? entry.name.trim() : ""))
      .filter((name) => name.length > 0);
    return Array.from(new Set(models));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function modelPresent(tags: string[], modelName: string): boolean {
  const target = safeTrim(modelName);
  if (!target) return false;
  return tags.some((tag) => tag === target || tag.startsWith(`${target}:`));
}

function localHostLike(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return (
      host === "127.0.0.1" ||
      host === "localhost" ||
      host === "::1" ||
      host === "0.0.0.0"
    );
  } catch {
    return false;
  }
}

function ollamaAppInstalled(): boolean {
  if (process.platform !== "darwin") return false;
  return (
    existsSync("/Applications/Ollama.app") ||
    existsSync(join(homedir(), "Applications", "Ollama.app"))
  );
}

export async function getOllamaSetupStatus(config: AppConfig): Promise<OllamaSetupStatus> {
  const cliInstalled = commandExists("ollama");
  const appInstalled = ollamaAppInstalled();
  const serviceReachable = await checkUrlOk(ollamaTagsUrl(config.ollamaHost));
  const tags = serviceReachable ? await fetchOllamaModelNames(config.ollamaHost) : [];
  return {
    cliInstalled,
    appInstalled,
    serviceReachable,
    llama31Installed: modelPresent(tags, OLLAMA_REQUIRED_MODEL),
    canAutoInstallCli: process.platform === "darwin" && commandExists("brew"),
    installerUrl: OLLAMA_INSTALLER_URL,
  };
}

export async function installOllamaCliAndRequiredModel(
  config: AppConfig
): Promise<{ status: OllamaSetupStatus; steps: string[] }> {
  const steps: string[] = [];
  let cliInstalled = commandExists("ollama");

  if (!cliInstalled) {
    const canAutoInstallCli = process.platform === "darwin" && commandExists("brew");
    if (canAutoInstallCli) {
      steps.push("Installing Ollama CLI with Homebrew...");
      try {
        await runCommand("brew", ["install", "--cask", "ollama"]);
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown install error";
        steps.push(`Ollama install failed: ${message}`);
      }
      cliInstalled = commandExists("ollama");
    } else {
      steps.push("Automatic Ollama CLI install is unavailable on this platform.");
    }
  }

  if (process.platform === "darwin" && ollamaAppInstalled()) {
    try {
      await runCommand("open", ["-a", "Ollama"]);
      steps.push("Requested Ollama app launch.");
    } catch {
      // Non-fatal; CLI service start below can still work.
    }
  }

  if (cliInstalled) {
    startDetached("ollama", ["serve"]);
    steps.push("Requested Ollama local service start.");
  }

  const serviceReachable = await waitUntil(
    () => checkUrlOk(ollamaTagsUrl(config.ollamaHost)),
    OLLAMA_WAIT_TIMEOUT_MS
  );
  if (!serviceReachable) {
    steps.push("Ollama service is still unreachable.");
    return {
      status: await getOllamaSetupStatus(config),
      steps,
    };
  }

  const tags = await fetchOllamaModelNames(config.ollamaHost);
  if (!modelPresent(tags, OLLAMA_REQUIRED_MODEL) && cliInstalled) {
    steps.push(`Pulling required model: ${OLLAMA_REQUIRED_MODEL}`);
    try {
      await runCommand("ollama", ["pull", OLLAMA_REQUIRED_MODEL]);
      steps.push(`Model downloaded: ${OLLAMA_REQUIRED_MODEL}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown pull error";
      steps.push(`Model download failed (${OLLAMA_REQUIRED_MODEL}): ${message}`);
    }
  } else if (modelPresent(tags, OLLAMA_REQUIRED_MODEL)) {
    steps.push(`Model ready: ${OLLAMA_REQUIRED_MODEL}`);
  }

  return {
    status: await getOllamaSetupStatus(config),
    steps,
  };
}

async function ensureOllamaReady(config: AppConfig, steps: string[]): Promise<boolean> {
  const tagsUrl = ollamaTagsUrl(config.ollamaHost);
  if (await checkUrlOk(tagsUrl)) {
    steps.push("Ollama is already reachable.");
    return true;
  }

  const hasOllama = commandExists("ollama");
  const hasBrew = process.platform === "darwin" && commandExists("brew");

  if (!hasOllama && hasBrew) {
    steps.push("Installing Ollama with Homebrew...");
    try {
      await runCommand("brew", ["install", "--cask", "ollama"]);
      steps.push("Ollama install completed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown install error";
      steps.push(`Ollama install failed: ${message}`);
    }
  } else if (!hasOllama) {
    steps.push("Ollama CLI is missing and no automatic installer is available on this platform.");
  }

  if (process.platform === "darwin") {
    try {
      await runCommand("open", ["-a", "Ollama"]);
      steps.push("Requested Ollama app launch.");
    } catch {
      // If the app is absent, fallback to CLI serve below.
    }
  }

  if (commandExists("ollama")) {
    startDetached("ollama", ["serve"]);
    steps.push("Requested Ollama local service start.");
  }

  const ready = await waitUntil(() => checkUrlOk(tagsUrl), OLLAMA_WAIT_TIMEOUT_MS);
  if (!ready) {
    steps.push("Ollama is still not reachable after automation.");
  }
  return ready;
}

async function ensureRequiredOllamaModels(config: AppConfig, steps: string[]): Promise<void> {
  const required = Array.from(
    new Set([safeTrim(config.ollamaModel), safeTrim(config.ollamaEmbeddingModel)].filter(Boolean))
  );
  if (required.length === 0) {
    return;
  }

  const currentTags = await fetchOllamaModelNames(config.ollamaHost);
  for (const model of required) {
    if (modelPresent(currentTags, model)) {
      steps.push(`Model ready: ${model}`);
      continue;
    }

    steps.push(`Pulling model: ${model}`);
    try {
      await runCommand("ollama", ["pull", model]);
      steps.push(`Model downloaded: ${model}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown pull error";
      steps.push(`Model download failed (${model}): ${message}`);
    }
  }
}

async function ensureQdrantReady(config: AppConfig, steps: string[]): Promise<boolean> {
  const readyzUrl = qdrantReadyzUrl(config.qdrantUrl);
  if (await checkUrlOk(readyzUrl)) {
    steps.push("Qdrant is already reachable.");
    return true;
  }

  if (!localHostLike(config.qdrantUrl)) {
    steps.push("Qdrant URL points to an external host; skipping local auto-start.");
    return false;
  }

  let qdrantCommandPath: string | null = commandExists("qdrant") ? "qdrant" : null;
  const hasBrew = process.platform === "darwin" && commandExists("brew");
  if (!qdrantCommandPath && hasBrew) {
    steps.push("Installing Qdrant with Homebrew...");
    try {
      await runCommand("brew", ["install", "qdrant"]);
      steps.push("Qdrant install completed.");
      qdrantCommandPath = commandExists("qdrant") ? "qdrant" : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown install error";
      steps.push(`Qdrant install failed: ${message}`);
    }
  }

  if (!qdrantCommandPath) {
    qdrantCommandPath = await ensureDownloadedQdrantBinary(steps);
  }

  if (!qdrantCommandPath) {
    steps.push("Qdrant binary not found for automatic start.");
    return false;
  }

  const dataDir = resolveLocalDataRoot();
  const storagePath = join(dataDir, "Qdrant", "storage");
  {
    try {
      mkdirSync(storagePath, { recursive: true });
    } catch {
      // Non-fatal; qdrant can still try defaults.
    }
  }

  const envExtras = {
    QDRANT__STORAGE__STORAGE_PATH: storagePath,
  };
  startDetached(qdrantCommandPath, [], envExtras);
  steps.push("Requested Qdrant local service start.");
  const ready = await waitUntil(() => checkUrlOk(readyzUrl), QDRANT_WAIT_TIMEOUT_MS);
  if (!ready) {
    steps.push("Qdrant is still not reachable after automation.");
  }
  return ready;
}

export async function runAutoSetup(config: AppConfig): Promise<SetupAutomationReport> {
  const steps: string[] = [];

  const ollamaReady = await ensureOllamaReady(config, steps);
  if (ollamaReady) {
    await ensureRequiredOllamaModels(config, steps);
  }

  const qdrantReady = await ensureQdrantReady(config, steps);

  const finalOllamaReady = await checkUrlOk(ollamaTagsUrl(config.ollamaHost));
  const finalQdrantReady = await checkUrlOk(qdrantReadyzUrl(config.qdrantUrl));

  return {
    steps,
    services: {
      ollama: finalOllamaReady ? "ready" : "needs_setup",
      qdrant: qdrantReady || finalQdrantReady ? "ready" : "needs_setup",
    },
  };
}
