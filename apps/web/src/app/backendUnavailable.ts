export const BACKEND_UNAVAILABLE_CODE = "backend_unavailable" as const;
export const BACKEND_UNAVAILABLE_EVENT = "prism:backend-unavailable" as const;
export const BACKEND_AVAILABLE_EVENT = "prism:backend-available" as const;

export type BackendUnavailablePayload = {
  ok: false;
  code: typeof BACKEND_UNAVAILABLE_CODE;
  error: string;
  retryable: true;
  detail?: string;
};

export type BackendUnavailableEventDetail = {
  code: typeof BACKEND_UNAVAILABLE_CODE;
  message: string;
  path?: string;
  status?: number;
  detail?: string;
};

type BackendConnectionEventState = "available" | "unavailable";

const backendConnectionEventState = new WeakMap<
  EventTarget,
  BackendConnectionEventState
>();

type BackendUnavailableErrorOptions = {
  path?: string;
  status?: number;
  detail?: string;
};

export class PrismBackendUnavailableError extends Error {
  readonly code = BACKEND_UNAVAILABLE_CODE;
  readonly retryable = true;
  readonly path?: string;
  readonly status?: number;
  readonly detail?: string;

  constructor(message: string, options: BackendUnavailableErrorOptions = {}) {
    super(message);
    this.name = "PrismBackendUnavailableError";
    this.path = options.path;
    this.status = options.status;
    this.detail = options.detail;
  }
}

export function isBackendUnavailablePayload(
  payload: unknown
): payload is BackendUnavailablePayload {
  if (!payload || typeof payload !== "object") return false;
  const candidate = payload as Partial<BackendUnavailablePayload>;
  return (
    candidate.ok === false &&
    candidate.code === BACKEND_UNAVAILABLE_CODE &&
    candidate.retryable === true &&
    typeof candidate.error === "string" &&
    candidate.error.trim().length > 0
  );
}

export function isPrismBackendUnavailableError(
  error: unknown
): error is PrismBackendUnavailableError {
  if (error instanceof PrismBackendUnavailableError) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    retryable?: unknown;
    message?: unknown;
  };
  return (
    candidate.code === BACKEND_UNAVAILABLE_CODE &&
    candidate.retryable === true &&
    typeof candidate.message === "string"
  );
}

export function createBackendUnavailableError(
  message = "Prism is waiting for its local API.",
  options: BackendUnavailableErrorOptions = {}
): PrismBackendUnavailableError {
  return new PrismBackendUnavailableError(message, options);
}

export function createBackendUnavailableErrorFromPayload(
  payload: BackendUnavailablePayload,
  options: BackendUnavailableErrorOptions = {}
): PrismBackendUnavailableError {
  return createBackendUnavailableError(payload.error, {
    ...options,
    detail: options.detail ?? payload.detail,
  });
}

export function dispatchBackendUnavailableEvent(
  error: PrismBackendUnavailableError
): void {
  dispatchBackendUnavailableDetail({
    code: BACKEND_UNAVAILABLE_CODE,
    message: error.message,
    path: error.path,
    status: error.status,
    detail: error.detail,
  });
}

export function dispatchBackendUnavailableDetail(
  detail: BackendUnavailableEventDetail
): void {
  if (typeof window === "undefined") return;
  if (backendConnectionEventState.get(window) === "unavailable") return;
  backendConnectionEventState.set(window, "unavailable");
  window.dispatchEvent(
    new CustomEvent<BackendUnavailableEventDetail>(BACKEND_UNAVAILABLE_EVENT, {
      detail,
    })
  );
}

export function dispatchBackendAvailableEvent(): void {
  if (typeof window === "undefined") return;
  if (backendConnectionEventState.get(window) !== "unavailable") return;
  backendConnectionEventState.set(window, "available");
  window.dispatchEvent(new CustomEvent(BACKEND_AVAILABLE_EVENT));
}
