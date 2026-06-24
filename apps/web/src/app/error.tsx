"use client";

import { useEffect } from "react";
import { PrismAppErrorFallback } from "./PrismAppErrorFallback";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    console.error("[Prism route error]", error);
  }, [error]);

  return <PrismAppErrorFallback onAction={reset} />;
}
