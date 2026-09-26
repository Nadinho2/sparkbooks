"use client";

import { useEffect, useRef, useState } from "react";

interface VoicePlayerProps {
  /** Storage path in the voice-notes bucket (e.g. "123/msg_abc.ogg") */
  storagePath: string;
  /** The transcribed text to show below the player */
  transcript: string | null;
}

const STATIC_BAR_HEIGHTS = [
  35, 60, 45, 75, 50, 85, 40, 65, 90, 55, 70, 30, 80, 60, 45, 65, 40, 50,
];

export function VoicePlayer({ storagePath, transcript }: VoicePlayerProps) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Fetch signed URL on mount
  useEffect(() => {
    let cancelled = false;
    async function fetchUrl() {
      try {
        const res = await fetch(
          `/api/messages/signed-url?path=${encodeURIComponent(storagePath)}`,
        );
        if (!res.ok) throw new Error("Failed to fetch");
        const { url } = await res.json();
        if (!cancelled) setSignedUrl(url);
      } catch {
        if (!cancelled) setError(true);
      }
    }
    fetchUrl();
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play();
      setPlaying(true);
    } else {
      audio.pause();
      setPlaying(false);
    }
  }

  function handleTimeUpdate() {
    if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
  }

  function handleLoadedMetadata() {
    if (audioRef.current) setDuration(audioRef.current.duration);
  }

  function handleEnded() {
    setPlaying(false);
    setCurrentTime(0);
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const t = Number(e.target.value);
    audio.currentTime = t;
    setCurrentTime(t);
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  // Loading state
  if (!signedUrl && !error) {
    return (
      <div className="flex items-center gap-2 text-xs text-ink-muted">
        <span className="inline-flex gap-0.5 items-end h-4 voice-wave-container">
          <span
            className="voice-wave-bar inline-block"
            style={{ height: "40%", animationDelay: "0s" }}
          />
          <span
            className="voice-wave-bar inline-block"
            style={{ height: "70%", animationDelay: "0.1s" }}
          />
          <span
            className="voice-wave-bar inline-block"
            style={{ height: "55%", animationDelay: "0.2s" }}
          />
          <span
            className="voice-wave-bar inline-block"
            style={{ height: "90%", animationDelay: "0.15s" }}
          />
          <span
            className="voice-wave-bar inline-block"
            style={{ height: "50%", animationDelay: "0.25s" }}
          />
        </span>
        <span>Loading audio…</span>
      </div>
    );
  }

  // Error state
  if (error || !signedUrl) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-ink-muted">
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="shrink-0"
        >
          <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4.5v4M8 11.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span>Audio unavailable</span>
        {transcript && (
          <span className="text-ink-muted/60 ml-1">
            &mdash; transcript below
          </span>
        )}
      </div>
    );
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div>
      <audio
        ref={audioRef}
        src={signedUrl}
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onError={() => setError(true)}
      />

      {/* Waveform + controls */}
      <div className="flex items-center gap-2.5">
        {/* Play/Pause button */}
        <button
          onClick={togglePlay}
          className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-spark/15 text-spark hover:bg-spark/25 transition-colors"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <rect x="2" y="2" width="3.5" height="10" rx="0.5" />
              <rect x="8.5" y="2" width="3.5" height="10" rx="0.5" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <path d="M3 2l10 5-10 5z" />
            </svg>
          )}
        </button>

        {/* Waveform bars */}
        <div className="flex items-end gap-px h-5 flex-1 voice-wave-container">
          {Array.from({ length: 18 }).map((_, i) => (
            <span
              key={i}
              className="voice-wave-bar inline-block"
              style={{
                height: playing
                  ? undefined
                  : `${STATIC_BAR_HEIGHTS[i % STATIC_BAR_HEIGHTS.length]}%`,
                animationPlayState: playing ? "running" : "paused",
                animationDelay: `${i * 0.06}s`,
                opacity: progress > (i / 18) * 100 ? 1 : 0.3,
              }}
            />
          ))}
        </div>

        {/* Time */}
        <span className="text-xs text-ink-muted font-mono shrink-0 min-w-[32px] text-right">
          {playing ? formatTime(currentTime) : formatTime(duration)}
        </span>
      </div>

      {/* Seek bar */}
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={currentTime}
        onChange={handleSeek}
        className="w-full mt-1.5 h-1 accent-spark cursor-pointer appearance-none bg-rule rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-spark"
        style={{ opacity: duration > 0 ? 1 : 0.3 }}
      />

      {/* Transcript */}
      {transcript && (
        <p className="mt-2 text-xs text-ink-muted italic leading-relaxed">
          &ldquo;{transcript}&rdquo;
        </p>
      )}
    </div>
  );
}
