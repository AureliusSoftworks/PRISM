export type BackendRecoveryPlan = {
  bootstrapAuth: boolean;
  refreshWorkspace: false;
};

const BACKEND_RECONNECT_DELAYS_MS = [750, 1_250, 2_000, 3_000, 5_000] as const;

/**
 * A signed-in workspace already has the route, conversation, draft, scroll,
 * and transient app state it needs. Reconnecting its transport must not
 * rehydrate that state from the server.
 */
export function backendRecoveryPlan(
  hadAuthenticatedUser: boolean,
): BackendRecoveryPlan {
  return {
    bootstrapAuth: !hadAuthenticatedUser,
    refreshWorkspace: false,
  };
}

export function backendReconnectDelayMs(failedAttempts: number): number {
  const index = Math.min(
    Math.max(0, Math.floor(failedAttempts)),
    BACKEND_RECONNECT_DELAYS_MS.length - 1,
  );
  return BACKEND_RECONNECT_DELAYS_MS[index];
}
