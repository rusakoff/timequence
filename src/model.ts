import { sounds, type SoundId } from "./sounds.ts";
export { sounds, type SoundId } from "./sounds.ts";
export type EventMode = "hit" | "hold";
export interface SoundEvent {
  id: string;
  at: number;
  duration: number;
  mode: EventMode;
}
export interface Track {
  id: string;
  sound: SoundId;
  name: string;
  color: string;
  volume: number;
  muted: boolean;
  events: SoundEvent[];
}
export interface Timer {
  id: string;
  name: string;
  duration: number;
  zoom: number;
  loop: boolean;
  tracks: Track[];
}
export const uid = () => crypto.randomUUID();
export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export const GRID_SECOND = 1;
export const BASE_CELL_WIDTH = 32;
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
export const DEFAULT_ZOOM = 0.5;
export const snapSecond = (seconds: number) =>
  Math.round(seconds / GRID_SECOND) * GRID_SECOND;
export const rulerInterval = (pixelsPerSecond: number) =>
  [1, 2, 5, 10, 15, 30, 60, 120].find(
    (seconds) => seconds * pixelsPerSecond >= 58,
  ) ?? 120;
export const time = (seconds: number) =>
  `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, "0")}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, "0")}`;
export const eventEnd = (e: SoundEvent) =>
  e.at + (e.mode === "hold" ? e.duration : 0);
export function moveEvent(
  e: SoundEvent,
  at: number,
  length: number,
): SoundEvent {
  return {
    ...e,
    at: clamp(snapSecond(at), 0, length - (e.mode === "hold" ? e.duration : 1)),
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
    if (e.mode === "hold" && at + e.duration > length) break;
    if (!result.some((x) => Math.abs(x.at - at) < 0.01))
      result.push({ ...e, id: uid(), at });
  }
  return result.sort((a, b) => a.at - b.at);
}
export function resizeTimer(timer: Timer, duration: number): Timer {
  return {
    ...timer,
    duration,
    tracks: timer.tracks.map((t) => ({
      ...t,
      events: t.events
        .filter((e) => e.at < duration)
        .map((e) => ({
          ...e,
          duration: Math.min(e.duration, duration - e.at),
        })),
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
export const makeTimer = (name = "Новый таймер"): Timer => ({
  id: uid(),
  name,
  duration: 300,
  zoom: DEFAULT_ZOOM,
  loop: false,
  tracks: [makeTrack("nepal-bell")],
});
export function initialTimers(): Timer[] {
  const a = makeTimer("Мой ритм");
  a.tracks = ["nepal-bell", "woodblock", "vibraphone", "bell-tree"].map((s) =>
    makeTrack(s as SoundId),
  );
  a.tracks[0].events = [0, 60, 120, 180, 240].map((at) => ({
    id: uid(),
    at,
    duration: 1,
    mode: "hit",
  }));
  a.tracks[1].events = [30, 90, 150, 210, 270].map((at) => ({
    id: uid(),
    at,
    duration: 1,
    mode: "hit",
  }));
  a.tracks[2].events = [0, 120, 240].map((at) => ({
    id: uid(),
    at,
    duration: 30,
    mode: "hold",
  }));
  a.tracks[3].events = [{ id: uid(), at: 290, duration: 10, mode: "hold" }];
  const b = makeTimer("Короткие интервалы");
  b.duration = 180;
  b.tracks[0].events = Array.from({ length: 18 }, (_, i) => ({
    id: uid(),
    at: i * 10,
    duration: 1,
    mode: "hit",
  }));
  const c = makeTimer("Тихая последовательность");
  c.duration = 600;
  c.zoom = MIN_ZOOM;
  c.tracks = [makeTrack("gong"), makeTrack("hand-chime")];
  c.tracks[0].events = [0, 120, 240, 360, 480].map((at) => ({
    id: uid(),
    at,
    duration: 8,
    mode: "hold",
  }));
  c.tracks[1].events = [60, 180, 300, 420, 540].map((at) => ({
    id: uid(),
    at,
    duration: 20,
    mode: "hold",
  }));
  return [a, b, c];
}
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
      Number.isFinite(t.zoom) &&
      t.zoom >= MIN_ZOOM &&
      t.zoom <= MAX_ZOOM &&
      typeof t.loop === "boolean" &&
      Array.isArray(t.tracks) &&
      t.tracks.length <= 16 &&
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
          tr.events.every(
            (e) =>
              e &&
              typeof e.id === "string" &&
              Number.isFinite(e.at) &&
              e.at >= 0 &&
              e.at < t.duration &&
              ["hit", "hold"].includes(e.mode) &&
              Number.isFinite(e.duration) &&
              e.duration > 0 &&
              (e.mode === "hit" || eventEnd(e) <= t.duration),
          ),
      ),
  );
}

/** Preserve existing events when loading the former step-based format. */
export function restoreTimers(value: unknown): Timer[] | null {
  if (validTimers(value)) return value;
  if (!Array.isArray(value)) return null;
  const migrated = value.map((timer) => {
    if (
      !timer ||
      typeof timer !== "object" ||
      "zoom" in timer ||
      ![5, 10, 15, 30, 60].includes(timer.step)
    )
      return timer;
    const { step, ...rest } = timer;
    return {
      ...rest,
      zoom: clamp(
        Math.round((68 / step / BASE_CELL_WIDTH) * 4) / 4,
        MIN_ZOOM,
        MAX_ZOOM,
      ),
    };
  });
  return validTimers(migrated) ? migrated : null;
}
