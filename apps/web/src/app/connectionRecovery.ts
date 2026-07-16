export type BackendRecoveryPlan = {
  bootstrapAuth: boolean;
  refreshWorkspace: false;
};

const BACKEND_RECONNECT_DELAYS_MS = [500, 750, 1_000, 1_500, 2_000] as const;
const BACKEND_HEALTH_POLL_FOREGROUND_MS = 2_000;
const BACKEND_HEALTH_POLL_BACKGROUND_MS = 10_000;

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

export function backendHealthPollDelayMs(documentHidden: boolean): number {
  return documentHidden
    ? BACKEND_HEALTH_POLL_BACKGROUND_MS
    : BACKEND_HEALTH_POLL_FOREGROUND_MS;
}
