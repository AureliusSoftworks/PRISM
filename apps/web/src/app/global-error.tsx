"use client";

import { useEffect } from "react";
import { PrismAppErrorFallback } from "./PrismAppErrorFallback";
import { PRISM_DOCUMENT_THEME_BOOTSTRAP_SCRIPT } from "./prismDocumentTheme";

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
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <script
          id="prism-document-theme-bootstrap"
          dangerouslySetInnerHTML={{
            __html: PRISM_DOCUMENT_THEME_BOOTSTRAP_SCRIPT,
          }}
        />
        <PrismAppErrorFallback
          title="Prism is still here."
          body="The app shell hit a rendering problem. Try again when you are ready."
          error={error}
          surface="Application shell"
          onAction={reset}
        />
      </body>
    </html>
  );
}
