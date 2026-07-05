import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import {
  AUTH_REAUTH_REQUIRED_EVENT,
  dispatchAuthReauthRequiredEvent,
  isSessionAuthFailureMessage,
  shouldRedirectToLoginForApiFailure,
  type AuthReauthRequiredDetail,
} from "./authReauth.ts";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");

afterEach(() => {
  if (originalWindow) {
    Object.defineProperty(globalThis, "window", originalWindow);
  } else {
    Reflect.deleteProperty(globalThis, "window");
  }
});

describe("auth reauthentication helpers", () => {
  it("recognizes browser session failures", () => {
    assert.equal(isSessionAuthFailureMessage("Authentication required."), true);
    assert.equal(isSessionAuthFailureMessage("Invalid session."), true);
    assert.equal(isSessionAuthFailureMessage("Session expired."), true);
    assert.equal(isSessionAuthFailureMessage("OpenAI request failed with status 401."), false);
    assert.equal(isSessionAuthFailureMessage(null), false);
  });

  it("redirects protected API session failures but leaves passive auth checks alone", () => {
    assert.equal(
      shouldRedirectToLoginForApiFailure({
        path: "/api/conversations",
        status: 400,
        payload: { ok: false, error: "Session expired." },
      }),
      true
    );
    assert.equal(
      shouldRedirectToLoginForApiFailure({
        path: "/api/auth/me",
        status: 200,
        payload: { ok: true, error: "Session expired." },
      }),
      false
    );
    assert.equal(
      shouldRedirectToLoginForApiFailure({
        path: "/api/settings/api-key-status",
        status: 200,
        payload: { ok: true, error: "Provider returned status 401." },
      }),
      false
    );
  });

  it("dispatches a deferred app-level reauth event", async () => {
    const target = new EventTarget();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: Object.assign(target, {
        setTimeout: (callback: () => void) => setTimeout(callback, 0),
      }),
    });
    const received: AuthReauthRequiredDetail[] = [];
    target.addEventListener(AUTH_REAUTH_REQUIRED_EVENT, (event) => {
      received.push((event as CustomEvent<AuthReauthRequiredDetail>).detail);
    });

    dispatchAuthReauthRequiredEvent({
      path: "/api/conversations",
      status: 400,
      reason: "Session expired.",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(received, [
      {
        path: "/api/conversations",
        status: 400,
        reason: "Session expired.",
      },
    ]);
  });
});
