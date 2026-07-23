import type { PrismStartupPreference } from "@localai/shared";

export const PRISM_SURFACE_ORDER = [
  "home",
  "prism-home",
  "zen",
  "group-home",
  "coffee",
  "signal",
  "story",
  "slate",
  "marketplace",
  "avatar-studio",
  "images",
  "settings",
] as const;

export type PrismSurfaceId = (typeof PRISM_SURFACE_ORDER)[number];
export type PrismSurfaceClassification =
  | "home"
  | "experience"
  | "studio"
  | "tool";
export type PrismSurfaceStatus = "active" | "preview" | "planned";
export type PrismSurfaceEntryRequirement =
  | { kind: "none" }
  | { kind: "prism_identity" }
  | { kind: "selected_bot" }
  | { kind: "saved_group" }
  | {
      kind: "selected_bots_or_group";
      minimumSelectedBots: number;
      maximumSelectedBots?: number;
    }
  | { kind: "selected_bot_or_group" };
export type PrismSurfaceReturnBehavior =
  | "home_root"
  | "restore_origin_checkpoint"
  | "resume_workspace";

export interface PrismSurfaceDefinition {
  id: PrismSurfaceId;
  name: string;
  classification: PrismSurfaceClassification;
  status: PrismSurfaceStatus;
  startupEligible: boolean;
  entryRequirement: PrismSurfaceEntryRequirement;
  returnBehavior: PrismSurfaceReturnBehavior;
  /** Current internal route while the living shell is introduced incrementally. */
  href: string;
}

export const PRISM_SURFACES: Record<PrismSurfaceId, PrismSurfaceDefinition> = {
  home: {
    id: "home",
    name: "All Bots",
    classification: "home",
    status: "active",
    startupEligible: true,
    entryRequirement: { kind: "none" },
    returnBehavior: "home_root",
    href: "/?view=chat",
  },
  "prism-home": {
    id: "prism-home",
    name: "Prism Home",
    classification: "home",
    status: "active",
    startupEligible: false,
    entryRequirement: { kind: "prism_identity" },
    returnBehavior: "restore_origin_checkpoint",
    href: "/?view=chat",
  },
  zen: {
    id: "zen",
    name: "Zen Home",
    classification: "home",
    status: "active",
    startupEligible: false,
    entryRequirement: { kind: "selected_bot" },
    returnBehavior: "restore_origin_checkpoint",
    href: "/?view=chat",
  },
  "group-home": {
    id: "group-home",
    name: "Group Home",
    classification: "home",
    status: "active",
    startupEligible: false,
    entryRequirement: { kind: "saved_group" },
    returnBehavior: "restore_origin_checkpoint",
    href: "/?view=chat",
  },
  coffee: {
    id: "coffee",
    name: "Coffee",
    classification: "experience",
    status: "active",
    startupEligible: false,
    entryRequirement: {
      kind: "selected_bots_or_group",
      minimumSelectedBots: 2,
      maximumSelectedBots: 5,
    },
    returnBehavior: "restore_origin_checkpoint",
    href: "/?view=coffee",
  },
  signal: {
    id: "signal",
    name: "Signal",
    classification: "experience",
    status: "active",
    startupEligible: false,
    entryRequirement: { kind: "selected_bot_or_group" },
    returnBehavior: "restore_origin_checkpoint",
    href: "/?view=botcast",
  },
  story: {
    id: "story",
    name: "Story",
    classification: "experience",
    status: "planned",
    startupEligible: false,
    entryRequirement: { kind: "selected_bots_or_group", minimumSelectedBots: 1 },
    returnBehavior: "restore_origin_checkpoint",
    href: "/?view=story",
  },
  slate: {
    id: "slate",
    name: "Slate",
    classification: "studio",
    status: "preview",
    startupEligible: true,
    entryRequirement: { kind: "none" },
    returnBehavior: "resume_workspace",
    href: "/?view=slate",
  },
  marketplace: {
    id: "marketplace",
    name: "Marketplace",
    classification: "tool",
    status: "active",
    startupEligible: false,
    entryRequirement: { kind: "none" },
    returnBehavior: "restore_origin_checkpoint",
    href: "/?view=chat&tool=marketplace",
  },
  "avatar-studio": {
    id: "avatar-studio",
    name: "Avatar Studio",
    classification: "tool",
    status: "active",
    startupEligible: false,
    entryRequirement: { kind: "none" },
    returnBehavior: "restore_origin_checkpoint",
    href: "/?view=chat&tool=avatar-studio",
  },
  images: {
    id: "images",
    name: "Images",
    classification: "tool",
    status: "active",
    startupEligible: false,
    entryRequirement: { kind: "none" },
    returnBehavior: "restore_origin_checkpoint",
    href: "/?view=chat&tool=images",
  },
  settings: {
    id: "settings",
    name: "Settings",
    classification: "tool",
    status: "active",
    startupEligible: false,
    entryRequirement: { kind: "none" },
    returnBehavior: "restore_origin_checkpoint",
    href: "/?view=chat&tool=settings",
  },
};

export const PRISM_STARTUP_ROOTS = [
  "home",
  "slate",
] as const satisfies readonly PrismSurfaceId[];
export type PrismStartupRoot = (typeof PRISM_STARTUP_ROOTS)[number];
export type { PrismStartupPreference };

export interface PrismSurfaceCheckpoint {
  surfaceId: PrismSurfaceId;
  /** Exact app-relative location, including its query string and hash. */
  location: string;
  selectedBotId?: string;
  selectedGroupId?: string;
  workspaceId?: string;
  focusTarget?: string;
}

export interface PrismContextualSurfaceEntry {
  destination: PrismSurfaceDefinition;
  origin: PrismSurfaceCheckpoint;
}

const PRISM_RESTORABLE_WORKSPACE_VIEW_PARAMS = new Set([
  "chat",
  "coffee",
  "botcast",
  "slate",
  "story",
]);

export interface PrismStartupLocationInput {
  /** A present `view` query always represents an intentional deep link. */
  explicitViewParam: string | null;
  preference: PrismStartupPreference;
  lastWorkspaceLocation?: string | null;
}

export function prismSurfacesByClassification(
  classification: PrismSurfaceClassification,
): PrismSurfaceDefinition[] {
  return PRISM_SURFACE_ORDER
    .map((surfaceId) => PRISM_SURFACES[surfaceId])
    .filter((surface) => surface.classification === classification);
}

export function prismStartupSurfaces(): PrismSurfaceDefinition[] {
  return PRISM_STARTUP_ROOTS.map((surfaceId) => PRISM_SURFACES[surfaceId]);
}

export function prismRestorableWorkspaceLocation(
  location: string | null | undefined,
): string | null {
  if (!location || !location.startsWith("/") || location.startsWith("//")) {
    return null;
  }
  try {
    const base = new URL("https://prism.local/");
    const parsed = new URL(location, base);
    if (parsed.origin !== base.origin || parsed.pathname !== "/") return null;
    if (parsed.searchParams.has("mode")) return null;
    const viewParam = parsed.searchParams.get("view");
    if (!viewParam || !PRISM_RESTORABLE_WORKSPACE_VIEW_PARAMS.has(viewParam)) {
      return null;
    }
    if (viewParam === "story" && PRISM_SURFACES.story.status === "planned") {
      return null;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

export function prismStartupLocationFor({
  explicitViewParam,
  preference,
  lastWorkspaceLocation,
}: PrismStartupLocationInput): string | null {
  if (explicitViewParam !== null) return null;
  if (preference === "slate") return PRISM_SURFACES.slate.href;
  if (preference === "last_workspace") {
    return (
      prismRestorableWorkspaceLocation(lastWorkspaceLocation) ??
      PRISM_SURFACES.home.href
    );
  }
  return PRISM_SURFACES.home.href;
}

export function prismContextualSurfaceEntry(
  destinationId: PrismSurfaceId,
  origin: PrismSurfaceCheckpoint,
): PrismContextualSurfaceEntry {
  const destination = PRISM_SURFACES[destinationId];
  if (destination.returnBehavior !== "restore_origin_checkpoint") {
    throw new Error(
      `${destination.name} does not use a contextual return checkpoint.`,
    );
  }

  return {
    destination,
    origin: { ...origin },
  };
}
