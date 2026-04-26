import type { DatabaseSync } from "node:sqlite";
import type { AppConfig } from "@localai/config";

export const PRISM_API_VERSION = 1;
export const PRISM_SERVER_VERSION = "0.1.0";

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

function checkSqlite(db: DatabaseSync): ServiceState {
  try {
    db.prepare("SELECT 1").get();
    return "ready";
  } catch {
    return "error";
  }
}

export function buildHealthResponse(
  db: DatabaseSync,
  config: AppConfig,
  uptime: number
): HealthResponse {
  const sqlite = checkSqlite(db);
  return {
    ok: sqlite === "ready",
    uptime,
    appName: "Prism Server",
    serverVersion: PRISM_SERVER_VERSION,
    apiVersion: PRISM_API_VERSION,
    pairingEnabled: true,
    serverName: config.serverName,
    services: {
      sqlite,
      qdrant: config.qdrantUrl ? "configured" : "not_configured",
      ollama: config.ollamaHost ? "configured" : "not_configured",
      openai: config.openAiApiKey ? "configured" : "not_configured",
    },
  };
}
