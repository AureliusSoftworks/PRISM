"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  attachCoffeeCupFoley,
  startSessionAtmosphere,
  type SessionAmbientBotVocalizationCue,
  type SessionAmbientFoleyProfile,
  type SessionAtmosphereBackgroundTone,
  type SessionAtmosphereController,
  type SessionAtmosphereMix,
} from "./session-atmosphere-audio";
import type { RoomAcousticsSend } from "./roomAcoustics";
import {
  getPrismPresentationSuspendedSnapshot,
  usePrismPresentationSuspended,
} from "./prismPresentationSuspend";

export interface SessionAtmosphereLayerProps {
  active: boolean;
  sessionKey: string;
  volume: number;
  backgroundUrl?: string | null;
  /** Used only when the preferred protected/generated bed cannot be loaded. */
  backgroundFallbackUrl?: string | null;
  grainUrl?: string | null;
  preloadFoleyUrls?: readonly string[];
  mix?: SessionAtmosphereMix;
  backgroundTone?: SessionAtmosphereBackgroundTone;
  /** When false, background beds stay local-only and skip the audio master. */
  backgroundRecordable?: boolean;
  /** When false, grain beds stay local-only and skip the audio master. */
  grainRecordable?: boolean;
  foleyRoomAcoustics?: RoomAcousticsSend;
  backgroundRoomAcoustics?: RoomAcousticsSend;
  allowMixBoost?: boolean;
  /** Prioritize uninterrupted input/rendering over HTML media compatibility. */
  latencyCritical?: boolean;
  mixTransitionMs?: number;
  /** Crossfade loop beds when this layer mounts, changes, or unmounts. */
  lifecycleTransitionMs?: number;
  ambientFoley?: boolean;
  deferFoley?: boolean;
  deferBotVocalization?: boolean;
  ambientFoleyProfile?: SessionAmbientFoleyProfile;
  ambientFoleyUrls?: readonly string[];
  ambientBotVocalizations?: boolean;
  ambientBotVocalizationProfile?: SessionAmbientFoleyProfile;
  onAmbientBotVocalization?: (
    cue: SessionAmbientBotVocalizationCue,
  ) => boolean | "owned";
  onCoffeeCupFoley?: (
    cue: "coffeeSip" | "coffeeCupPlace",
    cup: HTMLElement,
  ) => void;
  coffeeCupRootRef?: RefObject<HTMLElement | null>;
  controllerHandleRef?: RefObject<SessionAtmosphereController | null>;
}

export function SessionAtmosphereLayer({
  active,
  sessionKey,
  volume,
  backgroundUrl,
  backgroundFallbackUrl,
  grainUrl,
  preloadFoleyUrls,
  mix,
  backgroundTone = "neutral",
  backgroundRecordable = true,
  grainRecordable = true,
  foleyRoomAcoustics,
  backgroundRoomAcoustics,
  allowMixBoost = false,
  latencyCritical = false,
  mixTransitionMs = 0,
  lifecycleTransitionMs = 180,
  ambientFoley = true,
  deferFoley = false,
  deferBotVocalization = deferFoley,
  ambientFoleyProfile,
  ambientFoleyUrls,
  ambientBotVocalizations = false,
  ambientBotVocalizationProfile,
  onAmbientBotVocalization,
  onCoffeeCupFoley,
  coffeeCupRootRef,
  controllerHandleRef,
}: SessionAtmosphereLayerProps): null {
  const [resolvedBackgroundUrl, setResolvedBackgroundUrl] = useState(backgroundUrl);
  const presentationSuspended = usePrismPresentationSuspended();
  const deferFoleyRef = useRef(deferFoley);
  const deferBotVocalizationRef = useRef(deferBotVocalization);
  const controllerRef = useRef<SessionAtmosphereController | null>(null);
  const volumeRef = useRef(volume);
  const mixRef = useRef(mix);
  const ambientBotVocalizationRef = useRef(onAmbientBotVocalization);
  const coffeeCupFoleyRef = useRef(onCoffeeCupFoley);
  useEffect(() => setResolvedBackgroundUrl(backgroundUrl), [backgroundUrl]);
  useEffect(() => {
    deferFoleyRef.current = deferFoley;
    if (deferFoley) {
      controllerRef.current?.stopFoley("ambient-foley", 140);
    }
  }, [deferFoley]);
  useEffect(() => {
    deferBotVocalizationRef.current = deferBotVocalization;
    if (deferBotVocalization) {
      controllerRef.current?.stopFoley("ambient-bot-vocalization", 140);
    }
  }, [deferBotVocalization]);
  useEffect(() => {
    ambientBotVocalizationRef.current = onAmbientBotVocalization;
  }, [onAmbientBotVocalization]);
  useEffect(() => {
    coffeeCupFoleyRef.current = onCoffeeCupFoley;
  }, [onCoffeeCupFoley]);
  useEffect(() => {
    volumeRef.current = volume;
    mixRef.current = mix;
    controllerRef.current?.setMix({
      volume,
      mix,
      transitionMs: mixTransitionMs,
    });
  }, [mix, mixTransitionMs, volume]);

  useEffect(() => {
    controllerRef.current?.setPresentationSuspended(presentationSuspended);
  }, [presentationSuspended]);

  useEffect(() => {
    if (!active) return;
    const controller = startSessionAtmosphere({
      seed: sessionKey,
      volume: volumeRef.current,
      backgroundUrl: resolvedBackgroundUrl,
      grainUrl,
      mix: mixRef.current,
      startTransitionMs: lifecycleTransitionMs,
      backgroundTone,
      backgroundRecordable,
      grainRecordable,
      foleyRoomAcoustics,
      backgroundRoomAcoustics,
      allowMixBoost,
      latencyCritical,
      ambientFoley,
      ambientFoleyUrls,
      shouldDeferFoley: () => deferFoleyRef.current,
      shouldDeferBotVocalization: () => deferBotVocalizationRef.current,
      ambientFoleyProfile,
      ambientBotVocalizations,
      ambientBotVocalizationProfile,
      onAmbientBotVocalization: (cue) =>
        ambientBotVocalizationRef.current?.(cue) ?? false,
      onPlaybackError: () => {
        if (
          backgroundFallbackUrl &&
          resolvedBackgroundUrl !== backgroundFallbackUrl
        ) setResolvedBackgroundUrl(backgroundFallbackUrl);
      },
    });
    controller.preloadFoley(preloadFoleyUrls ?? []);
    controller.setPresentationSuspended(
      getPrismPresentationSuspendedSnapshot(),
      0,
    );
    controllerRef.current = controller;
    if (controllerHandleRef) controllerHandleRef.current = controller;
    const detachCupFoley = coffeeCupRootRef?.current
      ? attachCoffeeCupFoley(coffeeCupRootRef.current, controller, (cue, cup) =>
          coffeeCupFoleyRef.current?.(cue, cup),
        )
      : null;
    return () => {
      detachCupFoley?.();
      controller.stop(lifecycleTransitionMs);
      if (controllerRef.current === controller) controllerRef.current = null;
      if (controllerHandleRef?.current === controller) {
        controllerHandleRef.current = null;
      }
    };
  }, [
    active,
    allowMixBoost,
    ambientFoley,
    ambientFoleyProfile,
    ambientFoleyUrls,
    ambientBotVocalizations,
    ambientBotVocalizationProfile,
    backgroundRecordable,
    grainRecordable,
    backgroundTone,
    backgroundRoomAcoustics,
    backgroundFallbackUrl,
    resolvedBackgroundUrl,
    coffeeCupRootRef,
    controllerHandleRef,
    foleyRoomAcoustics,
    grainUrl,
    latencyCritical,
    lifecycleTransitionMs,
    preloadFoleyUrls,
    sessionKey,
  ]);

  return null;
}
