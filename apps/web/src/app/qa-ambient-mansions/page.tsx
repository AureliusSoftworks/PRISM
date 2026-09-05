import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { notFound } from "next/navigation";
import { normalizeDebateMysteryAtmosphereContractV1, type DebateMysteryMansionSnapshotV2, type MansionPackageManifestV1 } from "@localai/shared";
import { WhodunnitV2Fixture } from "../qa-whodunnit/WhodunnitV2Fixture";

const slugs = ["asterion-observatory", "banyan-house", "blackwood-house", "briarwatch-manor"];

export default async function AmbientMansionPage({ searchParams }: { searchParams: Promise<{ mansion?: string }> }): Promise<React.JSX.Element> {
  if (process.env.NODE_ENV === "production") notFound();
  const slug = (await searchParams).mansion ?? slugs[0]!;
  if (!slugs.includes(slug)) notFound();
  const path = resolve(process.cwd(), "../../.codex/output/whodunnit-ambient-mansions-v1/public-fixtures", `${slug}.public-manifest.json`);
  const manifest = JSON.parse(await readFile(path, "utf8")) as MansionPackageManifestV1;
  const snapshot: DebateMysteryMansionSnapshotV2 = {
    version: 2, sourceBundleId: manifest.packageId, capturedAt: manifest.provenance.createdAt,
    layoutV2: manifest.layoutV2!, layoutSha256: "public-package-fixture", presentationSha256: "public-package-fixture",
    rooms: manifest.rooms.map(room => ({ ...room, assignedSuspectSeatId: null, imageId: null,
      bundledAssetPath: room.roomAssetId ? `/qa-ambient-mansions/art?mansion=${slug}&asset=${encodeURIComponent(room.roomAssetId)}` : null,
    })),
    presentation: {
      version: 2, name: manifest.title, title: manifest.title, description: manifest.description,
      thumbnailAssetId: null, scaleClass: "standard", assets: [],
      houseStyle: { ...manifest.houseStyle, version: 1, atmosphere: normalizeDebateMysteryAtmosphereContractV1(manifest.ambience?.atmosphere, manifest.houseStyle.promptContract), acousticThemePaletteId: manifest.ambience?.themePaletteId ?? "estate", bespokeAmbienceRequested: false },
    },
  };
  return <WhodunnitV2Fixture mansion={snapshot} />;
}
