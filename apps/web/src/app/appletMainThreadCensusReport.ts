"use client";

import { useEffect } from "react";

import {
  PRISM_CENSUS_SAMPLE_INTERVAL_MS,
  PrismCensusRecorder,
  type PrismCensusReading,
} from "./prismMainThreadCensusRecorder.ts";
import {
  installPrismMainThreadCensus,
  prismMainThreadCensus,
} from "./prismMainThreadCensus.ts";
import { currentPrismFrameRate } from "./prismFrameRate.ts";

export interface AppletMainThreadCensusSummary {
  sampleCount: number;
  spanMs: number;
  fpsFirst: number | null;
  fpsLast: number | null;
  fpsMin: number | null;
  growth: readonly { name: string; first: number; last: number; peak: number }[];
}

/**
 * Records the main-thread census for as long as a session is open.
 *
 * Deliberately not gated on the FPS badge: the run worth explaining is the long
 * one somebody started and walked away from.
 */
export function useAppletMainThreadCensus(
  surface: "coffee" | "signal" | "debate" | "story",
  sessionId: string | null | undefined,
): void {
  useEffect(() => {
    const normalizedSessionId = sessionId?.trim();
    if (!normalizedSessionId || typeof window === "undefined") return;
    // Counting only starts here, so early readings undercount whatever was
    // already scheduled. The slope is the signal, not the floor.
    installPrismMainThreadCensus();
    const recorder = new PrismCensusRecorder({
      surface,
      sessionId: normalizedSessionId,
      startedAtMs: Date.now(),
      now: () => Date.now(),
      readCensus: () => prismMainThreadCensus(),
      readFrameRate: () => {
        const snapshot = currentPrismFrameRate();
        return {
          fps: snapshot?.fps ?? null,
          busyMsPerSecond: snapshot?.longTaskMsPerSecond ?? null,
        };
      },
      post: async (batch) => {
        const response = await fetch("/api/main-thread-census-samples", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(batch),
        });
        if (!response.ok) throw new Error("Census samples were not recorded.");
      },
    });
    recorder.sample();
    const id = window.setInterval(
      () => recorder.sample(),
      PRISM_CENSUS_SAMPLE_INTERVAL_MS,
    );
    return () => {
      window.clearInterval(id);
      void recorder.stop().catch(() => undefined);
    };
  }, [sessionId, surface]);
}

function formatGrowthRow(row: {
  name: string;
  first: number;
  last: number;
  peak: number;
}): string {
  const climbed = row.last > row.first;
  const recovered = row.peak > row.last;
  const note = climbed && !recovered ? "  [!GREW AND HELD]" : "";
  return `- ${row.name}: ${row.first} → ${row.last} (peak ${row.peak})${note}`;
}

/**
 * Appends the census to a session transcript for review, in the same spirit as
 * the frame-rate annotation: a reader should be able to answer "what piled up"
 * without opening a database.
 */
export function appendPrismMainThreadCensusToTranscript(
  transcript: string,
  samples: readonly PrismCensusReading[] | null | undefined,
  summary: AppletMainThreadCensusSummary | null | undefined,
): string {
  if (!samples?.length || !summary) return transcript.trimEnd();
  const lines: string[] = [
    "",
    "## Main-Thread Census",
    "",
    "Periodic readings of what accumulated while the session ran. A counter that",
    "climbs and never comes back down is a leak; one that tracks activity and",
    "settles is not.",
    "",
    `- Samples: ${summary.sampleCount} over ${Math.round(summary.spanMs / 1000)}s`,
    `- Frame rate: first ${summary.fpsFirst ?? "n/a"}, last ${
      summary.fpsLast ?? "n/a"
    }, worst ${summary.fpsMin ?? "n/a"}`,
    "",
    ...summary.growth.map(formatGrowthRow),
    "",
    "### Census Series",
  ];
  for (const sample of samples) {
    const seconds = Math.round(sample.elapsedMs / 1000);
    const renders = sample.renderRates
      .map((rate) => `${rate.name}=${rate.perSecond}/s`)
      .join(" ");
    lines.push(
      `- ${seconds}s | fps=${sample.fps ?? "n/a"} busy=${
        sample.busyMsPerSecond ?? "n/a"
      }ms/s raf=${sample.rafPending} int=${sample.intervalsLive} tmo=${
        sample.timeoutsPending
      } dom=${sample.domElements ?? "n/a"} anim=${
        sample.animationsRunning ?? "n/a"
      } heap=${sample.heapMb ?? "n/a"}MB${renders ? ` rend=${renders}` : ""}`,
    );
  }
  return `${transcript.trimEnd()}\n${lines.join("\n")}\n`;
}
