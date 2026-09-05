import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { MansionPackageManifestV1 } from "@localai/shared";

const slugs = ["asterion-observatory", "banyan-house", "blackwood-house", "briarwatch-manor"];
export async function GET(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") return new Response(null, { status: 404 });
  const params = new URL(request.url).searchParams;
  const slug = params.get("mansion") ?? "";
  if (!slugs.includes(slug)) return new Response(null, { status: 404 });
  const root = resolve(process.cwd(), "../../.codex/output/whodunnit-ambient-mansions-v1");
  const manifest = JSON.parse(await readFile(resolve(root, "public-fixtures", `${slug}.public-manifest.json`), "utf8")) as MansionPackageManifestV1;
  const asset = manifest.assets.find(item => item.id === params.get("asset") && item.role === "room");
  if (!asset || !/^[a-f0-9]{64}$/.test(asset.sha256)) return new Response(null, { status: 404 });
  const bytes = await readFile(resolve(root, "qa-art", asset.sha256));
  return new Response(bytes, { headers: { "content-type": asset.mimeType, "cache-control": "private, max-age=3600" } });
}
