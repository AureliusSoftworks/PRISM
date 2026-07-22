import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  BACKEND_UNAVAILABLE_CODE,
  BACKEND_AVAILABLE_EVENT,
  BACKEND_UNAVAILABLE_EVENT,
  PrismBackendUnavailableError,
  createBackendUnavailableErrorFromPayload,
  dispatchBackendAvailableEvent,
  dispatchBackendUnavailableDetail,
  dispatchBackendUnavailableEvent,
  isBackendUnavailableMessage,
  isBackendUnavailablePayload,
  isPrismBackendUnavailableError,
  type BackendUnavailableEventDetail,
} from "./backendUnavailable.ts";
import {
  backendUnavailableDetailFromError,
  decideAuthBootstrapFailure,
  isAbortLikeError,
} from "./authBootstrap.ts";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

describe("backend unavailable helpers", () => {
  it("recognizes the stable backend-down payload", () => {
    const payload = {
      ok: false,
      code: BACKEND_UNAVAILABLE_CODE,
      error: "Prism is waiting for its local API.",
      retryable: true,
      detail: "connect ECONNREFUSED",
    };

    assert.equal(isBackendUnavailablePayload(payload), true);
    assert.equal(isBackendUnavailablePayload({ ok: false, error: "Internal Server Error" }), false);
  });

  it("recognizes only connection-shaped messages for stale-error cleanup", () => {
    assert.equal(
      isBackendUnavailableMessage("Prism is waiting for its local API."),
      true,
    );
    assert.equal(
      isBackendUnavailableMessage("Trying to reconnect to Prism..."),
      true,
    );
    assert.equal(isBackendUnavailableMessage("ElevenLabs quota exceeded."), false);
  });

  it("converts backend-down payloads into PrismBackendUnavailableError", () => {
    const error = createBackendUnavailableErrorFromPayload(
      {
        ok: false,
        code: BACKEND_UNAVAILABLE_CODE,
        error: "Prism is waiting for its local API.",
        retryable: true,
        detail: "fetch failed",
      },
      { path: "/api/health", status: 503 }
    );

    assert.equal(error instanceof PrismBackendUnavailableError, true);
    assert.equal(isPrismBackendUnavailableError(error), true);
    assert.equal(error.message, "Prism is waiting for its local API.");
    assert.equal(error.path, "/api/health");
    assert.equal(error.status, 503);
    assert.equal(error.detail, "fetch failed");
  });

  it("dispatches one app-level backend unavailable event", () => {
    const target = new EventTarget();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: target,
    });
    const received: BackendUnavailableEventDetail[] = [];
    target.addEventListener(BACKEND_UNAVAILABLE_EVENT, (event) => {
      received.push((event as CustomEvent<BackendUnavailableEventDetail>).detail);
    });

    dispatchBackendUnavailableEvent(
      new PrismBackendUnavailableError("Prism is waiting for its local API.", {
        path: "/api/conversations",
        status: 503,
        detail: "ECONNREFUSED",
      })
    );

    assert.deepEqual(received, [
      {
        code: BACKEND_UNAVAILABLE_CODE,
        message: "Prism is waiting for its local API.",
        path: "/api/conversations",
        status: 503,
        detail: "ECONNREFUSED",
      },
    ]);
  });

  it("emits connection events once per availability transition", () => {
    const target = new EventTarget();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: target,
    });
    const received: string[] = [];
    target.addEventListener(BACKEND_UNAVAILABLE_EVENT, (event) => {
      const detail = (event as CustomEvent<BackendUnavailableEventDetail>).detail;
      received.push(`down:${detail.path}`);
    });
    target.addEventListener(BACKEND_AVAILABLE_EVENT, () => {
      received.push("up");
    });

    dispatchBackendAvailableEvent();
    dispatchBackendUnavailableDetail({
      code: BACKEND_UNAVAILABLE_CODE,
      message: "Reconnecting",
      path: "/api/first",
    });
    dispatchBackendUnavailableDetail({
      code: BACKEND_UNAVAILABLE_CODE,
      message: "Reconnecting",
      path: "/api/duplicate",
    });
    dispatchBackendAvailableEvent();
    dispatchBackendAvailableEvent();
    dispatchBackendUnavailableDetail({
      code: BACKEND_UNAVAILABLE_CODE,
      message: "Reconnecting again",
      path: "/api/second",
    });

    assert.deepEqual(received, ["down:/api/first", "up", "down:/api/second"]);
  });

  it("preserves the current user when auth bootstrap hits a backend outage", () => {
    const currentUser = { id: "user-1", displayName: "Jared" };
    const decision = decideAuthBootstrapFailure(
      new PrismBackendUnavailableError("Prism is waiting for its local API.", {
        path: "/api/auth/me",
        status: 503,
        detail: "ECONNREFUSED",
      }),
      currentUser
    );

    assert.equal(decision.kind, "reconnecting");
    if (decision.kind !== "reconnecting") return;
    assert.equal(decision.user, currentUser);
    assert.deepEqual(decision.detail, {
      code: BACKEND_UNAVAILABLE_CODE,
      message: "Prism is waiting for its local API.",
      path: "/api/auth/me",
      status: 503,
      detail: "ECONNREFUSED",
    });
  });

  it("treats auth bootstrap timeouts as reconnecting instead of signed out", () => {
    const timeout = new Error("operation timed out");
    timeout.name = "AbortError";

    assert.equal(isAbortLikeError(timeout), true);
    assert.deepEqual(backendUnavailableDetailFromError(timeout, { path: "/api/auth/me" }), {
      code: BACKEND_UNAVAILABLE_CODE,
      message: "Trying to reconnect to Prism...",
      path: "/api/auth/me",
      status: undefined,
      detail: "Request timed out while Prism was starting.",
    });
  });

  it("still clears auth state for ordinary bootstrap failures", () => {
    const decision = decideAuthBootstrapFailure(
      new Error("Invalid session."),
      { id: "user-1" }
    );

    assert.deepEqual(decision, { kind: "signed-out" });
  });
});
