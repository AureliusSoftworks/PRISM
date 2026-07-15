export type RelationshipDepthSurface =
  | "library"
  | "group-room"
  | "history"
  | "home"
  | "transcript";

export interface RelationshipDepthEndpoint {
  /** Stable key for the exact logical surface or saved checkpoint. */
  key: string;
  surface: RelationshipDepthSurface;
  /** Stable relationship owner: `prism`, `bot:<id>`, or null outside a Home. */
  contextKey: string | null;
  /** Identity depicted by a shared anchor, independent of current ownership. */
  identityKey: string | null;
  /** Active episode or pending-turn scope. Transcript keeps this unchanged. */
  activityKey: string | null;
}

export interface RelationshipDepthRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface RelationshipDepthAnchorGeometry {
  identityKey: string;
  viewport: {
    width: number;
    height: number;
  };
  source: RelationshipDepthRect;
  destination: RelationshipDepthRect;
}

export interface RelationshipDepthCheckpoint {
  key: string;
  endpoint: RelationshipDepthEndpoint;
  focusKey: string | null;
}

export type RelationshipDepthMotion =
  | "shared-anchor"
  | "pullback-swap"
  | "lateral"
  | "crossfade";

export type RelationshipDepthPhase =
  | "interrupting"
  | "source-beat"
  | "handoff"
  | "destination-beat"
  | "settled";

export type RelationshipDepthInteractionLock =
  | "none"
  | "navigation"
  | "surface";

export interface RelationshipDepthPlan {
  motion: RelationshipDepthMotion;
  spatial: boolean;
  contextChanges: boolean;
  activityChanges: boolean;
  atmosphere: "retain" | "crossfade";
  interactionLock: Exclude<RelationshipDepthInteractionLock, "none">;
  interruptActiveTurn: boolean;
}

export interface RelationshipDepthTransitionState {
  id: string;
  source: RelationshipDepthEndpoint;
  destination: RelationshipDepthEndpoint;
  checkpoint: RelationshipDepthCheckpoint;
  geometry: RelationshipDepthAnchorGeometry | null;
  plan: RelationshipDepthPlan;
  phase: RelationshipDepthPhase;
  direction: "forward" | "reverse";
  mountedEndpoint: "source" | "destination";
  settledAt: "source" | "destination" | null;
  returnReason: "back" | "escape" | "cancel" | null;
}

export type RelationshipDepthEffect =
  | { type: "interrupt-active-turn"; transitionId: string }
  | {
      type: "commit-destination";
      endpoint: RelationshipDepthEndpoint;
    }
  | {
      type: "restore-checkpoint";
      checkpoint: RelationshipDepthCheckpoint;
    }
  | { type: "restore-focus"; focusKey: string | null };

export type RelationshipDepthEvent =
  | { type: "active-turn-interrupted"; transitionId: string }
  | { type: "beat-complete"; transitionId: string }
  | { type: "endpoint-ready"; transitionId: string }
  | {
      type: "return";
      transitionId: string;
      reason: "back" | "escape" | "cancel";
    };

export interface RelationshipDepthTransitionUpdate {
  state: RelationshipDepthTransitionState;
  effects: readonly RelationshipDepthEffect[];
}

export interface CreateRelationshipDepthTransitionInput {
  id: string;
  source: RelationshipDepthEndpoint;
  destination: RelationshipDepthEndpoint;
  checkpoint: RelationshipDepthCheckpoint;
  geometry?: RelationshipDepthAnchorGeometry | null;
  reducedMotion?: boolean;
  activeTurnRunning?: boolean;
}

const NO_EFFECTS: readonly RelationshipDepthEffect[] = [];

function rectIsUsable(
  rect: RelationshipDepthRect,
  viewport: RelationshipDepthAnchorGeometry["viewport"],
): boolean {
  const values = [
    rect.left,
    rect.top,
    rect.width,
    rect.height,
    viewport.width,
    viewport.height,
  ];
  if (!values.every(Number.isFinite)) return false;
  if (
    rect.width <= 0 ||
    rect.height <= 0 ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return false;
  }
  return (
    rect.left < viewport.width &&
    rect.left + rect.width > 0 &&
    rect.top < viewport.height &&
    rect.top + rect.height > 0
  );
}

function usableSharedAnchorGeometry(
  source: RelationshipDepthEndpoint,
  destination: RelationshipDepthEndpoint,
  geometry: RelationshipDepthAnchorGeometry | null | undefined,
): RelationshipDepthAnchorGeometry | null {
  if (
    !geometry ||
    !source.identityKey ||
    source.identityKey !== destination.identityKey ||
    geometry.identityKey !== source.identityKey ||
    !rectIsUsable(geometry.source, geometry.viewport) ||
    !rectIsUsable(geometry.destination, geometry.viewport)
  ) {
    return null;
  }
  return geometry;
}

function transitionMotion({
  source,
  destination,
  geometry,
  reducedMotion,
  contextChanges,
}: {
  source: RelationshipDepthEndpoint;
  destination: RelationshipDepthEndpoint;
  geometry: RelationshipDepthAnchorGeometry | null;
  reducedMotion: boolean;
  contextChanges: boolean;
}): RelationshipDepthMotion {
  if (reducedMotion) return "crossfade";
  if (source.surface === "transcript" || destination.surface === "transcript") {
    return "lateral";
  }
  if (
    source.surface === "home" &&
    destination.surface === "home" &&
    contextChanges
  ) {
    return "pullback-swap";
  }
  if (
    (source.surface === "home") !== (destination.surface === "home") &&
    geometry
  ) {
    return "shared-anchor";
  }
  return "crossfade";
}

function unchanged(
  state: RelationshipDepthTransitionState,
): RelationshipDepthTransitionUpdate {
  return { state, effects: NO_EFFECTS };
}

/**
 * Plans one visual relationship-depth transition without routing, persistence,
 * timers, DOM nodes, or message-generation behavior.
 */
export function createRelationshipDepthTransition(
  input: CreateRelationshipDepthTransitionInput,
): RelationshipDepthTransitionUpdate | null {
  if (input.source.key === input.destination.key) return null;

  const contextChanges = input.source.contextKey !== input.destination.contextKey;
  const activityChanges =
    input.source.activityKey !== input.destination.activityKey;
  const reducedMotion = input.reducedMotion === true;
  const candidateGeometry = usableSharedAnchorGeometry(
    input.source,
    input.destination,
    input.geometry,
  );
  const motion = transitionMotion({
    source: input.source,
    destination: input.destination,
    geometry: candidateGeometry,
    reducedMotion,
    contextChanges,
  });
  const interruptActiveTurn =
    input.activeTurnRunning === true && (contextChanges || activityChanges);
  const plan: RelationshipDepthPlan = {
    motion,
    spatial: motion === "shared-anchor" || motion === "pullback-swap",
    contextChanges,
    activityChanges,
    atmosphere: contextChanges ? "crossfade" : "retain",
    interactionLock:
      contextChanges || activityChanges ? "surface" : "navigation",
    interruptActiveTurn,
  };
  const state: RelationshipDepthTransitionState = {
    id: input.id,
    source: input.source,
    destination: input.destination,
    checkpoint: input.checkpoint,
    geometry: motion === "shared-anchor" ? candidateGeometry : null,
    plan,
    phase: interruptActiveTurn ? "interrupting" : "source-beat",
    direction: "forward",
    mountedEndpoint: "source",
    settledAt: null,
    returnReason: null,
  };
  return {
    state,
    effects: interruptActiveTurn
      ? [{ type: "interrupt-active-turn", transitionId: input.id }]
      : NO_EFFECTS,
  };
}

/**
 * Advances or reverses a planned transition. Effects describe only local UI
 * orchestration; deliberately no effect can send or persist conversation text.
 */
export function reduceRelationshipDepthTransition(
  state: RelationshipDepthTransitionState,
  event: RelationshipDepthEvent,
): RelationshipDepthTransitionUpdate {
  if (event.transitionId !== state.id) return unchanged(state);

  if (event.type === "active-turn-interrupted") {
    return state.phase === "interrupting"
      ? {
          state: { ...state, phase: "source-beat" },
          effects: NO_EFFECTS,
        }
      : unchanged(state);
  }

  if (event.type === "endpoint-ready") {
    if (state.phase !== "handoff") return unchanged(state);
    return {
      state: {
        ...state,
        phase:
          state.direction === "forward"
            ? "destination-beat"
            : "source-beat",
      },
      effects: NO_EFFECTS,
    };
  }

  if (event.type === "beat-complete") {
    if (state.phase === "source-beat") {
      if (state.direction === "reverse") {
        return {
          state: {
            ...state,
            phase: "settled",
            mountedEndpoint: "source",
            settledAt: "source",
          },
          effects: [
            { type: "restore-focus", focusKey: state.checkpoint.focusKey },
          ],
        };
      }
      return {
        state: {
          ...state,
          phase: "handoff",
          mountedEndpoint: "destination",
        },
        effects: [
          { type: "commit-destination", endpoint: state.destination },
        ],
      };
    }

    if (state.phase === "destination-beat") {
      if (state.direction === "reverse") {
        return {
          state: {
            ...state,
            phase: "handoff",
            mountedEndpoint: "source",
          },
          effects: [
            { type: "restore-checkpoint", checkpoint: state.checkpoint },
          ],
        };
      }
      return {
        state: {
          ...state,
          phase: "settled",
          mountedEndpoint: "destination",
          settledAt: "destination",
        },
        effects: NO_EFFECTS,
      };
    }
    return unchanged(state);
  }

  if (event.type === "return") {
    if (state.direction === "reverse" || state.settledAt === "source") {
      return unchanged(state);
    }
    const returning = {
      ...state,
      direction: "reverse" as const,
      settledAt: null,
      returnReason: event.reason,
    };

    if (state.phase === "interrupting") {
      return {
        state: {
          ...returning,
          phase: "settled",
          mountedEndpoint: "source",
          settledAt: "source",
        },
        effects: [
          { type: "restore-focus", focusKey: state.checkpoint.focusKey },
        ],
      };
    }
    if (state.phase === "source-beat") {
      return { state: returning, effects: NO_EFFECTS };
    }
    if (state.phase === "handoff") {
      return {
        state: { ...returning, mountedEndpoint: "source" },
        effects: [
          { type: "restore-checkpoint", checkpoint: state.checkpoint },
        ],
      };
    }
    return {
      state: {
        ...returning,
        phase: "destination-beat",
        mountedEndpoint: "destination",
      },
      effects: NO_EFFECTS,
    };
  }

  return unchanged(state);
}

export function relationshipDepthTransitionInteractionLock(
  state: RelationshipDepthTransitionState,
): RelationshipDepthInteractionLock {
  return state.phase === "settled" ? "none" : state.plan.interactionLock;
}
