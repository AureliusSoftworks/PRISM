import test from "node:test";
import assert from "node:assert/strict";
import {
  isLoopbackOrigin,
  resolveInstallCoachContent,
  type InstallCoachEnvironment,
} from "./installCoach.ts";

const IOS_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const DESKTOP_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

function env(overrides: Partial<InstallCoachEnvironment>): InstallCoachEnvironment {
  return {
    origin: "http://192.168.1.20:18788",
    userAgent: DESKTOP_SAFARI,
    platform: "MacIntel",
    maxTouchPoints: 0,
    standalone: false,
    dismissed: false,
    hasBeforeInstallPrompt: false,
    ...overrides,
  };
}

test("hides install coach on loopback origins", () => {
  assert.equal(isLoopbackOrigin("http://localhost:18788"), true);
  assert.equal(isLoopbackOrigin("http://127.0.0.1:18788"), true);
  assert.equal(isLoopbackOrigin("http://[::1]:18788"), true);
  assert.equal(resolveInstallCoachContent(env({ origin: "http://localhost:18788" })), null);
});

test("hides install coach when already standalone or dismissed", () => {
  assert.equal(resolveInstallCoachContent(env({ standalone: true })), null);
  assert.equal(resolveInstallCoachContent(env({ dismissed: true })), null);
});

test("uses iOS Safari Add to Home Screen copy", () => {
  const content = resolveInstallCoachContent(
    env({ userAgent: IOS_SAFARI, platform: "iPhone", maxTouchPoints: 5 })
  );
  assert.equal(content?.kind, "ios-safari");
  assert.match(content?.body ?? "", /Add to Home Screen/);
});

test("asks iOS non-Safari browsers to open Safari", () => {
  const content = resolveInstallCoachContent(
    env({ userAgent: IOS_CHROME, platform: "iPhone", maxTouchPoints: 5 })
  );
  assert.equal(content?.kind, "ios-other");
  assert.match(content?.body ?? "", /Safari/);
});

test("uses Android install button only when the prompt event is available", () => {
  assert.equal(
    resolveInstallCoachContent(
      env({ userAgent: ANDROID_CHROME, hasBeforeInstallPrompt: true })
    )?.kind,
    "android-install"
  );
  assert.equal(
    resolveInstallCoachContent(
      env({ userAgent: ANDROID_CHROME, hasBeforeInstallPrompt: false })
    )?.kind,
    "android-menu"
  );
});

test("falls back to desktop bookmark copy", () => {
  const content = resolveInstallCoachContent(env({ userAgent: DESKTOP_SAFARI }));
  assert.equal(content?.kind, "desktop-bookmark");
  assert.match(content?.body ?? "", /browser/);
});
