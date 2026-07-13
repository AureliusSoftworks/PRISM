import { spawn } from "node:child_process";

const coverage = process.argv.includes("--coverage");
const script = coverage ? "test:coverage" : "test";
const workspaces = [
  "packages/config",
  "packages/shared",
  "apps/api",
  "apps/web",
];

function runWorkspace(workspace) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "npm.cmd" : "npm",
      ["run", script, "--prefix", workspace],
      { stdio: "inherit", env: process.env }
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${workspace} ${script} failed${signal ? ` with ${signal}` : ` with exit code ${code}`}`
        )
      );
    });
  });
}

for (const workspace of workspaces) {
  await runWorkspace(workspace);
}
