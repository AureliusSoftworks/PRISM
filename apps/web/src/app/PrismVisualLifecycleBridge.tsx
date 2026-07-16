"use client";

import { useEffect } from "react";
import { acquirePrismVisualLifecycle } from "./prismVisualLifecycle";

export function PrismVisualLifecycleBridge(): null {
  useEffect(() => acquirePrismVisualLifecycle(), []);
  return null;
}
