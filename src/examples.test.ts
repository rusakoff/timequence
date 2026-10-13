import test from "node:test";
import assert from "node:assert/strict";
import {
  initialTimers,
  additionalTimers,
  addNewExamples,
  legacyExampleTimers,
  upgradeDefaultTimers,
} from "./examples.ts";
import { makeTimer, sounds, validTimers } from "./model.ts";
import { loadTimers, serializeTimers, STORAGE } from "./storage.ts";
import { cueMoments, currentSegment } from "./zen.ts";

test("eight real examples have named actions, valid cues and independent IDs", () => {
  const timers = initialTimers();
  assert.equal(timers.length, 8);
  assert.ok(validTimers(timers));
  assert.deepEqual(
    timers.map((t) => t.duration),
    [540, 76, 24, 240, 120, 405, 150, 400],
  );
  const ids = timers.flatMap((t) => [
    t.id,
    ...t.tracks.flatMap((tr) => [tr.id, ...tr.events.map((e) => e.id)]),
  ]);
  assert.equal(new Set(ids).size, ids.length);
  for (const timer of timers) {
    assert.equal(timer.loop, false);
    assert.equal(cueMoments(timer)[0].at, 0);
    for (const track of timer.tracks.filter((t) => !t.tickEvery)) {
      assert.ok(track.name.length > 0);
      assert.ok(!sounds.some((sound) => sound.name === track.name));
      assert.ok(track.events.length > 0);
      assert.equal(
        new Set(track.events.map((e) => e.at)).size,
        track.events.length,
      );
    }
  }
});

test("exercise and rest alternate for six 60/30 rounds and eight 20/10 rounds", () => {
  const timers = initialTimers();
  for (const [index, work, rest, cycles] of [
    [0, 60, 30, 6],
    [3, 20, 10, 8],
  ]) {
    const timer = timers[index];
    const moments = cueMoments(timer);
    assert.deepEqual(
      timer.tracks.filter((t) => !t.tickEvery).map((t) => t.name),
      ["Упражнение", "Отдых"],
    );
    for (let i = 0; i < cycles; i++) {
      assert.equal(
        currentSegment(moments, timer.duration, i * (work + rest)).remaining,
        work,
      );
      assert.equal(
        currentSegment(moments, timer.duration, i * (work + rest) + work)
          .remaining,
        rest,
      );
    }
  }
});

test("eye example has three left/right repetitions with preparation and release", () => {
  const eyes = initialTimers()[2];
  assert.deepEqual(
    eyes.tracks
      .filter((t) => !t.tickEvery)
      .map((t) => [t.name, t.events.map((e) => e.at)]),
    [
      ["Закройте глаза", [0]],
      ["Медленно влево", [3, 9, 15]],
      ["Медленно вправо", [6, 12, 18]],
      ["Откройте глаза", [21]],
    ],
  );
});

test("v5 upgrade removes only requested examples without restoring deleted presets", () => {
  const retired = [
    "Фокус · 25 / 5",
    "Зелёный чай",
    "Медитация · 5 минут",
    "Уборка · 15 минут",
    "Выступление · 10 минут",
    "Тихая последовательность",
  ].map(makeTimer);
  const edited = initialTimers()[0];
  edited.tracks[0].name = "Приседания";
  const personal = makeTimer("Личный");
  const old = JSON.stringify({
    version: 5,
    timers: [edited, ...retired, personal],
  });
  const storage = new Map([["timequence.timers.v5", old]]);
  assert.deepEqual(loadTimers((key) => storage.get(key) ?? null).slice(0, 2), [
    edited,
    personal,
  ]);
  assert.equal(storage.get("timequence.timers.v5"), old);
  assert.deepEqual(
    loadTimers((key) =>
      key === "timequence.timers.v5"
        ? JSON.stringify({ version: 5, timers: [] })
        : null,
    ).map((t) => t.name),
    additionalTimers().map((t) => t.name),
  );
});

test("upgrade replaces only untouched legacy demos and preserves edits and user IDs", () => {
  const legacy = legacyExampleTimers();
  const edited = structuredClone(legacy[0]);
  edited.tracks[0].name = "Моё действие";
  const personal = makeTimer("Мой собственный таймер");
  const saved = [...legacy, edited, personal];
  const before = structuredClone(saved);
  const upgraded = upgradeDefaultTimers(saved);
  assert.equal(upgraded.length, 10);
  assert.deepEqual(upgraded.slice(8), [edited, personal]);
  assert.deepEqual(saved, before);
  assert.ok(validTimers(upgraded));
});

test("upgrade respects capacity and does not duplicate the new examples", () => {
  const full = Array.from({ length: 100 }, (_, i) => makeTimer(`Личный ${i}`));
  assert.deepEqual(upgradeDefaultTimers(full), full);
  const current = initialTimers();
  assert.deepEqual(upgradeDefaultTimers(current), current);
});

test("v9 preserves edits, empty libraries and deliberate deletion of examples", () => {
  for (const timers of [[], initialTimers().slice(1), [makeTimer("Свой")]]) {
    const storage = new Map([
      [STORAGE, serializeTimers(timers)],
      ["timequence.timers.v4", JSON.stringify(legacyExampleTimers())],
    ]);
    assert.deepEqual(
      loadTimers((key) => storage.get(key) ?? null),
      timers,
    );
  }
});

test("legacy library loads new examples once and stays intact as a backup", () => {
  const original = [makeTimer("Личный"), ...legacyExampleTimers()];
  const old = JSON.stringify(original);
  const storage = new Map([["timequence.timers.v4", old]]);
  const timers = loadTimers((key) => storage.get(key) ?? null);
  assert.equal(timers.length, 9);
  assert.deepEqual(timers.at(-1), original[0]);
  storage.set(STORAGE, serializeTimers(timers));
  assert.deepEqual(
    loadTimers((key) => storage.get(key) ?? null),
    timers,
  );
  assert.equal(storage.get("timequence.timers.v4"), old);
});

test("fresh installs and unreadable current storage can load usable examples", () => {
  assert.equal(loadTimers(() => null).length, 8);
  const old = JSON.stringify([makeTimer("Личный")]);
  const timers = loadTimers((key) =>
    key === STORAGE ? "broken" : key === "timequence.timers.v4" ? old : null,
  );
  assert.equal(timers.length, 9);
  assert.equal(timers.at(-1)?.name, "Личный");
});

test("v6 upgrade removes focus while retaining existing edits and omissions", () => {
  const personal = makeTimer("Личный");
  const old = JSON.stringify({
    version: 6,
    timers: [makeTimer("Фокус · 25 / 5"), personal],
  });
  assert.deepEqual(
    loadTimers((key) => (key === "timequence.timers.v6" ? old : null)).slice(
      0,
      1,
    ),
    [personal],
  );
});

test("v7 adds only the three agreed examples, preserving edits and deleted defaults", () => {
  const custom = makeTimer("Мой сценарий");
  const edited = additionalTimers()[0];
  edited.tracks[0].name = "Моё упражнение";
  const old = JSON.stringify({ version: 7, timers: [custom, edited] });
  const migrated = loadTimers((key) =>
    key === "timequence.timers.v7" ? old : null,
  );
  assert.equal(migrated.length, 4);
  assert.deepEqual(migrated.slice(0, 2), [custom, edited]);
  assert.deepEqual(
    migrated.slice(2).map((t) => t.name),
    additionalTimers()
      .slice(1)
      .map((t) => t.name),
  );
  assert.deepEqual(addNewExamples(migrated), migrated);
  assert.deepEqual(
    addNewExamples(
      Array.from({ length: 100 }, (_, i) => makeTimer(`Личный ${i}`)),
    ).length,
    100,
  );
  const saved = serializeTimers(migrated.slice(0, 2));
  assert.deepEqual(
    loadTimers((key) => (key === STORAGE ? saved : old)),
    [custom, edited],
  );
});

test("new sequences use whole steps and distinct actions, with usable segment boundaries", () => {
  const [circuit, stretch, cards] = additionalTimers();
  for (const timer of [circuit, stretch, cards]) {
    assert.equal(timer.duration % timer.step, 0);
    assert.equal(
      new Set(timer.tracks.filter((t) => !t.tickEvery).map((t) => t.color))
        .size,
      timer.tracks.filter((t) => !t.tickEvery).length,
    );
    for (const track of timer.tracks)
      for (const e of track.events) assert.equal(e.at % timer.step, 0);
  }
  assert.deepEqual(
    cueMoments(circuit)
      .slice(0, 6)
      .map((m) => [m.at, m.tracks[0].name]),
    [
      [0, "Приседания"],
      [30, "Отдых"],
      [45, "Отжимания"],
      [75, "Отдых"],
      [90, "Планка"],
      [120, "Отдых"],
    ],
  );
  assert.equal(
    currentSegment(cueMoments(stretch), stretch.duration, 30).current?.tracks[0]
      .name,
    "Смените положение",
  );
  assert.equal(
    currentSegment(cueMoments(stretch), stretch.duration, 35).current?.tracks[0]
      .name,
    "Правая сторона",
  );
  assert.equal(
    currentSegment(cueMoments(cards), cards.duration, 10).remaining,
    20,
  );
  assert.equal(
    currentSegment(cueMoments(cards), cards.duration, 40).current?.tracks[0]
      .name,
    "Посмотрите",
  );
});
