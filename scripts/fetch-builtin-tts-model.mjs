#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

export const BUILTIN_TTS_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
export const BUILTIN_TTS_MODEL_REVISION =
  "1939ad2a8e416c0acfeecc08a694d14ef25f2231";

const MODEL_FILES = [
  {
    path: "config.json",
    bytes: 44,
    sha256: "df34b4f930b23447cd4dc410fabfb42eb3f24e803e6c3f97d618fb359380a36f",
  },
  {
    path: "tokenizer.json",
    bytes: 3_497,
    sha256: "77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34",
  },
  {
    path: "tokenizer_config.json",
    bytes: 113,
    sha256: "be1cb066d6ef6b074b3f15e6a6dd21ac88ff3cdaedf325f0aaed686c70f75d20",
  },
  {
    path: "onnx/model_quantized.onnx",
    bytes: 92_361_116,
    sha256: "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478",
  },
];

function parseOutputDir(argv) {
  const outputIndex = argv.indexOf("--output-dir");
  if (outputIndex >= 0 && argv[outputIndex + 1]) {
    return path.resolve(argv[outputIndex + 1]);
  }
  return path.join(repoRoot, ".cache", "prism-models");
}

async function fileExists(target) {
  return fs.stat(target).then(() => true).catch(() => false);
}

async function sha256File(target) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(target)) hash.update(chunk);
  return hash.digest("hex");
}

async function validFile(target, spec) {
  if (!(await fileExists(target))) return false;
  const stats = await fs.stat(target);
  if (spec.bytes !== undefined && stats.size !== spec.bytes) return false;
  if (spec.sha256 !== undefined && await sha256File(target) !== spec.sha256) {
    return false;
  }
  if (target.endsWith(".json")) {
    try {
      JSON.parse(await fs.readFile(target, "utf8"));
    } catch {
      return false;
    }
  }
  return stats.size > 0;
}

async function downloadFile(target, spec) {
  const source =
    `https://huggingface.co/${BUILTIN_TTS_MODEL_ID}/resolve/` +
    `${BUILTIN_TTS_MODEL_REVISION}/${spec.path}`;
  await fs.mkdir(path.dirname(target), { recursive: true });
  const partial = `${target}.part`;
  let downloadedBytes = await fs.stat(partial).then((stats) => stats.size).catch(() => 0);
  if (spec.bytes !== undefined && downloadedBytes > spec.bytes) {
    await fs.rm(partial, { force: true });
    downloadedBytes = 0;
  }
  const response = await fetch(source, {
    redirect: "follow",
    headers: downloadedBytes > 0 ? { range: `bytes=${downloadedBytes}-` } : {},
  });
  if (!response.ok || !response.body) {
    throw new Error(`Unable to download ${spec.path} (${response.status}).`);
  }

  const resuming = downloadedBytes > 0 && response.status === 206;
  if (downloadedBytes > 0 && !resuming) {
    await fs.rm(partial, { force: true });
    downloadedBytes = 0;
  }
  console.log(
    `${resuming ? "Resuming" : "Downloading"} PRISM voice model: ${spec.path}`,
  );
  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(partial, { flags: resuming ? "a" : "w" }),
  );
  if (!(await validFile(partial, spec))) {
    await fs.rm(partial, { force: true });
    throw new Error(`Downloaded voice model file failed validation: ${spec.path}`);
  }
  await fs.rename(partial, target);
}

export async function ensureBuiltinTtsModel(outputRoot) {
  const resolvedRoot = path.resolve(outputRoot);
  const modelDir = path.join(resolvedRoot, BUILTIN_TTS_MODEL_ID);
  for (const spec of MODEL_FILES) {
    const target = path.join(modelDir, spec.path);
    if (!(await validFile(target, spec))) await downloadFile(target, spec);
  }
  return { modelDir, outputRoot: resolvedRoot };
}

async function main() {
  const { modelDir } = await ensureBuiltinTtsModel(
    parseOutputDir(process.argv.slice(2)),
  );
  console.log(`PRISM built-in voice model ready at ${modelDir}`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
