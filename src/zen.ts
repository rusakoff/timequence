import { clamp, type Timer, type Track } from "./model.ts";

export type CueMoment = { at: number; tracks: Track[] };

/** Muting controls audio only; silent tracks still provide visual cues. */
export function cueMoments(timer: Timer): CueMoment[] {
  const moments = new Map<number, Track[]>();
  for (const track of timer.tracks) {
    if (track.tickEvery) continue;
    for (const event of track.events) {
      const tracks = moments.get(event.at) ?? [];
      if (!tracks.includes(track)) tracks.push(track);
      moments.set(event.at, tracks);
    }
  }
  return [...moments]
    .map(([at, tracks]) => ({ at, tracks }))
    .sort((a, b) => a.at - b.at);
}

/** An interval runs from the latest cue to the next cue (or the timer end). */
export function currentSegment(
  moments: CueMoment[],
  duration: number,
  position: number,
) {
  const at = clamp(position, 0, duration);
  let low = 0;
  let high = moments.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (moments[mid].at <= at) low = mid + 1;
    else high = mid;
  }
  const current = moments[low - 1] ?? null;
  const next = moments[low] ?? null;
  const start = current?.at ?? 0;
  const end = next?.at ?? duration;
  return {
    current,
    next,
    start,
    end,
    remaining: Math.max(0, end - at),
    progress: end > start ? clamp((at - start) / (end - start), 0, 1) : 1,
    finished: at >= duration,
  };
}
