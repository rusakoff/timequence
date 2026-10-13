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
  Leaf,
  LoaderCircle,
  MoreHorizontal,
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
import { SettingsPopover } from "./SettingsPopover";
import { ZenMode } from "./ZenMode";
import { initialTimers } from "./examples";
import { loadTimers, serializeTimers, STORAGE } from "./storage";
import { getSound, MAX_SOUND_DURATION } from "./sounds";
import {
  clamp,
  CELL_PITCH,
  DEFAULT_STEP,
  changeTimerStep,
  snapToStep,
  makeTimer,
  makeTrack,
  makeEvent,
  trackColors,
  moveEvent,
  repeatEvent,
  resizeTimer,
  sounds,
  time,
  uid,
  type SoundEvent,
  type SoundId,
  type Timer,
  type Track,
} from "./model";

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
  nextAt: number;
  moved: boolean;
  target: string;
  scale: number;
};
type Modal =
  | "create"
  | "edit"
  | "sounds"
  | "help"
  | "delete"
  | "focus"
  | "zen"
  | "timers"
  | "timer-actions"
  | null;
const countLabel = (n: number, forms: [string, string, string]) =>
  `${n} ${forms[n % 100 >= 11 && n % 100 <= 14 ? 2 : n % 10 === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 ? 1 : 2]}`;

function TimerList({
  timers,
  activeId,
  select,
}: {
  timers: Timer[];
  activeId?: string;
  select: (id: string) => void;
}) {
  return (
    <div className="timer-list">
      {timers.map((t) => (
        <button
          className={`timer-card ${t.id === activeId ? "current" : ""}`}
          key={t.id}
          aria-current={t.id === activeId ? "true" : undefined}
          onClick={() => select(t.id)}
        >
          <span className="timer-card-top">
            <strong title={t.name}>{t.name}</strong>
            <span>{time(t.duration)}</span>
          </span>
          <MiniSequence timer={t} />
        </button>
      ))}
    </div>
  );
}

function TrackName({
  name,
  disabled,
  onActivate,
  onRename,
}: {
  name: string;
  disabled: boolean;
  onActivate: () => void;
  onRename: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const ignoreBlur = useRef(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function finish(save: boolean, restoreFocus = false) {
    ignoreBlur.current = true;
    const next = draft.trim();
    if (save && !disabled && next && next !== name) onRename(next);
    setEditing(false);
    if (restoreFocus)
      requestAnimationFrame(() =>
        buttonRef.current?.focus({ preventScroll: true }),
      );
  }

  return editing ? (
    <input
      className="track-name-input"
      aria-label="Название дорожки"
      value={draft}
      maxLength={60}
      disabled={disabled}
      autoFocus
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (!ignoreBlur.current) finish(true);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish(event.key === "Enter", true);
        }
      }}
    />
  ) : (
    <button
      ref={buttonRef}
      className="track-name-button"
      aria-label={`Переименовать дорожку: ${name}`}
      title="Переименовать дорожку"
      disabled={disabled}
      onClick={() => {
        setDraft(name);
        ignoreBlur.current = false;
        setEditing(true);
        onActivate();
      }}
    >
      <strong>{name}</strong>
    </button>
  );
}

function MiniSequence({ timer }: { timer: Timer }) {
  return (
    <span className="mini-sequence" aria-hidden="true">
      {timer.tracks
        .filter((t) => !t.tickEvery)
        .slice(0, 3)
        .map((t) => (
          <span key={t.id} className={`color-${t.color}`}>
            {t.events.slice(0, 14).map((e) => (
              <i
                key={e.id}
                style={{
                  left: `${(e.at / timer.duration) * 95}%`,
                  width: "3px",
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
  const step = timer?.step ?? DEFAULT_STEP;
  const [steps, setSteps] = useState(
    Math.ceil((timer?.duration ?? 300) / step),
  );
  const duration = steps * step;
  const removed =
    timer?.tracks.reduce(
      (sum, t) => sum + t.events.filter((e) => e.at >= duration).length,
      0,
    ) ?? 0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (
          name.trim() &&
          Number.isInteger(steps) &&
          steps >= 1 &&
          duration <= 3600
        )
          onSave(name.trim(), duration);
      }}
    >
      <h2>{timer ? "Настройки таймера" : "Новый таймер"}</h2>
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
        Количество шагов
        <input
          type="number"
          min="1"
          max={Math.floor(3600 / step)}
          step="1"
          required
          value={steps || ""}
          onChange={(e) => setSteps(Number(e.target.value))}
        />
        <span className="field-note">
          {time(duration)} · один шаг — {step} сек
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
          disabled={
            !name.trim() ||
            steps < 1 ||
            !Number.isInteger(steps) ||
            duration > 3600
          }
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
      return loadTimers((key) => localStorage.getItem(key));
    } catch {
      /* Keep the editor usable when storage is unavailable. */
    }
    return initialTimers();
  });
  const [activeId, setActiveId] = useState(() => timers[0]?.id ?? "");
  const timer = timers.find((t) => t.id === activeId) ?? timers[0];
  const [selection, setSelected] = useState<Selection>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  function setSelection(next: Selection) {
    setSelected(next);
    setInspectorOpen(!!next);
  }
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
  const audibleVolume = useRef(65);
  const [transportError, setTransportError] = useState("");
  function toggleMute() {
    if (volume > 0) {
      audibleVolume.current = volume;
      setVolume(0);
    } else setVolume(audibleVolume.current);
  }
  const [repeatEvery, setRepeatEvery] = useState(4);
  const [toast, setToast] = useState("");
  const [history, setHistory] = useState<Timer[][]>([]);
  const [future, setFuture] = useState<Timer[][]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const movedRef = useRef(false);
  const engine = useRef(new AudioEngine());
  const previewEngine = useRef(new AudioEngine());
  const stageRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({
    left: 0,
    top: 0,
    ruler: 44,
    width: 1000,
    height: 400,
    label: 184,
  });
  const gridStep = timer?.step ?? DEFAULT_STEP;
  const pixelsPerSecond = CELL_PITCH / gridStep;
  // Start at the first cell; scroll only once the playhead reaches the center.
  const playheadCenter = Math.max(0, (viewport.width - viewport.label) / 2);
  const transportToken = useRef(0);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.scrollLeft = 0;
    stage.scrollTop = 0;
    const measure = () =>
      setViewport({
        left: stage.scrollLeft,
        top: stage.scrollTop,
        ruler:
          stage.querySelector<HTMLElement>(".ruler-row")?.offsetHeight ?? 44,
        width: stage.clientWidth,
        height: stage.clientHeight,
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
    const stage = stageRef.current;
    if (stage && !playing)
      stage.scrollLeft = Math.max(
        0,
        position * pixelsPerSecond - playheadCenter,
      );
  }, [playing, position, pixelsPerSecond, viewport.width, viewport.label]);

  useLayoutEffect(() => {
    if (playing || !playheadRef.current) return;
    const x = position * pixelsPerSecond - (stageRef.current?.scrollLeft ?? 0);
    playheadRef.current.style.transform = `translateX(${x}px)`;
  }, [
    playing,
    position,
    pixelsPerSecond,
    viewport.left,
    viewport.width,
    viewport.label,
    timer?.tracks.length,
  ]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !playing || !timer) return;
    let frame = 0;
    const follow = () => {
      const x =
        Math.min(timer.duration, engine.current.position) * pixelsPerSecond;
      stage.scrollLeft = Math.max(0, x - playheadCenter);
      if (playheadRef.current)
        playheadRef.current.style.transform = `translateX(${Math.min(x, playheadCenter)}px)`;
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => cancelAnimationFrame(frame);
  }, [playing, timer?.id, timer?.duration, pixelsPerSecond, playheadCenter]);

  function changeStep(value: number) {
    if (!timer || locked || drag) return;
    const next = changeTimerStep(timer, value);
    if (next === timer || next.step === timer.step) return;
    updateTimer(next);
    setPosition((p) => (p / timer.step) * next.step);
  }
  const selectedTrack = timer?.tracks.find((t) => t.id === selection?.track);
  const selectedEvent = selectedTrack?.events.find(
    (e) => e.id === selection?.event,
  );
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || !inspectorOpen || !selection || drag) return;
    const row = stage.querySelector<HTMLElement>(
      `[data-track-row="${selection.track}"]`,
    );
    if (!row) return;
    if (selectedEvent) {
      const x = selectedEvent.at * pixelsPerSecond;
      const available = stage.clientWidth - viewport.label;
      if (x < stage.scrollLeft) stage.scrollLeft = x;
      else if (x + CELL_PITCH > stage.scrollLeft + available)
        stage.scrollLeft = x + CELL_PITCH - available;
    }
    const bounds = stage.getBoundingClientRect();
    const item = row.getBoundingClientRect();
    const rulerHeight =
      stage.querySelector(".ruler-row")?.getBoundingClientRect().height ?? 44;
    const padding = bounds.height - rulerHeight >= item.height + 12 ? 12 : 0;
    if (item.bottom > bounds.bottom - padding)
      stage.scrollTop += item.bottom - bounds.bottom + padding;
    else if (item.top < bounds.top + rulerHeight)
      stage.scrollTop -= bounds.top + rulerHeight - item.top;
  }, [
    inspectorOpen,
    selection?.track,
    selectedEvent?.id,
    selectedEvent?.at,
    pixelsPerSecond,
    !!drag,
    viewport.width,
    viewport.height,
  ]);
  function closeInspector(restoreFocus = true) {
    setInspectorOpen(false);
    stopPreview();
    if (!restoreFocus) return;
    requestAnimationFrame(() => {
      const element = stageRef.current?.querySelector<HTMLElement>(
        selection?.event
          ? ".sound-event.selected"
          : ".track-select.selected .track-name-button",
      );
      element?.focus({ preventScroll: true });
    });
  }
  const locked = playing || busy;
  const closeModal = () => {
    stopPreview();
    setModal(null);
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, serializeTimers(timers));
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
    if (reset) setTransportError("");
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
    setTransportError("");
    setInspectorOpen(false);
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
      if (token === transportToken.current) {
        const message =
          error instanceof SampleLoadError
            ? error.message
            : "Не удалось включить звук. Проверьте разрешения браузера и попробуйте снова.";
        setTransportError(message);
        setToast(message);
      }
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
  function playInMode(mode: "zen" | "focus") {
    if (busy) return;
    stopPreview();
    setInspectorOpen(false);
    setModal(mode);
    if (!playing) void togglePlay();
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
        const message =
          "Браузер приостановил звук. Нажмите «Продолжить», чтобы вернуться к таймеру.";
        setTransportError(message);
        setToast(message);
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
              const message =
                "Не удалось повторить таймер. Нажмите «Продолжить».";
              setTransportError(message);
              setToast(message);
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
  function duplicateTimer() {
    if (!timer || locked || timers.length >= 100) return;
    const copy: Timer = {
      ...structuredClone(timer),
      id: uid(),
      name: `${timer.name} (копия)`.slice(0, 60),
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
    stopPreview();
    setToast("Копия таймера создана.");
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
      if (e.key === "Escape") closeInspector();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });

  function addEvent(track: Track, at: number) {
    if (locked || movedRef.current || !timer || track.tickEvery) return;
    const existing = track.events.find((e) => Math.abs(e.at - at) < 0.01);
    if (existing) {
      setSelection({ track: track.id, event: existing.id });
      return;
    }
    if (track.events.length >= 1000) {
      setToast("На одной дорожке можно разместить до 1000 событий.");
      return;
    }
    const e = makeEvent(at);
    updateTrack(track.id, {
      events: [...track.events, e].sort((a, b) => a.at - b.at),
    });
    setSelection({ track: track.id, event: e.id });
  }
  function beginDrag(
    e: React.PointerEvent<HTMLElement>,
    track: Track,
    event: SoundEvent,
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
      nextAt: event.at,
      moved: false,
      target: track.id,
      scale: row.getBoundingClientRect().width / timer.duration,
    };
    dragRef.current = d;
    setDrag(d);
    setSelected({ track: track.id, event: event.id });
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
      const seconds = snapToStep(delta / d.scale, timer.step);
      const targetRow = document
        .elementsFromPoint(e.clientX, e.clientY)
        .find(
          (el) =>
            el.hasAttribute("data-track-row") &&
            !el.hasAttribute("data-tick-track"),
        );
      const next = {
        ...d,
        moved: true,
        nextAt: moveEvent(event, d.at + seconds, timer.duration, timer.step).at,
        target: targetRow?.getAttribute("data-track-row") ?? d.target,
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
          setToast("В этот момент уже есть звук. Выберите соседнюю позицию.");
        else if (d.target !== d.track && target.events.length >= 1000)
          setToast("На этой дорожке уже 1000 событий.");
        else {
          const changed = { ...event, at: d.nextAt };
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

  const stepCount = Math.ceil((timer?.duration ?? 0) / gridStep);
  const gridWidth = stepCount * CELL_PITCH;
  // Mount the visible steps with a small buffer for scrolling and keyboard moves.
  const firstStep = Math.max(0, Math.floor(viewport.left / CELL_PITCH) - 6);
  const lastStep = Math.min(
    stepCount,
    Math.ceil((viewport.left + viewport.width - viewport.label) / CELL_PITCH) +
      6,
  );
  const visibleSteps = Array.from(
    { length: Math.max(0, lastStep - firstStep) },
    (_, i) => firstStep + i,
  );
  const currentStep =
    position >= (timer?.duration ?? 0) ? -1 : Math.floor(position / gridStep);
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
    const selected = selection?.event === ev.id;
    const active =
      playing &&
      !track.muted &&
      position >= at &&
      position <
        at + Math.min(getSound(track.sound).duration, MAX_SOUND_DURATION);
    return (
      <div
        role="button"
        tabIndex={locked ? -1 : 0}
        aria-disabled={locked}
        aria-label={`${track.name}, шаг ${Math.floor(at / gridStep) + 1}, ${time(at)}`}
        aria-pressed={selected}
        aria-haspopup="dialog"
        aria-expanded={selected && inspectorOpen}
        aria-controls={
          selected && inspectorOpen ? "sound-properties" : undefined
        }
        key={ev.id}
        className={`sound-event color-${track.color} ${selected ? "selected" : ""} ${active ? "sounding" : ""} ${d?.moved ? "dragging" : ""}`}
        style={
          {
            "--event-start": `${at * pixelsPerSecond}px`,
            "--event-span": `${CELL_PITCH}px`,
          } as CSSProperties
        }
        title={`${track.name} · шаг ${Math.floor(at / gridStep) + 1} · ${time(at)}`}
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
              ev.at + (e.key === "ArrowLeft" ? -gridStep : gridStep),
              timer!.duration,
              gridStep,
            );
            if (!track.events.some((x) => x.id !== ev.id && x.at === next.at))
              updateTrack(track.id, {
                events: track.events.map((x) => (x.id === ev.id ? next : x)),
              });
          }
        }}
      >
        <span className="cue-mark" aria-hidden="true">
          <i />
        </span>
      </div>
    );
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          href="#"
          className="brand"
          aria-label="Timequence, в начало таймера"
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
          timequence
        </a>
        <nav aria-label="Помощь">
          <button
            aria-label="Как это работает"
            onClick={() => setModal("help")}
          >
            <CircleHelp size={18} />
            <span>Как это работает</span>
          </button>
        </nav>
      </header>
      <div className="workspace">
        <aside className="sidebar">
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
          <TimerList
            timers={timers}
            activeId={timer?.id}
            select={switchTimer}
          />
          <div className="sidebar-bottom">
            <span>
              Пробел <kbd>␣</kbd> запуск / пауза
            </span>
            <span>
              Отменить <kbd>⌘ / Ctrl Z</kbd>
            </span>
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
              <h1>Ваш первый таймер</h1>
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
                  <div className="title-row">
                    <h1 className="desktop-timer-title" title={timer.name}>
                      {timer.name}
                    </h1>
                    <button
                      className="timer-switcher"
                      aria-label={`Открыть список таймеров: ${timer.name}`}
                      aria-haspopup="dialog"
                      onClick={() => setModal("timers")}
                    >
                      <span>{timer.name}</span>
                      <ChevronDown size={18} />
                    </button>
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
                </div>
                <div className="heading-actions">
                  <button
                    className="icon-btn desktop-action"
                    title="Создать копию таймера"
                    aria-label="Создать копию таймера"
                    disabled={locked || timers.length >= 100}
                    onClick={duplicateTimer}
                  >
                    <Copy size={18} />
                  </button>
                  <button
                    className="icon-btn desktop-action"
                    title="Удалить таймер"
                    aria-label="Удалить таймер"
                    disabled={locked}
                    onClick={() => setModal("delete")}
                  >
                    <Trash2 size={18} />
                  </button>
                  <button
                    className="icon-btn mobile-action"
                    aria-label="Действия с таймером"
                    aria-haspopup="dialog"
                    onClick={() => setModal("timer-actions")}
                  >
                    <MoreHorizontal size={20} />
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
                    <label className="step-control">
                      <span>Шаг</span>
                      <input
                        key={`${timer.id}:${timer.step}`}
                        aria-label="Длительность шага в секундах"
                        type="number"
                        min="1"
                        max={Math.floor(3600 / stepCount)}
                        step="1"
                        defaultValue={timer.step}
                        disabled={locked || !!drag}
                        onBlur={(e) => {
                          const n = Number(e.currentTarget.value);
                          if (
                            !e.currentTarget.value ||
                            !Number.isInteger(n) ||
                            n < 1 ||
                            n > Math.floor(3600 / stepCount)
                          ) {
                            e.currentTarget.value = String(timer.step);
                            return;
                          }
                          changeStep(n);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") e.currentTarget.blur();
                          if (e.key === "Escape") {
                            e.currentTarget.value = String(timer.step);
                            e.currentTarget.blur();
                          }
                        }}
                        title="Длительность одной клетки. Изменение шага меняет темп всей последовательности."
                      />
                      <span>сек</span>
                    </label>
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
                      className={`icon-btn small ${inspectorOpen && selectedTrack ? "on" : ""}`}
                      aria-label={
                        inspectorOpen && selectedTrack
                          ? "Скрыть настройки звука"
                          : "Показать настройки звука"
                      }
                      aria-expanded={inspectorOpen && !!selectedTrack}
                      aria-controls="sound-properties"
                      disabled={!selectedTrack || locked}
                      onClick={() =>
                        inspectorOpen
                          ? closeInspector()
                          : setInspectorOpen(true)
                      }
                      title="Настройки выбранного звука"
                    >
                      <SlidersHorizontal size={18} />
                    </button>
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
                <div
                  className="sequence-viewport"
                  style={
                    {
                      "--timeline-end-space": `${playheadCenter}px`,
                    } as CSSProperties
                  }
                >
                  <div className="sequence-scroll" ref={stageRef}>
                    <div
                      className="sequence-inner"
                      style={
                        {
                          "--timeline-width": `${gridWidth}px`,
                          "--cell-pitch": `${CELL_PITCH}px`,
                        } as CSSProperties
                      }
                    >
                      <div className="ruler-row">
                        <div className="track-column-caption">Дорожки</div>
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
                                  Math.floor(
                                    (e.clientX - r.left) / CELL_PITCH,
                                  ) * gridStep,
                                  0,
                                  timer.duration,
                                ),
                              );
                            }
                          }}
                          title="Нажмите, чтобы переместить указатель"
                        >
                          {visibleSteps.map((index) => (
                            <span
                              key={index}
                              className={`ruler-step ${currentStep === index ? "is-current" : ""}`}
                              style={{
                                left: index * CELL_PITCH,
                                width: CELL_PITCH,
                              }}
                              title={`Шаг ${index + 1} · ${time(index * gridStep)}`}
                            >
                              {index + 1}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="tracks-body">
                        {timer.tracks.map((track) => {
                          const SoundIcon =
                            SOUND_ICONS[getSound(track.sound).icon];
                          const isSelected = selection?.track === track.id;
                          return (
                            <div
                              className={`track-row ${track.tickEvery ? "tick-track" : ""} color-${track.color} ${isSelected ? "track-selected" : ""} ${track.muted ? "muted-track" : ""}`}
                              key={track.id}
                            >
                              <div className="track-label">
                                <div
                                  className={`track-select ${isSelected ? "selected" : ""}`}
                                >
                                  <button
                                    className="track-icon-button"
                                    aria-label={`Настройки дорожки: ${track.name}`}
                                    title={`Настройки дорожки: ${track.name}`}
                                    aria-pressed={isSelected}
                                    aria-haspopup="dialog"
                                    aria-expanded={
                                      isSelected &&
                                      !selectedEvent &&
                                      inspectorOpen
                                    }
                                    disabled={locked}
                                    onClick={() =>
                                      setSelection({ track: track.id })
                                    }
                                  >
                                    <span className="sound-icon">
                                      <SoundIcon size={20} strokeWidth={1.6} />
                                    </span>
                                  </button>
                                  <TrackName
                                    name={track.name}
                                    disabled={locked}
                                    onActivate={() =>
                                      setSelection({ track: track.id })
                                    }
                                    onRename={(name) =>
                                      updateTrack(track.id, { name })
                                    }
                                  />
                                </div>
                                <button
                                  className="mute-button"
                                  aria-label={`${track.muted ? "Включить" : "Выключить"} ${track.name}`}
                                  aria-pressed={track.muted}
                                  title={
                                    track.muted
                                      ? "Включить дорожку"
                                      : "Выключить дорожку"
                                  }
                                  disabled={
                                    busy || (playing && !track.tickEvery)
                                  }
                                  onClick={() => {
                                    const muted = !track.muted;
                                    if (track.tickEvery)
                                      engine.current.setTickMuted({
                                        ...track,
                                        muted,
                                      });
                                    updateTrack(track.id, { muted });
                                  }}
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
                                data-tick-track={track.tickEvery || undefined}
                                style={{
                                  minWidth: gridWidth,
                                  width: gridWidth,
                                  flex: "0 0 auto",
                                }}
                              >
                                {track.tickEvery ? (
                                  <div className="grid-cells">
                                    {visibleSteps.map((index) => {
                                      const every = track.tickEvery!;
                                      const from = index * gridStep;
                                      const first = Math.max(
                                        every,
                                        Math.ceil(from / every) * every,
                                      );
                                      const hasTick =
                                        first <
                                        Math.min(
                                          timer.duration,
                                          from + gridStep,
                                        );
                                      const sounding =
                                        playing &&
                                        !track.muted &&
                                        position >= every &&
                                        position % every < 0.12 &&
                                        index === currentStep;
                                      return (
                                        <button
                                          key={index}
                                          className={`grid-cell tick-cell ${hasTick ? "has-ticks" : ""} ${sounding ? "tick-sounding" : ""}`}
                                          style={{ left: index * CELL_PITCH }}
                                          disabled={locked}
                                          aria-label={`Настройки тиков: ${track.name}, шаг ${index + 1}`}
                                          title={`Тик каждые ${every} сек · настроить дорожку`}
                                          onClick={() =>
                                            setSelection({ track: track.id })
                                          }
                                        >
                                          {hasTick && (
                                            <span
                                              className="tick-marks"
                                              aria-hidden="true"
                                            >
                                              <i />
                                              <i />
                                              <i />
                                            </span>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <div className="grid-cells">
                                    {visibleSteps.map((index) => (
                                      <button
                                        key={index}
                                        className={`grid-cell ${currentStep === index ? "is-current" : ""}`}
                                        style={{
                                          left: index * CELL_PITCH,
                                        }}
                                        disabled={locked}
                                        aria-label={`Добавить звук: ${track.name}, шаг ${index + 1}, ${time(index * gridStep)}`}
                                        onClick={() =>
                                          addEvent(track, index * gridStep)
                                        }
                                      >
                                        <Plus size={14} />
                                      </button>
                                    ))}
                                  </div>
                                )}
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
                      </div>
                      {timer.tracks.length === 0 && (
                        <div className="empty-tracks">
                          <Waves size={28} />
                          <p>
                            Добавьте первую дорожку, чтобы расставить звуки.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  {timer.tracks.length > 0 && (
                    <div
                      className="playhead-area"
                      aria-hidden="true"
                      style={{
                        left: viewport.label,
                        top: viewport.ruler,
                        width: viewport.width - viewport.label,
                        height: Math.max(
                          0,
                          Math.min(
                            timer.tracks.length * CELL_PITCH - viewport.top,
                            viewport.height - viewport.ruler,
                          ),
                        ),
                      }}
                    >
                      <div
                        className={`playhead ${playing ? "is-playing" : ""}`}
                        ref={playheadRef}
                      >
                        <i />
                      </div>
                    </div>
                  )}
                </div>
                <div className="sequencer-footer">
                  <button
                    className="add-track"
                    disabled={
                      locked ||
                      timer.tracks.filter((t) => !t.tickEvery).length >= 16
                    }
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
                </div>
              </section>
              {selectedTrack && inspectorOpen && (
                <SettingsPopover
                  anchorKey={
                    selectedEvent
                      ? `${selectedEvent.id}:${selectedEvent.at}`
                      : selectedTrack.id
                  }
                  getAnchor={() =>
                    stageRef.current?.querySelector<HTMLElement>(
                      selectedEvent
                        ? ".sound-event.selected"
                        : ".track-select.selected",
                    ) ?? null
                  }
                  suspended={!!modal || !!drag}
                  onDismiss={closeInspector}
                >
                  <div className="properties-header">
                    <strong>{selectedEvent ? "Событие" : "Дорожка"}</strong>
                    <span>
                      {selectedEvent
                        ? time(selectedEvent.at)
                        : selectedTrack.tickEvery
                          ? `Каждые ${selectedTrack.tickEvery} сек`
                          : countLabel(selectedTrack.events.length, [
                              "событие",
                              "события",
                              "событий",
                            ])}
                    </span>
                    {selectedEvent && (
                      <button
                        className="icon-btn small"
                        aria-label="Удалить событие"
                        title="Удалить событие · Delete"
                        disabled={locked}
                        onClick={() => {
                          removeEvent();
                          setInspectorOpen(false);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                    <button
                      className="icon-btn small properties-close"
                      aria-label="Закрыть настройки звука"
                      title="Закрыть настройки · Esc"
                      onClick={() => closeInspector()}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  <div className="properties-content">
                    <div className="sound-preview">
                      <span className="property-label">Звук дорожки</span>
                      <div className="sound-preview-title">
                        <strong>{getSound(selectedTrack.sound).name}</strong>
                        {!selectedTrack.tickEvery && (
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
                        )}
                      </div>
                      <div className="sound-options">
                        <button
                          className="preview-play"
                          title="Послушать звук"
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
                        <div
                          className="track-colors"
                          role="group"
                          aria-label="Цвет дорожки"
                        >
                          {trackColors.map((color) => (
                            <button
                              key={color.id}
                              className={`color-swatch color-${color.id}`}
                              aria-label={`Цвет дорожки: ${color.name}`}
                              aria-pressed={selectedTrack.color === color.id}
                              title={color.name}
                              disabled={locked}
                              onClick={() =>
                                updateTrack(selectedTrack.id, {
                                  color: color.id,
                                })
                              }
                            >
                              {selectedTrack.color === color.id && (
                                <Check size={12} strokeWidth={2.5} />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                      {!selectedEvent && (
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
                      )}
                    </div>
                    {selectedEvent ? (
                      <>
                        <div className="event-timing">
                          <label>
                            Шаг
                            <input
                              key={`${selectedEvent.id}-${selectedEvent.at}`}
                              type="number"
                              aria-label="Шаг события"
                              min="1"
                              max={stepCount}
                              step="1"
                              disabled={locked}
                              defaultValue={selectedEvent.at / gridStep + 1}
                              onBlur={(e) => {
                                const n = Number(e.target.value);
                                if (!e.target.value || !Number.isFinite(n)) {
                                  e.target.value = String(
                                    selectedEvent.at / gridStep + 1,
                                  );
                                  return;
                                }
                                const at = moveEvent(
                                  selectedEvent,
                                  (Math.round(n) - 1) * gridStep,
                                  timer.duration,
                                  gridStep,
                                ).at;
                                if (
                                  selectedTrack.events.some(
                                    (ev) =>
                                      ev.id !== selectedEvent.id &&
                                      ev.at === at,
                                  )
                                ) {
                                  setToast("В этот момент уже есть звук.");
                                  e.target.value = String(
                                    selectedEvent.at / gridStep + 1,
                                  );
                                } else if (at !== selectedEvent.at)
                                  updateEvent({ at });
                                else e.target.value = String(at / gridStep + 1);
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
                              aria-label="Интервал повторения в шагах"
                              type="number"
                              min="1"
                              max={stepCount}
                              disabled={locked}
                              value={repeatEvery || ""}
                              onChange={(e) =>
                                setRepeatEvery(Number(e.target.value))
                              }
                            />
                            <span>шаг.</span>
                            <button
                              aria-label="Заполнить повторами до конца таймера"
                              title="Заполнить до конца таймера"
                              disabled={
                                locked ||
                                repeatEvery < 1 ||
                                repeatEvery > stepCount
                              }
                              onClick={() => {
                                const events = repeatEvent(
                                  selectedEvent,
                                  Math.round(repeatEvery) * gridStep,
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
                        <span>
                          {selectedTrack.tickEvery
                            ? `Тик каждые ${selectedTrack.tickEvery} сек`
                            : "Выберите событие на сетке"}
                        </span>
                        <p>
                          {selectedTrack.tickEvery
                            ? "По всему таймеру, независимо от шага. Выключается кнопкой звука на дорожке."
                            : "Здесь можно задать момент сигнала и интервал повторов."}
                        </p>
                      </div>
                    )}
                  </div>
                </SettingsPopover>
              )}
              <section
                className="transport"
                aria-label="Воспроизведение"
                aria-busy={busy}
              >
                <div className="transport-time">
                  <strong>{time(position)}</strong>
                  <span>/ {time(timer.duration)}</span>
                </div>
                <div
                  className="transport-center"
                  role="group"
                  aria-label="Способ воспроизведения"
                >
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
                    {busy ? (
                      <LoaderCircle className="spinning" size={22} />
                    ) : playing ? (
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
                  <button
                    className="play-mode zen-button"
                    aria-label="Дзен-режим"
                    aria-haspopup="dialog"
                    title={
                      playing ? "Открыть дзен-режим" : "Запустить в дзен-режиме"
                    }
                    disabled={busy}
                    onClick={() => playInMode("zen")}
                  >
                    <Leaf size={18} />
                    <span>Дзен</span>
                  </button>
                  <button
                    className="play-mode focus-button"
                    aria-label="Режим таймера"
                    aria-haspopup="dialog"
                    title={
                      playing
                        ? "Открыть режим таймера"
                        : "Запустить в режиме таймера"
                    }
                    disabled={busy}
                    onClick={() => playInMode("focus")}
                  >
                    <Expand size={18} />
                    <span>Таймер</span>
                  </button>
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
      {modal === "timers" && (
        <Dialog
          label="Мои таймеры"
          className="timers-dialog"
          close={closeModal}
        >
          <h2>
            Мои таймеры <span className="count">{timers.length}</span>
          </h2>
          <TimerList
            timers={timers}
            activeId={timer?.id}
            select={(id) => {
              switchTimer(id);
              closeModal();
            }}
          />
          {!timers.length && (
            <p className="muted">
              Создайте таймер, чтобы добавить свою последовательность.
            </p>
          )}
          <button
            className="btn primary full"
            disabled={timers.length >= 100}
            onClick={() => {
              stop();
              setModal("create");
            }}
          >
            <Plus size={18} />
            Новый таймер
          </button>
        </Dialog>
      )}
      {modal === "timer-actions" && timer && (
        <Dialog
          label="Действия с таймером"
          className="actions-dialog"
          close={closeModal}
        >
          <h2>{timer.name}</h2>
          <div className="action-list">
            <button disabled={locked} onClick={() => setModal("edit")}>
              <Pencil size={18} />
              Название и длительность
            </button>
            <button
              disabled={locked || timers.length >= 100}
              onClick={() => {
                duplicateTimer();
                closeModal();
              }}
            >
              <Copy size={18} />
              Создать копию
            </button>
            <button
              className="danger-text"
              disabled={locked}
              onClick={() => setModal("delete")}
            >
              <Trash2 size={18} />
              Удалить таймер
            </button>
          </div>
        </Dialog>
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
          <h2>Выбрать звук</h2>
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
              Синтезатор{" "}
              <span>{sounds.filter((s) => s.kind === "synth").length}</span>
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
                    name:
                      selectedTrack.name === getSound(selectedTrack.sound).name
                        ? s.name
                        : selectedTrack.name,
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
          <h2>Как работает Timequence</h2>
          <div className="help-steps">
            <div>
              <span>01</span>
              <div>
                <h3>Задайте шаг и длину</h3>
                <p>
                  Выберите количество шагов и длительность одной клетки. Если
                  увеличить шаг с 5 до 10 секунд, рисунок сохранится, а вся
                  последовательность станет вдвое длиннее.
                </p>
              </div>
            </div>
            <div>
              <span>02</span>
              <div>
                <h3>Добавьте звуки на дорожки</h3>
                <p>
                  Нажмите на пустой квадрат. Переносите события между шагами и
                  дорожками или укажите номер шага в свойствах сигнала. Номера
                  над сеткой помогают ориентироваться в последовательности.
                </p>
              </div>
            </div>
            <div>
              <span>03</span>
              <div>
                <h3>Задайте ритм действий</h3>
                <p>
                  Каждый блок — короткий сигнал, до трёх секунд. Все блоки
                  одинакового размера. Переименуйте дорожки и выберите им цвета.
                  Например: вдох в 00:00, задержка в 00:04, выдох в 00:11,
                  следующий вдох в 00:19. Интервалы между сигналами задают время
                  действий.
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
      {modal === "zen" && timer && (
        <Dialog label="Дзен-режим" className="zen-dialog" close={closeModal}>
          <ZenMode
            timer={timer}
            position={position}
            playing={playing}
            busy={busy}
            muted={volume === 0}
            error={transportError}
            onPlay={togglePlay}
            onRestart={() => stop(true)}
            onMute={toggleMute}
          />
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
              .filter((t) => !t.muted && !t.tickEvery)
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
