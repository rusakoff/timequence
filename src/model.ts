import { sounds, DEFAULT_SOUND, TICK_SOUND, restoreSoundId, type SoundId } from "./sounds.ts";
export { sounds, type SoundId } from "./sounds.ts";
export interface SoundEvent {
  id: string;
  at: number;
}
export interface Track {
  id: string;
  sound: SoundId;
  name: string;
  color: string;
  volume: number;
  muted: boolean;
  events: SoundEvent[];
  tickEvery?: 1 | 5; // 5 is accepted only while reading legacy snapshots.
}
export interface Timer {
  id: string;
  name: string;
  duration: number;
  step: number;
  loop: boolean;
  tracks: Track[];
}
export const uid = () => crypto.randomUUID();
export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export const CELL_PITCH = 72;
export const DEFAULT_STEP = 30;
export const snapToStep = (seconds: number, step = 1) =>
  Math.round(seconds / step) * step;

/** Infer a common step without moving any of the existing cues. */
export function inferStep(timer: Pick<Timer, "duration" | "tracks">): number {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const times = [
    timer.duration,
    ...timer.tracks.flatMap((t) =>
      Array.isArray(t?.events) ? t.events.map((e) => e?.at) : [],
    ),
  ];
  if (!times.every(Number.isInteger)) return 1;
  const common = times.reduce(gcd);
  for (let step = Math.min(60, common); step >= 1; step--)
    if (common % step === 0) return step;
  return 1;
}

export interface StepChangeMove {
  trackId: string;
  trackName: string;
  eventId: string;
  from: number;
  to: number;
}

/** Preview every cue whose playback time will move to the nearest valid cell. */
export function stepChangeMoves(timer: Timer, step: number): StepChangeMove[] {
  if (!Number.isInteger(step) || step < 1 || step > timer.duration || step === timer.step)
    return [];
  return timer.tracks.flatMap((track) =>
    track.tickEvery
      ? []
      : track.events.flatMap((event) => {
          const to = moveEvent(event, event.at, timer.duration, step).at;
          return to === event.at
            ? []
            : [{ trackId: track.id, trackName: track.name, eventId: event.id, from: event.at, to }];
        }),
  );
}

/** Count cells where previously separate cues on one track would play together. */
export function stepChangeCoincidences(timer: Timer, step: number): number {
  if (!Number.isInteger(step) || step < 1 || step > timer.duration || step === timer.step)
    return 0;
  return timer.tracks.reduce((count, track) => {
    if (track.tickEvery) return count;
    const originalTimesByCell = new Map<number, Set<number>>();
    for (const event of track.events) {
      const to = moveEvent(event, event.at, timer.duration, step).at;
      const originalTimes = originalTimesByCell.get(to) ?? new Set<number>();
      originalTimes.add(event.at);
      originalTimesByCell.set(to, originalTimes);
    }
    return count + [...originalTimesByCell.values()].filter((times) => times.size > 1).length;
  }, 0);
}

/** Align cue playback times with the new grid while preserving their IDs. */
export function changeTimerStep(timer: Timer, step: number): Timer {
  if (!Number.isInteger(step) || step < 1 || step > timer.duration)
    return timer;
  if (step === timer.step) return timer;
  return {
    ...timer,
    step,
    tracks: timer.tracks.map((track) =>
      track.tickEvery
        ? track
        : {
            ...track,
            events: track.events.map((event) =>
              moveEvent(event, event.at, timer.duration, step),
            ),
          },
    ),
  };
}
export const time = (seconds: number) =>
  `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, "0")}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, "0")}`;
export const trackColors = [
  { id: "ink", name: "Графитовый" },
  { id: "orange", name: "Оранжевый" },
  { id: "sand", name: "Песочный" },
  { id: "sage", name: "Зелёный" },
  { id: "clay", name: "Терракотовый" },
  { id: "blue", name: "Бирюзовый" },
] as const;
export const makeEvent = (at: number): SoundEvent => ({ id: uid(), at });
export function moveEvent(
  e: SoundEvent,
  at: number,
  length: number,
  step = 1,
): SoundEvent {
  return {
    ...e,
    at: clamp(
      snapToStep(at, step),
      0,
      Math.max(0, (Math.ceil(length / step) - 1) * step),
    ),
  };
}
export function repeatEvent(
  e: SoundEvent,
  every: number,
  length: number,
  existing: SoundEvent[],
): SoundEvent[] {
  if (!Number.isFinite(every) || every < 1) return existing;
  const result = [...existing];
  for (
    let at = e.at + every;
    at < length && result.length < 1000;
    at += every
  ) {
    if (!result.some((x) => Math.abs(x.at - at) < 0.01))
      result.push({ ...e, id: uid(), at });
  }
  return result.sort((a, b) => a.at - b.at);
}
export function resizeTimer(timer: Timer, duration: number): Timer {
  return {
    ...timer,
    duration,
    step: timer.step <= duration ? timer.step : 1,
    tracks: timer.tracks.map((t) => ({
      ...t,
      events: t.events.filter((e) => e.at < duration),
    })),
  };
}
export const makeTrack = (sound: SoundId): Track => {
  const s = sounds.find((x) => x.id === sound)!;
  return {
    id: uid(),
    sound,
    name: s.name,
    color: s.color,
    volume: 70,
    muted: false,
    events: [],
  };
};

export function makeTickTrack(every: 1): Track {
  return {
    ...makeTrack(TICK_SOUND),
    name: "Тик · 1 с",
    color: "ink",
    volume: 28,
    tickEvery: every,
  };
}

/** Retire the five-second clock without changing any user tracks or the one-second clock. */
export function withoutFiveSecondTicks(timer: Timer): Timer {
  const tracks = timer.tracks.filter((track) => track.tickEvery !== 5);
  return tracks.length === timer.tracks.length ? timer : { ...timer, tracks };
}

/** Fixed-second ticks are independent of the editable step pattern. */
export function withTickTracks(timer: Timer): Timer {
  const current = withoutFiveSecondTicks(timer);
  return current.tracks.some((track) => track.tickEvery === 1)
    ? current
    : { ...current, tracks: [...current.tracks, makeTickTrack(1)] };
}

export const makeTimer = (name = "Новый таймер"): Timer => ({
  id: uid(),
  name,
  duration: 300,
  step: DEFAULT_STEP,
  loop: false,
  tracks: [makeTrack(DEFAULT_SOUND), makeTickTrack(1)],
});
export function validTimers(value: unknown): value is Timer[] {
  if (!Array.isArray(value) || value.length > 100) return false;
  return value.every(
    (t) =>
      t &&
      typeof t.id === "string" &&
      typeof t.name === "string" &&
      Number.isFinite(t.duration) &&
      t.duration >= 1 &&
      t.duration <= 3600 &&
      Number.isInteger(t.step) &&
      t.step >= 1 &&
      t.step <= t.duration &&
      typeof t.loop === "boolean" &&
      Array.isArray(t.tracks) &&
      t.tracks.filter((tr: Track) => !tr?.tickEvery).length <= 16 &&
      t.tracks.filter((tr: Track) => tr?.tickEvery).length <= 2 &&
      new Set(
        t.tracks
          .filter((tr: Track) => tr?.tickEvery)
          .map((tr: Track) => tr.tickEvery),
      ).size === t.tracks.filter((tr: Track) => tr?.tickEvery).length &&
      t.tracks.every(
        (tr: Track) =>
          tr &&
          typeof tr.id === "string" &&
          sounds.some((s) => s.id === tr.sound) &&
          typeof tr.name === "string" &&
          typeof tr.color === "string" &&
          typeof tr.muted === "boolean" &&
          Number.isFinite(tr.volume) &&
          tr.volume >= 0 &&
          tr.volume <= 100 &&
          Array.isArray(tr.events) &&
          tr.events.length <= 1000 &&
          (tr.tickEvery === undefined ||
            ([1, 5].includes(tr.tickEvery) &&
              tr.events.length === 0 &&
              tr.sound === (tr.tickEvery === 1 ? TICK_SOUND : "snap"))) &&
          tr.events.every(
            (e) =>
              e &&
              typeof e.id === "string" &&
              Number.isFinite(e.at) &&
              e.at >= 0 &&
              e.at < t.duration &&
              !("mode" in e) &&
              !("duration" in e),
          ),
      ),
  );
}

/** Preserve user edits while migrating old sounds and variable-length blocks. */
export function restoreTimers(value: unknown): Timer[] | null {
  if (validTimers(value)) return value;
  if (!Array.isArray(value)) return null;
  const migrated = value.map((timer) => {
    if (!timer || typeof timer !== "object") return timer;
    if (!Array.isArray(timer.tracks)) return timer;
    if (
      "zoom" in timer &&
      (!Number.isFinite(timer.zoom) || timer.zoom < 0.25 || timer.zoom > 4)
    )
      return timer;
    const { zoom, ...next } = timer;
    if (!("step" in next)) next.step = inferStep(next);
    return {
      ...next,
      tracks: next.tracks.map((track: Track) => {
        if (
          !track ||
          !Array.isArray(track.events) ||
          !restoreSoundId(track.sound)
        )
          return track;
        return {
          ...track,
          sound: restoreSoundId(track.sound)!,
          events: track.events.map(
            (event: SoundEvent & { mode?: string; duration?: number }) => {
              if (!event || typeof event !== "object") return event;
              if (!("duration" in event)) return event;
              if (
                !Number.isFinite(event.duration) ||
                event.duration! <= 0 ||
                ("mode" in event && !["hit", "hold"].includes(event.mode ?? ""))
              )
                return event;
              const { duration, mode, ...rest } = event;
              return rest;
            },
          ),
        };
      }),
    };
  });
  return validTimers(migrated) ? migrated : null;
}
