import type { NextConfig } from "next";
import { networkInterfaces } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Monorepo root — anchors Turbopack so it does not walk up to unrelated lockfiles (e.g. in $HOME). */
const MONOREPO_ROOT = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

/**
 * Returns every non-internal IPv4 address bound to this host, so LAN devices
 * (phones, laptops) can reach `next dev` running on 0.0.0.0 without Next 16's
 * default cross-origin-dev guard silently dropping their POST requests.
 * Applies to dev mode only; production builds ignore `allowedDevOrigins`.
 */
function collectLanAddresses(): string[] {
  const addresses: string[] = [];
  const interfaces = networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const net of iface) {
      if (net.family === "IPv4" && !net.internal) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}

// Operator escape hatch: ALLOWED_DEV_ORIGINS=foo.local,bar.lan
const extraDevOrigins =
  process.env.ALLOWED_DEV_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  devIndicators: false,
  output: "standalone",
  turbopack: {
    root: MONOREPO_ROOT,
  },
  allowedDevOrigins: [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    ...collectLanAddresses(),
    ...extraDevOrigins,
  ],
  // `/api/*` is proxied by `src/app/api/[[...path]]/route.ts` so long-running
  // requests (image generation) are not cut off by Next’s rewrite proxy timeout.
};

export default nextConfig;
