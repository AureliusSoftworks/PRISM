import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import type { AppConfig } from "@localai/config";
import { resolveDbPath } from "./db.ts";

/**
 * Local-network access is a server/machine-level setting (not per-user). It is
 * persisted next to the SQLite database so a single host installation keeps one
 * source of truth, and it is read once at startup to decide the bind address.
 *
 * Source precedence:
 *   1. Explicit env `PRISM_LAN_ACCESS` (native server apps mirror into their
 *      managed .env; Docker/scripts set it directly).
 *   2. The persisted `network.json` file (written by the in-app web toggle).
 *   3. Default: false (private to the host machine).
 */
const NETWORK_CONFIG_FILENAME = "network.json";

/** Default port the web UI is published on; only used to build display URLs. */
const DEFAULT_WEB_PUBLIC_PORT = 18788;

interface PersistedNetworkConfig {
  lanAccessEnabled?: unknown;
}

export function resolveNetworkConfigPath(): string {
  return join(dirname(resolveDbPath()), NETWORK_CONFIG_FILENAME);
}

/** Returns the persisted LAN-access choice, or null when no file exists yet. */
export function readPersistedLanAccess(): boolean | null {
  try {
    const path = resolveNetworkConfigPath();
    if (!existsSync(path)) {
      return null;
    }
    const parsed = JSON.parse(readFileSync(path, "utf8")) as PersistedNetworkConfig;
    return typeof parsed.lanAccessEnabled === "boolean"
      ? parsed.lanAccessEnabled
      : null;
  } catch {
    // A corrupt or unreadable file must fail safe to "private".
    return null;
  }
}

export function writePersistedLanAccess(enabled: boolean): void {
  const path = resolveNetworkConfigPath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    `${JSON.stringify({ lanAccessEnabled: enabled }, null, 2)}\n`,
    "utf8"
  );
}

/** True when an operator pinned LAN access through the environment. */
export function lanAccessManagedByEnv(): boolean {
  const raw = process.env.PRISM_LAN_ACCESS;
  return typeof raw === "string" && raw.trim() !== "";
}

/** Whether a raw socket peer address is loopback (IPv4 or IPv6 forms). */
export function isLoopbackAddress(address: string | null | undefined): boolean {
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}

/**
 * Pure host-only decision for the network toggle. Inputs are extracted from the
 * request by the caller so this stays trivially testable.
 *
 * - `peerAddress`: the DIRECT socket peer (never a forwarding header).
 * - `webOrigin`: the server-set `x-prism-web-origin` marker, "lan" when the web
 *    front-end that proxied the request is itself LAN-exposed.
 * - `managedByEnv`: true when LAN access is pinned by the environment.
 *
 * Forwarding headers (x-forwarded-for, etc.) are deliberately NOT consulted, so
 * a remote client cannot spoof loopback.
 */
export function canEditNetworkAccess(input: {
  peerAddress: string | null | undefined;
  webOrigin: string | null | undefined;
  managedByEnv: boolean;
}): boolean {
  if (input.managedByEnv) {
    return false;
  }
  if (!isLoopbackAddress(input.peerAddress)) {
    return false;
  }
  return input.webOrigin !== "lan";
}

/**
 * Resolves the effective desired LAN-access state by overlaying the persisted
 * file on top of the env-derived default. Explicit env always wins.
 */
export function resolveLanAccessEnabled(config: AppConfig): boolean {
  if (lanAccessManagedByEnv()) {
    return config.lanAccessEnabled;
  }
  return readPersistedLanAccess() ?? false;
}

/**
 * The address the API binds to. An explicit `API_HOST` always wins (e.g. the
 * desktop app pins loopback); otherwise LAN access decides loopback vs all
 * interfaces.
 */
export function resolveApiBindHost(lanAccessEnabled: boolean): string {
  const explicit = process.env.API_HOST?.trim();
  if (explicit) {
    return explicit;
  }
  return lanAccessEnabled ? "0.0.0.0" : "127.0.0.1";
}

/** The published web port, used only to build human-facing access URLs. */
export function resolveWebPublicPort(): number {
  const raw = process.env.PRISM_WEB_PORT ?? process.env.WEB_PORT;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_WEB_PUBLIC_PORT;
}

/** Non-internal IPv4 addresses of this host, sorted and de-duplicated. */
export function listLanIpv4Addresses(): string[] {
  const found = new Set<string>();
  const interfaces = networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const entry of interfaces[name] ?? []) {
      const isIpv4 = entry.family === "IPv4" || (entry.family as unknown) === 4;
      if (isIpv4 && !entry.internal && entry.address) {
        found.add(entry.address);
      }
    }
  }
  return [...found].sort();
}

export interface LanUrlSet {
  web: string[];
  api: string[];
}

export function buildLanUrls(
  addresses: string[],
  webPort: number,
  apiPort: number
): LanUrlSet {
  return {
    web: addresses.map((address) => `http://${address}:${webPort}`),
    api: addresses.map((address) => `http://${address}:${apiPort}`),
  };
}
