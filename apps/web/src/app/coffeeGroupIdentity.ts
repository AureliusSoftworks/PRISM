import type {
  CoffeeGroupAtmosphere,
  CoffeeGroupSynthesisItem,
  CoffeeGroupSynthesisItemState,
  CoffeeGroupSynthesisState,
} from "@localai/shared";

export interface CoffeeGroupIdentitySnapshot {
  id: string;
  name: string;
  ethos?: string;
  atmosphere?: CoffeeGroupAtmosphere | null;
  synthesis?: CoffeeGroupSynthesisState;
}

/** Returns the durable synthesis state when it exists on a modern group shape. */
export function coffeeGroupSynthesisItemState(
  group: CoffeeGroupIdentitySnapshot,
  item: CoffeeGroupSynthesisItem,
): CoffeeGroupSynthesisItemState | null {
  return group.synthesis?.items?.[item] ?? null;
}

/** Maps backend lifecycle values to the compact language shown in the identity card. */
export function coffeeGroupSynthesisStatusLabel(
  state: CoffeeGroupSynthesisItemState | null,
): "Shaping" | "Ready" | "Needs retry" {
  const status = state?.status;
  switch (status) {
    case "pending":
    case "running":
      return "Shaping";
    case "ready":
      return "Ready";
    case "failed":
    case undefined:
      return "Needs retry";
    default: {
      const exhaustiveStatus: never = status;
      return exhaustiveStatus;
    }
  }
}

/** True only for explicit backend work, so legacy groups never poll forever. */
export function coffeeGroupSynthesisIsInFlight(
  group: CoffeeGroupIdentitySnapshot,
  item: CoffeeGroupSynthesisItem,
): boolean {
  const status = coffeeGroupSynthesisItemState(group, item)?.status;
  return status === "pending" || status === "running";
}

/** Returns whether any independently generated identity item still needs polling. */
export function coffeeGroupHasInFlightSynthesis(
  group: CoffeeGroupIdentitySnapshot,
): boolean {
  return (["name", "ethos", "atmosphere"] as const).some((item) =>
    coffeeGroupSynthesisIsInFlight(group, item),
  );
}

function coffeeGroupIdentityItemHasValue(
  group: CoffeeGroupIdentitySnapshot,
  item: CoffeeGroupSynthesisItem,
): boolean {
  switch (item) {
    case "name":
      return group.name.trim().length > 0;
    case "ethos":
      return (group.ethos ?? "").trim().length > 0;
    case "atmosphere":
      return Boolean(group.atmosphere?.imageId.trim());
    default: {
      const exhaustiveItem: never = item;
      return exhaustiveItem;
    }
  }
}

/** Chooses the single action label without inventing a separate legacy status. */
export function coffeeGroupSynthesisActionLabel(
  group: CoffeeGroupIdentitySnapshot,
  item: CoffeeGroupSynthesisItem,
): "Generate" | "Retry" | "Regenerate" {
  const state = coffeeGroupSynthesisItemState(group, item);
  if (state?.status === "failed") return "Retry";
  if (state?.status === "ready") return "Regenerate";
  if (
    (state?.status === "pending" || state?.status === "running") &&
    state.revision === 0
  ) {
    return "Generate";
  }
  return coffeeGroupIdentityItemHasValue(group, item)
    ? "Regenerate"
    : "Generate";
}

/** Treats a legacy persisted image as ready while respecting modern lifecycle state. */
export function coffeeGroupAtmosphereIsReady(
  group: CoffeeGroupIdentitySnapshot | null,
): boolean {
  if (!group?.atmosphere?.imageId.trim()) return false;
  const state = coffeeGroupSynthesisItemState(group, "atmosphere");
  return state === null || state.status === "ready";
}

/** Builds the authenticated same-origin image route for a Coffee atmosphere. */
export function coffeeGroupAtmosphereImageUrl(imageId: string): string {
  return `/api/images/${encodeURIComponent(imageId)}/file`;
}
