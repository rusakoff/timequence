import { legacySounds } from "./sounds.ts";
import {
  makeEvent,
  makeTimer,
  makeTrack,
  inferStep,
  withTickTracks,
  type Timer,
  type Track,
  type SoundId,
} from "./model.ts";

type Phase = [name: string, seconds: number, sound: SoundId, color: string];
type Part = { repeat?: number; phases: Phase[] };

/** Phases become start cues; their durations are not stored on the events. */
function sequence(name: string, parts: Part[]): Timer {
  const tracks = new Map<string, Track>();
  let at = 0;
  for (const part of parts) {
    for (let cycle = 0; cycle < (part.repeat ?? 1); cycle++) {
      for (const [name, seconds, sound, color] of part.phases) {
        const track = tracks.get(name) ?? { ...makeTrack(sound), name, color };
        track.events.push(makeEvent(at));
        tracks.set(name, track);
        at += seconds;
      }
    }
  }
  return withTickTracks({
    ...makeTimer(name),
    step: inferStep({ duration: at, tracks: [...tracks.values()] }),
    duration: at,
    tracks: [...tracks.values()],
  });
}

export function breathingTimer(): Timer {
  return sequence("Дыхание 4–7–8", [
    {
      repeat: 4,
      phases: [
        ["Вдох", 4, "notification", "sage"],
        ["Задержка", 7, "press", "sand"],
        ["Выдох", 8, "success", "blue"],
      ],
    },
  ]);
}

export function initialTimers(): Timer[] {
  return [
    sequence("Тренировка · 60 / 30", [
      {
        repeat: 6,
        phases: [
          ["Упражнение", 60, "snap", "orange"],
          ["Отдых", 30, "notification", "sage"],
        ],
      },
    ]),
    breathingTimer(),
    sequence("Глаза · влево / вправо", [
      { phases: [["Закройте глаза", 3, "checkpoint", "sand"]] },
      {
        repeat: 3,
        phases: [
          ["Медленно влево", 3, "press", "sage"],
          ["Медленно вправо", 3, "success", "blue"],
        ],
      },
      { phases: [["Откройте глаза", 3, "notification", "clay"]] },
    ]),
    sequence("Табата · 20 / 10", [
      {
        repeat: 8,
        phases: [
          ["Упражнение", 20, "snap", "orange"],
          ["Отдых", 10, "checkpoint", "blue"],
        ],
      },
    ]),
    sequence("Чистка зубов", [
      {
        phases: [
          ["Сверху слева", 30, "press", "sage"],
          ["Сверху справа", 30, "select", "blue"],
          ["Снизу справа", 30, "notification", "sand"],
          ["Снизу слева", 30, "checkpoint", "clay"],
        ],
      },
    ]),
    ...additionalTimers(),
  ];
}

export function additionalTimers(): Timer[] {
  return [
    sequence("Круговая тренировка", [
      {
        repeat: 3,
        phases: [
          ["Приседания", 30, "snap", "orange"],
          ["Отдых", 15, "notification", "sage"],
          ["Отжимания", 30, "press", "sand"],
          ["Отдых", 15, "notification", "sage"],
          ["Планка", 30, "select", "blue"],
          ["Отдых", 15, "notification", "sage"],
        ],
      },
    ]),
    sequence("Растяжка · левая / правая", [
      {
        repeat: 2,
        phases: [
          ["Левая сторона", 30, "notification", "sage"],
          ["Смените положение", 5, "press", "sand"],
          ["Правая сторона", 30, "success", "blue"],
          ["Отдых", 10, "checkpoint", "clay"],
        ],
      },
    ]),
    sequence("Запоминание · карточки", [
      {
        repeat: 10,
        phases: [
          ["Посмотрите", 10, "press", "sage"],
          ["Вспомните", 20, "notification", "blue"],
          ["Проверьте", 5, "select", "sand"],
          ["Следующая карточка", 5, "checkpoint", "orange"],
        ],
      },
    ]),
  ];
}

/** Add this release's examples once, without restoring previously deleted ones. */
export function addNewExamples(saved: Timer[]): Timer[] {
  const names = new Set(saved.map((timer) => timer.name));
  const additions = additionalTimers().filter(
    (timer) => !names.has(timer.name),
  );
  return [...saved, ...additions.slice(0, Math.max(0, 100 - saved.length))];
}

/** Match old names and colors after their sound IDs have migrated to Glass. */
function makeLegacyTrack(id: keyof typeof legacySounds): Track {
  const [sound, name, color] = legacySounds[id];
  return { ...makeTrack(sound), name, color };
}

/** Known, untouched old demos, after event-format and sound migration. */
export function legacyExampleTimers(): Timer[] {
  const examples: Timer[] = [];
  for (const sample of [true, false]) {
    const sounds: (keyof typeof legacySounds)[] = sample
      ? ["nepal-bell", "woodblock", "vibraphone", "bell-tree"]
      : ["bell", "pulse", "bowl", "chime"];
    const rhythm = makeTimer("Мой ритм");
    rhythm.tracks = sounds.map(makeLegacyTrack);
    [
      [0, 60, 120, 180, 240],
      [30, 90, 150, 210, 270],
      [0, 120, 240],
      [290],
    ].forEach(
      (positions, index) =>
        (rhythm.tracks[index].events = positions.map(makeEvent)),
    );
    const intervals = { ...makeTimer("Короткие интервалы"), duration: 180 };
    intervals.tracks = [makeLegacyTrack(sounds[0])];
    intervals.tracks[0].events = Array.from({ length: 18 }, (_, i) =>
      makeEvent(i * 10),
    );
    const quiet = {
      ...makeTimer("Тихая последовательность"),
      duration: 600,
      step: 60,
    };
    quiet.tracks = (
      sample ? (["gong", "hand-chime"] as const) : (["bowl", "air"] as const)
    ).map(makeLegacyTrack);
    quiet.tracks.forEach(
      (track, i) =>
        (track.events = Array.from({ length: 5 }, (_, n) =>
          makeEvent(n * 120 + i * 60),
        )),
    );
    examples.push(rhythm, intervals, quiet);
  }
  examples.push(
    sequence("Дыхание 3–4–5", [
      {
        repeat: 10,
        phases: [
          ["Вдох", 3, "notification", "sage"],
          ["Задержка", 4, "press", "sand"],
          ["Выдох", 5, "success", "blue"],
        ],
      },
    ]),
  );
  return examples;
}

function contentSignature(timer: Timer): string {
  return JSON.stringify({
    name: timer.name,
    duration: timer.duration,
    loop: timer.loop,
    tracks: timer.tracks
      .filter((t) => !t.tickEvery)
      .map(({ sound, name, color, volume, muted, events }) => ({
        sound,
        name,
        color,
        volume,
        muted,
        events: events.map((e) => e.at).sort((a, b) => a - b),
      })),
  });
}

/** These named examples were explicitly requested for removal. */
export function removeRetiredExamples(saved: Timer[]): Timer[] {
  const retired = new Set([
    "Фокус · 25 / 5",
    "Зелёный чай",
    "Медитация · 5 минут",
    "Уборка · 15 минут",
    "Выступление · 10 минут",
    "Тихая последовательность",
  ]);
  return saved.filter((timer) => !retired.has(timer.name));
}

/** Replace untouched demos and remove retired examples; keep other edits and IDs. */
export function upgradeDefaultTimers(saved: Timer[]): Timer[] {
  const legacy = new Set(legacyExampleTimers().map(contentSignature));
  const kept = removeRetiredExamples(saved).filter(
    (timer) => !legacy.has(contentSignature(timer)),
  );
  const existing = new Set(kept.map(contentSignature));
  const additions = initialTimers().filter(
    (timer) => !existing.has(contentSignature(timer)),
  );
  return [...additions.slice(0, Math.max(0, 100 - kept.length)), ...kept];
}
