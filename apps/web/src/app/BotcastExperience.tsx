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
import styles from "./botcast.module.css";

export interface BotcastBotSummary {
  id: string;
  name: string;
  color: string | null;
  glyph: string | null;
  online_enabled?: number | null;
}

export interface BotcastApiRequest {
  <T>(path: string, options?: RequestInit): Promise<T>;
}

export interface BotcastExperienceProps {
  bots: BotcastBotSummary[];
  request: BotcastApiRequest;
  preferredProvider: "local" | "openai" | "anthropic";
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Signal request failed.";
}

function runtimeLabel(runtimeMs: number | null): string {
  if (runtimeMs == null) return "Live";
  const totalSeconds = Math.max(0, Math.round(runtimeMs / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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

export function BotcastExperience({
  bots,
  request,
  preferredProvider,
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
  const [shows, setShows] = useState<BotcastShow[]>([]);
  const [selectedShowId, setSelectedShowId] = useState<string | null>(null);
  const [episodes, setEpisodes] = useState<BotcastEpisodeSummary[]>([]);
  const [episode, setEpisode] = useState<BotcastEpisode | null>(null);
  const [replayEpisode, setReplayEpisode] = useState<BotcastEpisode | null>(null);
  const [hostDraftId, setHostDraftId] = useState("");
  const [guestDraftId, setGuestDraftId] = useState("");
  const [topicDraft, setTopicDraft] = useState("");
  const [producerBriefDraft, setProducerBriefDraft] = useState("");
  const [askAboutDraft, setAskAboutDraft] = useState("");
  const [showNameDraft, setShowNameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [autoRun, setAutoRun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [replayCamera, setReplayCamera] = useState<BotcastCameraShot>("auto");
  const [replayElapsedMs, setReplayElapsedMs] = useState(0);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const advanceInFlightRef = useRef(false);
  const replayVoiceMessageIdRef = useRef<string | null>(null);
  const speakingTimerRef = useRef<number | null>(null);

  const selectedShow = shows.find((show) => show.id === selectedShowId) ?? null;
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

  const createShow = async (): Promise<void> => {
    if (!hostDraftId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await request<{ show: BotcastShow }>("/api/botcast/shows", {
        method: "POST",
        body: JSON.stringify({ hostBotId: hostDraftId }),
      });
      await loadShows();
      await selectShow(response.show);
      setHostDraftId("");
      setNotice(`${response.show.name} is on the slate.`);
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

  const generateAtmosphere = async (): Promise<void> => {
    if (!selectedShow) return;
    setBusy(true);
    setError(null);
    setNotice("Building a new camera-safe studio atmosphere…");
    try {
      const reset = await request<{ show: BotcastShow }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}`,
        { method: "PATCH", body: JSON.stringify({ regenerateAtmosphere: true }) },
      );
      setShows((current) =>
        current.map((show) => (show.id === reset.show.id ? reset.show : show)),
      );
      const generated = await request<ImageGenerationResponse>("/api/images/generate", {
        method: "POST",
        body: JSON.stringify({
          prompt: reset.show.atmosphere.prompt,
          size: "1536x1024",
          quality: "standard",
          preferredProvider,
        }),
      });
      const imageUrl = generated.image.displayUrl ?? generated.image.url;
      if (!imageUrl) throw new Error("Studio image generated without a usable local URL.");
      const saved = await request<{ show: BotcastShow }>(
        `/api/botcast/shows/${encodeURIComponent(selectedShow.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            atmosphereImageUrl: imageUrl,
            atmosphereImageId: generated.image.id,
          }),
        },
      );
      setShows((current) =>
        current.map((show) => (show.id === saved.show.id ? saved.show : show)),
      );
      setNotice("The new studio atmosphere is locked to this show.");
    } catch (generationError) {
      setNotice("The procedural studio fallback is active; no show setup was lost.");
      setError(errorMessage(generationError));
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
          }),
        },
      );
      setEpisode(response.episode);
      setReplayEpisode(null);
      setAutoRun(true);
      setTopicDraft("");
      setProducerBriefDraft("");
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
              preferredProvider,
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
      preferredProvider,
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
    const atmosphereStyle = {
      ["--botcast-accent" as string]: args.show.accentColor,
      ...(args.show.atmosphere.imageUrl
        ? { ["--botcast-atmosphere" as string]: `url("${args.show.atmosphere.imageUrl}")` }
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
        style={atmosphereStyle}
        aria-label={`Signal studio, ${args.shot} camera`}
      >
        <div className={styles.stageScene}>
          <div className={styles.atmosphere} aria-hidden="true" />
          <div className={styles.wordmark}>
            <span className={styles.logoMark} aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
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
              <span className={styles.mugLogo}><i /><i /><i /></span>
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
            >
              <span className={styles.showDot} />
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
      <div className={styles.createShowCard}>
        <label htmlFor="botcast-host-picker">Create a show</label>
        <select
          id="botcast-host-picker"
          value={hostDraftId}
          onChange={(event) => setHostDraftId(event.target.value)}
        >
          <option value="">Choose a host…</option>
          {eligibleBots
            .filter((bot) => !shows.some((show) => show.hostBotId === bot.id))
            .map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
        </select>
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
          <button type="button" onClick={() => void generateAtmosphere()} disabled={busy}>
            Regenerate studio
          </button>
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
        <button
          type="button"
          className={styles.goLiveButton}
          onClick={() => void startEpisode()}
          disabled={busy || !guestDraftId || !topicDraft.trim()}
        >
          Begin episode
        </button>
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
          <button key={item.id} type="button" onClick={() => void openReplay(item)}>
            <span className={styles.episodeNumber}>EP {String(episodes.length - index).padStart(2, "0")}</span>
            <strong>{item.title}</strong>
            <span>{botsById.get(item.guestBotId)?.name ?? "Guest"}</span>
            <small>
              {new Date(item.startedAt).toLocaleDateString()} · {runtimeLabel(item.runtimeMs)} · {item.status === "live" ? "Resume episode" : episodeOutcomeLabel(item)}
            </small>
          </button>
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
    <main className={styles.shell} data-botcast-mode="true">
      {renderLibrary()}
      <section className={styles.main}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>{episode ? "Live control room" : replayEpisode ? "Episode replay" : "Host-owned shows"}</span>
            {selectedShow ? (
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
              />
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
              <span>{episode.tensionStage === "calm" ? "Guest settled" : `Guest: ${episode.tensionStage}`}</span>
              <button type="button" onClick={() => setAutoRun((value) => !value)} disabled={episode.status === "completed"}>
                {autoRun ? "Pause rundown" : "Resume rundown"}
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
                <p>{new Date(replayEpisode.startedAt).toLocaleString()} · {episodeOutcomeLabel(replayEpisode)}</p>
              </div>
              <button type="button" onClick={() => setReplayEpisode(null)}>Close replay</button>
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
        ) : selectedShow ? (
          <div className={styles.showDashboard}>
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
    </main>
  );
}
