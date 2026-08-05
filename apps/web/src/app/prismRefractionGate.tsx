"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  ModelPreparationExperience,
  ModelPreparationFailure,
  ModelPreparationResponse,
} from "@localai/shared";
import {
  modelPreparationFailureMessage,
  waitForModelPreparation,
  type ModelPreparationRequestFn,
} from "./modelPreparation";
import {
  ModelWarmupIntermission,
  type ModelWarmupIntermissionPhase,
} from "./ModelWarmupIntermission";
import { PrismBlockingLoader } from "./PrismBlockingLoader";

export type PrismRefractionWarmupContext = "session" | "invent" | "refract";

export interface PrismRefractionLoaderCopy {
  title: string;
  detail: string;
  stepLabel: string;
  theme?: "light" | "dark";
  footer?: string;
}

interface WarmupUiState {
  phase: ModelWarmupIntermissionPhase;
  experience: ModelPreparationExperience;
  context: PrismRefractionWarmupContext;
  model: string | null;
  startedAt: string | null;
  failure: ModelPreparationFailure | null;
  initial: boolean;
}

interface PrismRefractionGateValue {
  prepareLocalModel: (args: {
    provider: "local" | "openai" | "anthropic";
    model?: string | null;
    experience: ModelPreparationExperience;
    context?: PrismRefractionWarmupContext;
    signal?: AbortSignal;
    initial?: boolean;
  }) => Promise<ModelPreparationResponse>;
  withRefractionLoader: <T>(args: {
    loader: PrismRefractionLoaderCopy;
    work: () => Promise<T>;
    onCancel?: () => void;
  }) => Promise<T>;
  runLocalRefraction: <T>(args: {
    provider: "local" | "openai" | "anthropic";
    model?: string | null;
    experience: ModelPreparationExperience;
    context?: PrismRefractionWarmupContext;
    signal?: AbortSignal;
    loader: PrismRefractionLoaderCopy;
    work: () => Promise<T>;
    onCancel?: () => void;
  }) => Promise<T>;
}

const PrismRefractionGateContext =
  createContext<PrismRefractionGateValue | null>(null);

async function defaultGateRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;
  if (!response.ok) {
    throw new Error(
      (payload && typeof payload === "object" && "error" in payload
        ? payload.error
        : null) || `Request failed (${response.status}).`,
    );
  }
  return payload as T;
}

export function PrismRefractionGateProvider(props: {
  children: ReactNode;
  request?: ModelPreparationRequestFn;
}): React.JSX.Element {
  const request = props.request ?? defaultGateRequest;
  const [warmup, setWarmup] = useState<WarmupUiState | null>(null);
  const [loader, setLoader] = useState<PrismRefractionLoaderCopy | null>(null);
  const warmupAbortRef = useRef<AbortController | null>(null);

  const clearWarmup = useCallback((): void => {
    setWarmup(null);
  }, []);

  const prepareLocalModel = useCallback(
    async (args: {
      provider: "local" | "openai" | "anthropic";
      model?: string | null;
      experience: ModelPreparationExperience;
      context?: PrismRefractionWarmupContext;
      signal?: AbortSignal;
      initial?: boolean;
    }): Promise<ModelPreparationResponse> => {
      warmupAbortRef.current?.abort();
      const controller = new AbortController();
      warmupAbortRef.current = controller;
      const onAbort = (): void => controller.abort();
      args.signal?.addEventListener("abort", onAbort, { once: true });
      const context = args.context ?? "refract";
      const initial = args.initial ?? true;
      try {
        const preparation = await waitForModelPreparation({
          request,
          provider: args.provider,
          model: args.model ?? null,
          experience: args.experience,
          signal: controller.signal,
          onStatus: (status) => {
            if (status.state === "warming") {
              setWarmup({
                phase: "held",
                experience: args.experience,
                context,
                model: status.model,
                startedAt: status.startedAt,
                failure: null,
                initial,
              });
            } else if (status.state === "unavailable") {
              setWarmup({
                phase: "failed",
                experience: args.experience,
                context,
                model: status.model,
                startedAt: status.startedAt,
                failure: status.failure,
                initial,
              });
            }
          },
        });
        if (preparation.state === "unavailable") {
          setWarmup({
            phase: "failed",
            experience: args.experience,
            context,
            model: preparation.model,
            startedAt: preparation.startedAt,
            failure: preparation.failure,
            initial,
          });
          return preparation;
        }
        clearWarmup();
        return preparation;
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          clearWarmup();
          throw error;
        }
        setWarmup({
          phase: "failed",
          experience: args.experience,
          context,
          model: args.model ?? null,
          startedAt: new Date().toISOString(),
          failure: "request_failed",
          initial,
        });
        throw error;
      } finally {
        args.signal?.removeEventListener("abort", onAbort);
        if (warmupAbortRef.current === controller) {
          warmupAbortRef.current = null;
        }
      }
    },
    [clearWarmup, request],
  );

  const withRefractionLoader = useCallback(
    async <T,>(args: {
      loader: PrismRefractionLoaderCopy;
      work: () => Promise<T>;
      onCancel?: () => void;
    }): Promise<T> => {
      setLoader(args.loader);
      try {
        return await args.work();
      } finally {
        setLoader(null);
      }
    },
    [],
  );

  const runLocalRefraction = useCallback(
    async <T,>(args: {
      provider: "local" | "openai" | "anthropic";
      model?: string | null;
      experience: ModelPreparationExperience;
      context?: PrismRefractionWarmupContext;
      signal?: AbortSignal;
      loader: PrismRefractionLoaderCopy;
      work: () => Promise<T>;
      onCancel?: () => void;
    }): Promise<T> => {
      const preparation = await prepareLocalModel({
        provider: args.provider,
        model: args.model,
        experience: args.experience,
        context: args.context,
        signal: args.signal,
      });
      if (preparation.state === "unavailable") {
        throw new Error(
          modelPreparationFailureMessage({ failure: preparation.failure }),
        );
      }
      return withRefractionLoader({
        loader: args.loader,
        work: args.work,
        onCancel: args.onCancel,
      });
    },
    [prepareLocalModel, withRefractionLoader],
  );

  const value = useMemo<PrismRefractionGateValue>(
    () => ({
      prepareLocalModel,
      withRefractionLoader,
      runLocalRefraction,
    }),
    [prepareLocalModel, runLocalRefraction, withRefractionLoader],
  );

  return (
    <PrismRefractionGateContext.Provider value={value}>
      {props.children}
      {warmup ? (
        <ModelWarmupIntermission
          phase={warmup.phase}
          experience={warmup.experience}
          context={warmup.context}
          model={warmup.model}
          startedAt={warmup.startedAt}
          failure={warmup.failure}
          initial={warmup.initial}
          exitLabel="Cancel"
          onExit={() => {
            warmupAbortRef.current?.abort();
            warmupAbortRef.current = null;
            clearWarmup();
          }}
        />
      ) : null}
      <PrismBlockingLoader
        open={loader !== null}
        title={loader?.title ?? "Refracting"}
        detail={loader?.detail ?? "Prism is shaping a fresh reading."}
        stepLabel={loader?.stepLabel ?? "Working"}
        progress={null}
        theme={loader?.theme ?? "dark"}
        footer={
          loader?.footer ?? "Keep this window open while the light takes shape."
        }
      />
    </PrismRefractionGateContext.Provider>
  );
}

export function usePrismRefractionGate(): PrismRefractionGateValue | null {
  return useContext(PrismRefractionGateContext);
}

/** Map companion surface ids onto model-prepare experiences. */
export function modelPreparationExperienceForSurface(
  surfaceId: string,
): ModelPreparationExperience {
  switch (surfaceId) {
    case "coffee":
      return "coffee";
    case "signal":
    case "botcast":
      return "signal";
    case "debate":
      return "debate";
    default:
      return "prism";
  }
}
