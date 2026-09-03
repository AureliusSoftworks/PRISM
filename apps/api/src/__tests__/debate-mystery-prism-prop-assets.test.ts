import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { WHODUNNIT_PROP_ARCHETYPES_V1, type EvidencePropBindingV1, type WhodunnitPropArchetypeIdV1 } from "@localai/shared";
import { bundledWhodunnitPrismPublicRootsV1, readBundledWhodunnitPrismPropAssetV1 } from "../debate-mystery-prism-prop-assets.ts";
import { getRevealedDebateMysteryAssetFileV1, validateDebateMysteryAssetPixelsV1 } from "../debate-mystery-assets.ts";
import { normalizeGeneratedDebateExhibitImage } from "../debate-exhibit-image.ts";
import { encryptBytes } from "../security.ts";

function binding(archetypeId: WhodunnitPropArchetypeIdV1 = "key"): EvidencePropBindingV1 {
  const fallback = WHODUNNIT_PROP_ARCHETYPES_V1[archetypeId].prismFallback;
  return {
    version: 1, archetypeId,
    chosenIdentity: { displayName: fallback.displayName, appearanceDescription: fallback.displayName },
    capabilitySnapshot: { whatItDoes: "Test capability", capabilities: [], limitations: [] },
    visualSource: "prism", contentSha256: fallback.contentSha256,
  };
}

describe("bundled PRISM Whodunnit prop assets", () => {
  it("selects the registered fallback bytes and verifies their source hash", () => {
    const fallback = WHODUNNIT_PROP_ARCHETYPES_V1.key.prismFallback;
    const asset = readBundledWhodunnitPrismPropAssetV1({
      version: 1,
      archetypeId: "key",
      chosenIdentity: { displayName: fallback.displayName, appearanceDescription: "A plain silver key." },
      capabilitySnapshot: { whatItDoes: "Opens a lock.", capabilities: [], limitations: [] },
      visualSource: "prism",
      contentSha256: fallback.contentSha256,
    });
    assert.ok(asset);
    assert.equal(asset.publicPath, fallback.publicPath);
    assert.equal(asset.sourceContentSha256, fallback.contentSha256);
    assert.ok(asset.bytes.byteLength > 0);
  });

  it("resolves every registered built-in from the source public directory", () => {
    for (const id of Object.keys(WHODUNNIT_PROP_ARCHETYPES_V1) as WhodunnitPropArchetypeIdV1[]) {
      assert.ok(readBundledWhodunnitPrismPropAssetV1(binding(id)), `missing or modified canonical ${id}`);
    }
  });

  for (const layout of ["source", "docker", "desktop"] as const) {
    it(`reads verified canonical key and revolver bytes in the ${layout} layout`, (t) => {
      const root = mkdtempSync(join(tmpdir(), "prism-evidence-layout-"));
      t.after(() => rmSync(root, { recursive: true, force: true }));
      const moduleUrl = pathToFileURL(join(root, "apps/api", layout === "desktop" ? "dist" : "src", "debate-mystery-prism-prop-assets.js"));
      const publicRoots = bundledWhodunnitPrismPublicRootsV1(moduleUrl);
      const publicRoot = publicRoots[layout === "desktop" ? 1 : 0]!;
      for (const id of ["key", "firearm"] as const) {
        const original = readBundledWhodunnitPrismPropAssetV1(binding(id))!;
        const path = join(publicRoot, original.publicPath.slice(1));
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, original.bytes);
        const resolved = readBundledWhodunnitPrismPropAssetV1(binding(id), moduleUrl);
        assert.deepEqual(resolved?.bytes, original.bytes);
        assert.equal(resolved?.sourceContentSha256, binding(id).contentSha256);
      }
    });
  }

  it("rejects missing assets, changed bytes, foreign bindings, and a present corrupt source even when a packaged copy exists", (t) => {
    const root = mkdtempSync(join(tmpdir(), "prism-evidence-rejection-"));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const moduleUrl = pathToFileURL(join(root, "apps/api/src/props.ts"));
    assert.equal(readBundledWhodunnitPrismPropAssetV1(binding(), moduleUrl), null);
    assert.equal(readBundledWhodunnitPrismPropAssetV1({ ...binding(), contentSha256: "0".repeat(64) }), null);
    assert.equal(readBundledWhodunnitPrismPropAssetV1({ ...binding(), visualSource: "mansion" }), null);
    const original = readBundledWhodunnitPrismPropAssetV1(binding())!;
    const roots = bundledWhodunnitPrismPublicRootsV1(moduleUrl);
    for (const [index, publicRoot] of roots.entries()) {
      const path = join(publicRoot, original.publicPath.slice(1));
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, index === 0 ? Buffer.from("changed canonical bytes") : original.bytes);
    }
    assert.equal(readBundledWhodunnitPrismPropAssetV1(binding(), moduleUrl), null);
  });

  it("stages the API's canonical directory and retains the desktop public staging contract", () => {
    const dockerfile = readFileSync(new URL("../../Dockerfile", import.meta.url), "utf8");
    assert.match(dockerfile, /COPY apps\/web\/public\/debate\/mystery\/evidence\/ apps\/web\/public\/debate\/mystery\/evidence\//u);
    const staging = readFileSync(new URL("../../../../scripts/stage-desktop-runtime.mjs", import.meta.url), "utf8");
    assert.match(staging, /const stagedPublicDir = path\.join\(\s*resolvedOutputDir,\s*"apps",\s*"web",\s*"\.next",\s*"standalone",\s*"apps",\s*"web",\s*"public"/u);
  });

  it("keeps normalized canonical artwork behind the tenant, case, and discovery boundary without opening a database", async () => {
    const source = readBundledWhodunnitPrismPropAssetV1(binding())!;
    const { pngBytes } = await normalizeGeneratedDebateExhibitImage(source.bytes);
    await validateDebateMysteryAssetPixelsV1("evidence", pngBytes);
    const userKey = randomBytes(32);
    const encrypted = encryptBytes(pngBytes, userKey);
    const row = {
      status: "ready", revealed_at: null as string | null,
      ciphertext: encrypted.ciphertext, cipher_iv: encrypted.iv, cipher_tag: encrypted.tag,
      sha256: createHash("sha256").update(pngBytes).digest("hex"),
      byte_size: pngBytes.length, mime_type: "image/png",
    };
    const db = {
      prepare(sql: string) {
        assert.match(sql, /WHERE user_id = \? AND session_id = \? AND kind = \? AND subject_id = \?/u);
        return { get: (...keys: string[]) => keys.join(":") === "owner:case:evidence:key" ? row : undefined };
      },
    } as unknown as DatabaseSync;
    const read = (owner = "owner", session = "case") =>
      getRevealedDebateMysteryAssetFileV1(db, userKey, owner, session, "evidence", "key");
    assert.throws(() => read(), /not been revealed/u);
    assert.throws(() => read("another-owner"), /not found/u);
    assert.throws(() => read("owner", "another-case"), /not found/u);
    row.revealed_at = "2026-09-03T00:00:00Z";
    assert.deepEqual(read().bytes, pngBytes);
    row.sha256 = "0".repeat(64);
    assert.throws(() => read(), /integrity validation failed/u);
  });
});
