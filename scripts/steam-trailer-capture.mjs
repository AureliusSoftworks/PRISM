#!/usr/bin/env node
/**
 * Records the Steam trailer shot list as motion clips.
 *
 * The reel this replaces was seven stills panned with Ken Burns, which reads
 * on a store page as "this thing does not move" — Prism's whole appeal is
 * motion: visemes, blinks, the companion recede, Signal's camera cuts.
 *
 * Safety: the app is booted against a COPY of the database on isolated ports,
 * so a capture run can never write to live data or collide with a dev server.
 * Nothing here mutates the source database.
 *
 *   node scripts/steam-trailer-capture.mjs --list
 *   node scripts/steam-trailer-capture.mjs --shots 03-zen-calm,07-coffee-live
 *   node scripts/steam-trailer-capture.mjs --user <userId> --keep-open
 */
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sourceDb = join(repoRoot, "apps", "api", "data", "localai.db");
const stamp = new Date().toISOString().slice(0, 10);
const captureRoot = join(repoRoot, "captures", `steam-trailer-${stamp}`);
const workDir = join(captureRoot, ".stack");
const captureDb = join(workDir, "localai.db");

// Deliberately off the 18787/18788 dev pair: a parallel session may own those.
const API_PORT = Number(process.env.CAPTURE_API_PORT ?? 18897);
const WEB_PORT = Number(process.env.CAPTURE_WEB_PORT ?? 18898);
const VIEWPORT = { width: 1920, height: 1080 };

const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};
const has = (name) => argv.includes(`--${name}`);

/**
 * One clip per shot, named for the wireframe's "What to record" table so the
 * editor can drop them straight onto the timeline. `settleMs` is dead air we
 * throw away — first paint, atmosphere fade-in — and `holdMs` is the take.
 */
const SHOTS = [
  {
    name: "01-atm-open",
    url: "/?view=chat",
    settleMs: 3500,
    holdMs: 8000,
    note: "Home shell atmosphere, dark theme",
  },
  {
    name: "02-companion-turn",
    url: "/?view=chat",
    settleMs: 3500,
    holdMs: 16000,
    note: "Home Base radial: lanes orbiting the emblem (Spectrum beat)",
    async action(page) {
      // Open the floating companion so the redesigned cloud is on screen.
      const orb = page.locator('[data-prism-companion-avatar="true"]').first();
      if (await orb.count()) await orb.click({ timeout: 4000 }).catch(() => {});
      await page.waitForTimeout(1200);
    },
  },
  {
    name: "03-zen-calm",
    url: "/?view=zen",
    settleMs: 4000,
    holdMs: 10000,
    note: "Zen live bot: breathing, blinking, cursor attention",
  },
  {
    name: "04-signal-hit",
    url: "/?view=botcast",
    settleMs: 4000,
    holdMs: 10000,
    note: "Signal studio stage",
  },
  {
    name: "06-coffee-setup",
    url: "/?view=coffee",
    settleMs: 4000,
    holdMs: 10000,
    note: "Coffee seats and group",
  },
  {
    name: "07-coffee-live",
    url: "/?view=coffee",
    settleMs: 4500,
    holdMs: 14000,
    note: "Live table energy — the money shot",
    async action(page) {
      // Open a saved group so the seats are filled with real bots.
      const group = page
        .locator("li")
        .filter({ hasText: process.env.CAPTURE_COFFEE_GROUP ?? "Bikini Bottom" })
        .first();
      if (await group.count()) {
        await group
          .locator("button:not([data-delete-affordance])")
          .first()
          .click({ timeout: 5000 })
          .catch(() => {});
        // Never leave a destructive confirm on screen in a take.
        await page
          .getByRole("button", { name: /^Cancel$/ })
          .first()
          .click({ timeout: 1500 })
          .catch(() => {});
      }
      await page.waitForTimeout(2500);
    },
  },
  {
    name: "08-debate-broll",
    url: "/?view=debate",
    settleMs: 4000,
    holdMs: 10000,
    note: "Debate chamber b-roll",
  },
];

function log(message) {
  process.stdout.write(`[capture] ${message}\n`);
}

/** Copy the live database, then mint a session inside the COPY only. */
function prepareIsolatedDatabase(userId) {
  if (!existsSync(sourceDb)) throw new Error(`No database at ${sourceDb}`);
  // A previous run's -wal/-shm would not match the freshly copied .db and
  // SQLite would refuse to open it, so start from an empty work dir.
  if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) {
    const from = `${sourceDb}${suffix}`;
    if (existsSync(from)) copyFileSync(from, `${captureDb}${suffix}`);
  }
  const db = new DatabaseSync(captureDb);
  try {
    const resolvedUser = userId
      ? db.prepare("SELECT id, display_name FROM users WHERE id = ?").get(userId)
      : db
          .prepare(
            `SELECT id, display_name FROM users
              ORDER BY (
                (SELECT COUNT(*) FROM coffee_groups WHERE coffee_groups.user_id = users.id) * 10
                + (SELECT COUNT(*) FROM botcast_episodes WHERE botcast_episodes.user_id = users.id) * 5
                + (SELECT COUNT(*) FROM bots WHERE bots.user_id = users.id)
              ) DESC
              LIMIT 1`,
          )
          .get();
    if (!resolvedUser) throw new Error(`No such user: ${userId}`);
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
    db.prepare(
      "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)",
    ).run(token, resolvedUser.id, expiresAt);
    log(`capture account: ${resolvedUser.display_name} (${resolvedUser.id})`);
    return { token, user: resolvedUser };
  } finally {
    db.close();
  }
}


function stageStandaloneAssets() {
  const standaloneWeb = join(repoRoot, "apps", "web", ".next", "standalone", "apps", "web");
  if (!existsSync(join(standaloneWeb, "server.js"))) {
    throw new Error("No standalone build — run `npm run build` first.");
  }
  cpSync(
    join(repoRoot, "apps", "web", ".next", "static"),
    join(standaloneWeb, ".next", "static"),
    { recursive: true },
  );
  cpSync(join(repoRoot, "apps", "web", "public"), join(standaloneWeb, "public"), {
    recursive: true,
  });
}

function waitForHttp(url, label, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolvePromise, reject) => {
    const attempt = async () => {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
        if (response.status < 500) return resolvePromise();
      } catch {
        // not up yet
      }
      if (Date.now() > deadline) reject(new Error(`${label} never became ready`));
      else setTimeout(attempt, 700);
    };
    void attempt();
  });
}

const children = [];
function spawnService(label, command, args, env) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: "pipe",
  });
  child.stdout.on("data", (chunk) => {
    if (process.env.CAPTURE_VERBOSE) process.stdout.write(`[${label}] ${chunk}`);
  });
  child.stderr.on("data", (chunk) => {
    if (process.env.CAPTURE_VERBOSE) process.stderr.write(`[${label}] ${chunk}`);
  });
  children.push(child);
  return child;
}

function shutdown() {
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
}
process.on("exit", shutdown);
process.on("SIGINT", () => {
  shutdown();
  process.exit(130);
});

/** Chrome that a store page never sees: no scrollbars, no dev indicator. */
const CAPTURE_CSS = `
  *::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
  [data-nextjs-toast], nextjs-portal, #__next-build-watcher,
  [data-nextjs-dialog-overlay], [data-prism-fps-counter] { display: none !important; }
  html, body { overflow: hidden !important; }
`;

async function main() {
  if (has("list")) {
    for (const shot of SHOTS) {
      process.stdout.write(`${shot.name.padEnd(20)} ${shot.note}\n`);
    }
    return;
  }

  const requested = flag("shots");
  const shots = requested
    ? SHOTS.filter((shot) => requested.split(",").includes(shot.name))
    : SHOTS;
  if (shots.length === 0) throw new Error("No shots matched --shots");

  const { token } = prepareIsolatedDatabase(flag("user"));

  log(`starting api on :${API_PORT}`);
  spawnService(
    "api",
    process.execPath,
    [
      "--env-file-if-exists=.env",
      "--experimental-strip-types",
      "apps/api/src/server.ts",
    ],
    {
      DB_PATH: captureDb,
      PORT: String(API_PORT),
      API_PORT: String(API_PORT),
    },
  );
  await waitForHttp(`http://127.0.0.1:${API_PORT}/api/health`, "api");

  // `next build` with standalone output leaves static assets outside the
  // bundle; the Dockerfile copies them in, and so must we, or every frame
  // renders unstyled. The package start script also pins PORT, so the
  // standalone server is launched directly instead.
  stageStandaloneAssets();
  log(`starting web on :${WEB_PORT}`);
  spawnService(
    "web",
    process.execPath,
    [join("apps", "web", ".next", "standalone", "apps", "web", "server.js")],
    {
      PORT: String(WEB_PORT),
      HOSTNAME: "127.0.0.1",
      LOCALAI_API_ORIGIN: `http://127.0.0.1:${API_PORT}`,
    },
  );
  await waitForHttp(`http://127.0.0.1:${WEB_PORT}/`, "web");

  const videoDir = join(captureRoot, "clips");
  mkdirSync(videoDir, { recursive: true });
  // Prefer the Chrome already on the machine so a capture run never depends
  // on Playwright's ~150MB browser download.
  const launchOptions = { args: ["--force-color-profile=srgb"] };
  const browser = await chromium
    .launch({ ...launchOptions, channel: "chrome" })
    .catch(() => chromium.launch(launchOptions));
  const manifest = [];

  for (const shot of shots) {
    log(`recording ${shot.name} (${(shot.settleMs + shot.holdMs) / 1000}s)`);
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      colorScheme: "dark",
      reducedMotion: "no-preference",
      recordVideo: { dir: videoDir, size: VIEWPORT },
    });
    await context.addCookies([
      {
        name: "localai_session",
        value: token,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${WEB_PORT}${shot.url}`, {
      waitUntil: "domcontentloaded",
      timeout: 60000,
    });
    await page.addStyleTag({ content: CAPTURE_CSS }).catch(() => {});
    await page.waitForTimeout(shot.settleMs);
    if (shot.action) await shot.action(page).catch(() => {});
    // The take itself: no input, so the only motion is the product's own.
    await page.waitForTimeout(shot.holdMs);
    const video = page.video();
    await context.close();
    if (video) {
      const target = join(videoDir, `${shot.name}.webm`);
      if (existsSync(target)) rmSync(target);
      await video.saveAs(target);
      await video.delete().catch(() => {});
      manifest.push({ shot: shot.name, clip: `clips/${shot.name}.webm`, note: shot.note });
      log(`  -> ${target}`);
    }
  }

  await browser.close();
  writeFileSync(
    join(captureRoot, "manifest.json"),
    `${JSON.stringify({ capturedAt: new Date().toISOString(), viewport: VIEWPORT, shots: manifest }, null, 2)}\n`,
  );
  log(`done — ${manifest.length} clips in ${captureRoot}`);
  if (!has("keep-open")) shutdown();
}

main().catch((error) => {
  process.stderr.write(`[capture] failed: ${error.message}\n`);
  shutdown();
  process.exit(1);
});
