type PrismDevEnv = {
  NODE_ENV?: string;
  NEXT_PUBLIC_PRISM_BRANCH?: string;
  NEXT_PUBLIC_AVATAR_DETAILS?: string;
};

export function prismBranchIsDev(branchName: string | undefined): boolean {
  return (branchName ?? "").trim().toLowerCase() === "dev";
}

/** Authoring tools are available in local development and dev-branch builds. */
export function prismDeveloperAuthoringEnabled(env: PrismDevEnv): boolean {
  return (
    env.NODE_ENV !== "production" ||
    prismBranchIsDev(env.NEXT_PUBLIC_PRISM_BRANCH)
  );
}

/** Marketplace shelves can pin to an exact git branch (today: `dev` only). */
export type PrismMarketplaceBranchLock = "dev";

export function normalizePrismMarketplaceBranchLock(
  value: unknown,
): PrismMarketplaceBranchLock | null {
  const normalized =
    typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "dev" ? "dev" : null;
}

/**
 * Branch-locked Marketplace entries stay hidden unless the running build's
 * branch name exactly matches the lock. Missing/unknown branch → hidden.
 */
export function prismMarketplaceBranchLockAllows(
  branchLock: PrismMarketplaceBranchLock | null | undefined,
  branchName: string | undefined,
): boolean {
  if (!branchLock) return true;
  return branchLock === "dev" && prismBranchIsDev(branchName);
}

/** Unfinished Avatar Details stays on development branches and out of release builds. */
export function prismAvatarDetailsPaneEnabled(env: PrismDevEnv): boolean {
  const branch = (env.NEXT_PUBLIC_PRISM_BRANCH ?? "").trim().toLowerCase();
  if (
    !branch ||
    branch === "unknown" ||
    branch === "main" ||
    branch === "release" ||
    branch.startsWith("release/") ||
    branch.startsWith("release-")
  ) {
    return false;
  }
  return env.NEXT_PUBLIC_AVATAR_DETAILS !== "0";
}
