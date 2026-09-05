"use client";

import { useEffect, useRef, useState } from "react";
import { PrismRefractionRunOwner, type PrismRefractionRun } from "./prismRefractionRun.ts";

export function usePrismRefractionRun(): readonly [PrismRefractionRun | null, PrismRefractionRunOwner] {
  const [run, setRun] = useState<PrismRefractionRun | null>(null);
  const owner = useRef<PrismRefractionRunOwner | null>(null);
  if (!owner.current) owner.current = new PrismRefractionRunOwner(setRun);
  const stableOwner = owner.current;
  useEffect(() => () => stableOwner.dispose(), [stableOwner]);
  return [run, stableOwner] as const;
}
