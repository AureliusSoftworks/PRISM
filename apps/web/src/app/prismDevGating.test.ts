import assert from "node:assert/strict";
import test from "node:test";

import {
  prismAvatarDetailsPaneEnabled,
  prismBranchAllowsDevTools,
  prismWebDevChatCommandsEnabled,
  prismWebDevToolsEnabled,
} from "./prismDevGating.ts";

test("dev tools are disabled on main even when local flags are enabled", () => {
  const env = {
    NODE_ENV: "development",
    NEXT_PUBLIC_DEV_TOOLS: "1",
    NEXT_PUBLIC_PRISM_BRANCH: "main",
    NEXT_PUBLIC_PRISM_DEV_COMMANDS: "true",
  };

  assert.equal(prismBranchAllowsDevTools("main"), false);
  assert.equal(prismWebDevToolsEnabled(env), false);
  assert.equal(prismWebDevChatCommandsEnabled(env), false);
  assert.equal(prismAvatarDetailsPaneEnabled(env), false);
});

test("dev tools are disabled when the branch cannot be resolved", () => {
  const env = {
    NODE_ENV: "development",
    NEXT_PUBLIC_DEV_TOOLS: "1",
    NEXT_PUBLIC_PRISM_BRANCH: "unknown",
    NEXT_PUBLIC_PRISM_DEV_COMMANDS: "true",
  };

  assert.equal(prismBranchAllowsDevTools(undefined), false);
  assert.equal(prismBranchAllowsDevTools("unknown"), false);
  assert.equal(prismWebDevToolsEnabled(env), false);
  assert.equal(prismWebDevChatCommandsEnabled(env), false);
  assert.equal(prismAvatarDetailsPaneEnabled(env), false);
});

test("dev tools stay available by default on non-main development branches", () => {
  const env = {
    NODE_ENV: "development",
    NEXT_PUBLIC_PRISM_BRANCH: "dev",
  };

  assert.equal(prismBranchAllowsDevTools("dev"), true);
  assert.equal(prismWebDevToolsEnabled(env), true);
  assert.equal(prismWebDevChatCommandsEnabled(env), true);
  assert.equal(prismAvatarDetailsPaneEnabled(env), true);
});

test("avatar details stay locked on release branches without an override", () => {
  for (const branch of ["release", "release/0.8.0", "release-candidate"]) {
    assert.equal(
      prismAvatarDetailsPaneEnabled({
        NEXT_PUBLIC_PRISM_BRANCH: branch,
        NEXT_PUBLIC_AVATAR_DETAILS: "1",
      }),
      false
    );
  }
});

test("avatar details can be parked on dev without affecting other dev tools", () => {
  assert.equal(
    prismAvatarDetailsPaneEnabled({
      NEXT_PUBLIC_PRISM_BRANCH: "dev",
      NEXT_PUBLIC_AVATAR_DETAILS: "0",
    }),
    false
  );
});

test("production dev commands require explicit opt-in on non-main branches", () => {
  assert.equal(
    prismWebDevChatCommandsEnabled({
      NODE_ENV: "production",
      NEXT_PUBLIC_PRISM_BRANCH: "dev",
    }),
    false
  );
  assert.equal(
    prismWebDevChatCommandsEnabled({
      NODE_ENV: "production",
      NEXT_PUBLIC_PRISM_BRANCH: "dev",
      NEXT_PUBLIC_PRISM_DEV_COMMANDS: "1",
    }),
    true
  );
});
