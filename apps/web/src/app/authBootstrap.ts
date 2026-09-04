import {
  BACKEND_UNAVAILABLE_CODE,
  isPrismBackendUnavailableError,
  type BackendUnavailableEventDetail,
} from "./backendUnavailable.ts";

type BackendUnavailableDetailFallback = {
  path?: string;
  status?: number;
  message?: string;
  detail?: string;
};

export type AuthBootstrapFailureDecision<User> =
  | {
      kind: "reconnecting";
      user: User | null;
      detail: BackendUnavailableEventDetail;
    }
  | { kind: "signed-out" };

export function isAbortLikeError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "AbortError") return true;
  return (
    typeof DOMException !== "undefined" &&
    err instanceof DOMException &&
    err.name === "AbortError"
  );
}

export function backendUnavailableDetailFromError(
  error: unknown,
  fallback: BackendUnavailableDetailFallback = {}
): BackendUnavailableEventDetail | null {
  if (isPrismBackendUnavailableError(error)) {
    return {
      code: BACKEND_UNAVAILABLE_CODE,
      message: error.message,
      path: error.path ?? fallback.path,
      status: error.status ?? fallback.status,
      detail: error.detail ?? fallback.detail,
    };
  }

  if (!isAbortLikeError(error)) return null;

  return {
    code: BACKEND_UNAVAILABLE_CODE,
    message: fallback.message ?? "Trying to reconnect to Prism...",
    path: fallback.path,
    status: fallback.status,
    detail: fallback.detail ?? "Request timed out while Prism was starting.",
  };
}

export function decideAuthBootstrapFailure<User>(
  error: unknown,
  currentUser: User | null,
  fallback: BackendUnavailableDetailFallback = {}
): AuthBootstrapFailureDecision<User> {
  const detail = backendUnavailableDetailFromError(error, fallback);
  if (!detail) return { kind: "signed-out" };
  return {
    kind: "reconnecting",
    user: currentUser,
    detail,
  };
}

/** Watchdog budgets for the auth bootstrap request. A young document is still
 * parsing and hydrating on the same thread that must service the response, so
 * a tight deadline there mostly measures the page's own busyness: the abort
 * fires, reads as "server offline", and the reconnect card flashes on every
 * cold start. The first attempt therefore gets the wide deadline while the
 * document is young, and an established page keeps the tight one. Retry
 * attempts are always wide — they run only after a watchdog abort, and their
 * job is to separate "the page was busy" from "the server is gone". Genuine
 * refusals (the API proxy answering unavailable) are not aborts and surface
 * immediately regardless of these budgets. */
export const AUTH_BOOTSTRAP_TIMEOUT_MS = 3_000;
export const AUTH_BOOTSTRAP_WIDE_TIMEOUT_MS = 12_000;
export const AUTH_BOOTSTRAP_YOUNG_DOCUMENT_MS = 15_000;

export function authBootstrapAttemptTimeoutMs(args: {
  /** 1 for the first try; anything above it is the silent retry. */
  attempt: number;
  /** Milliseconds since navigation start, i.e. performance.now(). */
  documentAgeMs: number;
}): number {
  if (args.attempt > 1) return AUTH_BOOTSTRAP_WIDE_TIMEOUT_MS;
  return args.documentAgeMs < AUTH_BOOTSTRAP_YOUNG_DOCUMENT_MS
    ? AUTH_BOOTSTRAP_WIDE_TIMEOUT_MS
    : AUTH_BOOTSTRAP_TIMEOUT_MS;
}
