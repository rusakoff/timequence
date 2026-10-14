import test from "node:test";
import assert from "node:assert/strict";
import { initialTimers, breathingTimer } from "./examples.ts";
import {
  makeTimer,
  makeTrack,
  makeEvent,
  sounds,
  moveEvent,
  repeatEvent,
  resizeTimer,
  validTimers,
  restoreTimers,
  snapToStep,
  changeTimerStep,
  inferStep,
  type SoundEvent,
} from "./model.ts";

test("changing grid step preserves timer duration and cue times", () => {
  const timer = initialTimers()[0];
  const changed = changeTimerStep(timer, 60);
  assert.equal(changed.step, 60);
  assert.equal(changed.duration, timer.duration);
  for (const [i, track] of changed.tracks.entries()) {
    assert.equal(track.id, timer.tracks[i].id);
    for (const [j, event] of track.events.entries()) {
      assert.equal(event.id, timer.tracks[i].events[j].id);
      assert.equal(event.at, timer.tracks[i].events[j].at);
    }
  }
  assert.deepEqual(changeTimerStep(changed, timer.step), timer);
  for (const step of [0, -1, NaN, Infinity, 0.5, timer.duration + 1])
    assert.equal(changeTimerStep(timer, step), timer);
});
test("cue positions stay within the timer and snap to whole seconds", () => {
  const e: SoundEvent = { id: "test", at: 20 };
  assert.equal(moveEvent(e, 100, 60).at, 59);
  assert.equal(moveEvent(e, -20, 60).at, 0);
});
test("repeat skips occupied starts and includes the final second", () => {
  const e: SoundEvent = { id: "test", at: 0 };
  const events = repeatEvent(e, 20, 55, [e, { ...e, id: "other", at: 20 }]);
  assert.deepEqual(
    events.map((e) => e.at),
    [0, 20, 40],
  );
  assert.equal(new Set(events.map((e) => e.id)).size, 3);
  assert.deepEqual(repeatEvent(e, 0, 55, [e]), [e]);
  assert.deepEqual(repeatEvent(e, NaN, 55, [e]), [e]);
});
test("shortening a timer removes cues beyond its end without changing others", () => {
  const timer = makeTimer();
  timer.tracks[0].events = [
    { id: "a", at: 30 },
    { id: "b", at: 60 },
  ];
  const shorter = resizeTimer(timer, 45);
  assert.equal(shorter.tracks[0].events.length, 1);
  assert.deepEqual(shorter.tracks[0].events[0], { id: "a", at: 30 });
  assert.equal(timer.tracks[0].events.length, 2);
  assert.equal(resizeTimer(timer, 18).step, 1);
});
test("saved data validates supported sounds, duration, volume and bounds", () => {
  const examples = initialTimers();
  assert.ok(validTimers(examples));
  assert.ok(validTimers([]));
  assert.ok(!validTimers([{ ...examples[0], step: 0 }]));
  assert.ok(!validTimers([{ ...examples[0], duration: Infinity }]));
  assert.ok(
    !validTimers([
      {
        ...examples[0],
        tracks: [{ ...examples[0].tracks[0], sound: "unknown" }],
      },
    ]),
  );
  assert.ok(
    !validTimers([
      { ...examples[0], tracks: [{ ...examples[0].tracks[0], volume: -10 }] },
    ]),
  );
});

test("legacy zoom timers infer a common step without changing time, events or IDs", () => {
  const timers = initialTimers();
  const legacy = timers.map(({ step, ...timer }) => ({ ...timer, zoom: 0.5 }));
  const migrated = restoreTimers(legacy)!;
  assert.ok(validTimers(migrated));
  migrated.forEach((timer, i) => {
    assert.deepEqual(timer.tracks, timers[i].tracks);
    assert.equal(timer.id, timers[i].id);
    assert.equal(timer.duration, timers[i].duration);
    assert.equal(timer.step, inferStep(timer));
    assert.ok(!("zoom" in timer));
  });
  assert.deepEqual(restoreTimers(migrated), migrated);
  assert.equal(restoreTimers([{ ...legacy[0], zoom: 0 }]), null);
});

test("drag and keyboard moves snap to a step and stay inside the last cell", () => {
  const e: SoundEvent = { id: "step", at: 10 };
  assert.equal(snapToStep(14, 5), 15);
  assert.equal(snapToStep(-14, 5), -15);
  assert.equal(moveEvent(e, 16, 60, 5).at, 15);
  assert.equal(moveEvent(e, 60, 60, 5).at, 55);
  assert.equal(moveEvent(e, -10, 60, 5).at, 0);
});

test("all bundled recordings and existing synth timers survive storage restoration", () => {
  const timer = makeTimer();
  for (const sound of sounds) {
    timer.tracks = [makeTrack(sound.id)];
    timer.tracks[0].events = [{ id: "preserve", at: 4 }];
    assert.deepEqual(restoreTimers(JSON.parse(JSON.stringify([timer]))), [
      timer,
    ]);
  }
  assert.equal(sounds.filter((sound) => sound.kind === "sample").length, 12);
});

test("all cues have only a start and identifier, independent of the chosen sound", () => {
  const cue = makeEvent(12);
  assert.equal(cue.at, 12);
  assert.deepEqual(Object.keys(cue).sort(), ["at", "id"]);
  const repeated = repeatEvent(cue, 1, 15, [cue]);
  assert.deepEqual(
    repeated.map((e) => e.at),
    [12, 13, 14],
  );
});

test("v1/v2/v3 events migrate to cues preserving IDs, positions, names and colors", () => {
  const timer = makeTimer();
  timer.tracks[0].name = "Вдох";
  timer.tracks[0].color = "blue";
  const legacy = [
    {
      ...timer,
      tracks: [
        {
          ...timer.tracks[0],
          events: [
            { id: "hit", at: 4, duration: 1, mode: "hit" },
            { id: "hold", at: 30, duration: 10, mode: "hold" },
            { id: "v3", at: 299, duration: 0.35 },
          ],
        },
      ],
    },
  ];
  const migrated = restoreTimers(legacy)!;
  assert.equal(migrated[0].tracks[0].name, "Вдох");
  assert.equal(migrated[0].tracks[0].color, "blue");
  assert.deepEqual(migrated[0].tracks[0].events, [
    { id: "hit", at: 4 },
    { id: "hold", at: 30 },
    { id: "v3", at: 299 },
  ]);
  assert.deepEqual(restoreTimers(migrated), migrated);
  assert.equal(legacy[0].tracks[0].events[1].duration, 10);
  legacy[0].tracks[0].events[0].mode = "broken";
  assert.equal(restoreTimers(legacy), null);
  legacy[0].tracks[0].events[0].mode = "hit";
  legacy[0].tracks[0].events[0].duration = -1;
  assert.equal(restoreTimers(legacy), null);
});

test("cue validation rejects a position at the end and obsolete duration controls", () => {
  const timer = makeTimer();
  timer.tracks[0].events = [{ id: "end", at: 300 }];
  assert.equal(validTimers([timer]), false);
  timer.tracks[0].events[0].at = 299;
  assert.equal(validTimers([timer]), true);
  Object.assign(timer.tracks[0].events[0], { duration: 1 });
  assert.equal(validTimers([timer]), false);
});

test("breathing example marks four 4/7/8-second cycles with independent colored tracks", () => {
  const timer = breathingTimer();
  assert.deepEqual(
    timer.tracks.filter((t) => !t.tickEvery).map((t) => t.name),
    ["Вдох", "Задержка", "Выдох"],
  );
  assert.equal(
    new Set(timer.tracks.filter((t) => !t.tickEvery).map((t) => t.color)).size,
    3,
  );
  const starts = timer.tracks
    .flatMap((t) => t.events.map((e) => e.at))
    .sort((a, b) => a - b);
  assert.deepEqual(starts.slice(0, 7), [0, 4, 11, 19, 23, 30, 38]);
  assert.equal(starts.at(-1), 68);
  assert.equal(timer.duration, 76);
  assert.equal(starts.length, 12);
  assert.ok(validTimers([timer]));
});

test("every bundled sound is at most three seconds", () => {
  assert.ok(sounds.every((sound) => sound.duration > 0 && sound.duration <= 3));
});
