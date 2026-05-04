import type { MetadataRoute } from "next";

/**
 * Web app manifest so “Install app” / Add to Home Screen picks up Prism client artwork.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Prism",
    short_name: "Prism",
    description: "Local-first AI playground with per-account isolation.",
    start_url: "/",
    display: "standalone",
    background_color: "#111827",
    theme_color: "#111827",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
