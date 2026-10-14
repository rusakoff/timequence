import test from "node:test";
import assert from "node:assert/strict";
import {
  makeTimer,
  makeTrack,
  makeTickTrack,
  withTickTracks,
  changeTimerStep,
  resizeTimer,
  validTimers,
} from "./model.ts";
import { initialTimers } from "./examples.ts";
import { loadTimers, serializeTimers, STORAGE } from "./storage.ts";
import { cueMoments, currentSegment } from "./zen.ts";

test("all examples and new timers have one independent stopwatch track", () => {
  for (const timer of [makeTimer(), ...initialTimers()]) {
    const ticks = timer.tracks.filter((t) => t.tickEvery);
    assert.deepEqual(ticks.map((t) => t.tickEvery), [1]);
    assert.ok(ticks.every((t) => !t.muted && t.events.length === 0));
    const changed = resizeTimer(changeTimerStep(timer, 1), 3600);
    assert.deepEqual(
      changed.tracks.filter((t) => t.tickEvery),
      ticks,
    );
    assert.deepEqual(withTickTracks(timer), timer);
  }
});

test("v8 migration adds one-second ticks once and retains user settings in v10", () => {
  const original = { ...makeTimer(), tracks: [makeTrack("nepal-bell")] };
  const raw = JSON.stringify({ version: 8, timers: [original] });
  const migrated = loadTimers((key) =>
    key === "timequence.timers.v8" ? raw : null,
  );
  assert.equal(migrated[0].id, original.id);
  assert.deepEqual(migrated[0].tracks[0], original.tracks[0]);
  assert.equal(migrated[0].tracks.length, 2);
  migrated[0].tracks[1].muted = true;
  const saved = serializeTimers(migrated);
  assert.deepEqual(
    loadTimers((key) => (key === STORAGE ? saved : raw)),
    migrated,
  );
});

test("v9 migration removes only the five-second track and honors deleted one-second ticks", () => {
  const action = makeTrack("nepal-bell");
  const one = { ...makeTickTrack(1), muted: true, volume: 17 };
  const five = {
    ...makeTrack("tick-accent"),
    name: "Тик · 5 с",
    tickEvery: 5 as const,
  };
  const old = { ...makeTimer(), tracks: [action, one, five] };
  const raw = JSON.stringify({ version: 9, timers: [old] });
  const migrated = loadTimers((key) =>
    key === "timequence.timers.v9" ? raw : null,
  );
  assert.deepEqual(migrated[0].tracks, [action, one]);
  assert.deepEqual(
    loadTimers((key) =>
      key === "timequence.timers.v9"
        ? JSON.stringify({ version: 9, timers: [{ ...old, tracks: [action, five] }] })
        : null,
    )[0].tracks,
    [action],
  );
  assert.deepEqual(JSON.parse(serializeTimers([old])).timers[0].tracks, [action, one]);
});

test("one stopwatch track fits alongside 16 action tracks and validates its interval", () => {
  const timer = withTickTracks({
    ...makeTimer(),
    tracks: Array.from({ length: 16 }, () => makeTrack("woodblock")),
  });
  assert.equal(timer.tracks.length, 17);
  assert.ok(validTimers([timer]));
  assert.equal(
    validTimers([{ ...timer, tracks: [...timer.tracks, makeTickTrack(1)] }]),
    false,
  );
  assert.equal(
    validTimers([
      { ...timer, tracks: [{ ...makeTickTrack(1), tickEvery: 2 }] },
    ]),
    false,
  );
});

test("clock tracks do not interrupt action segments in zen mode", () => {
  const timer = initialTimers()[1];
  const moments = cueMoments(timer);
  assert.equal(
    currentSegment(moments, timer.duration, 2).current?.tracks[0].name,
    "Вдох",
  );
  assert.equal(
    currentSegment(moments, timer.duration, 5).current?.tracks[0].name,
    "Задержка",
  );
  assert.equal(currentSegment(moments, timer.duration, 5).remaining, 6);
  assert.ok(
    moments.every((moment) => moment.tracks.every((t) => !t.tickEvery)),
  );
});
