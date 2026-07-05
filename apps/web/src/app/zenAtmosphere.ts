export interface ZenAtmosphereTimelineEntry {
  imageId: string;
  generationMessageCount: number;
  createdAt?: string;
}

interface ZenAtmosphereAnchorEntry extends ZenAtmosphereTimelineEntry {
  startY: number;
  fullY: number;
}

export interface ZenAtmosphereLayerOpacityArgs {
  timeline: readonly ZenAtmosphereTimelineEntry[];
  readerY: number;
  revealScrollDistancePx: number;
  messageCountToY: (messageCount: number) => number;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function maxZenAtmosphereLayerOpacity(
  layerOpacities: Record<string, number>
): number {
  return Object.values(layerOpacities).reduce(
    (maxOpacity, opacity) => Math.max(maxOpacity, clampUnit(opacity)),
    0
  );
}

export function calculateZenAtmosphereLayerOpacitiesForReader({
  timeline,
  readerY,
  revealScrollDistancePx,
  messageCountToY,
}: ZenAtmosphereLayerOpacityArgs): Record<string, number> {
  if (timeline.length === 0) return {};

  const revealDistancePx = Math.max(1, revealScrollDistancePx);
  const anchors: ZenAtmosphereAnchorEntry[] = timeline
    .map((entry) => {
      const startY = messageCountToY(entry.generationMessageCount);
      const fullY = startY + revealDistancePx;
      return {
        ...entry,
        startY,
        fullY,
      };
    })
    .sort((a, b) => {
      const yDelta = a.startY - b.startY;
      if (Math.abs(yDelta) > 0.5) return yDelta;
      return a.generationMessageCount - b.generationMessageCount;
    });

  const next: Record<string, number> = {};
  for (const entry of timeline) {
    next[entry.imageId] = 0;
  }

  if (readerY < anchors[0]!.startY) {
    return next;
  }

  for (let index = 0; index < anchors.length; index += 1) {
    const current = anchors[index]!;
    const previous = anchors[index - 1] ?? null;
    const upcoming = anchors[index + 1] ?? null;
    if (readerY >= current.startY && readerY <= current.fullY) {
      const progress = clampUnit(
        (readerY - current.startY) / Math.max(1, current.fullY - current.startY)
      );
      if (previous) next[previous.imageId] = 1 - progress;
      next[current.imageId] = progress;
      return next;
    }
    if (readerY > current.fullY && (!upcoming || readerY < upcoming.startY)) {
      next[current.imageId] = 1;
      return next;
    }
  }

  next[anchors[anchors.length - 1]!.imageId] = 1;
  return next;
}
