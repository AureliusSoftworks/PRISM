import type { ReactNode } from "react";

export type BotHubResourceResolution =
  | { status: "unavailable" }
  | {
      status: "loading";
      label: string;
      message: string;
    }
  | {
      status: "error";
      label: string;
      message: string;
      retry: () => void;
    }
  | {
      status: "available";
      label: string;
      description: string;
      preview?: ReactNode;
      activate: () => void;
    };

/**
 * Presentation-only registry contract for applet resources in the focused bot
 * hub. Applets retain ownership of their data and navigation.
 */
export interface BotHubResourceProvider<Context> {
  id: string;
  order: number;
  resolve: (context: Context) => BotHubResourceResolution;
}

export interface ResolvedBotHubResource {
  id: string;
  order: number;
  resolution: Exclude<BotHubResourceResolution, { status: "unavailable" }>;
}

export function resolveBotHubResources<Context>(
  providers: readonly BotHubResourceProvider<Context>[],
  context: Context,
): ResolvedBotHubResource[] {
  const seen = new Set<string>();
  return providers
    .filter((provider) => {
      const id = provider.id.trim();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((provider) => ({
      id: provider.id.trim(),
      order: provider.order,
      resolution: provider.resolve(context),
    }))
    .filter(
      (
        resource,
      ): resource is ResolvedBotHubResource & {
        resolution: Exclude<
          BotHubResourceResolution,
          { status: "unavailable" }
        >;
      } => resource.resolution.status !== "unavailable",
    )
    .sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    );
}
