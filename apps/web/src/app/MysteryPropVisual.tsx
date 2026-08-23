"use client";

import { useState } from "react";

interface MysteryPropVisualProps {
  generatedImageId?: string | null;
  bundledAssetPath: string;
  fallbackGlyph: string;
  className?: string;
}

export function MysteryPropVisual({
  generatedImageId,
  bundledAssetPath,
  fallbackGlyph,
  className,
}: MysteryPropVisualProps) {
  const generatedAssetPath = generatedImageId
    ? `/api/images/${encodeURIComponent(generatedImageId)}/file`
    : null;
  const sources = [...new Set(
    [generatedAssetPath, bundledAssetPath].filter((source): source is string => Boolean(source)),
  )];

  return (
    <MysteryPropVisualSources
      key={sources.join("\u0000")}
      sources={sources}
      generatedAssetPath={generatedAssetPath}
      fallbackGlyph={fallbackGlyph}
      className={className}
    />
  );
}

function MysteryPropVisualSources({
  sources,
  generatedAssetPath,
  fallbackGlyph,
  className,
}: {
  sources: string[];
  generatedAssetPath: string | null;
  fallbackGlyph: string;
  className?: string;
}) {
  const [sourceIndex, setSourceIndex] = useState(0);

  const source = sources[sourceIndex] ?? null;
  if (source) {
    return (
      // Native load errors advance from authenticated generated art to the bundled fallback.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={source}
        alt=""
        aria-hidden="true"
        className={className}
        data-mystery-prop-source={source === generatedAssetPath ? "generated" : "bundled"}
        onError={() => setSourceIndex((current) => current + 1)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={className}
      data-mystery-prop-source="emoji"
    >
      {fallbackGlyph}
    </span>
  );
}
