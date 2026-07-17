import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEV_WORKSPACE_DEPENDENCIES,
  DEV_WORKSPACE_DEPENDENCY_SOURCE_DIRS,
  buildDevWorkspaceDependencies,
  watchDevWorkspaceDependencies,
} from "./dev-workspace-dependencies.mjs";

test("builds shared runtime dependencies before the dev services start", () => {
  const built = [];

  buildDevWorkspaceDependencies((workspace) => built.push(workspace));

  assert.deepEqual(built, DEV_WORKSPACE_DEPENDENCIES);
});

test("stops before services can start when a dependency build fails", () => {
  const built = [];

  assert.throws(
    () =>
      buildDevWorkspaceDependencies((workspace) => {
        built.push(workspace);
        if (workspace === "packages/config") throw new Error("build failed");
      }),
    /build failed/,
  );
  assert.deepEqual(built, ["packages/config"]);
});

test("debounces source changes, rebuilds dependencies, and reloads after success", () => {
  const watched = [];
  const closed = [];
  const built = [];
  const canceled = [];
  let scheduled = null;
  let reloads = 0;

  const watcher = watchDevWorkspaceDependencies({
    afterBuild: () => {
      reloads += 1;
    },
    buildWorkspace: (workspace) => built.push(workspace),
    cancelSchedule: (handle) => canceled.push(handle),
    schedule: (callback, delay) => {
      scheduled = { callback, delay };
      return scheduled;
    },
    watchDirectory: (sourceDir, onChange) => {
      watched.push({ sourceDir, onChange });
      return { close: () => closed.push(sourceDir) };
    },
  });

  assert.deepEqual(
    watched.map(({ sourceDir }) => sourceDir),
    DEV_WORKSPACE_DEPENDENCY_SOURCE_DIRS,
  );
  watched[0].onChange();
  const firstSchedule = scheduled;
  watched[1].onChange();
  assert.deepEqual(canceled, [firstSchedule]);
  assert.equal(scheduled.delay, 120);
  scheduled.callback();
  assert.deepEqual(built, DEV_WORKSPACE_DEPENDENCIES);
  assert.equal(reloads, 1);

  watcher.close();
  assert.deepEqual(closed, DEV_WORKSPACE_DEPENDENCY_SOURCE_DIRS);
});

test("does not reload the API when a dependency rebuild fails", () => {
  const errors = [];
  let onChange = null;
  let scheduled = null;
  let reloads = 0;

  watchDevWorkspaceDependencies({
    afterBuild: () => {
      reloads += 1;
    },
    buildWorkspace: () => {
      throw new Error("build failed");
    },
    onError: (error) => errors.push(error),
    schedule: (callback) => {
      scheduled = callback;
      return callback;
    },
    watchDirectory: (_sourceDir, callback) => {
      onChange = callback;
      return { close() {} };
    },
  });

  onChange();
  scheduled();
  assert.equal(reloads, 0);
  assert.match(errors[0].message, /build failed/);
});
