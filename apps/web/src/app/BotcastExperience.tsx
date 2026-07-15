"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  botcastCameraShotAt,
  botcastGuestHasDepartedAt,
  botcastReplayMessageIndexAt,
  botcastReplayTimeline,
  type BotcastCameraShot,
  type BotcastEpisode,
  type BotcastEpisodeAdvanceResponse,
  type BotcastEpisodeSummary,
  type BotcastMessage,
  type BotcastProducerCue,
  type BotcastShow,
} from "@localai/shared";
import { nextBotcastShowIdAfterDeletion } from "./botcastDeletion";
import { PrismBlockingLoader } from "./PrismBlockingLoader";
import styles from "./botcast.module.css";

export interface BotcastBotSummary {
  id: string;
  name: string;
  color: string | null;
  glyph: string | null;
  online_enabled?: number | null;
}

export interface BotcastModelOption {
  id: string;
  label: string;
}

export interface BotcastApiRequest {
  <T>(path: string, options?: RequestInit): Promise<T>;
}

export interface BotcastExperienceProps {
  bots: BotcastBotSummary[];
  request: BotcastApiRequest;
  preferredProvider: "local" | "openai" | "anthropic";
  preferredImageProvider: "local" | "openai";
  modelOptions: BotcastModelOption[];
  accountDefaultModel: string | null;
  theme?: "light" | "dark";
  renderAvatar?: (
    bot: BotcastBotSummary,
    state: { talking: boolean; thinking: boolean; role: "host" | "guest" },
  ) => ReactNode;
  onUtterance?: (message: BotcastMessage, bot: BotcastBotSummary) => void;
  onExit: () => void;
  headerActions?: ReactNode;
}

type ImageGenerationResponse = {
  image: { id: string; displayUrl?: string; url?: string };
};

type SignalArtworkKind = "studio" | "logo";

type SignalArtworkProgress = {
  title: string;
  detail: string;
  stepLabel: string;
  progress: number | null;
};

type SignalDeleteTarget =
  | {
      kind: "show";
      id: string;
      name: string;
      episodeCount: number;
    }
  | {
      kind: "episode";
      id: string;
      showId: string;
      title: string;
      status: BotcastEpisodeSummary["status"];
    };

function deleteConfirmationCopy(target: SignalDeleteTarget): {
  title: string;
  body: string;
  action: string;
} {
  if (target.kind === "show") {
    const archiveCopy = target.episodeCount
      ? `, ${target.episodeCount} episode${target.episodeCount === 1 ? "" : "s"}, and every transcript and replay`
      : "";
    return {
      title: `Delete “${target.name}”?`,
      body: `This permanently removes the show${archiveCopy}. Saved studio and logo artwork stays in Images.`,
      action: "Delete show",
    };
  }
  if (target.status === "live") {
    return {
      title: `Discard “${target.title}”?`,
      body: "This stops the rundown and permanently removes the live episode, its transcript, and producer cues. The show stays.",
      action: "Discard episode",
    };
  }
  return {
    title: `Delete “${target.title}”?`,
    body: "This permanently removes the episode and replay. The show stays.",
    action: "Delete episode",
  };
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return "Signal request failed.";
  if (/database is locked|SQLITE_BUSY/iu.test(error.message)) {
    return "Signal is finishing another save. Try again in a moment.";
  }
  return error.message;
}

function runtimeLabel(runtimeMs: number | null): string {
  if (runtimeMs == null) return "Live";
  const totalSeconds = Math.max(0, Math.round(runtimeMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function providerLabel(provider: BotcastEpisodeSummary["provider"]): string {
  if (provider === "local") return "LOCAL";
  return provider === "anthropic" ? "Anthropic" : "OpenAI";
}

function activeShowAtmosphere(
  show: BotcastShow,
  theme: "light" | "dark",
): BotcastShow["atmosphere"] {
  return theme === "light" ? show.dayAtmosphere : show.nightAtmosphere;
}

function episodeOutcomeLabel(episode: Pick<BotcastEpisodeSummary, "outcome">): string {
  return episode.outcome === "guest_departed" ? "Guest walked out" : "Completed";
}

function latestDirectedShot(episode: BotcastEpisode): "left" | "right" | "wide" {
  const latest = [...episode.events]
    .reverse()
    .find((event) => event.kind === "camera_suggestion");
  const shot = latest?.payload.shot;
  return shot === "left" || shot === "right" || shot === "wide" ? shot : "wide";
}

function guestHasDeparted(episode: BotcastEpisode): boolean {
  return episode.events.some((event) => event.kind === "departure");
}

function avatarFallback(bot: BotcastBotSummary): ReactNode {
  return (
    <span className={styles.avatarFallback} aria-hidden="true">
      <span>{bot.glyph?.trim() || bot.name.slice(0, 1).toUpperCase()}</span>
    </span>
  );
}

function SignalShowLogo({
  show,
  compact = false,
}: {
  show: BotcastShow;
  compact?: boolean;
}): React.JSX.Element {
  if (show.logo.imageUrl) {
    return (
      <span
        className={styles.showLogo}
        data-compact={compact ? "true" : undefined}
        data-generated="true"
      >
        {/* Authenticated generated artwork is already locally sized and cannot use Next's optimizer. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={show.logo.imageUrl} alt="" />
      </span>
    );
  }
  const glyph = show.logo.fallbackGlyph;
  return (
    <span
      className={styles.showLogo}
      data-compact={compact ? "true" : undefined}
      data-glyph={glyph}
      data-generated="false"
    >
      <svg viewBox="0 0 64 64" aria-hidden="true">
        {glyph === "frequency" ? (
          <>
            <path className={styles.spectrumP} d="M10 26c5-7 9-7 14 0s9 7 14 0 9-7 16 0" />
            <path className={styles.spectrumS} d="M10 38c5-7 9-7 14 0s9 7 14 0 9-7 16 0" />
          </>
        ) : glyph === "orbit" ? (
          <>
            <ellipse className={styles.spectrumM} cx="32" cy="32" rx="23" ry="10" />
            <ellipse className={styles.spectrumS} cx="32" cy="32" rx="10" ry="23" />
            <circle className={styles.spectrumRFill} cx="48" cy="24" r="4" />
          </>
        ) : glyph === "aperture" ? (
          <>
            <path className={styles.spectrumPFill} d="M32 8 45 16 32 31 18 23Z" />
            <path className={styles.spectrumRFill} d="m45 16 9 13-20 8-2-6Z" />
            <path className={styles.spectrumIFill} d="m54 29-3 16-21-6 4-2Z" />
            <path className={styles.spectrumSFill} d="m51 45-15 11-10-17h4Z" />
            <path className={styles.spectrumMFill} d="m36 56-18-5 8-12Z" />
          </>
        ) : glyph === "spark" ? (
          <>
            <path className={styles.spectrumRFill} d="m32 6 5 19 19 7-19 7-5 19-5-19-19-7 19-7Z" />
            <circle className={styles.spectrumSFill} cx="50" cy="14" r="4" />
            <circle className={styles.spectrumMFill} cx="14" cy="49" r="3" />
          </>
        ) : (
          <>
            <circle className={styles.spectrumM} cx="32" cy="32" r="23" />
            <text className={styles.spectrumMonogram} x="32" y="42">
              {show.name.trim().slice(0, 1).toUpperCase() || "S"}
            </text>
          </>
        )}
      </svg>
    </span>
  );
}

export function BotcastExperience({
  bots,
  request,
  preferredProvider,
  preferredImageProvider,
  modelOptions,
  accountDefaultModel,
  theme = "dark",
  renderAvatar,
  onUtterance,
  onExit,
  headerActions,
}: BotcastExperienceProps): React.JSX.Element {
  const eligibleBots = useMemo(
    () => [...bots].sort((a, b) => a.name.localeCompare(b.name)),
    [bots],
  );
  const botsById = useMemo(
    () => new Map(eligibleBots.map((bot) => [bot.id, bot])),
    [eligibleBots],
  );
  const modelLabels = useMemo(
    () => new Map(modelOptions.map((option) => [option.id, option.label])),
    [modelOptions],
  );
  const [shows, setShows] = useState<BotcastShow[]>([]);
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<BotcastEpisodeSummary[]>([]);
  const [episode, setEpisode] = useState<BotcastEpisode | null>(null);
  const [replayEpisode, setReplayEpisode] = useState<BotcastEpisode | null>(null);
  const [hostDraftId, setHostDraftId] = useState("");
  const [guestDraftId, setGuestDraftId] = useState("");
  const [topicDraft, setTopicDraft] = useState("");
  const [producerBriefDraft, setProducerBriefDraft] = useState("");
  const [episodeModelDraft, setEpisodeModelDraft] = useState("");
  const [askAboutDraft, setAskAboutDraft] = useState("");
  const [showNameDraft, setShowNameDraft] = useState("");
  const [synthesizeArtwork, setSynthesizeArtwork] = useState(true);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoRun, setAutoRun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [replayCamera, setReplayCamera] = useState<BotcastCameraShot>("auto");
  const [replayElapsedMs, setReplayElapsedMs] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SignalDeleteTarget | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [artworkProgress, setArtworkProgress] = useState<SignalArtworkProgress | null>(null);
  const advanceInFlightRef = useRef(false);
  const replayVoiceMessageIdRef = useRef<string | null>(null);
  const speakingTimerRef = useRef<number | null>(null);
  const deleteCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const deleteReturnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (
      episodeModelDraft &&
      !modelOptions.some((option) => option.id === episodeModelDraft)
    ) {
      setEpisodeModelDraft("");
    }
  }, [episodeModelDraft, modelOptions]);

  const selectedShow = shows.find((show) => show.id === selectedShowId) ?? null;
  const dashboardAtmosphere = selectedShow
    ? activeShowAtmosphere(selectedShow, theme)
    : null;
  const hostBot = selectedShow ? botsById.get(selectedShow.hostBotId) ?? null : null;
  const liveGuestBot = episode ? botsById.get(episode.guestBotId) ?? null : null;
  const replayHostBot = replayEpisode
    ? botsById.get(replayEpisode.hostBotId) ?? null
    : null;
  const replayGuestBot = replayEpisode
    ? botsById.get(replayEpisode.guestBotId) ?? null
    : null;

  const loadShows = useCallback(async (): Promise<BotcastShow[]> => {
    const response = await request<{ shows: BotcastShow[] }>("/api/botcast/shows");
    setShows(response.shows);
    return response.shows;
  }, [request]);

  const loadEpisodes = useCallback(
    async (showId: string): Promise<BotcastEpisodeSummary[]> => {
      const response = await request<{ episodes: BotcastEpisodeSummary[] }>(
        `/api/botcast/shows/${encodeURIComponent(showId)}/episodes`,
      );
      setEpisodes(response.episodes);
      return response.episodes;
    },
    [request],
  );

  const loadEpisode = useCallback(
    async (episodeId: string): Promise<BotcastEpisode> => {
      const response = await request<{ episode: BotcastEpisode }>(
        `/api/botcast/episodes/${encodeURIComponent(episodeId)}`,
      );
      return response.episode;
    },
    [request],
  );

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const nextShows = await loadShows();
        if (!active) return;
        const first = nextShows[0] ?? null;
        if (first) {
          setSelectedShowId(first.id);
          setShowNameDraft(first.name);
          await loadEpisodes(first.id);
        }
      } catch (loadError) {
        if (active) setError(errorMessage(loadError));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadEpisodes, loadShows]);

  const selectShow = useCallback(
    async (show: BotcastShow): Promise<void> => {
      setSelectedShowId(show.id);
      setShowNameDraft(show.name);
      setEpisode(null);
      setReplayEpisode(null);
      setError(null);
      setLoading(true);
      try {
        await loadEpisodes(show.id);
      } catch (loadError) {
        setError(errorMessage(loadError));
      } finally {
        setLoading(false);
      }
    },
    [loadEpisodes],
  );

  const replaceShow = (nextShow: BotcastShow): void => {
    setShows((current) => {
      const exists = current.some((show) => show.id === nextShow.id);
      return exists
        ? current.map((show) => (show.id === nextShow.id ? nextShow : show))
        : [nextShow, ...current];
    });
    if (nextShow.id === selectedShowId) setShowNameDraft(nextShow.name);
  };

  const resetEpisodePlayback = (): void => {
    setAutoRun(false);
    setReplayPlaying(false);
    setReplayElapsedMs(0);
    setReplayCamera("auto");
    setSpeakingMessageId(null);
    replayVoiceMessageIdRef.current = null;
    if (speakingTimerRef.current !== null) {
      window.clearTimeout(speakingTimerRef.current);
      speakingTimerRef.current = null;
    }
  };

  const openShowDeletion = (show: BotcastShow, opener: HTMLElement): void => {
    resetEpisodePlayback();
    deleteReturnFocusRef.current = opener;
    setDeleteError(null);
    setDeleteTarget({
      kind: "show",
      id: show.id,
      name: show.name,
      episodeCount: show.episodeCount,
    });
  };

  const openEpisodeDeletion = (
    item: Pick<BotcastEpisodeSummary, "id" | "showId" | "title" | "status">,
    opener: HTMLElement,
  ): void => {
    resetEpisodePlayback();
    deleteReturnFocusRef.current = opener;
    setDeleteError(null);
    setDeleteTarget({
      kind: "episode",
      id: item.id,
      showId: item.showId,
      title: item.title,
      status: item.status,
    });
  };

  const dismissDeletion = (): void => {
    if (busy) return;
    setDeleteError(null);
    setDeleteTarget(null);
  };

  useEffect(() => {
    if (!deleteTarget) {
      const focusTarget = deleteReturnFocusRef.current?.isConnected
        ? deleteReturnFocusRef.current
        : document.querySelector<HTMLElement>("[data-botcast-delete-focus-fallback='true']");
      deleteReturnFocusRef.current = null;
      focusTarget?.focus();
      return;
    }
    deleteCancelButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        setDeleteError(null);
        setDeleteTarget(null);
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = deleteCancelButtonRef.current?.closest<HTMLElement>("[role='alertdialog']");
      const focusable = dialog
        ? Array.from(dialog.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
        : [];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, deleteTarget]);

  const deleteConfirmedTarget = async (): Promise<void> => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setBusy(true);
    setDeleteError(null);
    setError(null);
    try {
      if (target.kind === "show") {
        const nextShowId = nextBotcastShowIdAfterDeletion(shows, target.id);
        await request(`/api/botcast/shows/${encodeURIComponent(target.id)}`, {
          method: "DELETE",
        });
        resetEpisodePlayback();
        setEpisode(null);
        setReplayEpisode(null);
        setEpisodes([]);
        setGuestDraftId("");
        setTopicDraft("");
        setProducerBriefDraft("");
        setAskAboutDraft("");
        const nextShows = await loadShows();
        const nextShow = nextShows.find((show) => show.id === nextShowId) ?? nextShows[0] ?? null;
        setSelectedShowId(nextShow?.id ?? null);
        setShowNameDraft(nextShow?.name ?? "");
        if (nextShow) await loadEpisodes(nextShow.id);
        setNotice(
          target.episodeCount
            ? `${target.name} and ${target.episodeCount} episode${target.episodeCount === 1 ? "" : "s"} deleted.`
            : `${target.name} deleted.`,
        );
      } else {
        await request(`/api/botcast/episodes/${encodeURIComponent(target.id)}`, {
          method: "DELETE",
        });
        resetEpisodePlayback();
        setEpisode((current) => (current?.id === target.id ? null : current));
        setReplayEpisode((current) => (current?.id === target.id ? null : current));
        await Promise.all([loadShows(), loadEpisodes(target.showId)]);
        setNotice(
          target.status === "live"
            ? `“${target.title}” discarded.`
            : `“${target.title}” deleted from the archive.`,
        );
      }
      setDeleteTarget(null);
    } catch (deleteRequestError) {
      setDeleteError(errorMessage(deleteRequestError));
    } finally {
      setBusy(false);
    }
  };

  const generateShowArtwork = async (
    sourceShow: BotcastShow,
    regenerate: boolean,
    kinds: readonly SignalArtworkKind[] = ["studio", "logo"],
  ): Promise<{
    show: BotcastShow;
    generatedCount: number;
    failureMessage: string | null;
  }> => {
    const includesStudios = kinds.includes("studio");
    const includesLogo = kinds.includes("logo");
    setArtworkProgress({
      title: includesStudios && includesLogo
        ? `Giving ${sourceShow.name} a visual identity`
        : includesStudios
          ? "Building the day and night studios"
          : "Designing a new show mark",
      detail: includesStudios && includesLogo
        ? "PRISM is rendering a matched studio pair and its companion logo."
        : includesStudios
          ? "PRISM is preserving one persona-specific set while changing only its light."
          : "PRISM is distilling the show’s personality into one memorable symbol.",
      stepLabel: regenerate ? "Preparing fresh art direction" : "Preparing the visual identity",
      progress: 0,
    });
    try {
      let workingShow = sourceShow;
      if (regenerate) {
        const reset = await request<{ show: BotcastShow }>(
          `/api/botcast/shows/${encodeURIComponent(sourceShow.id)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              ...(includesStudios ? { regenerateAtmosphere: true } : {}),
              ...(includesLogo ? { regenerateLogo: true } : {}),
            }),
          },
        );
        workingShow = reset.show;
        replaceShow(workingShow);
      }
      let generatedCount = 0;
      let failureMessage: string | null = null;
      const artwork = ([
        {
          kind: "daytime studio",
          artworkKind: "studio",
          prompt: workingShow.dayAtmosphere.prompt,
          size: "1536x1024",
          imageUrlKey: "dayAtmosphereImageUrl",
          imageIdKey: "dayAtmosphereImageId",
        },
        {
          kind: "nighttime studio",
          artworkKind: "studio",
          prompt: workingShow.nightAtmosphere.prompt,
          size: "1536x1024",
          imageUrlKey: "nightAtmosphereImageUrl",
          imageIdKey: "nightAtmosphereImageId",
        },
        {
          kind: "logo",
          artworkKind: "logo",
          prompt: workingShow.logo.prompt,
          size: "1024x1024",
          imageUrlKey: "logoImageUrl",
          imageIdKey: "logoImageId",
        },
      ] as const).filter((asset) => kinds.includes(asset.artworkKind));
      for (const [index, asset] of artwork.entries()) {
        setArtworkProgress((current) => current ? {
          ...current,
          stepLabel: `Rendering ${asset.kind} · ${index + 1} of ${artwork.length}`,
          progress: index / artwork.length,
        } : null);
        try {
          setNotice(`Synthesizing the ${asset.kind}…`);
          const generated = await request<ImageGenerationResponse>("/api/images/generate", {
            method: "POST",
            body: JSON.stringify({
              prompt: asset.prompt,
              size: asset.size,
              quality: "standard",
              preferredProvider: preferredImageProvider,
              botId: workingShow.hostBotId,
              origin: "botcast",
            }),
          });
          const imageUrl = generated.image.displayUrl ?? generated.image.url;
          if (!imageUrl) throw new Error(`${asset.kind} image has no usable local URL.`);
          const saved = await request<{ show: BotcastShow }>(
            `/api/botcast/shows/${encodeURIComponent(sourceShow.id)}`,
            {
              method: "PATCH",
              body: JSON.stringify({
                [asset.imageUrlKey]: imageUrl,
                [asset.imageIdKey]: generated.image.id,
              }),
            },
          );
          workingShow = saved.show;
          generatedCount += 1;
          replaceShow(workingShow);
        } catch (artworkError) {
          failureMessage ??= errorMessage(artworkError);
          // Each asset owns a deterministic fallback, so one failed synthesis
          // never blocks the rest of the show setup.
        } finally {
          setArtworkProgress((current) => current ? {
            ...current,
            progress: (index + 1) / artwork.length,
          } : null);
        }
      }
      return { show: workingShow, generatedCount, failureMessage };
    } finally {
      setArtworkProgress(null);
    }
  };

  const createShow = async (): Promise<void> => {
    if (!hostDraftId) return;
    setBusy(true);
    setError(null);
    setNotice("Finding the show hidden inside this host…");
    try {
      const response = await request<{ show: BotcastShow }>("/api/botcast/shows", {
        method: "POST",
        body: JSON.stringify({ hostBotId: hostDraftId }),
      });
      await selectShow(response.show);
      replaceShow(response.show);
      let show = response.show;
      let identityGenerated = false;
      try {
        const branded = await request<{ show: BotcastShow; generated: boolean }>(
          `/api/botcast/shows/${encodeURIComponent(show.id)}/brand`,
          {
            method: "POST",
            body: JSON.stringify({ preferredProvider }),
          },
        );
        show = branded.show;
        identityGenerated = branded.generated;
        replaceShow(show);
        setShowNameDraft(show.name);
      } catch {
        // The initial show already includes a host-shaped deterministic identity.
      }
      if (synthesizeArtwork) {
        const artwork = await generateShowArtwork(show, false);
        show = artwork.show;
        if (artwork.failureMessage) setError(artwork.failureMessage);
        setNotice(
          artwork.generatedCount === 3
            ? `${show.name} has its name, mark, and day-to-night studio pair.`
            : artwork.generatedCount > 0
              ? `${show.name} is ready; ${3 - artwork.generatedCount} visual${artwork.generatedCount === 2 ? " uses" : "s use"} its PRISM fallback.`
              : `${show.name} is ready in its procedural PRISM studios.`,
        );
      } else {
        setNotice(
          `${show.name} is ready with its procedural studio and ${identityGenerated ? "generated" : "host-shaped"} identity.`,
        );
      }
      setHostDraftId("");
      await loadShows();
    } catch (createError) {
      setError(errorMessage(createError));
    } finally {
      setBusy(false);
    }
  };

  const renameShow = async (nextName?: string): Promise<void> => {
    if (!selectedShow) return;
    const name = (nextName ?? showNameDraft).trim();
    if (!name || name === selectedShow.name) return;
    setShows((current) =>
      current.map((show) => (show.id === selectedShow.id ? { ...show, name } : show)),
    );
    try {
      const response = await request<{ show: BotcastShow }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}`,
        { method: "PATCH", body: JSON.stringify({ name }) },
      );
      setShows((current) =>
        current.map((show) => (show.id === response.show.id ? response.show : show)),
      );
    } catch (renameError) {
      setShowNameDraft(selectedShow.name);
      setError(errorMessage(renameError));
    }
  };

  const regenerateStudio = async (): Promise<void> => {
    if (!selectedShow) return;
    setBusy(true);
    setError(null);
    setNotice("Refreshing the show’s studio…");
    try {
      const artwork = await generateShowArtwork(selectedShow, true, ["studio"]);
      if (artwork.failureMessage) setError(artwork.failureMessage);
      setNotice(
        artwork.generatedCount === 2
          ? "The refreshed day and night studios are live."
          : artwork.generatedCount === 1
            ? "One refreshed studio is live; its partner is using the PRISM fallback."
            : "Synthesis was unavailable, so the refreshed PRISM studios are live.",
      );
    } catch {
      setNotice("The procedural day and night studios are active; no show setup was lost.");
    } finally {
      setBusy(false);
    }
  };

  const regenerateLogo = async (): Promise<void> => {
    if (!selectedShow) return;
    setBusy(true);
    setError(null);
    setNotice("Refreshing the show’s logo…");
    try {
      const artwork = await generateShowArtwork(selectedShow, true, ["logo"]);
      if (artwork.failureMessage) setError(artwork.failureMessage);
      setNotice(
        artwork.generatedCount === 1
          ? "The refreshed logo is live."
          : "Synthesis was unavailable, so the refreshed PRISM logo is live.",
      );
    } catch {
      setNotice("The procedural logo is active; no show setup was lost.");
    } finally {
      setBusy(false);
    }
  };

  const startEpisode = async (): Promise<void> => {
    if (!selectedShow || !guestDraftId || !topicDraft.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const response = await request<{ episode: BotcastEpisode }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}/episodes`,
        {
          method: "POST",
          body: JSON.stringify({
            guestBotId: guestDraftId,
            topic: topicDraft,
            producerBrief: producerBriefDraft,
            modelOverride: episodeModelDraft || accountDefaultModel,
          }),
        },
      );
      setEpisode(response.episode);
      setReplayEpisode(null);
      setAutoRun(true);
      setTopicDraft("");
      setProducerBriefDraft("");
      setEpisodeModelDraft("");
      setAskAboutDraft("");
      await loadEpisodes(selectedShow.id);
    } catch (startError) {
      setError(errorMessage(startError));
    } finally {
      setBusy(false);
    }
  };

  const advanceEpisode = useCallback(
    async (cue?: BotcastProducerCue): Promise<void> => {
      if (!episode || episode.status === "completed" || advanceInFlightRef.current) return;
      advanceInFlightRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const response = await request<BotcastEpisodeAdvanceResponse>(
          `/api/botcast/episodes/${encodeURIComponent(episode.id)}/advance`,
          {
            method: "POST",
            body: JSON.stringify({
              ...(cue ? { cue } : {}),
            }),
          },
        );
        setEpisode(response.episode);
        if (response.message) {
          setSpeakingMessageId(response.message.id);
          if (speakingTimerRef.current !== null) {
            window.clearTimeout(speakingTimerRef.current);
          }
          const speakingMs = Math.min(
            9_000,
            Math.max(1_800, response.message.content.split(/\s+/u).length * 280),
          );
          speakingTimerRef.current = window.setTimeout(() => {
            setSpeakingMessageId(null);
            speakingTimerRef.current = null;
          }, speakingMs);
          const bot = botsById.get(response.message.botId);
          if (bot) onUtterance?.(response.message, bot);
        }
        if (response.episode.status === "completed") {
          setAutoRun(false);
          if (selectedShowId) await loadEpisodes(selectedShowId);
        }
      } catch (advanceError) {
        setAutoRun(false);
        setError(errorMessage(advanceError));
      } finally {
        setBusy(false);
        advanceInFlightRef.current = false;
      }
    },
    [
      botsById,
      episode,
      loadEpisodes,
      onUtterance,
      request,
      selectedShowId,
    ],
  );

  useEffect(() => {
    if (
      !episode ||
      episode.status === "completed" ||
      !autoRun ||
      busy ||
      speakingMessageId !== null
    )
      return;
    const timer = window.setTimeout(() => void advanceEpisode(), episode.messages.length ? 2_600 : 450);
    return () => window.clearTimeout(timer);
  }, [advanceEpisode, autoRun, busy, episode, speakingMessageId]);

  const sendCue = (cue: BotcastProducerCue): void => {
    setAutoRun(true);
    void advanceEpisode(cue);
  };

  const openReplay = async (summary: BotcastEpisodeSummary): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const detail = await loadEpisode(summary.id);
      if (detail.status === "live") {
        setEpisode(detail);
        setReplayEpisode(null);
        setAutoRun(false);
        return;
      }
      setReplayEpisode(detail);
      setEpisode(null);
      setReplayCamera("auto");
      setReplayElapsedMs(0);
      setReplayPlaying(false);
    } catch (replayError) {
      setError(errorMessage(replayError));
    } finally {
      setLoading(false);
    }
  };

  const replayTimeline = useMemo(
    () =>
      replayEpisode
        ? botcastReplayTimeline(replayEpisode.messages, replayEpisode.events)
        : { durationMs: 8_000, messageStartMs: [] },
    [replayEpisode],
  );
  const replayDurationMs = replayTimeline.durationMs;
  useEffect(() => {
    if (!replayEpisode || !replayPlaying) return;
    const timer = window.setInterval(() => {
      setReplayElapsedMs((current) => {
        const next = Math.min(replayDurationMs, current + 100);
        if (next >= replayDurationMs) setReplayPlaying(false);
        return next;
      });
    }, 100);
    return () => window.clearInterval(timer);
  }, [replayDurationMs, replayEpisode, replayPlaying]);

  const replayShot = replayEpisode
    ? botcastCameraShotAt({
        events: replayEpisode.events,
        elapsedMs: replayElapsedMs,
        manualShot: replayCamera,
      })
    : "wide";
  const replayGuestDeparted = replayEpisode
    ? botcastGuestHasDepartedAt(replayEpisode.events, replayElapsedMs)
    : false;
  const replayMessageIndex = botcastReplayMessageIndexAt(
    replayTimeline.messageStartMs,
    replayElapsedMs,
  );
  const replayActiveMessage = replayEpisode?.messages[replayMessageIndex] ?? null;
  useEffect(() => {
    if (!replayPlaying || !replayActiveMessage) return;
    if (replayVoiceMessageIdRef.current === replayActiveMessage.id) return;
    replayVoiceMessageIdRef.current = replayActiveMessage.id;
    const bot = botsById.get(replayActiveMessage.botId);
    if (bot) onUtterance?.(replayActiveMessage, bot);
  }, [botsById, onUtterance, replayActiveMessage, replayPlaying]);
  useEffect(() => {
    if (replayEpisode) return;
    replayVoiceMessageIdRef.current = null;
  }, [replayEpisode]);
  useEffect(
    () => () => {
      if (speakingTimerRef.current !== null) {
        window.clearTimeout(speakingTimerRef.current);
      }
    },
    [],
  );

  const renderStage = (args: {
    show: BotcastShow;
    currentEpisode: BotcastEpisode;
    host: BotcastBotSummary | null;
    guest: BotcastBotSummary | null;
    shot: "left" | "right" | "wide";
    activeMessage: BotcastMessage | null;
    replay: boolean;
    guestDeparted?: boolean;
  }): React.JSX.Element => {
    const departed = args.guestDeparted ?? guestHasDeparted(args.currentEpisode);
    const stageAtmosphere = activeShowAtmosphere(args.show, theme);
    const atmosphereStyle = {
      ["--botcast-accent" as string]: args.show.accentColor,
      ...(stageAtmosphere.imageUrl
        ? { ["--botcast-atmosphere" as string]: `url("${stageAtmosphere.imageUrl}")` }
        : {}),
    } as CSSProperties;
    const avatar = (
      bot: BotcastBotSummary,
      role: "host" | "guest",
      talking: boolean,
    ): ReactNode =>
      renderAvatar?.(bot, { talking, thinking: false, role }) ?? avatarFallback(bot);
    return (
      <section
        className={styles.stageViewport}
        data-shot={args.shot}
        data-replay={args.replay ? "true" : undefined}
        data-atmosphere={stageAtmosphere.status}
        style={atmosphereStyle}
        aria-label={`Signal studio, ${args.shot} camera`}
      >
        <div className={styles.stageScene}>
          <div className={styles.atmosphere} aria-hidden="true" />
          <div className={styles.wordmark}>
            <SignalShowLogo show={args.show} />
            <strong>{args.show.name}</strong>
          </div>
          <div className={styles.studioGlow} aria-hidden="true" />
          <div className={`${styles.seat} ${styles.hostSeat}`} data-role="host">
            <span className={styles.roleBadge}>Host</span>
            <div className={styles.chair} aria-hidden="true" />
            {args.host ? (
              <div className={styles.avatarRig}>
                {avatar(args.host, "host", args.activeMessage?.speakerRole === "host")}
              </div>
            ) : null}
            <div className={styles.boomMic} aria-hidden="true"><span /></div>
            <div className={`${styles.mug} ${styles.hostMug}`} aria-label="Host logo mug">
              <span className={styles.mugLogo}><i /><i /><i /><i /><i /></span>
            </div>
            <strong className={styles.nameplate}>{args.host?.name ?? "Host"}</strong>
          </div>
          <div
            className={`${styles.seat} ${styles.guestSeat}`}
            data-role="guest"
            data-departed={departed ? "true" : undefined}
          >
            <span className={styles.roleBadge}>Guest</span>
            <div className={styles.chair} aria-hidden="true" />
            {!departed && args.guest ? (
              <div className={styles.avatarRig}>
                {avatar(args.guest, "guest", args.activeMessage?.speakerRole === "guest")}
              </div>
            ) : (
              <span className={styles.emptyChairLabel}>Guest has left the studio</span>
            )}
            <div className={styles.boomMic} aria-hidden="true"><span /></div>
            <div
              className={`${styles.mug} ${styles.guestMug}`}
              style={{ ["--guest-accent" as string]: args.guest?.color ?? "#8da1b9" } as CSSProperties}
              aria-label="Guest accent mug"
            />
            <strong className={styles.nameplate}>{args.guest?.name ?? "Guest"}</strong>
          </div>
          <div className={styles.studioDesk} aria-hidden="true" />
        </div>
      </section>
    );
  };

  const renderLibrary = (): React.JSX.Element => (
    <aside className={styles.library} aria-label="Signal shows">
      <div className={styles.libraryBrand}>
        <button type="button" onClick={onExit} aria-label="Back to Chat">PRISM</button>
        <span>SIGNAL</span>
      </div>
      <div className={styles.libraryHeader}>
        <span>Your shows</span>
        <small>{shows.length}</small>
      </div>
      <div className={styles.showList} data-tutorial-target="botcast-shows">
        {shows.map((show) => {
          const host = botsById.get(show.hostBotId);
          return (
            <button
              key={show.id}
              type="button"
              className={styles.showRow}
              data-selected={show.id === selectedShowId ? "true" : undefined}
              onClick={() => void selectShow(show)}
              style={{ ["--show-accent" as string]: show.accentColor } as CSSProperties}
              data-botcast-show-id={show.id}
            >
              <SignalShowLogo show={show} compact />
              <span>
                <strong>{show.name}</strong>
                <small>{host?.name ?? "Unknown host"} · {show.episodeCount} episodes</small>
              </span>
            </button>
          );
        })}
        {!loading && shows.length === 0 ? (
          <p className={styles.emptyCopy}>Every great show starts with a host.</p>
        ) : null}
      </div>
      <div
        className={styles.createShowCard}
        data-tutorial-target="botcast-brand-controls"
      >
        <label htmlFor="botcast-host-picker">Create a show</label>
        <select
          id="botcast-host-picker"
          value={hostDraftId}
          onChange={(event) => setHostDraftId(event.target.value)}
          data-botcast-delete-focus-fallback="true"
        >
          <option value="">Choose a host…</option>
          {eligibleBots
            .filter((bot) => !shows.some((show) => show.hostBotId === bot.id))
            .map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
        </select>
        <label className={styles.synthesisToggle}>
          <input
            type="checkbox"
            checked={synthesizeArtwork}
            onChange={(event) => setSynthesizeArtwork(event.target.checked)}
          />
          <span>
            Synthesize studios + logo
            <small>Creates matching Light and Dark sets.</small>
          </span>
        </label>
        <button type="button" onClick={() => void createShow()} disabled={!hostDraftId || busy}>
          Create show
        </button>
      </div>
    </aside>
  );

  const renderEpisodeSetup = (): React.JSX.Element | null => {
    if (!selectedShow || !hostBot) return null;
    const guestOptions = eligibleBots.filter((bot) => bot.id !== hostBot.id);
    return (
      <div className={styles.productionDesk} data-tutorial-target="botcast-setup">
        <div className={styles.productionHeading}>
          <div>
            <span className={styles.eyebrow}>Tonight’s production</span>
            <h2>Book the guest. Set the angle.</h2>
          </div>
          <div className={styles.productionArtworkActions}>
            <button
              type="button"
              title="Regenerate matching Light and Dark studios"
              onClick={() => void regenerateStudio()}
              disabled={busy}
            >
              Refresh studio
            </button>
            <button type="button" onClick={() => void regenerateLogo()} disabled={busy}>
              Refresh logo
            </button>
          </div>
        </div>
        <div className={styles.setupGrid}>
          <label>
            Guest
            <select value={guestDraftId} onChange={(event) => setGuestDraftId(event.target.value)}>
              <option value="">Choose one guest…</option>
              {guestOptions.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
            </select>
          </label>
          <label>
            Episode topic
            <input
              value={topicDraft}
              onChange={(event) => setTopicDraft(event.target.value)}
              placeholder="The question tonight’s episode has to answer"
            />
          </label>
          <label className={styles.producerBrief}>
            Private producer brief <span>optional</span>
            <textarea
              value={producerBriefDraft}
              onChange={(event) => setProducerBriefDraft(event.target.value)}
              placeholder="The angle, boundaries, and follow-ups the host should keep in mind. This stays off-mic."
            />
          </label>
        </div>
        <div className={styles.episodeLaunchRow}>
          <label className={styles.episodeModelControl}>
            <span>Episode model</span>
            <select
              value={episodeModelDraft}
              onChange={(event) => setEpisodeModelDraft(event.target.value)}
              aria-label="Signal episode model"
            >
              <option value="">
                {`Account default · ${accountDefaultModel ? modelLabels.get(accountDefaultModel) ?? accountDefaultModel : "Provider default"}`}
              </option>
              {modelOptions
                .filter((option) => option.id !== accountDefaultModel)
                .map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
            </select>
            <small>{providerLabel(preferredProvider)} · locked for this recording</small>
          </label>
          <button
            type="button"
            className={styles.goLiveButton}
            onClick={() => void startEpisode()}
            disabled={busy || !guestDraftId || !topicDraft.trim()}
          >
            Begin episode
          </button>
        </div>
      </div>
    );
  };

  const renderArchive = (): React.JSX.Element => (
    <section className={styles.archive} data-tutorial-target="botcast-replay">
      <div className={styles.archiveHeading}>
        <span className={styles.eyebrow}>Episode archive</span>
        <h2>{episodes.length ? `${episodes.length} recorded` : "The tape shelf is empty"}</h2>
      </div>
      <div className={styles.episodeGrid}>
        {episodes.map((item, index) => (
          <article key={item.id} className={styles.episodeCard}>
            <button
              type="button"
              className={styles.episodeOpenButton}
              onClick={() => void openReplay(item)}
            >
              <span className={styles.episodeNumber}>EP {String(episodes.length - index).padStart(2, "0")}</span>
              <strong>{item.title}</strong>
              <span>{botsById.get(item.guestBotId)?.name ?? "Guest"}</span>
              <small>
                {new Date(item.startedAt).toLocaleDateString()} · {runtimeLabel(item.runtimeMs)} · {providerLabel(item.provider)} · {item.model ? modelLabels.get(item.model) ?? item.model : "Provider default"} · {item.status === "live" ? "Resume episode" : episodeOutcomeLabel(item)}
              </small>
            </button>
            <button
              type="button"
              className={styles.episodeDeleteButton}
              onClick={(event) => openEpisodeDeletion(item, event.currentTarget)}
              disabled={busy}
              aria-label={`${item.status === "live" ? "Discard" : "Delete"} episode ${item.title}`}
            >
              {item.status === "live" ? "Discard" : "Delete"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );

  const liveActiveMessage =
    episode?.messages.find((message) => message.id === speakingMessageId) ?? null;
  const liveShot = episode ? latestDirectedShot(episode) : "wide";
  const producerCueReady =
    Boolean(episode) &&
    (episode!.messages.length === 0 ||
      episode!.messages.at(-1)?.speakerRole === "guest");

  return (
    <>
    <main className={styles.shell} data-botcast-mode="true" data-theme={theme}>
      {renderLibrary()}
      <section className={styles.main}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>{episode ? "Live control room" : replayEpisode ? "Episode replay" : "Host-owned shows"}</span>
            {selectedShow ? (
              <div className={styles.showTitleRow}>
                <input
                  className={styles.showNameInput}
                  value={showNameDraft}
                  onChange={(event) => setShowNameDraft(event.target.value)}
                  onBlur={(event) => void renameShow(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void renameShow(event.currentTarget.value);
                      event.currentTarget.blur();
                    }
                  }}
                  aria-label="Show name"
                  data-botcast-delete-focus-fallback="true"
                />
                <button
                  type="button"
                  className={styles.showDeleteButton}
                  onClick={(event) => openShowDeletion(selectedShow, event.currentTarget)}
                  disabled={busy}
                  aria-label={`Delete show ${selectedShow.name}`}
                >
                  Delete show
                </button>
              </div>
            ) : <h1>Signal</h1>}
            <p>{selectedShow?.premise ?? "A bot owns the show. You produce the episode."}</p>
          </div>
          <div className={styles.headerActions}>{headerActions}</div>
        </header>

        {error ? <div className={styles.error} role="alert">{error}</div> : null}
        {notice ? <div className={styles.notice} role="status">{notice}</div> : null}

        {episode && selectedShow ? (
          <div className={styles.liveLayout}>
            <div className={styles.liveTopline}>
              <span data-live={episode.status === "live" ? "true" : undefined}>
                {episode.status === "live" ? "● ON AIR" : episodeOutcomeLabel(episode)}
              </span>
              <strong>{episode.segment === "interview" ? "MAIN INTERVIEW" : episode.segment.toUpperCase()}</strong>
              <span className={styles.modelProvenance}>
                {providerLabel(episode.provider)} · {episode.model ? modelLabels.get(episode.model) ?? episode.model : "Provider default"}
              </span>
              <span>{episode.tensionStage === "calm" ? "Guest settled" : `Guest: ${episode.tensionStage}`}</span>
              <button type="button" onClick={() => setAutoRun((value) => !value)} disabled={episode.status === "completed"}>
                {autoRun ? "Pause rundown" : "Resume rundown"}
              </button>
              <button
                type="button"
                className={styles.dangerButton}
                onClick={(event) => openEpisodeDeletion(episode, event.currentTarget)}
                disabled={busy}
              >
                {episode.status === "live" ? "Discard episode" : "Delete episode"}
              </button>
            </div>
            {renderStage({
              show: selectedShow,
              currentEpisode: episode,
              host: hostBot,
              guest: liveGuestBot,
              shot: liveShot,
              activeMessage: liveActiveMessage,
              replay: false,
            })}
            <div className={styles.controlRoom}>
              <div className={styles.transcript} aria-live="polite">
                {episode.messages.map((message) => (
                  <article key={message.id} data-role={message.speakerRole}>
                    <strong>{botsById.get(message.botId)?.name ?? message.speakerRole}</strong>
                    <p>{message.content}</p>
                  </article>
                ))}
                {busy ? <p className={styles.thinking}>The studio is thinking…</p> : null}
              </div>
              <aside
                className={styles.producerControls}
                aria-label="Private producer controls"
                data-tutorial-target="botcast-cues"
              >
                <span className={styles.eyebrow}>Private line to host</span>
                <label>
                  Ask about…
                  <div>
                    <input value={askAboutDraft} onChange={(event) => setAskAboutDraft(event.target.value)} placeholder="a specific detail" />
                    <button
                      type="button"
                      disabled={busy || !producerCueReady || !askAboutDraft.trim()}
                      onClick={() => {
                        sendCue({ kind: "ask_about", detail: askAboutDraft.trim() });
                        setAskAboutDraft("");
                      }}
                    >Send</button>
                  </div>
                </label>
                <div className={styles.cueGrid}>
                  <button type="button" disabled={busy || !producerCueReady} onClick={() => sendCue({ kind: "press_harder" })}>Press harder</button>
                  <button type="button" disabled={busy || !producerCueReady} onClick={() => sendCue({ kind: "move_on" })}>Move on</button>
                  <button type="button" disabled={busy || !producerCueReady} onClick={() => sendCue({ kind: "lighten_up" })}>Lighten up</button>
                </div>
                <small>Control-room cues are persisted for replay but never spoken or attributed to you.</small>
              </aside>
            </div>
            {episode.status === "completed" ? (
              <button
                type="button"
                className={styles.returnButton}
                onClick={() => {
                  setEpisode(null);
                  if (selectedShowId) void loadEpisodes(selectedShowId);
                }}
              >Return to show</button>
            ) : null}
          </div>
        ) : replayEpisode && selectedShow ? (
          <div className={styles.replayLayout}>
            <div className={styles.replayHeader}>
              <div>
                <span className={styles.eyebrow}>From the archive</span>
                <h2>{replayEpisode.title}</h2>
                <p>{new Date(replayEpisode.startedAt).toLocaleString()} · {providerLabel(replayEpisode.provider)} · {replayEpisode.model ? modelLabels.get(replayEpisode.model) ?? replayEpisode.model : "Provider default"} · {episodeOutcomeLabel(replayEpisode)}</p>
              </div>
              <div className={styles.replayHeaderActions}>
                <button type="button" onClick={() => setReplayEpisode(null)}>Close replay</button>
                <button
                  type="button"
                  className={styles.dangerButton}
                  onClick={(event) => openEpisodeDeletion(replayEpisode, event.currentTarget)}
                  disabled={busy}
                >
                  Delete episode
                </button>
              </div>
            </div>
            {renderStage({
              show: selectedShow,
              currentEpisode: replayEpisode,
              host: replayHostBot,
              guest: replayGuestBot,
              shot: replayShot,
              activeMessage: replayActiveMessage,
              replay: true,
              guestDeparted: replayGuestDeparted,
            })}
            <div className={styles.replayControls} aria-label="Signal replay cameras">
              <button type="button" onClick={() => setReplayPlaying((value) => !value)}>{replayPlaying ? "Pause" : "Play"}</button>
              <input
                type="range"
                min={0}
                max={replayDurationMs}
                step={100}
                value={replayElapsedMs}
                onChange={(event) => setReplayElapsedMs(Number(event.target.value))}
                aria-label="Replay position"
              />
              <div className={styles.cameraButtons}>
                {(["auto", "left", "right", "wide"] as const).map((camera) => (
                  <button
                    key={camera}
                    type="button"
                    data-selected={replayCamera === camera ? "true" : undefined}
                    onClick={() => setReplayCamera(camera)}
                  >{camera[0]!.toUpperCase() + camera.slice(1)}</button>
                ))}
              </div>
            </div>
            <div className={styles.replayTranscript}>
              {replayEpisode.messages.map((message, index) => (
                <button
                  key={message.id}
                  type="button"
                  data-botcast-replay-row="true"
                  data-active={index === replayMessageIndex ? "true" : undefined}
                  onClick={() =>
                    setReplayElapsedMs(replayTimeline.messageStartMs[index] ?? 0)
                  }
                >
                  <strong>{botsById.get(message.botId)?.name ?? message.speakerRole}</strong>
                  <span>{message.content}</span>
                </button>
              ))}
            </div>
          </div>
        ) : selectedShow && dashboardAtmosphere ? (
          <div className={styles.showDashboard}>
            <section
              className={styles.showBrandPreview}
              data-atmosphere={dashboardAtmosphere.status}
              style={
                {
                  "--botcast-accent": selectedShow.accentColor,
                  ...(dashboardAtmosphere.imageUrl
                    ? {
                        "--botcast-dashboard-atmosphere": `url("${dashboardAtmosphere.imageUrl}")`,
                      }
                    : {}),
                } as CSSProperties
              }
              aria-label={`${selectedShow.name} show identity`}
            >
              <div className={styles.showBrandAtmosphere} aria-hidden="true" />
              <div className={styles.showBrandContent}>
                <SignalShowLogo show={selectedShow} />
                <div>
                  <span className={styles.eyebrow}>Show identity</span>
                  <h2>{selectedShow.name}</h2>
                  <p>{hostBot?.name ?? "Host"}</p>
                </div>
              </div>
            </section>
            {renderEpisodeSetup()}
            {renderArchive()}
          </div>
        ) : (
          <div className={styles.emptyStudio}>
            <span className={styles.logoMark} aria-hidden="true"><i /><i /><i /></span>
            <h1>Give a bot the keys to a studio.</h1>
            <p>Create a show from the producer desk on the left.</p>
          </div>
        )}
      </section>
      {deleteTarget ? (
        <div className={styles.deleteBackdrop}>
          <button
            type="button"
            className={styles.deleteBackdropDismiss}
            onClick={dismissDeletion}
            disabled={busy}
            tabIndex={-1}
            aria-label="Cancel deletion"
          />
          <section
            className={styles.deleteDialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="signal-delete-title"
            aria-describedby="signal-delete-description"
          >
            <span className={styles.eyebrow}>Permanent edit</span>
            <h2 id="signal-delete-title">{deleteConfirmationCopy(deleteTarget).title}</h2>
            <p id="signal-delete-description">{deleteConfirmationCopy(deleteTarget).body}</p>
            {deleteError ? <p className={styles.deleteError} role="alert">{deleteError}</p> : null}
            <div className={styles.deleteDialogActions}>
              <button
                ref={deleteCancelButtonRef}
                type="button"
                onClick={dismissDeletion}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.deleteConfirmButton}
                onClick={() => void deleteConfirmedTarget()}
                disabled={busy}
              >
                {busy ? "Removing…" : deleteConfirmationCopy(deleteTarget).action}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
    <PrismBlockingLoader
      open={artworkProgress !== null}
      title={artworkProgress?.title ?? "PRISM is working"}
      detail={artworkProgress?.detail ?? "Preparing your workspace."}
      stepLabel={artworkProgress?.stepLabel ?? "Working"}
      progress={artworkProgress?.progress}
      theme={theme}
    />
    </>
  );
}
