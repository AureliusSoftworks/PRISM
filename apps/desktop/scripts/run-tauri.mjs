#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const command = process.argv[2];
const args = process.argv.slice(3);

if (!command) {
  console.error("Usage: run-tauri.mjs <dev|build|...args>");
  process.exit(1);
}

const env = { ...process.env };
const delimiter = path.delimiter;
const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "PATH";
const currentPath = env[pathKey] ?? "";
const pathEntries = currentPath.split(delimiter).filter(Boolean);
const cargoBin = path.join(os.homedir(), ".cargo", "bin");

if (fs.existsSync(cargoBin) && !pathEntries.includes(cargoBin)) {
  env[pathKey] = `${cargoBin}${delimiter}${currentPath}`;
}

const npmCommand = "npm";

const child = spawn(npmCommand, ["exec", "tauri", "--", command, ...args], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error.message);
  process.exit(1);
});
