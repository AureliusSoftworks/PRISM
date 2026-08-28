import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import type { MansionPackageManifestV1 } from "@localai/shared";
import { zipSync } from "fflate";
import sharp from "sharp";
import type { InternalMansionPackageV1 } from "../debate-mystery-mansion-codec.ts";
import {
  PortableMysteryImportSafetyError,
  portableOggOpusDurationMsV1,
  portableMp3DurationMsV1,
  preflightPortableMysteryArchiveV1,
  validatePortableMansionMediaV1,
} from "../debate-mystery-package-safety.ts";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function packageWithImage(args: {
  bytes: Uint8Array;
  mimeType?: "image/png" | "image/webp";
  width?: number;
  height?: number;
}): InternalMansionPackageV1 {
  const mimeType = args.mimeType ?? "image/webp";
  const digest = sha256(args.bytes);
  const extension = mimeType === "image/png" ? "png" : "webp";
  const archivePath = `assets/${digest}.${extension}`;
  const manifest: MansionPackageManifestV1 = {
    schema: "prism-mansion-package-v1",
    formatVersion: { major: 1, minor: 0 },
    packageId: "media-safety-fixture",
    title: "Media safety fixture",
    description: "Validates imported media before storage.",
    creator: { name: "PRISM", id: null, url: null },
    provenance: { createdAt: "2026-08-27T00:00:00.000Z", prismVersion: "0.15.0", generatedWith: [] },
    license: { name: "Private use", url: null, allowsRedistribution: false },
    contentWarnings: [],
    compatibility: { minimumFormatMajor: 1, maximumFormatMajor: 1, minimumPrismVersion: null },
    floorCount: 1,
    rooms: [{
      id: "room",
      templateId: "room",
      name: "Room",
      floor: 1,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      neighborIds: [],
      slots: [{ id: "slot", x: 0.5, y: 0.5 }],
      emoji: "🔎",
      roomAssetId: "room-image",
      propAssetIds: [],
    }],
    houseStyle: { id: "test", label: "Test", promptContract: "Test fixture." },
    assets: [{
      id: "room-image",
      role: "room",
      archivePath,
      sha256: digest,
      byteLength: args.bytes.byteLength,
      mimeType,
      width: args.width ?? 4,
      height: args.height ?? 3,
      durationMs: null,
    }],
    previewAssetId: "room-image",
    investigationThemeAssetId: null,
  };
  return { manifest, assets: new Map([[archivePath, args.bytes]]) };
}

describe("portable mystery package import safety", () => {
  it("preflights a normal archive without inflating it", () => {
    const hash = "a".repeat(64);
    const archive = zipSync({
      "manifest.json": Buffer.from("{}"),
      [`assets/${hash}.webp`]: Buffer.from("small fixture"),
    });
    assert.deepEqual(preflightPortableMysteryArchiveV1(archive), {
      entryCount: 2,
      expandedBytes: 15,
      paths: [`assets/${hash}.webp`, "manifest.json"],
    });
  });

  it("rejects traversal paths before archive inflation", () => {
    const archive = zipSync({
      "manifest.json": Buffer.from("{}"),
      "../escape.webp": Buffer.from("not allowed"),
    });
    assert.throws(
      () => preflightPortableMysteryArchiveV1(archive),
      PortableMysteryImportSafetyError,
    );
  });

  it("rejects a high-ratio compression bomb before archive inflation", () => {
    const hash = "b".repeat(64);
    const archive = zipSync({
      "manifest.json": Buffer.from("{}"),
      [`assets/${hash}.webp`]: Buffer.alloc(2 * 1024 * 1024),
    }, { level: 9 });
    assert.throws(
      () => preflightPortableMysteryArchiveV1(archive),
      /unsafe or too large/u,
    );
  });

  it("rejects an entry that declares an oversize expansion", () => {
    const archive = Buffer.from(zipSync({ "manifest.json": Buffer.from("{}") }));
    const central = archive.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    assert.notEqual(central, -1);
    archive.writeUInt32LE(64 * 1024 * 1024 + 1, central + 24);
    assert.throws(
      () => preflightPortableMysteryArchiveV1(archive),
      /unsafe or too large/u,
    );
  });

  it("decodes real images and rejects spoofed or dimension-mismatched media", async () => {
    const image = await sharp({
      create: { width: 4, height: 3, channels: 4, background: "#6a3bb7" },
    }).webp().toBuffer();
    await validatePortableMansionMediaV1(packageWithImage({ bytes: image }));
    await assert.rejects(
      validatePortableMansionMediaV1(packageWithImage({ bytes: image, width: 5 })),
      /dimensions are invalid/u,
    );
    await assert.rejects(
      validatePortableMansionMediaV1(packageWithImage({ bytes: Buffer.from("RIFF0000WEBPnot-an-image") })),
      /could not be decoded/u,
    );
  });

  it("walks MPEG frames for duration and rejects signature-only audio", () => {
    const frame = Buffer.alloc(417);
    frame.writeUInt32BE(0xfffb9000, 0);
    const audio = Buffer.concat(Array.from({ length: 100 }, () => frame));
    assert.equal(portableMp3DurationMsV1(audio), 2612);
    assert.throws(
      () => portableMp3DurationMsV1(Buffer.from("ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000")),
      PortableMysteryImportSafetyError,
    );
  });

  it("walks compact Ogg Opus pages without invoking a decoder", () => {
    const audio = readFileSync(new URL(
      "../../../web/public/audio/debate/whodunnit/shared/rain-storm-v1.ogg",
      import.meta.url,
    ));
    assert.ok(Math.abs(portableOggOpusDurationMsV1(audio) - 24_000) < 100);
    assert.throws(
      () => portableOggOpusDurationMsV1(Buffer.from("OggS\0not-a-real-page")),
      PortableMysteryImportSafetyError,
    );
  });
});
