"use client";

import { useEffect, useRef, type RefObject } from "react";
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
  grainUrl?: string | null;
  preloadFoleyUrls?: readonly string[];
  mix?: SessionAtmosphereMix;
  backgroundTone?: SessionAtmosphereBackgroundTone;
  /** When false, background beds stay local-only and skip the audio master. */
  backgroundRecordable?: boolean;
  foleyRoomAcoustics?: RoomAcousticsSend;
  backgroundRoomAcoustics?: RoomAcousticsSend;
  allowMixBoost?: boolean;
  mixTransitionMs?: number;
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
  grainUrl,
  preloadFoleyUrls,
  mix,
  backgroundTone = "neutral",
  backgroundRecordable = true,
  foleyRoomAcoustics,
  backgroundRoomAcoustics,
  allowMixBoost = false,
  mixTransitionMs = 0,
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
  const presentationSuspended = usePrismPresentationSuspended();
  const deferFoleyRef = useRef(deferFoley);
  const deferBotVocalizationRef = useRef(deferBotVocalization);
  const controllerRef = useRef<SessionAtmosphereController | null>(null);
  const volumeRef = useRef(volume);
  const mixRef = useRef(mix);
  const ambientBotVocalizationRef = useRef(onAmbientBotVocalization);
  const coffeeCupFoleyRef = useRef(onCoffeeCupFoley);
  useEffect(() => {
    deferFoleyRef.current = deferFoley;
  }, [deferFoley]);
  useEffect(() => {
    deferBotVocalizationRef.current = deferBotVocalization;
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
      backgroundUrl,
      grainUrl,
      mix: mixRef.current,
      backgroundTone,
      backgroundRecordable,
      foleyRoomAcoustics,
      backgroundRoomAcoustics,
      allowMixBoost,
      ambientFoley,
      ambientFoleyUrls,
      shouldDeferFoley: () => deferFoleyRef.current,
      shouldDeferBotVocalization: () => deferBotVocalizationRef.current,
      ambientFoleyProfile,
      ambientBotVocalizations,
      ambientBotVocalizationProfile,
      onAmbientBotVocalization: (cue) =>
        ambientBotVocalizationRef.current?.(cue) ?? false,
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
      controller.stop();
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
    backgroundTone,
    backgroundRoomAcoustics,
    backgroundUrl,
    coffeeCupRootRef,
    controllerHandleRef,
    foleyRoomAcoustics,
    grainUrl,
    preloadFoleyUrls,
    sessionKey,
  ]);

  return null;
}
