#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { applyDebateMysteryMosaicPresentationV1 } from
  "../apps/api/src/debate-mystery-room-art.ts";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const defaultInput = join(
  repositoryRoot,
  ".codex/output/imagegen/whodunnit-synthesized-pixel-art-v1",
);
const defaultOutput = join(repositoryRoot, "apps/web/public/debate/mystery/rooms");

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const inputDirectory = resolve(option("--input-dir") ?? defaultInput);
const outputDirectory = resolve(option("--output-dir") ?? defaultOutput);
if (inputDirectory === defaultOutput) {
  throw new Error(
    "Refusing to derive Pixel Art from the high-resolution production room directory. " +
    "Supply genuinely synthesized Pixel Art inputs instead.",
  );
}

const entries = (await readdir(inputDirectory, { withFileTypes: true }))
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => /\.(png|jpe?g|webp)$/iu.test(name))
  .filter((name) => !/^(?:space|jungle)-room-/iu.test(name))
  .sort((left, right) => left.localeCompare(right));

await mkdir(outputDirectory, { recursive: true });
for (const name of entries) {
  const outputName = `${basename(name, extname(name))}-mosaic.webp`;
  const outputPath = join(outputDirectory, outputName);
  const result = await applyDebateMysteryMosaicPresentationV1(
    await readFile(join(inputDirectory, name)),
    { format: "webp" },
  );
  await writeFile(outputPath, result.bytes);
  process.stdout.write(
    `${name} -> ${outputName} (${result.bytes.byteLength} bytes, median ${result.medianLuminance})\n`,
  );
}

process.stdout.write(
  `Installed ${entries.length} synthesized Pixel Art room${entries.length === 1 ? "" : "s"}. ` +
  "Sources remain gridless; the approved balanced Normal Mosaic grid is presentation-only.\n",
);
