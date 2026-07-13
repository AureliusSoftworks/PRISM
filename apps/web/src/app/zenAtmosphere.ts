export interface ZenAtmosphereTimelineEntry {
  imageId: string;
  generationMessageCount: number;
  startsVisible?: boolean;
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

export interface ZenAtmosphereLayerState {
  opacity: number;
  parallaxY: number;
}

export interface ZenAtmosphereLayerStateArgs extends ZenAtmosphereLayerOpacityArgs {
  parallaxRate?: number;
  parallaxMaxPx?: number;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampFinite(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function maxZenAtmosphereLayerOpacity(
  layerOpacities: Record<string, number>
): number {
  return Object.values(layerOpacities).reduce(
    (maxOpacity, opacity) => Math.max(maxOpacity, clampUnit(opacity)),
    0
  );
}

export function calculateZenAtmosphereLayerStatesForReader({
  timeline,
  readerY,
  revealScrollDistancePx,
  messageCountToY,
  parallaxRate = 0.08,
  parallaxMaxPx = 42,
}: ZenAtmosphereLayerStateArgs): Record<string, ZenAtmosphereLayerState> {
  if (timeline.length === 0) return {};

  const revealDistancePx = Math.max(1, revealScrollDistancePx);
  const maxParallaxY = Math.max(0, parallaxMaxPx);
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

  const next: Record<string, ZenAtmosphereLayerState> = {};
  for (const entry of timeline) {
    const anchor =
      anchors.find((candidate) => candidate.imageId === entry.imageId) ?? null;
    const rawParallaxY =
      anchor && readerY > anchor.startY
        ? -(readerY - anchor.startY) * Math.max(0, parallaxRate)
        : 0;
    next[entry.imageId] = {
      opacity: 0,
      parallaxY: clampFinite(rawParallaxY, -maxParallaxY, 0),
    };
  }

  if (readerY < anchors[0]!.startY) {
    if (anchors[0]!.startsVisible) {
      next[anchors[0]!.imageId]!.opacity = 1;
    }
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
      if (previous) {
        next[previous.imageId]!.opacity = 1 - progress;
        next[current.imageId]!.opacity = progress;
      } else if (current.startsVisible) {
        next[current.imageId]!.opacity = 1;
      } else {
        next[current.imageId]!.opacity = progress;
      }
      return next;
    }
    if (readerY > current.fullY && (!upcoming || readerY < upcoming.startY)) {
      next[current.imageId]!.opacity = 1;
      return next;
    }
  }

  next[anchors[anchors.length - 1]!.imageId]!.opacity = 1;
  return next;
}

export function calculateZenAtmosphereLayerOpacitiesForReader(
  args: ZenAtmosphereLayerOpacityArgs
): Record<string, number> {
  const states = calculateZenAtmosphereLayerStatesForReader(args);
  return Object.fromEntries(
    Object.entries(states).map(([imageId, state]) => [
      imageId,
      state.opacity,
    ])
  );
}
