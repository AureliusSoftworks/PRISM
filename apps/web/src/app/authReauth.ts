export const AUTH_REAUTH_REQUIRED_EVENT = "prism:auth-reauth-required" as const;

export type AuthReauthRequiredDetail = {
  path?: string;
  status?: number;
  reason: string;
};

type ApiFailurePayload = {
  ok?: boolean;
  error?: unknown;
};

const SESSION_AUTH_FAILURE_MESSAGES = new Set([
  "authentication required.",
  "invalid session.",
  "session expired.",
]);

export function isSessionAuthFailureMessage(message: unknown): message is string {
  return (
    typeof message === "string" &&
    SESSION_AUTH_FAILURE_MESSAGES.has(message.trim().toLowerCase())
  );
}

export function shouldRedirectToLoginForApiFailure(options: {
  path: string;
  status: number;
  payload: ApiFailurePayload | null;
}): boolean {
  if (!options.path.startsWith("/api/")) return false;
  if (options.path === "/api/auth/me") return false;
  return isSessionAuthFailureMessage(options.payload?.error);
}

export function dispatchAuthReauthRequiredEvent(
  detail: AuthReauthRequiredDetail
): void {
  if (typeof window === "undefined") return;
  window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent<AuthReauthRequiredDetail>(AUTH_REAUTH_REQUIRED_EVENT, {
        detail,
      })
    );
  }, 0);
}
