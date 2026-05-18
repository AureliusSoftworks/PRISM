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
const currentPath = env.PATH ?? "";
const pathEntries = currentPath.split(delimiter).filter(Boolean);
const cargoBin = path.join(os.homedir(), ".cargo", "bin");

if (fs.existsSync(cargoBin) && !pathEntries.includes(cargoBin)) {
  env.PATH = `${cargoBin}${delimiter}${currentPath}`;
}

const child = spawn("tauri", [command, ...args], {
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
