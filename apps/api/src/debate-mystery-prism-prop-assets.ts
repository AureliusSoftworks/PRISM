import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  WHODUNNIT_PROP_ARCHETYPES_V1,
  type EvidencePropBindingV1,
} from "@localai/shared";

/** API src/ and dist/ share the same root in source, Docker, and staged apps.
 * Desktop staging keeps public assets inside the Next standalone tree. */
export function bundledWhodunnitPrismPublicRootsV1(
  apiModuleUrl: string | URL = import.meta.url,
): string[] {
  const webRoot = resolve(dirname(fileURLToPath(apiModuleUrl)), "../../web");
  return [
    join(webRoot, "public"),
    join(webRoot, ".next/standalone/apps/web/public"),
  ];
}

export interface BundledWhodunnitPrismPropAssetV1 {
  bytes: Buffer;
  publicPath: string;
  sourceContentSha256: string;
}

/** Resolves only an exact registry entry; no user-controlled path reaches disk. */
export function readBundledWhodunnitPrismPropAssetV1(
  binding: EvidencePropBindingV1,
  // Trusted module location only; callers never pass request or case paths.
  apiModuleUrl: string | URL = import.meta.url,
): BundledWhodunnitPrismPropAssetV1 | null {
  if (binding.visualSource !== "prism") return null;
  const fallback = WHODUNNIT_PROP_ARCHETYPES_V1[binding.archetypeId]?.prismFallback;
  if (!fallback || binding.contentSha256 !== fallback.contentSha256) return null;
  const relativePath = fallback.publicPath.replace(/^\/+/, "");
  for (const root of bundledWhodunnitPrismPublicRootsV1(apiModuleUrl)) {
    let bytes: Buffer;
    try {
      bytes = readFileSync(join(root, relativePath));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      return null;
    }
    const sourceContentSha256 = createHash("sha256").update(bytes).digest("hex");
    // A present but modified canonical asset fails closed, even if another
    // layout happens to contain a valid copy from an older build.
    if (sourceContentSha256 !== fallback.contentSha256) return null;
    return { bytes, publicPath: fallback.publicPath, sourceContentSha256 };
  }
  return null;
}
