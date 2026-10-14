import { useMemo } from "react";
import {
  ArrowRight,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
} from "lucide-react";
import { time, type Timer } from "./model";
import { cueMoments, currentSegment } from "./zen";

type Props = {
  timer: Timer;
  position: number;
  playing: boolean;
  busy: boolean;
  muted: boolean;
  error: string;
  onPlay: () => void;
  onRestart: () => void;
  onMute: () => void;
};

export function ZenMode({
  timer,
  position,
  playing,
  busy,
  muted,
  error,
  onPlay,
  onRestart,
  onMute,
}: Props) {
  const moments = useMemo(() => cueMoments(timer), [timer]);
  const segment = currentSegment(moments, timer.duration, position);
  const tracks = segment.current?.tracks ?? [];
  const remaining = Math.ceil(segment.remaining);
  const names = tracks.map((t) => t.name).join(" · ");
  const nextNames = segment.next?.tracks.map((t) => t.name).join(" · ");
  const state = busy
    ? "Подготовка звука…"
    : segment.finished
      ? "Завершено"
      : playing
        ? ""
        : position > 0
          ? "На паузе"
          : "Готово к началу";
  const playLabel = busy
    ? "Запуск…"
    : playing
      ? "Пауза"
      : segment.finished
        ? "Начать снова"
        : position > 0
          ? "Продолжить"
          : "Запустить";
  const caption = segment.finished
    ? "Последовательность завершена"
    : nextNames
      ? nextNames
      : timer.loop
        ? "Новый цикл"
        : "Завершение";

  return (
    <div
      className="zen-mode"
      onKeyDown={(event) => {
        if (
          event.code === "Space" &&
          !(event.target as HTMLElement).closest("button")
        ) {
          event.preventDefault();
          if (!busy) onPlay();
        }
      }}
    >
      <header className="zen-header">
        <span>Дзен-режим</span>
        <span className="zen-timer-name">{timer.name}</span>
      </header>
      <div
        className={`zen-segment color-${tracks[0]?.color ?? "ink"} ${segment.finished ? "is-finished" : ""}`}
      >
        <div
          className="zen-segment-fill"
          aria-hidden="true"
          style={{ transform: `scaleX(${segment.progress})` }}
        />
        <div
          className="zen-segment-cursor"
          aria-hidden="true"
          style={{ left: `${segment.progress * 100}%` }}
        />
        <div className="zen-segment-content">
          <div className="zen-segment-overline">
            <span>
              {segment.finished
                ? "Готово"
                : tracks.length
                  ? "Сейчас"
                  : moments.length
                    ? "До первого события"
                    : "Без событий"}
            </span>
            <span role="status">{state}</span>
          </div>
          <div
            className={`zen-current ${tracks.length > 1 ? "zen-current-multiple" : ""}`}
            aria-live="polite"
            aria-atomic="true"
          >
            {segment.finished ? (
              <h2>Готово</h2>
            ) : tracks.length ? (
              tracks.map((track) => (
                <h2 key={track.id} className={`color-${track.color}`}>
                  {tracks.length > 1 && <i aria-hidden="true" />}
                  {track.name}
                </h2>
              ))
            ) : (
              <h2>{moments.length ? "Подготовка" : "Тихий интервал"}</h2>
            )}
          </div>
          <div
            className="zen-segment-remaining"
            role="timer"
            aria-label={
              segment.finished
                ? caption
                : `Через ${remaining} секунд: ${caption}`
            }
          >
            {!segment.finished && (
              <strong>
                {remaining < 60 ? (
                  <>
                    {remaining}
                    <small>с</small>
                  </>
                ) : (
                  time(remaining)
                )}
              </strong>
            )}
            <span
              className="zen-upcoming"
              aria-live="polite"
              aria-atomic="true"
            >
              {!segment.finished && <ArrowRight size={20} aria-hidden="true" />}
              <span>{caption}</span>
            </span>
          </div>
        </div>
        <div className="zen-segment-scale" aria-hidden="true">
          <span>{time(segment.start)}</span>
          <span>{time(segment.end)}</span>
        </div>
      </div>
      {segment.finished && (
        <div className="zen-next" aria-live="polite" aria-atomic="true">
          <span>Последнее</span>
          <ArrowRight size={16} aria-hidden="true" />
          <strong>{names || "Тихий интервал"}</strong>
        </div>
      )}
      <footer className="zen-footer">
        <div className="zen-controls" aria-busy={busy}>
          <button
            className="icon-btn"
            aria-label="Вернуться в начало"
            title="Вернуться в начало"
            onClick={onRestart}
          >
            <RotateCcw size={20} />
          </button>
          <button
            className="main-play"
            onClick={onPlay}
            disabled={busy}
            aria-label={playLabel}
          >
            {busy ? (
              <LoaderCircle size={20} className="spinning" />
            ) : playing ? (
              <Pause size={20} fill="currentColor" />
            ) : (
              <Play size={20} fill="currentColor" />
            )}
            <span>{playLabel}</span>
          </button>
        </div>
        <div className="zen-view-controls">
          <button
            className={`zen-sound-button ${muted ? "is-muted" : ""}`}
            onClick={onMute}
            aria-label={muted ? "Включить звук" : "Выключить звук"}
            aria-pressed={muted}
          >
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            <span>{muted ? "Без звука" : "Звук включён"}</span>
          </button>
        </div>
      </footer>
      {error && (
        <p className="zen-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
