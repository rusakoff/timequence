import { restoreTimers, withTickTracks, type Timer } from "./model.ts";
import {
  initialTimers,
  addNewExamples,
  removeRetiredExamples,
  upgradeDefaultTimers,
} from "./examples.ts";

export const STORAGE = "timequence.timers.v9";
const LEGACY_STORAGE = [
  "timequence.timers.v8",
  "timequence.timers.v7",
  "timequence.timers.v6",
  "timequence.timers.v5",
  "timequence.timers.v4",
  "timequence.timers.v3",
  "timequence.timers.v2",
  "timequence.timers.v1",
];

/** The app writes only v9, so previous libraries remain untouched backups. */
export function loadTimers(read: (key: string) => string | null): Timer[] {
  for (const key of [STORAGE, ...LEGACY_STORAGE]) {
    const raw = read(key);
    if (raw === null) continue;
    try {
      const parsed = JSON.parse(raw);
      const versioned =
        [5, 6, 7, 8, 9].includes(parsed?.version) && !Array.isArray(parsed);
      const timers = restoreTimers(versioned ? parsed.timers : parsed);
      if (timers) {
        if (key === STORAGE && parsed?.version === 9) return timers;
        if (key === "timequence.timers.v5" || key === "timequence.timers.v6")
          return addNewExamples(removeRetiredExamples(timers)).map(
            withTickTracks,
          );
        if (key === "timequence.timers.v7")
          return addNewExamples(timers).map(withTickTracks);
        if (key === "timequence.timers.v8") return timers.map(withTickTracks);
        return upgradeDefaultTimers(timers).map(withTickTracks);
      }
    } catch {
      /* Try the previous library if this snapshot cannot be parsed. */
    }
  }
  return initialTimers();
}

export function serializeTimers(timers: Timer[]): string {
  return JSON.stringify({ version: 9, timers });
}
