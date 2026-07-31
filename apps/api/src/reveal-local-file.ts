import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { platform } from "node:os";

export type RevealLocalFileResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "unsupported" | "spawn_failed" };

/**
 * Reveal a local file in the OS file manager (Finder on macOS).
 * Does not return the path to callers.
 *
 * Uses absolute launcher paths so a thin process PATH (desktop sidecars,
 * IDE-launched API) still finds `open` / Explorer / xdg-open.
 */
export function revealLocalFileInFolder(
  absolutePath: string,
): RevealLocalFileResult {
  const trimmed = absolutePath.trim();
  if (!trimmed || !existsSync(trimmed)) {
    return { ok: false, reason: "missing" };
  }

  const os = platform();
  try {
    if (os === "darwin") {
      // Selects the file in Finder (opens a Finder window when needed).
      return runRevealLauncher("/usr/bin/open", ["-R", trimmed]);
    }
    if (os === "win32") {
      return runRevealLauncher("explorer.exe", [`/select,${trimmed}`]);
    }
    if (os === "linux") {
      return runRevealLauncher("/usr/bin/xdg-open", [dirnameSafe(trimmed)]);
    }
  } catch {
    return { ok: false, reason: "spawn_failed" };
  }
  return { ok: false, reason: "unsupported" };
}

function runRevealLauncher(
  command: string,
  args: readonly string[],
): RevealLocalFileResult {
  const pathSeparator = platform() === "win32" ? ";" : ":";
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: "ignore",
    // Keep a usable PATH even when the API was launched with a stripped env.
    env: {
      ...process.env,
      PATH: [
        ...(platform() === "win32"
          ? []
          : ["/usr/bin", "/bin", "/usr/sbin"]),
        process.env.PATH ?? "",
        ...(platform() === "win32"
          ? ["C:\\Windows\\System32", "C:\\Windows"]
          : []),
      ]
        .filter(Boolean)
        .join(pathSeparator),
    },
    windowsHide: true,
  });
  if (result.error) {
    return { ok: false, reason: "spawn_failed" };
  }
  // Finder/`open` returns 0 on success. Explorer often returns 1 even when the
  // selection window opens, so Windows only fails on a missing executable.
  if (platform() === "win32") {
    return { ok: true };
  }
  if (result.status !== 0) {
    return { ok: false, reason: "spawn_failed" };
  }
  return { ok: true };
}

function dirnameSafe(absolutePath: string): string {
  const index = Math.max(
    absolutePath.lastIndexOf("/"),
    absolutePath.lastIndexOf("\\"),
  );
  return index > 0 ? absolutePath.slice(0, index) : absolutePath;
}
