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
