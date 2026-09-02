export const ACCOUNT_WORKSPACE_PRIMARY_RESOURCES = [
  "settings",
  "conversations",
  "memories",
  "bots",
  "images",
] as const;

export const ACCOUNT_WORKSPACE_STARTUP_RESOURCES = [
  ...ACCOUNT_WORKSPACE_PRIMARY_RESOURCES,
  "models",
] as const;

export type AccountWorkspaceStartupResource =
  (typeof ACCOUNT_WORKSPACE_STARTUP_RESOURCES)[number];

export interface AccountWorkspaceStartupProgress {
  readonly completed: Set<AccountWorkspaceStartupResource>;
  readonly started: Set<AccountWorkspaceStartupResource>;
}

export const ACCOUNT_WORKSPACE_STARTUP_RESOURCE_LABELS: Record<
  AccountWorkspaceStartupResource,
  string
> = {
  settings: "account settings",
  conversations: "conversations",
  memories: "private memories",
  bots: "bot library",
  images: "account assets",
  models: "model catalog",
};

export function createAccountWorkspaceStartupProgress(): AccountWorkspaceStartupProgress {
  return {
    completed: new Set<AccountWorkspaceStartupResource>(),
    started: new Set<AccountWorkspaceStartupResource>(),
  };
}

export function pendingAccountWorkspaceStartupResources(
  progress: AccountWorkspaceStartupProgress,
): AccountWorkspaceStartupResource[] {
  return ACCOUNT_WORKSPACE_STARTUP_RESOURCES.filter(
    (resource) => !progress.completed.has(resource),
  );
}

export function formatAccountWorkspaceStartupResources(
  resources: readonly AccountWorkspaceStartupResource[],
): string {
  const labels = resources.map(
    (resource) => ACCOUNT_WORKSPACE_STARTUP_RESOURCE_LABELS[resource],
  );
  if (labels.length <= 1) return labels[0] ?? "workspace";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

/**
 * Completes the requested startup resources without abandoning slow siblings
 * when one request fails. The shared progress object lets a bounded retry run
 * only unfinished work instead of replaying the entire account hydration.
 */
export async function settleAccountWorkspaceStartupResources(args: {
  progress: AccountWorkspaceStartupProgress;
  resources: readonly AccountWorkspaceStartupResource[];
  load: (resource: AccountWorkspaceStartupResource) => Promise<void>;
  onStarted?: (resource: AccountWorkspaceStartupResource) => void;
  onCompleted?: (resource: AccountWorkspaceStartupResource) => void;
  onFailed?: (
    resource: AccountWorkspaceStartupResource,
    error: unknown,
  ) => void;
}): Promise<AccountWorkspaceStartupResource[]> {
  const pending = args.resources.filter(
    (resource) => !args.progress.completed.has(resource),
  );
  await Promise.allSettled(
    pending.map(async (resource) => {
      if (!args.progress.started.has(resource)) {
        args.progress.started.add(resource);
        args.onStarted?.(resource);
      }
      try {
        await args.load(resource);
        args.progress.completed.add(resource);
        args.onCompleted?.(resource);
      } catch (error) {
        args.onFailed?.(resource, error);
        throw error;
      }
    }),
  );
  return args.resources.filter(
    (resource) => !args.progress.completed.has(resource),
  );
}
