"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./SanctumAudioPlayer.module.css";

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const whole = Math.floor(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function SanctumAudioPlayer({
  src,
  label,
  emptyLabel = "Select a clip to audition",
}: {
  src: string | null;
  label: string | null;
  emptyLabel?: string;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setPlaying(false);
    setError(false);
    setCurrent(0);
    setDuration(0);
    if (!src) {
      audio.removeAttribute("src");
      audio.load();
      setLoading(false);
      return;
    }
    setLoading(true);
    audio.src = src;
    audio.load();
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = muted;
  }, [muted]);

  const progress = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  const empty = !src;

  return (
    <div className={styles.stage}>
      <div className={styles.labelBlock}>
        <span className={styles.kicker}>Sanctum player</span>
        <strong>{label?.trim() || emptyLabel}</strong>
      </div>
      <div
        className={styles.player}
        data-empty={empty ? "true" : undefined}
        data-playing={playing ? "true" : undefined}
        data-loading={loading ? "true" : undefined}
        data-error={error ? "true" : undefined}
        data-muted={muted ? "true" : undefined}
        style={{ ["--player-progress" as string]: `${progress}%` }}
      >
        <audio
          ref={audioRef}
          preload="metadata"
          onLoadedMetadata={() => {
            const audio = audioRef.current;
            setDuration(audio?.duration || 0);
            setLoading(false);
            setError(false);
          }}
          onTimeUpdate={() => {
            setCurrent(audioRef.current?.currentTime || 0);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setCurrent(0);
          }}
          onWaiting={() => setLoading(true)}
          onCanPlay={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError(true);
            setPlaying(false);
          }}
        />
        <button
          type="button"
          className={styles.toggle}
          disabled={empty || error}
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => {
            const audio = audioRef.current;
            if (!audio || empty) return;
            if (audio.paused) {
              void audio.play().catch(() => setError(true));
            } else {
              audio.pause();
            }
          }}
        >
          <span className={styles.playIcon} aria-hidden="true" />
        </button>
        <span className={styles.time} aria-hidden="true">
          <span>{formatClock(current)}</span>
          <span>/</span>
          <span>{formatClock(duration)}</span>
        </span>
        <label className={styles.progress}>
          <span className={styles.progressTrack} aria-hidden="true">
            <span className={styles.progressFill} />
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(duration, 0.001)}
            step={0.01}
            value={current}
            disabled={empty || error || duration <= 0}
            aria-label="Seek"
            onChange={(event) => {
              const next = Number(event.currentTarget.value);
              const audio = audioRef.current;
              if (!audio || !Number.isFinite(next)) return;
              audio.currentTime = next;
              setCurrent(next);
            }}
          />
        </label>
        <button
          type="button"
          className={styles.mute}
          disabled={empty}
          aria-label={muted ? "Unmute" : "Mute"}
          aria-pressed={muted}
          onClick={() => setMuted((value) => !value)}
        >
          <span className={styles.muteWaves} aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span className={styles.muteMark} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
