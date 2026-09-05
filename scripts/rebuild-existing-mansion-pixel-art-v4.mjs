#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_MANSION_ROOM_ART_CONTRACT_V4,
} from "../packages/shared/src/portableMysteryPackage.ts";
import {
  decodeInternalMansionPackageV1,
  encodeInternalMansionPackageV1,
} from "../apps/api/src/debate-mystery-mansion-codec.ts";
import {
  openPortableMysteryEnvelopeV1,
  sealPortableMysteryEnvelopeV1,
} from "../apps/api/src/debate-mystery-package-envelope.ts";

const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packageInputDirectory = join(
  repositoryRoot,
  ".codex/output/imagegen/mansion-prop-theme-poc-2026-08-30",
);
const synthesizedDirectory = join(
  repositoryRoot,
  ".codex/output/imagegen/whodunnit-synthesized-pixel-art-v1",
);
const packageOutputDirectory = join(synthesizedDirectory, "packages");
const rawSynthPixelArtDirectory = join(
  repositoryRoot,
  ".codex/output/imagegen/mansion-raw-synth-pixel-art-v3/normalized",
);
const briarwatchPixelArtDirectory = join(
  repositoryRoot,
  ".codex/output/imagegen/mansion-media-completion-v1/pixel-art-sources/briarwatch",
);

const jobs = [
  {
    input: "asterion-observatory-prop-theme-v1.mansion",
    output: "asterion-observatory-synthesized-pixel-art-v4.mansion",
    roomArt: {
      Foyer: join(rawSynthPixelArtDirectory, "asterion/foyer-pixel-art.webp"),
      "Dining Room": join(rawSynthPixelArtDirectory, "asterion/dining-room-pixel-art.webp"),
      Kitchen: join(rawSynthPixelArtDirectory, "asterion/kitchen-pixel-art.webp"),
      Bedroom: join(rawSynthPixelArtDirectory, "asterion/bedroom-pixel-art.webp"),
      Bathroom: join(rawSynthPixelArtDirectory, "asterion/bathroom-pixel-art.webp"),
    },
  },
  {
    input: "banyan-house-prop-theme-v1.mansion",
    output: "banyan-house-synthesized-pixel-art-v4.mansion",
    roomArt: {
      Foyer: join(rawSynthPixelArtDirectory, "banyan/foyer-pixel-art.webp"),
      Bedroom: join(rawSynthPixelArtDirectory, "banyan/bedroom-pixel-art.webp"),
      Bathroom: join(rawSynthPixelArtDirectory, "banyan/bathroom-pixel-art.webp"),
      "Dining Room": join(rawSynthPixelArtDirectory, "banyan/dining-room-pixel-art.webp"),
      Kitchen: join(rawSynthPixelArtDirectory, "banyan/kitchen-pixel-art.webp"),
    },
  },
  {
    input: "blackwood-house-prop-theme-v1.mansion",
    output: "blackwood-house-synthesized-pixel-art-v4.mansion",
    roomArt: {
      Foyer: join(rawSynthPixelArtDirectory, "blackwood/foyer-pixel-art.webp"),
      Ballroom: join(rawSynthPixelArtDirectory, "blackwood/ballroom-pixel-art.webp"),
      Basement: join(rawSynthPixelArtDirectory, "blackwood/basement-pixel-art.webp"),
      Pool: join(rawSynthPixelArtDirectory, "blackwood/pool-pixel-art.webp"),
      "Guest Bedroom": join(rawSynthPixelArtDirectory, "blackwood/guest-bedroom-pixel-art.webp"),
      "Dining Room": join(rawSynthPixelArtDirectory, "blackwood/dining-room-pixel-art.webp"),
      Kitchen: join(rawSynthPixelArtDirectory, "blackwood/kitchen-pixel-art.webp"),
      Garage: join(rawSynthPixelArtDirectory, "blackwood/garage-pixel-art.webp"),
      Library: join(rawSynthPixelArtDirectory, "blackwood/library-pixel-art.webp"),
      Arboretum: join(rawSynthPixelArtDirectory, "blackwood/arboretum-pixel-art.webp"),
      Office: join(rawSynthPixelArtDirectory, "blackwood/office-pixel-art.webp"),
      "Living Room": join(rawSynthPixelArtDirectory, "blackwood/living-room-pixel-art.webp"),
      Bedroom: join(rawSynthPixelArtDirectory, "blackwood/bedroom-pixel-art.webp"),
      Bathroom: join(rawSynthPixelArtDirectory, "blackwood/bathroom-pixel-art.webp"),
      "Rooftop Lounge": join(rawSynthPixelArtDirectory, "blackwood/rooftop-lounge-pixel-art.webp"),
    },
  },
  {
    input: "briarwatch-manor-prop-theme-v1.mansion",
    output: "briarwatch-manor-synthesized-pixel-art-v4.mansion",
    roomArt: {
      Bedroom: join(briarwatchPixelArtDirectory, "bedroom-pixel-art.webp"),
      Attic: join(briarwatchPixelArtDirectory, "attic-pixel-art.webp"),
      "Guest Bedroom": join(briarwatchPixelArtDirectory, "guest-bedroom-pixel-art.webp"),
      Library: join(briarwatchPixelArtDirectory, "library-pixel-art.webp"),
      Kitchen: join(briarwatchPixelArtDirectory, "kitchen-pixel-art.webp"),
      "Dining Room": join(briarwatchPixelArtDirectory, "dining-room-pixel-art.webp"),
      Bathroom: join(briarwatchPixelArtDirectory, "bathroom-pixel-art.webp"),
      Foyer: join(briarwatchPixelArtDirectory, "foyer-pixel-art.webp"),
      Parlor: join(briarwatchPixelArtDirectory, "parlor-pixel-art.webp"),
      Study: join(briarwatchPixelArtDirectory, "study-pixel-art.webp"),
    },
  },
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

await mkdir(packageOutputDirectory, { recursive: true });
for (const job of jobs) {
  const envelope = openPortableMysteryEnvelopeV1({
    envelope: await readFile(join(packageInputDirectory, job.input)),
  });
  const decoded = decodeInternalMansionPackageV1(envelope.payload);
  const roomNames = new Set(decoded.manifest.rooms.map((room) => room.name));
  const missingRoomArt = decoded.manifest.rooms
    .filter((room) => !job.roomArt[room.name])
    .map((room) => room.name);
  const unknownRoomArt = Object.keys(job.roomArt)
    .filter((roomName) => !roomNames.has(roomName));
  if (missingRoomArt.length > 0 || unknownRoomArt.length > 0) {
    throw new Error([
      `${basename(job.input)} room-art mapping must cover every room exactly.`,
      missingRoomArt.length > 0 ? `Missing: ${missingRoomArt.join(", ")}.` : "",
      unknownRoomArt.length > 0 ? `Unknown: ${unknownRoomArt.join(", ")}.` : "",
    ].filter(Boolean).join(" "));
  }
  const assets = [...decoded.manifest.assets];
  const files = new Map(decoded.assets);
  const generatedBySha = new Map();
  let generatedIndex = 0;
  for (const room of decoded.manifest.rooms) {
    const sourcePath = job.roomArt[room.name];
    const bytes = await readFile(sourcePath);
    const digest = sha256(bytes);
    let descriptor = generatedBySha.get(digest);
    if (!descriptor) {
      const extension = sourcePath.endsWith(".webp") ? "webp" : "png";
      descriptor = {
        id: `pixel-art-${String(++generatedIndex).padStart(3, "0")}`,
        role: "room",
        archivePath: `assets/${digest}.${extension}`,
        sha256: digest,
        byteLength: bytes.byteLength,
        mimeType: extension === "webp" ? "image/webp" : "image/png",
        width: 1920,
        height: 1080,
        durationMs: null,
      };
      generatedBySha.set(digest, descriptor);
      assets.push(descriptor);
      files.set(descriptor.archivePath, bytes);
    }
    if (room.roomAssetId && !room.illustratedRoomAssetId) {
      room.illustratedRoomAssetId = room.roomAssetId;
    }
    room.roomAssetId = descriptor.id;
    if (decoded.manifest.layoutV2) {
      const entity = decoded.manifest.layoutV2.entities.find(
        (candidate) => candidate.kind === "room" && candidate.id === room.id,
      );
      if (entity?.kind === "room") entity.acceptedRoomAssetId = descriptor.id;
    }
  }
  decoded.manifest.assets = assets;
  decoded.manifest.roomArt = DEFAULT_MANSION_ROOM_ART_CONTRACT_V4;
  decoded.manifest.provenance.generatedWith = [
    ...new Set([
      ...decoded.manifest.provenance.generatedWith,
      "PRISM raw-synth Pixel Art V1",
    ]),
  ];
  const rebuilt = { manifest: decoded.manifest, assets: files };
  const payload = encodeInternalMansionPackageV1(rebuilt);
  const expandedBytes = [...files.values()]
    .reduce((total, bytes) => total + bytes.byteLength, 0);
  const sealed = sealPortableMysteryEnvelopeV1({
    payload,
    mode: envelope.header.encryptionMode,
    metadata: {
      packageType: "mansion",
      title: decoded.manifest.title,
      creatorName: decoded.manifest.creator.name,
      compatibility: decoded.manifest.compatibility,
      expandedBytes,
      assetCount: decoded.manifest.assets.length,
      contentWarnings: decoded.manifest.contentWarnings,
      creatorSignature: null,
    },
  });
  const output = join(packageOutputDirectory, job.output);
  await writeFile(output, sealed);
  process.stdout.write(`${basename(job.input)} -> ${basename(output)}\n`);
}
