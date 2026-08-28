#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderDebateMysteryRoomArtV1 } from "../apps/api/src/debate-mystery-room-art.ts";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultInput = join(repositoryRoot, "apps/web/public/debate/mystery/rooms");

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const inputDirectory = resolve(option("--input-dir") ?? defaultInput);
const outputDirectory = resolve(option("--output-dir") ?? inputDirectory);
const includeMosaics = process.argv.includes("--include-mosaics");

const entries = (await readdir(inputDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => /\.(png|jpe?g|webp)$/iu.test(name))
  .filter((name) => includeMosaics || !/-mosaic\.(png|jpe?g|webp)$/iu.test(name))
  .sort((left, right) => left.localeCompare(right));

await mkdir(outputDirectory, { recursive: true });
for (const name of entries) {
  const source = await readFile(join(inputDirectory, name));
  const result = await renderDebateMysteryRoomArtV1(source, { format: "webp" });
  const outputName = `${basename(name, extname(name))}-mosaic.webp`;
  await writeFile(join(outputDirectory, outputName), result.bytes);
  process.stdout.write(`${name} -> ${outputName} (${result.bytes.byteLength} bytes)\n`);
}

process.stdout.write(`Generated ${entries.length} Mosaic room${entries.length === 1 ? "" : "s"}.\n`);
