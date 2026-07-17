"use client";

import { useEffect, useRef, type RefObject } from "react";
import {
  attachCoffeeCupFoley,
  startSessionAtmosphere,
  type SessionAtmosphereController,
  type SessionAtmosphereMix,
} from "./session-atmosphere-audio";

export interface SessionAtmosphereLayerProps {
  active: boolean;
  sessionKey: string;
  volume: number;
  backgroundUrl?: string | null;
  grainUrl?: string | null;
  mix?: SessionAtmosphereMix;
  deferFoley?: boolean;
  coffeeCupRootRef?: RefObject<HTMLElement | null>;
}

export function SessionAtmosphereLayer({
  active,
  sessionKey,
  volume,
  backgroundUrl,
  grainUrl,
  mix,
  deferFoley = false,
  coffeeCupRootRef,
}: SessionAtmosphereLayerProps): null {
  const deferFoleyRef = useRef(deferFoley);
  const controllerRef = useRef<SessionAtmosphereController | null>(null);
  const volumeRef = useRef(volume);
  const mixRef = useRef(mix);
  useEffect(() => {
    deferFoleyRef.current = deferFoley;
  }, [deferFoley]);
  useEffect(() => {
    volumeRef.current = volume;
    mixRef.current = mix;
    controllerRef.current?.setMix({ volume, mix });
  }, [mix, volume]);

  useEffect(() => {
    if (!active) return;
    const controller = startSessionAtmosphere({
      seed: sessionKey,
      volume: volumeRef.current,
      backgroundUrl,
      grainUrl,
      mix: mixRef.current,
      shouldDeferFoley: () => deferFoleyRef.current,
    });
    controllerRef.current = controller;
    const detachCupFoley = coffeeCupRootRef?.current
      ? attachCoffeeCupFoley(coffeeCupRootRef.current, controller)
      : null;
    return () => {
      detachCupFoley?.();
      controller.stop();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [active, backgroundUrl, coffeeCupRootRef, grainUrl, sessionKey]);

  return null;
}
