import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import sharp from "sharp";
import {
  quarantineGeneratedImageFiles,
  resolveAbsoluteUnderDataRoot,
  thumbWebpRelativePathFromPngRelativePath,
  writeGeneratedImageBytes,
} from "../image-storage.ts";
import {
  encodeWebpThumbFromRasterBytes,
  GENERATED_IMAGE_THUMB_MAX_EDGE_PX,
  readOrCreateThumbBytes,
} from "../image-thumb.ts";

describe("thumbWebpRelativePathFromPngRelativePath", () => {
  it("maps png sidecar to webp thumb filename", () => {
    assert.equal(
      thumbWebpRelativePathFromPngRelativePath("generated-images/u1/abc123.png"),
      "generated-images/u1/abc123.thumb.webp"
    );
  });

  it("rejects non-png paths", () => {
    assert.throws(() => thumbWebpRelativePathFromPngRelativePath("generated-images/u1/x.jpg"));
  });
});

describe("encodeWebpThumbFromRasterBytes", () => {
  it("produces smaller WebP bounded by max edge", async () => {
    const png = await sharp({
      create: {
        width: 1024,
        height: 1024,
        channels: 3,
        background: { r: 80, g: 120, b: 200 },
      },
    })
      .png()
      .toBuffer();

    const webp = await encodeWebpThumbFromRasterBytes(png);
    assert.ok(webp.length > 0);
    assert.ok(webp.length < png.length);

    const meta = await sharp(webp).metadata();
    assert.ok(meta.width != null && meta.width <= GENERATED_IMAGE_THUMB_MAX_EDGE_PX);
    assert.ok(meta.height != null && meta.height <= GENERATED_IMAGE_THUMB_MAX_EDGE_PX);
  });

  it("does not recreate an orphan thumbnail when cleanup moves the PNG during encoding", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "prism-thumb-cleanup-race-"));
    const previousDbPath = process.env.DB_PATH;
    const previousDataDir = process.env.LOCALAI_DATA_DIR;
    process.env.DB_PATH = join(tempDir, "localai.db");
    delete process.env.LOCALAI_DATA_DIR;
    try {
      const primary = "generated-images/user-1/race-image.png";
      const thumbnail = thumbWebpRelativePathFromPngRelativePath(primary);
      writeGeneratedImageBytes(primary, Buffer.from("png source"));
      let releaseEncode!: (bytes: Buffer) => void;
      let encodingStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        encodingStarted = resolve;
      });
      const encoded = new Promise<Buffer>((resolve) => {
        releaseEncode = resolve;
      });
      const pending = readOrCreateThumbBytes(primary, async () => {
        encodingStarted();
        return encoded;
      });
      await started;

      const quarantine = quarantineGeneratedImageFiles(
        "user-1",
        [primary],
        "race-recovery",
      );
      releaseEncode(Buffer.from("webp result"));
      await assert.rejects(
        pending,
        /removed while creating its thumbnail/iu,
      );
      assert.equal(
        existsSync(resolveAbsoluteUnderDataRoot(thumbnail)),
        false,
      );
      assert.equal(
        existsSync(
          resolveAbsoluteUnderDataRoot(
            quarantine.movedFiles[0]?.quarantineRelativePath ?? "",
          ),
        ),
        true,
      );
    } finally {
      if (previousDbPath === undefined) delete process.env.DB_PATH;
      else process.env.DB_PATH = previousDbPath;
      if (previousDataDir === undefined) delete process.env.LOCALAI_DATA_DIR;
      else process.env.LOCALAI_DATA_DIR = previousDataDir;
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
