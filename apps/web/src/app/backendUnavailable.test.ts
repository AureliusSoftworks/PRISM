import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  BACKEND_UNAVAILABLE_CODE,
  BACKEND_UNAVAILABLE_EVENT,
  PrismBackendUnavailableError,
  createBackendUnavailableErrorFromPayload,
  dispatchBackendUnavailableEvent,
  isBackendUnavailablePayload,
  isPrismBackendUnavailableError,
  type BackendUnavailableEventDetail,
} from "./backendUnavailable.ts";

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
});
