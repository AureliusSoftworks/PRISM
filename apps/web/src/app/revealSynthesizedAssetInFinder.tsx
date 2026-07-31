"use client";

import { useCallback, type MouseEvent } from "react";
import { FolderOpen } from "lucide-react";
import { prismBranchIsDev } from "./prismDevGating";
import { usePrismMenu, type PrismMenuEntry } from "./PrismMenu";

export const REVEAL_SYNTHESIZED_ASSET_IN_FINDER_ENABLED = prismBranchIsDev(
  process.env.NEXT_PUBLIC_PRISM_BRANCH,
);

type RevealRequest = <T>(
  path: string,
  options?: RequestInit,
) => Promise<T>;

/**
 * Ask the local API to reveal a synthesized image file in Finder / Explorer.
 * Only available on the `dev` branch; the server enforces the same gate.
 */
export async function revealSynthesizedAssetInFinder(
  imageId: string,
  requestFn?: RevealRequest,
): Promise<void> {
  const id = imageId.trim();
  if (!id) throw new Error("Missing image id.");
  if (!REVEAL_SYNTHESIZED_ASSET_IN_FINDER_ENABLED) {
    throw new Error("Reveal in Finder is only available on the dev branch.");
  }
  const path = `/api/images/${encodeURIComponent(id)}/reveal-in-finder`;
  // Send an explicit empty JSON object so proxies/body parsers never see a
  // bare POST with Content-Type: application/json and no bytes.
  const options: RequestInit = {
    method: "POST",
    body: "{}",
  };
  if (requestFn) {
    await requestFn<{ ok: true }>(path, options);
    return;
  }
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: { "content-type": "application/json" },
  });
  if (!response.ok) {
    let message = "Could not reveal the asset in Finder.";
    try {
      const body = (await response.json()) as { error?: string };
      if (typeof body.error === "string" && body.error.trim()) {
        message = body.error.trim();
      }
    } catch {
      // Keep the default message when the body is not JSON.
    }
    throw new Error(message);
  }
}

export function useRevealSynthesizedAssetContextMenu(args?: {
  request?: RevealRequest;
  theme?: "light" | "dark";
}): {
  revealSynthesizedAssetContextMenuEnabled: boolean;
  onRevealSynthesizedAssetContextMenu: (
    event: MouseEvent,
    imageId: string,
  ) => void;
} {
  const { openMenu } = usePrismMenu();
  const enabled = REVEAL_SYNTHESIZED_ASSET_IN_FINDER_ENABLED;
  const requestFn = args?.request;
  const theme = args?.theme;

  const onRevealSynthesizedAssetContextMenu = useCallback(
    (event: MouseEvent, imageId: string) => {
      if (!enabled) return;
      const id = imageId.trim();
      if (!id) return;
      event.preventDefault();
      event.stopPropagation();
      const entries: PrismMenuEntry[] = [
        {
          id: "reveal-in-finder",
          icon: <FolderOpen />,
          label: "Reveal in Finder",
          feedback: "Shown in Finder",
          onSelect: async () => {
            try {
              await revealSynthesizedAssetInFinder(id, requestFn);
            } catch (error) {
              const message =
                error instanceof Error && error.message.trim()
                  ? error.message.trim()
                  : "Could not reveal the asset in Finder.";
              window.alert(message);
              throw error;
            }
          },
        },
      ];
      openMenu({
        id: `synthesized-asset-${id}`,
        label: "Synthesized asset",
        theme,
        anchor: {
          kind: "pointer",
          x: event.clientX,
          y: event.clientY,
        },
        entries,
      });
    },
    [enabled, openMenu, requestFn, theme],
  );

  return {
    revealSynthesizedAssetContextMenuEnabled: enabled,
    onRevealSynthesizedAssetContextMenu,
  };
}
