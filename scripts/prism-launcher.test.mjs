import assert from "node:assert/strict";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function writeExecutable(filePath, contents) {
  writeFileSync(filePath, contents);
  chmodSync(filePath, 0o755);
}

function writeFakeDesktopApp(appPath, marker) {
  mkdirSync(path.join(appPath, "Contents", "MacOS"), { recursive: true });
  writeFileSync(
    path.join(appPath, "Contents", "Info.plist"),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.localai.prism-desktop</string>
  <key>CFBundleExecutable</key><string>prism_desktop</string>
</dict></plist>\n`,
  );
  writeExecutable(
    path.join(appPath, "Contents", "MacOS", "prism_desktop"),
    `#!/bin/sh\nprintf '%s\\n' '${marker}'\n`,
  );
}

test("bare prism builds, replaces, and launches the installed macOS app", {
  skip: process.platform !== "darwin",
}, () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "prism-launcher-"));
  const scriptsDir = path.join(fixtureRoot, "scripts");
  const binDir = path.join(fixtureRoot, "bin");
  const installDir = path.join(fixtureRoot, "Applications");
  const logPath = path.join(fixtureRoot, "commands.log");
  const builtApp = path.join(
    fixtureRoot,
    "apps/desktop/src-tauri/target/release/bundle/macos/PRISM.app",
  );
  const installedApp = path.join(installDir, "PRISM.app");

  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  mkdirSync(installDir, { recursive: true });
  copyFileSync(path.join(repoRoot, "scripts", "prism"), path.join(scriptsDir, "prism"));
  chmodSync(path.join(scriptsDir, "prism"), 0o755);
  writeFakeDesktopApp(builtApp, "new-build");
  writeFakeDesktopApp(installedApp, "old-install");
  writeFileSync(path.join(installedApp, "stale-resource.txt"), "remove me");

  for (const command of ["npm", "osascript", "open"]) {
    writeExecutable(
      path.join(binDir, command),
      `#!/bin/sh\nprintf '${command} %s\\n' "$*" >> "$PRISM_TEST_LOG"\n`,
    );
  }
  writeExecutable(path.join(binDir, "pgrep"), "#!/bin/sh\nexit 1\n");

  try {
    const result = spawnSync(path.join(scriptsDir, "prism"), [], {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDir}:/usr/bin:/bin:/usr/sbin:/sbin`,
        PRISM_DESKTOP_INSTALL_DIR: installDir,
        PRISM_TEST_LOG: logPath,
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(readFileSync(path.join(installedApp, "Contents", "MacOS", "prism_desktop"), "utf8").includes("new-build"), true);
    assert.equal(
      readFileSync(logPath, "utf8"),
      [
        "npm run desktop:build:mac-app",
        `open ${installedApp}`,
        "",
      ].join("\n"),
    );
    assert.throws(() => readFileSync(path.join(installedApp, "stale-resource.txt")));
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test("prism up keeps the explicit browser development workflow", {
  skip: process.platform !== "darwin",
}, () => {
  const fixtureRoot = mkdtempSync(path.join(tmpdir(), "prism-launcher-web-"));
  const scriptsDir = path.join(fixtureRoot, "scripts");
  const binDir = path.join(fixtureRoot, "bin");
  const logPath = path.join(fixtureRoot, "commands.log");

  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(binDir, { recursive: true });
  copyFileSync(path.join(repoRoot, "scripts", "prism"), path.join(scriptsDir, "prism"));
  chmodSync(path.join(scriptsDir, "prism"), 0o755);
  writeExecutable(
    path.join(binDir, "npm"),
    "#!/bin/sh\nprintf 'npm %s\\n' \"$*\" >> \"$PRISM_TEST_LOG\"\n",
  );
  writeExecutable(path.join(binDir, "lsof"), "#!/bin/sh\nexit 1\n");

  try {
    const result = spawnSync(path.join(scriptsDir, "prism"), ["up"], {
      cwd: fixtureRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${binDir}:/usr/bin:/bin:/usr/sbin:/sbin`,
        PRISM_OPEN_WEB: "0",
        PRISM_TEST_LOG: logPath,
      },
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(readFileSync(logPath, "utf8"), "npm run dev\n");
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});
