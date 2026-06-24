"use client";

import { useEffect } from "react";
import { PrismAppErrorFallback } from "./PrismAppErrorFallback";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  useEffect(() => {
    console.error("[Prism global error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <PrismAppErrorFallback
          title="Prism is still here."
          body="The app shell hit a rendering problem. Try again when you are ready."
          onAction={reset}
        />
      </body>
    </html>
  );
}
