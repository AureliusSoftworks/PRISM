"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ModelPreparationResponse } from "@localai/shared";
import { PrismRefractionGateProvider, usePrismRefractionGate } from "../prismRefractionGate";
import { isRefractionAbort } from "../prismRefractionRun.ts";

/** Dev-only, no requests / account / provider / persisted assets. */
export function RefractionCancelFixture({ theme }: { theme: "light" | "dark" }): React.JSX.Element {
  const warmupStarted = useRef(0);
  const [polls, setPolls] = useState(0);
  const prepare = useCallback(async <T,>(_path: string, init?: RequestInit): Promise<T> => {
    init?.signal?.throwIfAborted();
    setPolls((count) => count + 1);
    return {
      ok: true,
      state: Date.now() - warmupStarted.current < 5_000 ? "warming" : "ready",
      model: "fixture-local",
      startedAt: new Date(warmupStarted.current).toISOString(),
      expiresAt: null,
      retryAfterMs: 200,
      failure: null,
    } satisfies ModelPreparationResponse as T;
  }, []);
  return (
    <PrismRefractionGateProvider request={prepare}>
      <FixtureBody theme={theme} polls={polls} startWarmup={() => {
        warmupStarted.current = Date.now();
        setPolls(0);
      }} />
    </PrismRefractionGateProvider>
  );
}

function FixtureBody({ theme, polls, startWarmup }: {
  theme: "light" | "dark"; polls: number; startWarmup: () => void;
}): React.JSX.Element {
  const gate = usePrismRefractionGate()!;
  const serial = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const mounted = useRef(true);
  const [asset, setAsset] = useState("Previously saved fixture asset");
  const [status, setStatus] = useState("Ready");
  const [providerFinishes, setProviderFinishes] = useState(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const timer of timers.current) clearTimeout(timer);
      timers.current.clear();
    };
  }, []);
  const later = (callback: () => void, ms: number): void => {
    const timer = setTimeout(() => { timers.current.delete(timer); callback(); }, ms);
    timers.current.add(timer);
  };
  const start = (kind: "quick" | "long" | "stubborn" | "warmup", title?: string): void => {
    const id = ++serial.current;
    if (kind === "warmup") startWarmup();
    setStatus(`Run ${id} started`);
    const loader = {
      title: title ?? (kind === "warmup" ? "Fixture warmup then refraction" : "Fixture asset refraction"),
      detail: "Local timer simulation. X or Escape must ask before cancelling; the previous fixture asset stays in place.",
      stepLabel: "Waiting for the simulated provider",
      theme,
      timingKey: kind === "quick" || kind === "long" ? "qa:measured-timer" : undefined,
    };
    const work = async (signal: AbortSignal): Promise<void> => {
      // Deliberately non-cooperative: resolving this promise after cancellation
      // must not apply an asset, clear a replacement overlay, or navigate.
      await new Promise<void>((resolve) => later(() => {
        if (mounted.current) setProviderFinishes((count) => count + 1);
        resolve();
      }, kind === "quick" ? 1_200 : kind === "long" ? 10_000 : 12_000));
      signal.throwIfAborted();
      if (mounted.current && serial.current === id) setAsset(`Completed fixture asset from run ${id}`);
    };
    const pending = kind === "warmup"
      ? gate.runLocalRefraction({ provider: "local", model: "fixture-local", experience: "prism", loader, work })
      : gate.withRefractionLoader({ loader, work });
    void pending.then(() => {
      if (mounted.current && serial.current === id) setStatus(`Run ${id} completed`);
    }).catch((error: unknown) => {
      if (mounted.current && serial.current === id) setStatus(isRefractionAbort(error) ? `Run ${id} cancelled` : String(error));
    });
  };
  return (
    <main data-qa-refraction-cancel="true" data-theme={theme} style={{ minHeight: "100vh", padding: 32, background: theme === "light" ? "#f6f7fa" : "#111521", color: theme === "light" ? "#141622" : "#f4f6fb" }}>
      <h1>Fullscreen refraction cancellation fixture</h1>
      <p>No network, real account, or saved PRISM data is used.</p>
      <p>Run “Quick measured run” three times, then “Exceed the estimate” to see a genuine learned estimate become unknown.</p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button onClick={() => start("quick")}>Quick measured run</button>
        <button onClick={() => start("long")}>Exceed the estimate</button>
        <button onClick={() => start("stubborn")}>Stubborn provider (12 seconds)</button>
        <button onClick={() => start("warmup")}>Warmup then generation</button>
        <button onClick={() => {
          start("stubborn", "Old run — will be replaced");
          later(() => start("stubborn", "New run — old completion must not clear me"), 500);
        }}>Replacement race</button>
      </div>
      <p role="status" data-qa-refraction-status="true">{status}</p>
      <p data-qa-refraction-asset="true">{asset}</p>
      <p>Simulated provider completions: {providerFinishes}; warmup polls: {polls}</p>
      <p>After cancellation, wait for the provider-completion count to rise. The fixture asset must stay unchanged. Focus should return to the start button.</p>
    </main>
  );
}
