#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(repoRoot, "voice-assets.manifest.json");

async function sha256File(target) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(target)) hash.update(chunk);
  return hash.digest("hex");
}

async function exists(target) {
  return fs.stat(target).then(() => true).catch(() => false);
}

function assetRoot(asset, options) {
  if (asset.kind === "model") {
    return options.modelRoot
      ? path.join(options.modelRoot, "onnx-community", "Kokoro-82M-v1.0-ONNX")
      : null;
  }
  return path.join(repoRoot, "node_modules", "kokoro-js", "voices");
}

export async function verifyVoiceAssets(options = {}) {
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.assets)) {
    throw new Error("Voice asset manifest schema is invalid.");
  }
  for (const asset of manifest.assets) {
    if (
      !asset.id ||
      !asset.sourceRevision ||
      !asset.notice ||
      asset.license === "unknown" ||
      asset.commercialUse !== "allowed" ||
      asset.redistributionPermission !== "allowed-with-notice" ||
      !asset.consentProvenance ||
      !Array.isArray(asset.files) ||
      asset.files.length === 0
    ) {
      throw new Error(`Voice asset ${asset.id ?? "unknown"} is not commercially cleared.`);
    }
    const root = assetRoot(asset, options);
    if (!root) continue;
    for (const file of asset.files) {
      if (!/^[a-f0-9]{64}$/u.test(file.sha256 ?? "")) {
        throw new Error(`Voice asset ${asset.id}/${file.path} has no SHA-256.`);
      }
      const target = path.join(root, file.path);
      if (!(await exists(target))) {
        throw new Error(`Required voice asset is missing: ${asset.id}/${file.path}`);
      }
      if ((await sha256File(target)) !== file.sha256) {
        throw new Error(`Voice asset checksum failed: ${asset.id}/${file.path}`);
      }
    }
  }
  for (const candidate of manifest.qualificationCandidates ?? []) {
    if (
      !candidate.id ||
      !candidate.source ||
      !/^[a-f0-9]{40}$/u.test(candidate.sourceRevision ?? "") ||
      !candidate.license ||
      candidate.license === "unknown" ||
      !Array.isArray(candidate.requiredFiles) ||
      candidate.requiredFiles.length === 0
    ) {
      throw new Error(
        `Voice qualification candidate ${candidate.id ?? "unknown"} is not pinned.`,
      );
    }
    const paths = new Set();
    for (const file of candidate.requiredFiles) {
      if (
        typeof file.path !== "string" ||
        file.path.length === 0 ||
        paths.has(file.path) ||
        !Number.isSafeInteger(file.size) ||
        file.size <= 0 ||
        !/^[a-f0-9]{64}$/u.test(file.sha256 ?? "")
      ) {
        throw new Error(
          `Voice qualification candidate ${candidate.id}/${file.path ?? "unknown"} has invalid file provenance.`,
        );
      }
      paths.add(file.path);
    }
  }
  if (options.requireVoicePlus) {
    const candidate = manifest.qualificationCandidates?.find(
      (entry) => entry.id === "chatterbox-turbo-onnx-q4",
    );
    const voicePlusAsset = manifest.assets.find(
      (asset) => asset.id === "chatterbox-turbo-onnx-q4",
    );
    const requiredTargets = new Set([
      "darwin-arm64",
      "darwin-x64",
      "win32-x64",
      "linux-x64",
    ]);
    const qualifiedTargets = new Set(
      Array.isArray(candidate?.qualification)
        ? candidate.qualification
            .filter(
              (result) =>
                result?.passed === true &&
                result.warmRealtimeFactor <= 1 &&
                result.firstPlayableMs < 2_500 &&
                result.watermarkVerified === true &&
                typeof result.runtimeVersion === "string" &&
                result.runtimeVersion.length > 0,
            )
            .map((result) => result.target)
        : [],
    );
    const missingTargets = [...requiredTargets].filter(
      (target) => !qualifiedTargets.has(target),
    );
    if (
      candidate?.status !== "qualified" ||
      !voicePlusAsset ||
      voicePlusAsset.sourceRevision !== candidate?.sourceRevision ||
      missingTargets.length > 0
    ) {
      throw new Error(
        `Voice+ release gate is blocked: qualify the pinned Q4 asset on ${
          missingTargets.join(", ") || "every desktop target"
        } and record its redistributed files, checksums, runtime, and watermark result.`,
      );
    }
  }
  return manifest;
}

async function main() {
  const modelIndex = process.argv.indexOf("--model-root");
  const modelRoot = modelIndex >= 0 ? process.argv[modelIndex + 1] : undefined;
  await verifyVoiceAssets({
    modelRoot,
    requireVoicePlus: process.argv.includes("--require-voice-plus"),
  });
  console.log("Commercial voice asset manifest verified.");
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
