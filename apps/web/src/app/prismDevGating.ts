type PrismDevEnv = {
  NODE_ENV?: string;
  NEXT_PUBLIC_DEV_TOOLS?: string;
  NEXT_PUBLIC_PRISM_BRANCH?: string;
  NEXT_PUBLIC_PRISM_DEV_COMMANDS?: string;
  NEXT_PUBLIC_AVATAR_DETAILS?: string;
};

function envFlagIsEnabled(value: string | undefined): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

export function prismBranchAllowsDevTools(branchName: string | undefined): boolean {
  const normalized = (branchName ?? "").trim().toLowerCase();
  return Boolean(normalized) && normalized !== "main" && normalized !== "unknown";
}

export function prismWebDevToolsEnabled(env: PrismDevEnv): boolean {
  if (!prismBranchAllowsDevTools(env.NEXT_PUBLIC_PRISM_BRANCH)) return false;
  return (
    env.NEXT_PUBLIC_DEV_TOOLS === "1" ||
    (env.NODE_ENV !== "production" && env.NEXT_PUBLIC_DEV_TOOLS !== "0")
  );
}

export function prismWebDevChatCommandsEnabled(env: PrismDevEnv): boolean {
  if (!prismBranchAllowsDevTools(env.NEXT_PUBLIC_PRISM_BRANCH)) return false;
  return env.NODE_ENV !== "production" || envFlagIsEnabled(env.NEXT_PUBLIC_PRISM_DEV_COMMANDS);
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
