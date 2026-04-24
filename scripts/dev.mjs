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

const SHUTDOWN_GRACE_MS = 3000;
const IS_POSIX = process.platform !== "win32";

const children = [];
let shuttingDown = false;

const label = (name) => `\x1b[36m[${name}]\x1b[0m`;

function start(name) {
  const child = spawn("npm", ["run", "dev", "-w", `apps/${name}`], {
    stdio: "inherit",
    // POSIX: new process group so `kill(-pgid)` cascades to npm's grandchildren.
    // Windows: leave attached; npm is a .cmd shim that needs shell resolution.
    detached: IS_POSIX,
    shell: !IS_POSIX,
  });
  children.push({ name, child });
  child.on("exit", (code, signal) => {
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

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) killTree(child, "SIGTERM");
  setTimeout(() => {
    for (const { child } of children) killTree(child, "SIGKILL");
    process.exit(exitCode);
  }, SHUTDOWN_GRACE_MS).unref();
}

process.on("SIGINT", () => shutdown(130));
process.on("SIGTERM", () => shutdown(143));

start("api");
start("web");
