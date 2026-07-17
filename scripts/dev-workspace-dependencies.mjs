import { spawnSync } from "node:child_process";
import { watch } from "node:fs";

export const DEV_WORKSPACE_DEPENDENCIES = [
  "packages/config",
  "packages/shared",
];
export const DEV_WORKSPACE_DEPENDENCY_SOURCE_DIRS =
  DEV_WORKSPACE_DEPENDENCIES.map((workspace) => `${workspace}/src`);
const DEV_WORKSPACE_REBUILD_DEBOUNCE_MS = 120;

function runWorkspaceBuild(workspace) {
  const command = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(command, ["run", "build", "--prefix", workspace], {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${workspace} build failed${result.signal ? ` with ${result.signal}` : ` with exit code ${result.status}`}`,
    );
  }
}

export function buildDevWorkspaceDependencies(
  buildWorkspace = runWorkspaceBuild,
) {
  for (const workspace of DEV_WORKSPACE_DEPENDENCIES) {
    buildWorkspace(workspace);
  }
}

function watchSourceDirectory(sourceDir, onChange) {
  return watch(sourceDir, { recursive: true }, onChange);
}

export function watchDevWorkspaceDependencies({
  afterBuild = () => {},
  buildWorkspace = runWorkspaceBuild,
  cancelSchedule = clearTimeout,
  debounceMs = DEV_WORKSPACE_REBUILD_DEBOUNCE_MS,
  onError = () => {},
  schedule = setTimeout,
  watchDirectory = watchSourceDirectory,
} = {}) {
  let closed = false;
  let scheduledBuild = null;

  const rebuild = () => {
    scheduledBuild = null;
    if (closed) return;
    try {
      buildDevWorkspaceDependencies(buildWorkspace);
      afterBuild();
    } catch (error) {
      onError(error);
    }
  };

  const scheduleRebuild = () => {
    if (closed) return;
    if (scheduledBuild !== null) cancelSchedule(scheduledBuild);
    scheduledBuild = schedule(rebuild, debounceMs);
  };

  const watchers = DEV_WORKSPACE_DEPENDENCY_SOURCE_DIRS.map((sourceDir) =>
    watchDirectory(sourceDir, scheduleRebuild),
  );

  return {
    close() {
      if (closed) return;
      closed = true;
      if (scheduledBuild !== null) cancelSchedule(scheduledBuild);
      scheduledBuild = null;
      for (const watcher of watchers) watcher.close();
    },
  };
}
