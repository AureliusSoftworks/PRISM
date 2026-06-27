import type { DatabaseSync } from "node:sqlite";
import type { AppConfig } from "@localai/config";

export const PRISM_API_VERSION = 1;
export const PRISM_SERVER_VERSION = "0.4.1";

export type ServiceState = "ready" | "configured" | "not_configured" | "error";

export interface HealthResponse extends Record<string, unknown> {
  ok: boolean;
  uptime: number;
  appName: "Prism Server";
  serverVersion: string;
  apiVersion: number;
  pairingEnabled: boolean;
  serverName: string;
  services: {
    sqlite: ServiceState;
    qdrant: ServiceState;
    ollama: ServiceState;
    openai: ServiceState;
  };
}

export type BuildHealthOptions = {
  /**
   * When true, skip HTTP probes (used in unit tests). Otherwise `/readyz` and Ollama tags are probed to match the Mac app.
   */
  skipNetworkChecks?: boolean;
};

function checkSqlite(db: DatabaseSync): ServiceState {
  try {
    db.prepare("SELECT 1").get();
    return "ready";
  } catch {
    return "error";
  }
}

async function checkUrlOk(url: URL, timeoutMs = 2000): Promise<"ready" | "error"> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    const res = await fetch(url, { method: "GET", signal: controller.signal });
    clearTimeout(timer);
    return res.ok ? "ready" : "error";
  } catch {
    clearTimeout(timer);
    return "error";
  }
}

/**
 * Liveness/dependency snapshot for the Prism API. In production, Qdrant and Ollama reachability match what the user sees in Prism Server.app.
 */
export async function buildHealthResponse(
  db: DatabaseSync,
  config: AppConfig,
  uptime: number,
  options: BuildHealthOptions = {}
): Promise<HealthResponse> {
  const sqlite = checkSqlite(db);
  if (options.skipNetworkChecks) {
    return {
      ok: sqlite === "ready",
      uptime,
      appName: "Prism Server",
      serverVersion: PRISM_SERVER_VERSION,
      apiVersion: PRISM_API_VERSION,
      pairingEnabled: false,
      serverName: config.serverName ?? process.env.PRISM_SERVER_NAME ?? "Prism Server",
      services: {
        sqlite,
        qdrant: config.qdrantUrl ? "configured" : "not_configured",
        ollama: config.ollamaHost ? "configured" : "not_configured",
        openai: config.openAiApiKey ? "configured" : "not_configured",
      },
    };
  }

  const qd = new URL(config.qdrantUrl);
  qd.pathname = "/readyz";
  qd.search = "";
  const ol = new URL(config.ollamaHost);
  ol.pathname = "/api/tags";
  ol.search = "";

  const [qdrant, ollama] = await Promise.all([checkUrlOk(qd), checkUrlOk(ol)]);

  return {
    ok: sqlite === "ready",
    uptime,
    appName: "Prism Server",
    serverVersion: PRISM_SERVER_VERSION,
    apiVersion: PRISM_API_VERSION,
    pairingEnabled: false,
    serverName: config.serverName ?? process.env.PRISM_SERVER_NAME ?? "Prism Server",
    services: {
      sqlite,
      qdrant,
      ollama,
      openai: config.openAiApiKey ? "configured" : "not_configured",
    },
  };
}
