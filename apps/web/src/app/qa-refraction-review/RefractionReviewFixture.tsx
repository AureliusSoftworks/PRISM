"use client";

import { useState } from "react";
import { PrismBlockingLoader } from "../PrismBlockingLoader";
import { usePrismRefractionRun } from "../usePrismRefractionRun";

/** No network or assets: deliberately slow work also exercises late-result rejection. */
export function RefractionReviewFixture({ theme }: { theme: "light" | "dark" }): React.JSX.Element {
  const [run, owner] = usePrismRefractionRun();
  const [estimate, setEstimate] = useState<number | null>(null);
  const [completed, setCompleted] = useState(0);
  const [status, setStatus] = useState("Ready");

  const start = async (estimatedMs: number | null): Promise<void> => {
    const next = owner.begin();
    setEstimate(estimatedMs);
    setStatus("Running local simulation");
    let success = false;
    try {
      await next.wait(() => new Promise<void>((resolve) => window.setTimeout(resolve, 15_000)));
      setCompleted((count) => count + 1);
      setStatus("Completed");
      success = true;
    } catch {
      if (next.ownsSlot()) setStatus("Cancelled — no result applied");
    } finally {
      next.finish(success);
    }
  };

  return (
    <main style={{ minHeight: "100vh", padding: 48, background: theme === "light" ? "#f4f6fa" : "#10121c", color: theme === "light" ? "#172638" : "#f4f6fa" }}>
      <h1>Fullscreen refraction review</h1>
      <p>Development-only, 15-second local simulation. No provider calls or saved assets.</p>
      <div style={{ display: "flex", gap: 16 }}>
        <button onClick={() => void start(null)}>Start unknown ETA</button>
        <button onClick={() => void start(30_000)}>Start estimated ETA</button>
        <button onClick={() => void start(1_000)}>Start overrun ETA</button>
      </div>
      <p role="status">{status}</p>
      <p>Applied results: {completed}</p>
      <PrismBlockingLoader
        open={run !== null}
        operation="refraction"
        operationId={run?.id}
        title="Refracting a local test asset"
        detail="This is a simulated request for checking the shared fullscreen experience."
        stepLabel="Simulating generation"
        startedAt={run?.startedAt}
        estimatedDurationMs={estimate}
        theme={theme}
        onCancel={() => owner.cancel()}
        cancelLabel="Cancel refraction"
      />
    </main>
  );
}
