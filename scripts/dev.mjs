#!/usr/bin/env node
/**
 * Dev launcher for the API + web workspaces that guarantees clean teardown.
 *
 * Why not just `npm run dev -w apps/api & npm run dev -w apps/web`?
 *   `&` backgrounds the API process group so Ctrl+C only reaches the
 *   foreground `next dev`. The `node --watch` API stays alive orphaned,
 *   holding its SQLite WAL lock and TCP listener. The next `npm run dev`
 *   then crashes with "database is locked" on the API side while
 *   Turbopack serves from its warm cache and prints "Ready in 0ms" --
 *   the false-success bug this launcher exists to prevent.
 *
 * How this fixes it:
 *   - Each workspace is spawned with `detached: true` (POSIX) so it gets
 *     its own process group.
 *   - On SIGINT/SIGTERM *or* one child crashing, we cascade SIGTERM to
 *     each child's process group via `kill(-pgid, ...)`, so npm, the
 *     `node --watch` wrapper, and its inferior all die together.
 *   - A SIGKILL follow-up runs `SHUTDOWN_GRACE_MS` later in case anything
 *     ignores SIGTERM.
 */

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadDevSecretDefaults } from "./dev-secrets.mjs";
import {
  buildDevWorkspaceDependencies,
  watchDevWorkspaceDependencies,
} from "./dev-workspace-dependencies.mjs";

const SHUTDOWN_GRACE_MS = 3000;
const WORKSPACE_RESTART_GRACE_MS = 250;
const IS_POSIX = process.platform !== "win32";
loadDevSecretDefaults();
const apiPort = process.env.API_PORT?.trim() || "18787";

// Mirror the API's resolution so the web server binds the same way: an explicit
// PRISM_LAN_ACCESS wins, otherwise the persisted in-app toggle decides,
// otherwise local-only.
function resolvePersistedLanAccess() {
  let networkConfigPath;
  if (process.env.DB_PATH) {
    networkConfigPath = join(dirname(process.env.DB_PATH), "network.json");
  } else if (process.env.LOCALAI_DATA_DIR) {
    networkConfigPath = join(process.env.LOCALAI_DATA_DIR, "network.json");
  } else {
    networkConfigPath = join(process.cwd(), "apps", "api", "data", "network.json");
  }
  try {
    const parsed = JSON.parse(readFileSync(networkConfigPath, "utf8"));
    return parsed?.lanAccessEnabled === true;
  } catch {
    return false;
  }
}

const lanAccessRaw = (process.env.PRISM_LAN_ACCESS ?? "").trim();
const LAN_ACCESS_ON = lanAccessRaw
  ? /^(1|true|yes|on)$/i.test(lanAccessRaw)
  : resolvePersistedLanAccess();
const webBindHost = LAN_ACCESS_ON ? "0.0.0.0" : "127.0.0.1";

const webEnv = {
  ...process.env,
  LOCALAI_API_ORIGIN:
    process.env.LOCALAI_API_ORIGIN?.trim() || `http://127.0.0.1:${apiPort}`,
  // Lets the /api proxy stamp x-prism-web-origin so the API can keep the
  // network toggle host-only.
  PRISM_WEB_LAN: LAN_ACCESS_ON ? "1" : "0",
  // The coordinated launcher builds shared workspace dependencies below.
  // Keep npm from running apps/web's predev build afterward: rewriting shared
  // dist once the API is listening would make node --watch restart the API.
  npm_config_ignore_scripts: "true",
};

const children = new Map();
let shuttingDown = false;
let workspaceDependencyWatcher = null;

const label = (name) => `\x1b[36m[${name}]\x1b[0m`;

function start(name) {
  if (shuttingDown) return;
  const args = ["run", "dev", "-w", `apps/${name}`];
  if (name === "web") {
    // Forward an explicit hostname to `next dev` so loopback-only is the default.
    args.push("--", "-H", webBindHost);
  }
  const child = spawn("npm", args, {
    stdio: "inherit",
    // POSIX: new process group so `kill(-pgid)` cascades to npm's grandchildren.
    // Windows: leave attached; npm is a .cmd shim that needs shell resolution.
    detached: IS_POSIX,
    shell: !IS_POSIX,
    env: name === "web" ? webEnv : process.env,
  });
  const record = { name, child, restarting: false };
  children.set(name, record);
  child.on("exit", (code, signal) => {
    if (children.get(name) !== record) return;
    if (record.restarting && !shuttingDown) {
      children.delete(name);
      setTimeout(() => start(name), WORKSPACE_RESTART_GRACE_MS);
      return;
    }
    console.error(
      `${label(name)} exited (code=${code ?? "null"}, signal=${signal ?? "null"})`,
    );
    shutdown(code ?? 1);
  });
}

function killTree(child, signal) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (IS_POSIX) {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch (err) {
    if (err?.code !== "ESRCH") {
      console.error(`failed to ${signal} pid ${child.pid}:`, err);
    }
  }
}

function restart(name) {
  if (shuttingDown) return;
  const record = children.get(name);
  if (!record || record.restarting) return;
  record.restarting = true;
  killTree(record.child, "SIGTERM");
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  workspaceDependencyWatcher?.close();
  workspaceDependencyWatcher = null;
  for (const { child } of children.values()) killTree(child, "SIGTERM");
  setTimeout(() => {
    for (const { child } of children.values()) killTree(child, "SIGKILL");
    process.exit(exitCode);
  }, SHUTDOWN_GRACE_MS).unref();
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

// The API loads workspace packages from dist once at process startup. Build
// them before either service launches so the web predev build cannot leave a
// long-running API process on an older shared runtime contract.
buildDevWorkspaceDependencies();
start("api");
start("web");
workspaceDependencyWatcher = watchDevWorkspaceDependencies({
  afterBuild() {
    // The API's native watch mode intentionally ignores workspace packages in
    // node_modules. Restart only the API workspace after a successful build so
    // it reloads the same contract the web app just picked up.
    restart("api");
  },
  onError(error) {
    console.error(`${label("workspace")} dependency rebuild failed:`, error);
    shutdown(1);
  },
});
