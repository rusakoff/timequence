import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Expand,
  Headphones,
  LoaderCircle,
  Minus,
  Pause,
  Pencil,
  Play,
  Plus,
  Radio,
  Redo2,
  Repeat2,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Square,
  Timer as TimerIcon,
  Trash2,
  Undo2,
  Volume2,
  VolumeX,
  Waves,
  Wind,
  X,
} from "lucide-react";
import { AudioEngine, SampleLoadError } from "./audio";
import { getSound } from "./sounds";
import {
  clamp,
  BASE_CELL_WIDTH,
  GRID_SECOND,
  MIN_ZOOM,
  MAX_ZOOM,
  rulerInterval,
  snapSecond,
  restoreTimers,
  initialTimers,
  makeTimer,
  makeTrack,
  moveEvent,
  repeatEvent,
  resizeTimer,
  sounds,
  time,
  uid,
  type EventMode,
  type SoundEvent,
  type SoundId,
  type Timer,
  type Track,
} from "./model";

const STORAGE = "timequence.timers.v2";
const LEGACY_STORAGE = "timequence.timers.v1";
const SOUND_ICONS = {
  bell: Bell,
  pulse: Activity,
  bowl: Waves,
  chime: Sparkles,
  wood: Radio,
  air: Wind,
};
type Selection = { track: string; event?: string } | null;
type Drag = {
  track: string;
  event: string;
  startX: number;
  at: number;
  duration: number;
  nextAt: number;
  nextDuration: number;
  resize: boolean;
  moved: boolean;
  target: string;
  scale: number;
};
type Modal = "create" | "edit" | "sounds" | "help" | "delete" | "focus" | null;

function Waveform({
  seed = 1,
  large = false,
  sound,
}: {
  seed?: number;
  large?: boolean;
  sound?: SoundId;
}) {
  const waveform = sound ? getSound(sound).waveform : undefined;
  return (
    <span className={`waveform ${large ? "large" : ""}`} aria-hidden="true">
      {Array.from({ length: large ? 66 : 21 }, (_, i) => (
        <i
          key={i}
          style={{
            height: `${waveform ? 4 + 96 * Math.sqrt(waveform[Math.floor((i * waveform.length) / (large ? 66 : 21))]) : 16 + Math.abs(Math.sin(i * 1.7 + seed) * Math.cos(i * 0.63 + seed)) * 84}%`,
          }}
        />
      ))}
    </span>
  );
}
function MiniSequence({ timer }: { timer: Timer }) {
  return (
    <span className="mini-sequence" aria-hidden="true">
      {timer.tracks.slice(0, 3).map((t, i) => (
        <span key={t.id}>
          {t.events.slice(0, 14).map((e) => (
            <i
              key={e.id}
              className={i === 1 ? "accent" : ""}
              style={{
                left: `${(e.at / timer.duration) * 95}%`,
                width:
                  e.mode === "hold"
                    ? `${Math.max(4, (e.duration / timer.duration) * 95)}%`
                    : "4px",
              }}
            />
          ))}
        </span>
      ))}
    </span>
  );
}
function Dialog({
  children,
  close,
  className = "",
  label,
}: {
  children: ReactNode;
  close: () => void;
  className?: string;
  label: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!;
    const previous = document.activeElement as HTMLElement | null;
    el.showModal();
    return () => {
      el.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-label={label}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const b = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            close();
        }
      }}
    >
      <button
        className="icon-btn dialog-close"
        aria-label="Закрыть"
        onClick={close}
      >
        <X size={20} />
      </button>
      {children}
    </dialog>
  );
}
function TimerForm({
  timer,
  onSave,
  close,
}: {
  timer?: Timer;
  onSave: (name: string, duration: number) => void;
  close: () => void;
}) {
  const [name, setName] = useState(timer?.name ?? "");
  const [duration, setDuration] = useState(timer?.duration ?? 300);
  const removed =
    timer?.tracks.reduce(
      (sum, t) => sum + t.events.filter((e) => e.at >= duration).length,
      0,
    ) ?? 0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim() && duration >= 5 && duration <= 3600)
          onSave(name.trim(), duration);
      }}
    >
      <span className="eyebrow">ВАША ПОСЛЕДОВАТЕЛЬНОСТЬ</span>
      <h2>{timer ? "Настройки таймера" : "Начнём с чистого листа"}</h2>
      <p className="muted">Любой ритм. Для всего, что важно вам.</p>
      <label className="form-field">
        Название
        <input
          autoFocus
          required
          maxLength={60}
          placeholder="Например, Мой ритм"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="form-field">
        Длительность, в секундах
        <input
          type="number"
          min="5"
          max="3600"
          step="1"
          required
          value={duration || ""}
          onChange={(e) => setDuration(Number(e.target.value))}
        />
        <span className="field-note">
          {time(duration)} · от 5 секунд до 60 минут
        </span>
      </label>
      {removed > 0 && (
        <p className="inline-warning">
          За новой границей таймера останется {removed} событий. Они будут
          удалены; изменение можно отменить.
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" className="btn secondary" onClick={close}>
          Отмена
        </button>
        <button
          type="submit"
          className="btn primary"
          disabled={!name.trim() || duration < 5 || duration > 3600}
        >
          {timer ? "Сохранить" : "Создать таймер"}
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}

export default function App() {
  const [storageMessage, setStorageMessage] = useState("");
  const [timers, setTimers] = useState<Timer[]>(() => {
    try {
      const raw =
        localStorage.getItem(STORAGE) ?? localStorage.getItem(LEGACY_STORAGE);
      if (raw) {
        const restored = restoreTimers(JSON.parse(raw));
        if (restored) return restored;
      }
    } catch {
      /* Keep the editor usable when storage is unavailable. */
    }
    return initialTimers();
  });
  const [activeId, setActiveId] = useState(() => timers[0]?.id ?? "");
  const timer = timers.find((t) => t.id === activeId) ?? timers[0];
  const [selection, setSelection] = useState<Selection>(() =>
    timers[0]?.tracks[1]
      ? {
          track: timers[0].tracks[1].id,
          event: timers[0].tracks[1].events[1]?.id,
        }
      : null,
  );
  const [modal, setModal] = useState<Modal>(null);
  const [soundChoice, setSoundChoice] = useState<SoundId>("nepal-bell");
  const [soundGroup, setSoundGroup] = useState<"sample" | "synth">("sample");
  const [previewState, setPreviewState] = useState<{
    sound: SoundId;
    status: "loading" | "playing";
  } | null>(null);
  const [previewError, setPreviewError] = useState("");
  const previewToken = useRef(0);
  const [soundAction, setSoundAction] = useState<"add" | "replace">("add");
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState(0);
  const [volume, setVolume] = useState(65);
  const [mode, setMode] = useState<EventMode>("hit");
  const [repeatEvery, setRepeatEvery] = useState(30);
  const [toast, setToast] = useState("");
  const [history, setHistory] = useState<Timer[][]>([]);
  const [future, setFuture] = useState<Timer[][]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const movedRef = useRef(false);
  const engine = useRef(new AudioEngine());
  const previewEngine = useRef(new AudioEngine());
  const stageRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({
    left: 0,
    width: 1000,
    label: 184,
  });
  const zoomScroll = useRef<number | null>(null);
  const pixelsPerSecond = BASE_CELL_WIDTH * (timer?.zoom ?? 0.5);
  const transportToken = useRef(0);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () =>
      setViewport({
        left: stage.scrollLeft,
        width: stage.clientWidth,
        label:
          (stage.querySelector(".track-column-caption") as HTMLElement | null)
            ?.offsetWidth ?? 184,
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    stage.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      stage.removeEventListener("scroll", measure);
    };
  }, [timer?.id]);

  useLayoutEffect(() => {
    if (zoomScroll.current !== null && stageRef.current) {
      stageRef.current.scrollLeft = zoomScroll.current * pixelsPerSecond;
      zoomScroll.current = null;
    }
  }, [pixelsPerSecond]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !playing) return;
    const x = position * pixelsPerSecond;
    const visibleWidth = stage.clientWidth - viewport.label - 18;
    if (x < stage.scrollLeft || x > stage.scrollLeft + visibleWidth - 16) {
      stage.scrollLeft = Math.max(0, x - visibleWidth * 0.3);
    }
  }, [playing, position, pixelsPerSecond, viewport.label]);

  function changeZoom(value: number) {
    if (!timer || drag) return;
    const zoom = clamp(value, MIN_ZOOM, MAX_ZOOM);
    if (zoom === timer.zoom) return;
    zoomScroll.current = (stageRef.current?.scrollLeft ?? 0) / pixelsPerSecond;
    setTimers((current) =>
      current.map((t) => (t.id === timer.id ? { ...t, zoom } : t)),
    );
  }
  const selectedTrack = timer?.tracks.find((t) => t.id === selection?.track);
  const selectedEvent = selectedTrack?.events.find(
    (e) => e.id === selection?.event,
  );
  const locked = playing || busy;
  const totalEvents =
    timer?.tracks.reduce((n, t) => n + t.events.length, 0) ?? 0;
  const closeModal = () => {
    stopPreview();
    setModal(null);
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(timers));
      setStorageMessage("");
    } catch {
      setStorageMessage(
        "Не удалось сохранить. Проверьте свободное место и разрешения браузера.",
      );
    }
  }, [timers]);
  useEffect(() => {
    if (!toast) return;
    const handle = window.setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(handle);
  }, [toast]);
  useEffect(
    () => () => {
      engine.current.stop();
      previewEngine.current.stop();
    },
    [],
  );
  const commit = useCallback(
    (next: Timer[]) => {
      setHistory((h) => [...h.slice(-39), timers]);
      setFuture([]);
      setTimers(next);
    },
    [timers],
  );
  const updateTimer = (next: Timer) =>
    commit(timers.map((t) => (t.id === next.id ? next : t)));
  const updateTrack = (id: string, change: Partial<Track>) => {
    if (timer)
      updateTimer({
        ...timer,
        tracks: timer.tracks.map((t) =>
          t.id === id ? { ...t, ...change } : t,
        ),
      });
  };
  const updateEvent = (change: Partial<SoundEvent>) => {
    if (selectedTrack && selectedEvent)
      updateTrack(selectedTrack.id, {
        events: selectedTrack.events.map((e) =>
          e.id === selectedEvent.id ? { ...e, ...change } : e,
        ),
      });
  };
  function undo() {
    if (locked || !history.length) return;
    const prev = history[history.length - 1];
    setFuture((f) => [timers, ...f]);
    setHistory((h) => h.slice(0, -1));
    setTimers(prev);
    setPosition(0);
    setSelection(null);
  }
  function redo() {
    if (locked || !future.length) return;
    setHistory((h) => [...h, timers]);
    setTimers(future[0]);
    setFuture((f) => f.slice(1));
    setPosition(0);
    setSelection(null);
  }
  function stop(reset = false) {
    transportToken.current++;
    engine.current.stop();
    setPlaying(false);
    setBusy(false);
    setPosition(reset ? 0 : engine.current.position);
  }
  async function togglePlay() {
    if (!timer || busy) return;
    if (playing) {
      stop();
      return;
    }
    const token = ++transportToken.current;
    setBusy(true);
    stopPreview();
    try {
      const started = await engine.current.start(
        timer,
        position >= timer.duration ? 0 : position,
        volume,
      );
      if (started && token === transportToken.current) setPlaying(true);
    } catch (error) {
      if (token === transportToken.current)
        setToast(
          error instanceof SampleLoadError
            ? error.message
            : "Не удалось включить звук. Проверьте разрешения браузера и попробуйте снова.",
        );
    } finally {
      if (token === transportToken.current) setBusy(false);
    }
  }
  function stopPreview() {
    previewToken.current++;
    previewEngine.current.stop();
    setPreviewState(null);
    setPreviewError("");
  }
  async function preview(sound: SoundId, level = 70) {
    if (previewState?.sound === sound) {
      stopPreview();
      return;
    }
    const token = ++previewToken.current;
    setPreviewError("");
    setPreviewState({ sound, status: "loading" });
    try {
      const started = await previewEngine.current.preview(
        sound,
        level,
        volume,
        () => {
          if (token === previewToken.current) setPreviewState(null);
        },
      );
      if (token === previewToken.current)
        setPreviewState(started ? { sound, status: "playing" } : null);
    } catch (error) {
      if (token !== previewToken.current) return;
      const message =
        error instanceof SampleLoadError
          ? error.message
          : "Не удалось включить звук. Попробуйте ещё раз.";
      setPreviewState(null);
      setPreviewError(message);
      if (modal !== "sounds") setToast(message);
    }
  }
  useEffect(() => {
    engine.current.setVolume(volume);
    previewEngine.current.setVolume(volume);
  }, [volume]);
  useEffect(() => {
    if (!playing || !timer) return;
    let restarting = false;
    const handle = window.setInterval(() => {
      if (restarting) return;
      if (engine.current.context?.state !== "running") {
        stop();
        setToast(
          "Браузер приостановил звук. Нажмите «Продолжить», чтобы вернуться к таймеру.",
        );
        return;
      }
      const next = engine.current.position;
      if (next >= timer.duration) {
        if (timer.loop) {
          restarting = true;
          engine.current
            .start(timer, 0, volume)
            .then((started) => {
              if (started) setPosition(0);
            })
            .catch(() => {
              stop();
              setToast("Не удалось повторить таймер. Нажмите «Продолжить».");
            })
            .finally(() => {
              restarting = false;
            });
        } else {
          engine.current.stop();
          setPlaying(false);
          setPosition(timer.duration);
          setToast("Последовательность завершена. Можно начать снова.");
        }
      } else setPosition(next);
    }, 40);
    return () => window.clearInterval(handle);
  }, [playing, timer, volume]);
  useEffect(() => {
    if (!playing) return;
    let wake: WakeLockSentinel | undefined;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState === "visible" && "wakeLock" in navigator)
        try {
          const next = await navigator.wakeLock.request("screen");
          if (cancelled) await next.release();
          else wake = next;
        } catch {
          /* Optional capability: playback still works without it. */
        }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      cancelled = true;
      void wake?.release();
      document.removeEventListener("visibilitychange", acquire);
    };
  }, [playing]);
  function switchTimer(id: string) {
    stop(true);
    stopPreview();
    setActiveId(id);
    setSelection(null);
  }
  function removeEvent() {
    if (!selectedTrack || !selectedEvent || locked) return;
    updateTrack(selectedTrack.id, {
      events: selectedTrack.events.filter((e) => e.id !== selectedEvent.id),
    });
    setSelection({ track: selectedTrack.id });
    setToast("Событие удалено. Его можно вернуть кнопкой отмены.");
  }
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (
        modal ||
        (e.target instanceof HTMLElement &&
          e.target.closest("input,select,textarea,[contenteditable]"))
      )
        return;
      if (
        e.code === "Space" &&
        !(
          e.target instanceof HTMLElement &&
          e.target.closest("button,[role=button]")
        )
      ) {
        e.preventDefault();
        void togglePlay();
      }
      if ((e.metaKey || e.ctrlKey) && e.code === "KeyZ") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !(e.target instanceof HTMLElement && e.target.closest("button"))
      ) {
        e.preventDefault();
        removeEvent();
      }
      if (e.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });

  function addEvent(track: Track, at: number) {
    if (locked || movedRef.current || !timer) return;
    const existing = track.events.find((e) => Math.abs(e.at - at) < 0.01);
    if (existing) {
      setSelection({ track: track.id, event: existing.id });
      return;
    }
    if (track.events.length >= 1000) {
      setToast("На одной дорожке можно разместить до 1000 событий.");
      return;
    }
    const e: SoundEvent = {
      id: uid(),
      at,
      duration:
        mode === "hold" ? Math.min(10, timer.duration - at) : GRID_SECOND,
      mode,
    };
    updateTrack(track.id, {
      events: [...track.events, e].sort((a, b) => a.at - b.at),
    });
    setSelection({ track: track.id, event: e.id });
  }
  function beginDrag(
    e: React.PointerEvent<HTMLElement>,
    track: Track,
    event: SoundEvent,
    resize = false,
  ) {
    if (locked || !timer || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    movedRef.current = false;
    const row = e.currentTarget.closest("[data-track-row]")!;
    const d: Drag = {
      track: track.id,
      event: event.id,
      startX: e.clientX,
      at: event.at,
      duration: event.duration,
      nextAt: event.at,
      nextDuration: event.duration,
      resize,
      moved: false,
      target: track.id,
      scale: row.getBoundingClientRect().width / timer.duration,
    };
    dragRef.current = d;
    setDrag(d);
    setSelection({ track: track.id, event: event.id });
  }
  useEffect(() => {
    if (!drag || !timer) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current!;
      const delta = e.clientX - d.startX;
      if (Math.abs(delta) < 5 && !d.moved) return;
      const event = timer.tracks
        .find((t) => t.id === d.track)!
        .events.find((ev) => ev.id === d.event)!;
      const seconds = snapSecond(delta / d.scale);
      const targetRow = document
        .elementsFromPoint(e.clientX, e.clientY)
        .find((el) => el.hasAttribute("data-track-row"));
      const next = {
        ...d,
        moved: true,
        nextAt: d.resize
          ? d.at
          : moveEvent(event, d.at + seconds, timer.duration).at,
        nextDuration: d.resize
          ? clamp(d.duration + seconds, 1, timer.duration - d.at)
          : d.duration,
        target: d.resize
          ? d.track
          : (targetRow?.getAttribute("data-track-row") ?? d.target),
      };
      dragRef.current = next;
      setDrag(next);
    };
    const finish = (cancelled = false) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.moved && !cancelled) {
        const source = timer.tracks.find((t) => t.id === d.track)!;
        const event = source.events.find((e) => e.id === d.event)!;
        const target = timer.tracks.find((t) => t.id === d.target)!;
        if (
          target.events.some(
            (e) => e.id !== event.id && Math.abs(e.at - d.nextAt) < 0.01,
          )
        )
          setToast("В этот момент уже есть сигнал. Выберите соседнюю позицию.");
        else if (d.target !== d.track && target.events.length >= 1000)
          setToast("На этой дорожке уже 1000 событий.");
        else {
          const changed = { ...event, at: d.nextAt, duration: d.nextDuration };
          updateTimer({
            ...timer,
            tracks: timer.tracks.map((t) => ({
              ...t,
              events: [
                ...t.events.filter((e) => e.id !== event.id),
                ...(t.id === d.target ? [changed] : []),
              ].sort((a, b) => a.at - b.at),
            })),
          });
          setSelection({ track: d.target, event: d.event });
        }
      }
      movedRef.current = d.moved;
      window.setTimeout(() => {
        movedRef.current = false;
      }, 0);
      dragRef.current = null;
      setDrag(null);
    };
    const onUp = () => finish();
    const onCancel = () => finish(true);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    // Drag data is held in a ref so one gesture creates one undo operation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  const gridWidth = (timer?.duration ?? 0) * pixelsPerSecond;
  const tickInterval = rulerInterval(pixelsPerSecond);
  // Mount only visible one-second cells, including a small keyboard/scroll buffer.
  const firstSecond = Math.max(
    0,
    Math.floor(viewport.left / pixelsPerSecond) - 12,
  );
  const lastSecond = Math.min(
    timer?.duration ?? 0,
    Math.ceil(
      (viewport.left + viewport.width - viewport.label) / pixelsPerSecond,
    ) + 12,
  );
  const visibleSeconds = Array.from(
    { length: Math.max(0, lastSecond - firstSecond) },
    (_, i) => firstSecond + i,
  );
  const rulerSeconds = visibleSeconds.filter(
    (second) =>
      second % tickInterval === 0 &&
      (timer!.duration - second) * pixelsPerSecond >= 40,
  );
  const nowLabel = playing
    ? "Сейчас играет"
    : position >= (timer?.duration ?? 1)
      ? "Завершён"
      : position > 0
        ? "На паузе"
        : "Готов к запуску";
  const drawEvent = (track: Track, ev: SoundEvent) => {
    const d = drag?.event === ev.id ? drag : null;
    const at = d?.nextAt ?? ev.at;
    const duration = d?.nextDuration ?? ev.duration;
    const selected = selection?.event === ev.id;
    const active =
      playing &&
      position >= at &&
      position < at + (ev.mode === "hold" ? duration : 0.7);
    return (
      <div
        role="button"
        tabIndex={locked ? -1 : 0}
        aria-disabled={locked}
        aria-label={`${track.name}, ${time(at)}, ${ev.mode === "hit" ? "короткий сигнал" : `${duration} секунд`}`}
        aria-pressed={selected}
        key={ev.id}
        className={`sound-event ${pixelsPerSecond < 20 ? "compact" : ""} ${ev.mode} color-${track.color} ${selected ? "selected" : ""} ${active ? "sounding" : ""} ${d?.moved ? "dragging" : ""}`}
        style={{
          left: `${(at / timer!.duration) * 100}%`,
          width:
            ev.mode === "hold"
              ? Math.max(4, duration * pixelsPerSecond - 2)
              : Math.max(4, pixelsPerSecond - 2),
        }}
        title={`${time(at)} · ${ev.mode === "hit" ? "Короткий сигнал" : `${duration} с`}`}
        onPointerDown={(e) => beginDrag(e, track, ev)}
        onClick={(e) => {
          e.stopPropagation();
          if (!locked) setSelection({ track: track.id, event: ev.id });
        }}
        onKeyDown={(e) => {
          if (locked) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSelection({ track: track.id, event: ev.id });
          }
          if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            e.stopPropagation();
            updateTrack(track.id, {
              events: track.events.filter((x) => x.id !== ev.id),
            });
            setSelection({ track: track.id });
          }
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            e.stopPropagation();
            const next = moveEvent(
              ev,
              ev.at + (e.key === "ArrowLeft" ? -GRID_SECOND : GRID_SECOND),
              timer!.duration,
            );
            if (!track.events.some((x) => x.id !== ev.id && x.at === next.at))
              updateTrack(track.id, {
                events: track.events.map((x) => (x.id === ev.id ? next : x)),
              });
          }
        }}
      >
        {ev.mode === "hit" ? (
          <span className="hit-mark">
            <i />
            <i />
            <i />
          </span>
        ) : (
          <Waveform seed={at + 1} />
        )}
        {ev.mode === "hold" && (
          <span
            className="resize-handle"
            title="Потяните, чтобы изменить длительность"
            onPointerDown={(e) => beginDrag(e, track, ev, true)}
          >
            <i />
            <i />
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          href="#"
          className="brand"
          aria-label="Timequence — главная"
          onClick={(e) => {
            e.preventDefault();
            stop(true);
          }}
        >
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          timequence<span className="beta">BETA</span>
        </a>
        <nav>
          <span className="nav-current">Мои таймеры</span>
          <button
            aria-label="Как это работает"
            onClick={() => setModal("help")}
          >
            Как это работает <ArrowRight size={14} />
          </button>
        </nav>
        <span className={`save-state ${storageMessage ? "error" : ""}`}>
          <span className="status-dot" />
          {storageMessage ? "Не сохранено" : "Сохранено на устройстве"}
        </span>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-heading">
            <span className="eyebrow">МОИ ТАЙМЕРЫ</span>
            <span className="count">
              {timers.length.toString().padStart(2, "0")}
            </span>
          </div>
          <button
            className="new-timer"
            onClick={() => {
              stop();
              setModal("create");
            }}
            disabled={timers.length >= 100}
          >
            <Plus size={18} />
            Новый таймер
          </button>
          <div className="timer-list">
            {timers.map((t, index) => (
              <button
                className={`timer-card ${t.id === timer?.id ? "current" : ""}`}
                key={t.id}
                aria-current={t.id === timer?.id ? "true" : undefined}
                onClick={() => switchTimer(t.id)}
              >
                <div className="timer-card-top">
                  <span className="timer-number">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>{time(t.duration)}</span>
                  {t.id === timer?.id && <span className="active-dot" />}
                </div>
                <strong>{t.name}</strong>
                <MiniSequence timer={t} />
                <span className="timer-card-meta">
                  {t.tracks.length} дорожек <span>·</span>{" "}
                  {t.tracks.reduce((n, tr) => n + tr.events.length, 0)} событий
                </span>
              </button>
            ))}
          </div>
          <div className="sidebar-bottom">
            <span className="little-orbit">
              <Activity size={20} />
            </span>
            <p>
              У времени есть ритм.
              <br />
              <span>Задайте свой.</span>
            </p>
            <button className="text-button" onClick={() => setModal("help")}>
              <CircleHelp size={15} /> Быстрый старт
            </button>
            <span className="version">TIMEQUENCE / V.01</span>
          </div>
        </aside>
        <main>
          {storageMessage && (
            <div className="storage-error" role="alert">
              {storageMessage}
            </div>
          )}
          {!timer ? (
            <div className="empty-page">
              <span className="empty-icon">
                <TimerIcon size={38} />
              </span>
              <h1>Время для вашего ритма</h1>
              <p>Создайте первый таймер и расставьте звуки на шкале.</p>
              <button
                className="btn primary"
                onClick={() => setModal("create")}
              >
                <Plus size={18} />
                Создать таймер
              </button>
              {history.length > 0 && (
                <button
                  className="text-button"
                  onClick={undo}
                  style={{ marginTop: 20 }}
                >
                  <Undo2 size={15} />
                  Отменить удаление
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="editor-heading">
                <div>
                  <div className="breadcrumb">
                    Мои таймеры <span>/</span> <span>Редактор</span>
                  </div>
                  <div className="title-row">
                    <h1>{timer.name}</h1>
                    <button
                      className="icon-btn title-edit"
                      title="Переименовать и настроить"
                      aria-label="Настройки таймера"
                      disabled={locked}
                      onClick={() => setModal("edit")}
                    >
                      <Pencil size={18} />
                    </button>
                  </div>
                  <p className="editor-subtitle">
                    Расставьте звуки. Почувствуйте свой ритм.
                  </p>
                </div>
                <div className="heading-actions">
                  <button
                    className="icon-btn"
                    title="Создать копию таймера"
                    aria-label="Создать копию таймера"
                    disabled={locked || timers.length >= 100}
                    onClick={() => {
                      const copy: Timer = {
                        ...structuredClone(timer),
                        id: uid(),
                        name: `${timer.name} — копия`.slice(0, 60),
                        tracks: timer.tracks.map((t) => ({
                          ...t,
                          id: uid(),
                          events: t.events.map((e) => ({ ...e, id: uid() })),
                        })),
                      };
                      commit([...timers, copy]);
                      setActiveId(copy.id);
                      setSelection(null);
                      setPosition(0);
                      setToast("Копия таймера создана.");
                    }}
                  >
                    <Copy size={18} />
                  </button>
                  <button
                    className="icon-btn"
                    title="Удалить таймер"
                    aria-label="Удалить таймер"
                    disabled={locked}
                    onClick={() => setModal("delete")}
                  >
                    <Trash2 size={18} />
                  </button>
                  <button
                    className="btn secondary focus-button"
                    onClick={() => setModal("focus")}
                  >
                    <Expand size={16} />
                    Режим таймера
                  </button>
                </div>
              </div>
              <section
                className="sequencer"
                aria-label="Редактор звуковой последовательности"
              >
                <div className="sequencer-toolbar">
                  <div className="timeline-settings">
                    <button
                      className="duration-button"
                      disabled={locked}
                      onClick={() => setModal("edit")}
                      title="Изменить длительность"
                    >
                      <TimerIcon size={17} />
                      <span>Длительность</span>
                      <strong>{time(timer.duration)}</strong>
                      <ChevronDown size={13} />
                    </button>
                    <span className="toolbar-divider" />
                    <div className="zoom-control">
                      <span className="zoom-caption">Масштаб</span>
                      <button
                        className="icon-btn small"
                        aria-label="Уменьшить масштаб"
                        title="Отдалить"
                        disabled={!!drag || timer.zoom <= MIN_ZOOM}
                        onClick={() => changeZoom(timer.zoom - 0.25)}
                      >
                        <Minus size={15} />
                      </button>
                      <input
                        type="range"
                        aria-label="Масштаб временной шкалы"
                        aria-valuetext={`${Math.round(timer.zoom * 100)} процентов`}
                        min="25"
                        max="400"
                        step="25"
                        value={timer.zoom * 100}
                        disabled={!!drag}
                        onChange={(e) =>
                          changeZoom(Number(e.target.value) / 100)
                        }
                      />
                      <button
                        className="icon-btn small"
                        aria-label="Увеличить масштаб"
                        title="Приблизить"
                        disabled={!!drag || timer.zoom >= MAX_ZOOM}
                        onClick={() => changeZoom(timer.zoom + 0.25)}
                      >
                        <Plus size={15} />
                      </button>
                      <output>{Math.round(timer.zoom * 100)}%</output>
                    </div>
                  </div>
                  <div className="history-controls">
                    <button
                      className="icon-btn small"
                      title="Отменить · ⌘Z"
                      aria-label="Отменить"
                      disabled={locked || !history.length}
                      onClick={undo}
                    >
                      <Undo2 size={17} />
                    </button>
                    <button
                      className="icon-btn small"
                      title="Повторить · ⌘⇧Z"
                      aria-label="Повторить изменение"
                      disabled={locked || !future.length}
                      onClick={redo}
                    >
                      <Redo2 size={17} />
                    </button>
                    <span className="toolbar-divider" />
                    <button
                      className={`icon-btn small ${timer.loop ? "on" : ""}`}
                      title="Зациклить таймер"
                      aria-label="Зациклить таймер"
                      aria-pressed={timer.loop}
                      disabled={locked}
                      onClick={() =>
                        updateTimer({ ...timer, loop: !timer.loop })
                      }
                    >
                      <Repeat2 size={18} />
                    </button>
                  </div>
                </div>
                <div className="sequence-scroll" ref={stageRef}>
                  <div
                    className="sequence-inner"
                    style={
                      {
                        "--timeline-width": `${gridWidth}px`,
                        "--track-label": "184px",
                      } as CSSProperties
                    }
                  >
                    <div className="ruler-row">
                      <div className="track-column-caption">
                        ДОРОЖКИ{" "}
                        <span>
                          {timer.tracks.length.toString().padStart(2, "0")}
                        </span>
                      </div>
                      <div
                        className="ruler"
                        style={{
                          minWidth: gridWidth,
                          width: gridWidth,
                          flex: "0 0 auto",
                        }}
                        onClick={(e) => {
                          if (!locked) {
                            const r = e.currentTarget.getBoundingClientRect();
                            setPosition(
                              clamp(
                                snapSecond(
                                  ((e.clientX - r.left) / r.width) *
                                    timer.duration,
                                ),
                                0,
                                timer.duration,
                              ),
                            );
                          }
                        }}
                        title="Нажмите, чтобы переместить указатель"
                      >
                        {rulerSeconds.map((second) => (
                          <span
                            key={second}
                            style={{
                              left: `${(second / timer.duration) * 100}%`,
                            }}
                          >
                            {time(second)}
                          </span>
                        ))}
                        <span className="ruler-end">
                          {time(timer.duration)}
                        </span>
                      </div>
                    </div>
                    <div className="tracks-body">
                      {timer.tracks.map((track, index) => {
                        const SoundIcon =
                          SOUND_ICONS[getSound(track.sound).icon];
                        const isSelected = selection?.track === track.id;
                        return (
                          <div
                            className={`track-row ${isSelected ? "track-selected" : ""} ${track.muted ? "muted-track" : ""}`}
                            key={track.id}
                          >
                            <div className="track-label">
                              <button
                                className={`track-select ${isSelected ? "selected" : ""}`}
                                onClick={() =>
                                  setSelection({ track: track.id })
                                }
                              >
                                <span
                                  className={`sound-icon color-${track.color}`}
                                >
                                  <SoundIcon size={21} strokeWidth={1.6} />
                                </span>
                                <span>
                                  <strong>{track.name}</strong>
                                  <small>
                                    Дорожка {String(index + 1).padStart(2, "0")}
                                  </small>
                                </span>
                              </button>
                              <button
                                className="mute-button"
                                aria-label={`${track.muted ? "Включить" : "Выключить"} ${track.name}`}
                                aria-pressed={track.muted}
                                title={
                                  track.muted
                                    ? "Включить дорожку"
                                    : "Выключить дорожку"
                                }
                                disabled={locked}
                                onClick={() =>
                                  updateTrack(track.id, { muted: !track.muted })
                                }
                              >
                                {track.muted ? (
                                  <VolumeX size={15} />
                                ) : (
                                  <Volume2 size={15} />
                                )}
                              </button>
                            </div>
                            <div
                              className="track-grid"
                              data-track-row={track.id}
                              style={{
                                minWidth: gridWidth,
                                width: gridWidth,
                                flex: "0 0 auto",
                                backgroundSize: `${pixelsPerSecond}px 100%`,
                              }}
                            >
                              <div className="grid-cells">
                                {visibleSeconds.map((second) => (
                                  <button
                                    key={second}
                                    className="grid-cell"
                                    style={{
                                      left: second * pixelsPerSecond,
                                      width: pixelsPerSecond,
                                    }}
                                    disabled={locked}
                                    aria-label={`Добавить ${mode === "hit" ? "сигнал" : "протяжённый звук"}: ${track.name}, ${time(second)}`}
                                    onClick={() => addEvent(track, second)}
                                  >
                                    <Plus size={14} />
                                  </button>
                                ))}
                              </div>
                              {track.events
                                .filter(
                                  (ev) =>
                                    !(
                                      drag?.moved &&
                                      drag.event === ev.id &&
                                      drag.target !== track.id
                                    ),
                                )
                                .map((ev) => drawEvent(track, ev))}
                              {drag?.moved &&
                                drag.target === track.id &&
                                drag.track !== track.id &&
                                drawEvent(
                                  track,
                                  timer.tracks
                                    .find((t) => t.id === drag.track)!
                                    .events.find((e) => e.id === drag.event)!,
                                )}
                            </div>
                          </div>
                        );
                      })}
                      <div
                        className="playhead-area"
                        style={{ left: 184, width: gridWidth }}
                        aria-hidden="true"
                      >
                        <div
                          className={`playhead ${playing ? "is-playing" : ""}`}
                          style={{
                            left: `${(position / timer.duration) * 100}%`,
                          }}
                        >
                          <i />
                          <span />
                        </div>
                      </div>
                    </div>
                    {timer.tracks.length === 0 && (
                      <div className="empty-tracks">
                        <Waves size={28} />
                        <p>Добавьте первую дорожку, чтобы расставить звуки.</p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="sequencer-footer">
                  <button
                    className="add-track"
                    disabled={locked || timer.tracks.length >= 16}
                    onClick={() => {
                      setSoundAction("add");
                      stopPreview();
                      setSoundChoice("nepal-bell");
                      setSoundGroup("sample");
                      setModal("sounds");
                    }}
                  >
                    <Plus size={17} />
                    Добавить дорожку
                  </button>
                  <div className="event-legend">
                    <span>
                      <i className="legend-hit" />
                      Сигнал
                    </span>
                    <span>
                      <i className="legend-hold" />
                      Протяжённый звук
                    </span>
                  </div>
                </div>
              </section>
              <div className="grid-hint">
                <span>
                  <span className="hint-dot" />
                  {locked
                    ? "Таймер звучит. Поставьте на паузу, чтобы изменить последовательность."
                    : "Клетка — 1 секунда. Нажмите, чтобы добавить звук. Приближайте шкалу для точной настройки."}
                </span>
                <span className="snap-label">
                  <span />1 клетка = 1 секунда
                </span>
              </div>
              <section
                className="properties"
                aria-label="Настройки выбранного звука"
              >
                <div className="properties-header">
                  <span className="eyebrow">
                    {selectedTrack
                      ? "НАСТРОЙКИ ЗВУКА"
                      : "ВАША ПОСЛЕДОВАТЕЛЬНОСТЬ"}
                  </span>
                  <span>
                    {selectedEvent
                      ? `Событие в ${time(selectedEvent.at)}`
                      : selectedTrack
                        ? `${selectedTrack.events.length} событий на дорожке`
                        : `${timer.tracks.length} дорожек · ${totalEvents} событий`}
                  </span>
                  {selectedEvent && (
                    <button
                      className="icon-btn small"
                      aria-label="Удалить событие"
                      title="Удалить событие · Delete"
                      disabled={locked}
                      onClick={removeEvent}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                {selectedTrack ? (
                  <div className="properties-content">
                    <div className="sound-preview">
                      <div className="sound-preview-title">
                        <strong>{selectedTrack.name}</strong>
                        <button
                          className="text-button"
                          disabled={locked}
                          onClick={() => {
                            setSoundAction("replace");
                            setSoundChoice(selectedTrack.sound);
                            stopPreview();
                            setSoundGroup(getSound(selectedTrack.sound).kind);
                            setModal("sounds");
                          }}
                        >
                          Изменить <ChevronDown size={12} />
                        </button>
                      </div>
                      <div
                        className={`wave-preview color-${selectedTrack.color}`}
                      >
                        <Waveform
                          large
                          sound={selectedTrack.sound}
                          seed={
                            sounds.findIndex(
                              (s) => s.id === selectedTrack.sound,
                            ) + 2
                          }
                        />
                        <button
                          className="preview-play"
                          aria-label={
                            previewState?.sound === selectedTrack.sound
                              ? "Остановить прослушивание"
                              : "Послушать выбранный звук"
                          }
                          disabled={locked}
                          onClick={() =>
                            preview(selectedTrack.sound, selectedTrack.volume)
                          }
                        >
                          {previewState?.sound === selectedTrack.sound ? (
                            previewState.status === "loading" ? (
                              <LoaderCircle className="spinning" size={14} />
                            ) : (
                              <Square size={12} fill="currentColor" />
                            )
                          ) : (
                            <Play size={14} fill="currentColor" />
                          )}
                        </button>
                      </div>
                      <div className="track-volume">
                        <Volume2 size={13} />
                        <input
                          aria-label="Громкость дорожки"
                          type="range"
                          min="0"
                          max="100"
                          disabled={locked}
                          value={selectedTrack.volume}
                          onChange={(e) =>
                            updateTrack(selectedTrack.id, {
                              volume: Number(e.target.value),
                            })
                          }
                        />
                        <span>{selectedTrack.volume}%</span>
                        <button
                          className="icon-btn tiny"
                          title="Удалить дорожку"
                          aria-label="Удалить дорожку"
                          disabled={locked}
                          onClick={() => {
                            updateTimer({
                              ...timer,
                              tracks: timer.tracks.filter(
                                (t) => t.id !== selectedTrack.id,
                              ),
                            });
                            setSelection(null);
                            setToast(
                              "Дорожка удалена. Нажмите «Отменить», чтобы вернуть её.",
                            );
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="event-mode">
                      <label>
                        {selectedEvent ? "Тип события" : "Новые события"}
                      </label>
                      <div className="segmented">
                        <button
                          disabled={locked}
                          className={
                            (selectedEvent?.mode ?? mode) === "hit"
                              ? "active"
                              : ""
                          }
                          aria-pressed={(selectedEvent?.mode ?? mode) === "hit"}
                          onClick={() => {
                            setMode("hit");
                            if (selectedEvent)
                              updateEvent({ mode: "hit", duration: 1 });
                          }}
                        >
                          <span className="legend-hit" />
                          Сигнал
                        </button>
                        <button
                          disabled={locked}
                          className={
                            (selectedEvent?.mode ?? mode) === "hold"
                              ? "active"
                              : ""
                          }
                          aria-pressed={
                            (selectedEvent?.mode ?? mode) === "hold"
                          }
                          onClick={() => {
                            setMode("hold");
                            if (selectedEvent)
                              updateEvent({
                                mode: "hold",
                                duration: Math.min(
                                  10,
                                  timer.duration - selectedEvent.at,
                                ),
                              });
                          }}
                        >
                          <span className="legend-hold" />
                          Звук
                        </button>
                      </div>
                      <p>
                        {(selectedEvent?.mode ?? mode) === "hit"
                          ? getSound(selectedTrack.sound).kind === "sample"
                            ? "Один удар с естественным затуханием"
                            : "Короткая отсечка в нужный момент"
                          : getSound(selectedTrack.sound).kind === "sample"
                            ? "Запись повторяется до конца события"
                            : "Звучит всю заданную длительность"}
                      </p>
                    </div>
                    {selectedEvent ? (
                      <>
                        <div className="event-timing">
                          <label>
                            Начало, сек
                            <input
                              key={`${selectedEvent.id}-${selectedEvent.at}`}
                              type="number"
                              aria-label="Начало события в секундах"
                              min="0"
                              max={
                                timer.duration -
                                (selectedEvent.mode === "hold"
                                  ? selectedEvent.duration
                                  : 1)
                              }
                              step="1"
                              disabled={locked}
                              defaultValue={selectedEvent.at}
                              onBlur={(e) => {
                                const n = Number(e.target.value);
                                if (!e.target.value || !Number.isFinite(n)) {
                                  e.target.value = String(selectedEvent.at);
                                  return;
                                }
                                const at = moveEvent(
                                  selectedEvent,
                                  Math.round(n),
                                  timer.duration,
                                ).at;
                                if (
                                  selectedTrack.events.some(
                                    (ev) =>
                                      ev.id !== selectedEvent.id &&
                                      ev.at === at,
                                  )
                                ) {
                                  setToast("В этот момент уже есть сигнал.");
                                  e.target.value = String(selectedEvent.at);
                                } else if (at !== selectedEvent.at)
                                  updateEvent({ at });
                                else e.target.value = String(at);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                              }}
                            />
                          </label>
                          <label>
                            Длительность
                            <input
                              key={`${selectedEvent.id}-${selectedEvent.duration}-${selectedEvent.mode}`}
                              aria-label="Длительность звука в секундах"
                              type={
                                selectedEvent.mode === "hit" ? "text" : "number"
                              }
                              min="1"
                              max={timer.duration - selectedEvent.at}
                              disabled={locked || selectedEvent.mode === "hit"}
                              defaultValue={
                                selectedEvent.mode === "hit"
                                  ? "Отсечка"
                                  : selectedEvent.duration
                              }
                              onBlur={(e) => {
                                const duration = clamp(
                                  Math.round(Number(e.target.value) || 1),
                                  1,
                                  timer.duration - selectedEvent.at,
                                );
                                if (duration !== selectedEvent.duration)
                                  updateEvent({ duration });
                                else e.target.value = String(duration);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                              }}
                            />
                          </label>
                        </div>
                        <div className="repeat-control">
                          <label htmlFor="repeat-every">Повторить каждые</label>
                          <div className="repeat-input">
                            <input
                              id="repeat-every"
                              aria-label="Интервал повторения в секундах"
                              type="number"
                              min="1"
                              max="3600"
                              disabled={locked}
                              value={repeatEvery || ""}
                              onChange={(e) =>
                                setRepeatEvery(Number(e.target.value))
                              }
                            />
                            <span>сек</span>
                            <button
                              aria-label="Заполнить повторами до конца таймера"
                              title="Заполнить до конца таймера"
                              disabled={
                                locked || repeatEvery < 1 || repeatEvery > 3600
                              }
                              onClick={() => {
                                const events = repeatEvent(
                                  selectedEvent,
                                  Math.round(repeatEvery),
                                  timer.duration,
                                  selectedTrack.events,
                                );
                                if (
                                  events.length === selectedTrack.events.length
                                )
                                  setToast(
                                    "Для новых повторов нет свободных позиций.",
                                  );
                                else {
                                  updateTrack(selectedTrack.id, { events });
                                  setToast(
                                    `Добавлено повторов: ${events.length - selectedTrack.events.length}. Каждый можно изменить отдельно.`,
                                  );
                                }
                              }}
                            >
                              <Repeat2 size={17} />
                            </button>
                          </div>
                          <p>От выбранного события до конца</p>
                        </div>
                      </>
                    ) : (
                      <div className="select-event-hint">
                        <span>Выберите событие на сетке</span>
                        <p>
                          Здесь можно точно настроить начало, длительность и
                          повторы.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="properties-empty">
                    <span className="empty-icon">
                      <SlidersHorizontal size={24} />
                    </span>
                    <div>
                      <strong>Каждый звук — на своём месте</strong>
                      <p>
                        Выберите дорожку или событие, чтобы настроить звук,
                        длительность и повторы.
                      </p>
                    </div>
                    <div className="empty-mode">
                      <span>Добавлять:</span>
                      <button
                        className={`btn small ${mode === "hit" ? "secondary" : ""}`}
                        aria-pressed={mode === "hit"}
                        onClick={() => setMode("hit")}
                        disabled={locked}
                      >
                        Сигнал
                      </button>
                      <button
                        className={`btn small ${mode === "hold" ? "secondary" : ""}`}
                        aria-pressed={mode === "hold"}
                        onClick={() => setMode("hold")}
                        disabled={locked}
                      >
                        Протяжённый
                      </button>
                    </div>
                  </div>
                )}
              </section>
              <section className="transport" aria-label="Воспроизведение">
                <div className="transport-status">
                  <span
                    className={`transport-dot ${playing ? "playing" : ""}`}
                  />
                  <div>
                    <strong>{nowLabel}</strong>
                    <span>
                      {timer.loop ? "Повтор включён" : "Один цикл"}{" "}
                      <span>·</span> {totalEvents} событий
                    </span>
                  </div>
                </div>
                <div className="transport-center">
                  <button
                    className="icon-btn restart"
                    aria-label="Вернуться в начало"
                    title="Вернуться в начало"
                    onClick={() => stop(true)}
                  >
                    <RotateCcw size={20} />
                  </button>
                  <button
                    className="main-play"
                    onClick={togglePlay}
                    disabled={busy}
                    aria-label={
                      playing
                        ? "Пауза"
                        : position > 0 && position < timer.duration
                          ? "Продолжить"
                          : "Запустить таймер"
                    }
                    title="Воспроизведение / пауза · Пробел"
                  >
                    {playing ? (
                      <Pause size={22} fill="currentColor" />
                    ) : (
                      <Play size={22} fill="currentColor" />
                    )}
                    <span>
                      {busy
                        ? "Запуск…"
                        : playing
                          ? "Пауза"
                          : position > 0 && position < timer.duration
                            ? "Продолжить"
                            : "Запустить"}
                    </span>
                  </button>
                  <div className="transport-time">
                    <strong>{time(position)}</strong>
                    <span>/ {time(timer.duration)}</span>
                  </div>
                </div>
                <div className="master-volume">
                  <Volume2 size={18} />
                  <input
                    type="range"
                    aria-label="Общая громкость"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    style={{ "--volume": `${volume}%` } as CSSProperties}
                  />
                  <span>{volume}%</span>
                </div>
              </section>
              <footer className="editor-footer">
                <span>
                  <Headphones size={13} /> Создано для вашего ритма
                </span>
                <span>
                  <kbd>space</kbd> воспроизведение{" "}
                  <span className="footer-separator">/</span> <kbd>⌘ Z</kbd>{" "}
                  отменить
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button
            className="icon-btn tiny"
            aria-label="Скрыть сообщение"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {(modal === "create" || modal === "edit") && (
        <Dialog
          label={modal === "create" ? "Создать таймер" : "Настройки таймера"}
          close={closeModal}
        >
          <TimerForm
            timer={modal === "edit" ? timer : undefined}
            close={closeModal}
            onSave={(name, duration) => {
              if (modal === "edit" && timer) {
                updateTimer({ ...resizeTimer(timer, duration), name });
                setPosition((p) => Math.min(p, duration));
              } else {
                const t = { ...makeTimer(name), duration };
                commit([...timers, t]);
                setActiveId(t.id);
                setSelection({ track: t.tracks[0].id });
                setPosition(0);
              }
              closeModal();
            }}
          />
        </Dialog>
      )}
      {modal === "sounds" && (
        <Dialog
          label="Библиотека звуков"
          className="sounds-dialog"
          close={closeModal}
        >
          <span className="eyebrow">БИБЛИОТЕКА ЗВУКОВ</span>
          <h2>Как звучит ваш ритм?</h2>
          <p className="muted">Выберите звук и послушайте, как он звучит.</p>
          <div className="segmented sound-tabs" aria-label="Тип звуков">
            <button
              className={soundGroup === "sample" ? "active" : ""}
              aria-pressed={soundGroup === "sample"}
              onClick={() => {
                stopPreview();
                setSoundGroup("sample");
              }}
            >
              Инструменты <span>12</span>
            </button>
            <button
              className={soundGroup === "synth" ? "active" : ""}
              aria-pressed={soundGroup === "synth"}
              onClick={() => {
                stopPreview();
                setSoundGroup("synth");
              }}
            >
              Синтезатор <span>6</span>
            </button>
          </div>
          <div className="sound-library">
            {sounds
              .filter((sound) => sound.kind === soundGroup)
              .map((s) => {
                const Icon = SOUND_ICONS[s.icon];
                const previewing = previewState?.sound === s.id;
                const loading = previewing && previewState.status === "loading";
                return (
                  <div
                    className={`sound-option ${soundChoice === s.id ? "chosen" : ""}`}
                    key={s.id}
                  >
                    <button
                      className="sound-option-select"
                      aria-pressed={soundChoice === s.id}
                      onClick={() => {
                        setSoundChoice(s.id);
                        void preview(s.id);
                      }}
                    >
                      <span className={`sound-icon color-${s.color}`}>
                        <Icon size={22} />
                      </span>
                      <span>
                        <strong>{s.name}</strong>
                        <small>{s.detail}</small>
                      </span>
                      {soundChoice === s.id && <Check size={17} />}
                    </button>
                    <button
                      className={`icon-btn ${previewing ? "is-previewing" : ""}`}
                      aria-label={`${loading ? "Отменить загрузку" : previewing ? "Остановить" : "Послушать"}: ${s.name}`}
                      onClick={() => preview(s.id)}
                    >
                      {loading ? (
                        <LoaderCircle className="spinning" size={16} />
                      ) : previewing ? (
                        <Square size={13} fill="currentColor" />
                      ) : (
                        <Play size={16} />
                      )}
                    </button>
                  </div>
                );
              })}
          </div>
          <div className="library-footer">
            {previewError && (
              <p className="sample-error" role="alert">
                {previewError}
              </p>
            )}
            <p className="sample-status" role="status">
              {previewState
                ? `${previewState.status === "loading" ? "Загрузка" : "Играет"}: ${getSound(previewState.sound).name}`
                : `Выбрано: ${getSound(soundChoice).name}`}
            </p>
            <button
              className="btn primary full"
              onClick={() => {
                if (!timer) return;
                if (soundAction === "replace" && selectedTrack) {
                  const s = sounds.find((x) => x.id === soundChoice)!;
                  updateTrack(selectedTrack.id, {
                    sound: s.id,
                    name: s.name,
                    color: s.color,
                  });
                } else {
                  const t = makeTrack(soundChoice);
                  updateTimer({ ...timer, tracks: [...timer.tracks, t] });
                  setSelection({ track: t.id });
                }
                closeModal();
              }}
            >
              {soundAction === "replace" ? "Выбрать звук" : "Добавить дорожку"}
              <Plus size={17} />
            </button>
            <p className="sample-credit">
              Записи инструментов:{" "}
              <a
                href="https://github.com/sgossner/VCSL"
                target="_blank"
                rel="noreferrer"
              >
                VCSL
              </a>{" "}
              ·{" "}
              <a
                href="/audio/vcsl/LICENSE.txt"
                target="_blank"
                rel="noreferrer"
              >
                CC0
              </a>
            </p>
          </div>
        </Dialog>
      )}
      {modal === "delete" && timer && (
        <Dialog label="Удалить таймер" close={closeModal}>
          <span className="empty-icon">
            <Trash2 size={24} />
          </span>
          <h2>Удалить «{timer.name}»?</h2>
          <p className="muted">
            Таймер и его дорожки исчезнут из списка. Действие можно отменить.
          </p>
          <div className="dialog-actions">
            <button className="btn secondary" onClick={closeModal}>
              Оставить
            </button>
            <button
              className="btn danger"
              onClick={() => {
                const next = timers.filter((t) => t.id !== timer.id);
                commit(next);
                setActiveId(next[0]?.id ?? "");
                setSelection(null);
                stop(true);
                closeModal();
                setToast("Таймер удалён. Нажмите ⌘Z, чтобы вернуть.");
              }}
            >
              Удалить таймер
            </button>
          </div>
        </Dialog>
      )}
      {modal === "help" && (
        <Dialog
          label="Как работает Timequence"
          className="help-dialog"
          close={closeModal}
        >
          <span className="eyebrow">БЫСТРЫЙ СТАРТ</span>
          <h2>
            Сначала время.
            <br />
            Потом ваш ритм.
          </h2>
          <div className="help-steps">
            <div>
              <span>01</span>
              <div>
                <h3>Задайте длительность</h3>
                <p>
                  Выберите длину таймера. Одна клетка всегда равна одной
                  секунде. Масштаб приближает или отдаляет шкалу, не меняя время
                  звуков.
                </p>
              </div>
            </div>
            <div>
              <span>02</span>
              <div>
                <h3>Добавьте звуки на дорожки</h3>
                <p>
                  Нажмите на пустую клетку. Переносите события между клетками и
                  дорожками с точностью до секунды. Приблизьте шкалу для точной
                  настройки или введите время в свойствах события.
                </p>
              </div>
            </div>
            <div>
              <span>03</span>
              <div>
                <h3>Коротко или протяжённо</h3>
                <p>
                  «Сигнал» — короткая отсечка. «Звук» — событие с длительностью:
                  тяните правый край или укажите секунды. Стрелки на клавиатуре
                  перемещают выбранное событие.
                </p>
              </div>
            </div>
            <div>
              <span>04</span>
              <div>
                <h3>Найдите свой ритм</h3>
                <p>
                  «Повторить каждые» расставит копии до конца таймера. Нажмите
                  запуск и слушайте. Ваши таймеры сохраняются в этом браузере.
                </p>
              </div>
            </div>
          </div>
          <div className="help-note">
            <Headphones size={20} />
            <p>
              Во время таймера держите страницу открытой. На телефонах
              блокировка экрана или другие приложения могут прервать звук.
            </p>
          </div>
          <button className="btn primary full" onClick={closeModal}>
            Попробовать
            <ArrowRight size={17} />
          </button>
        </Dialog>
      )}
      {modal === "focus" && timer && (
        <Dialog
          label="Режим таймера"
          className="focus-dialog"
          close={closeModal}
        >
          <div className="focus-overline">
            <span className={`status-dot ${playing ? "orange" : ""}`} />
            {nowLabel}
          </div>
          <h2>{timer.name}</h2>
          <div
            className="focus-clock"
            style={
              {
                "--progress": `${(position / timer.duration) * 360}deg`,
              } as CSSProperties
            }
          >
            <div>
              <span>ОСТАЛОСЬ</span>
              <strong>{time(Math.ceil(timer.duration - position))}</strong>
              <small>из {time(timer.duration)}</small>
            </div>
          </div>
          <div className="focus-tracks">
            {timer.tracks
              .filter((t) => !t.muted)
              .map((t) => {
                const Icon = SOUND_ICONS[getSound(t.sound).icon];
                return (
                  <span
                    key={t.id}
                    className={`sound-icon color-${t.color}`}
                    title={t.name}
                  >
                    <Icon size={20} />
                  </span>
                );
              })}
          </div>
          <div className="focus-actions">
            <button
              className="icon-btn"
              aria-label="Вернуться в начало"
              onClick={() => stop(true)}
            >
              <RotateCcw size={22} />
            </button>
            <button className="main-play" disabled={busy} onClick={togglePlay}>
              {playing ? (
                <Pause size={22} fill="currentColor" />
              ) : (
                <Play size={22} fill="currentColor" />
              )}
              {playing ? "Пауза" : "Запустить"}
            </button>
          </div>
          <p className="muted">Оставьте страницу открытой и следуйте звуку.</p>
        </Dialog>
      )}
    </div>
  );
}
