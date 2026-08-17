"use client";

import { useLayoutEffect } from "react";
import type { ReplayMouthShapeV2 } from "@localai/shared";
import { markReplayMouthShape, markReplaySpeechActivity } from "./replayAudioMasterCapture";

export function ReplayMouthPresentationCapture({
  sourceId,
  participantId,
  shape,
  speechActive,
}: {
  sourceId: string | null;
  participantId: string;
  shape: ReplayMouthShapeV2;
  speechActive?: boolean;
}): null {
  useLayoutEffect(() => {
    if (!sourceId) return;
    markReplayMouthShape({ sourceId, participantId, shape });
    if (typeof speechActive === "boolean") {
      markReplaySpeechActivity({ sourceId, participantId, active: speechActive });
    }
  }, [participantId, shape, sourceId, speechActive]);
  return null;
}
