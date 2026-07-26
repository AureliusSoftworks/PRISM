"use client";

import { useLayoutEffect } from "react";
import type { ReplayMouthShapeV2 } from "@localai/shared";
import { markReplayMouthShape } from "./replayAudioMasterCapture";

export function ReplayMouthPresentationCapture({
  sourceId,
  participantId,
  shape,
}: {
  sourceId: string | null;
  participantId: string;
  shape: ReplayMouthShapeV2;
}): null {
  useLayoutEffect(() => {
    if (!sourceId) return;
    markReplayMouthShape({ sourceId, participantId, shape });
  }, [participantId, shape, sourceId]);
  return null;
}
