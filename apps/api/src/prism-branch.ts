import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = resolve(MODULE_DIR, "../../..");

/**
 * Resolve the active PRISM git branch for API-side gates.
 * Prefer explicit env, then the local checkout (dev machines).
 */
export function resolvePrismBranchName(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const fromEnv =
    env.PRISM_BRANCH?.trim() || env.NEXT_PUBLIC_PRISM_BRANCH?.trim();
  if (fromEnv) return fromEnv;
  try {
    const fromGit = execSync("git branch --show-current", {
      cwd: MONOREPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (fromGit) return fromGit;
  } catch {
    // Git may be unavailable in packaged/container environments.
  }
  return "unknown";
}

/** Exact `dev` branch only — matches web `prismBranchIsDev`. */
export function prismBranchIsDev(
  branchName: string | undefined = resolvePrismBranchName(),
): boolean {
  return (branchName ?? "").trim().toLowerCase() === "dev";
}
