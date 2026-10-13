import test from "node:test";
import assert from "node:assert/strict";
import {
  initialTimers,
  makeTimer,
  makeTrack,
  sounds,
  moveEvent,
  repeatEvent,
  resizeTimer,
  validTimers,
  restoreTimers,
  snapSecond,
  rulerInterval,
  type SoundEvent,
} from "./model.ts";

test("changing zoom preserves absolute event timing and duration", () => {
  const timer = initialTimers()[0];
  const changed = { ...timer, zoom: 4 };
  assert.deepEqual(changed.tracks, timer.tracks);
  assert.equal(changed.tracks[1].events[1].at, 90);
});
test("held events cannot move outside the timer", () => {
  const e: SoundEvent = { id: "test", at: 20, duration: 10, mode: "hold" };
  assert.equal(moveEvent(e, 100, 60).at, 50);
  assert.equal(moveEvent(e, -20, 60).at, 0);
  assert.equal(moveEvent({ ...e, mode: "hit" }, 100, 60).at, 59);
});
test("repeat skips existing positions and clips at the timer end", () => {
  const e: SoundEvent = { id: "test", at: 0, duration: 10, mode: "hold" };
  const events = repeatEvent(e, 20, 55, [e, { ...e, id: "other", at: 20 }]);
  assert.deepEqual(
    events.map((e) => e.at),
    [0, 20, 40],
  );
  assert.equal(new Set(events.map((e) => e.id)).size, 3);
  assert.deepEqual(repeatEvent(e, 0, 55, [e]), [e]);
  assert.deepEqual(repeatEvent(e, NaN, 55, [e]), [e]);
});
test("shortening the timer removes out-of-range hits and trims held events", () => {
  const timer = makeTimer();
  timer.tracks[0].events = [
    { id: "a", at: 30, duration: 25, mode: "hold" },
    { id: "b", at: 60, duration: 1, mode: "hit" },
  ];
  const shorter = resizeTimer(timer, 45);
  assert.equal(shorter.tracks[0].events.length, 1);
  assert.equal(shorter.tracks[0].events[0].duration, 15);
  assert.equal(timer.tracks[0].events[0].duration, 25);
});
test("saved data validates supported sounds, duration, volume and bounds", () => {
  const examples = initialTimers();
  assert.ok(validTimers(examples));
  assert.ok(validTimers([]));
  assert.ok(!validTimers([{ ...examples[0], zoom: 0 }]));
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

test("legacy timers migrate without changing events or identifiers", () => {
  const timers = initialTimers();
  const legacy = timers.map(({ zoom, ...timer }, i) => ({
    ...timer,
    step: [30, 10, 60][i],
  }));
  const migrated = restoreTimers(legacy)!;
  assert.ok(validTimers(migrated));
  migrated.forEach((timer, i) => {
    assert.deepEqual(timer.tracks, timers[i].tracks);
    assert.equal(timer.id, timers[i].id);
    assert.equal(timer.duration, timers[i].duration);
    assert.ok(!("step" in timer));
  });
  assert.deepEqual(restoreTimers(migrated), migrated);
  assert.equal(restoreTimers([{ ...legacy[0], step: 0 }]), null);
});

test("dragging always snaps to whole seconds independently of zoom", () => {
  const e: SoundEvent = { id: "second", at: 5, duration: 10, mode: "hold" };
  assert.equal(snapSecond(1.6), 2);
  assert.equal(snapSecond(-1.6), -2);
  assert.equal(moveEvent(e, 6.4, 60).at, 6);
  assert.equal(moveEvent(e, 6.6, 60).at, 7);
  assert.equal(rulerInterval(8), 10);
  assert.equal(rulerInterval(128), 1);
});

test("all bundled recordings and existing synth timers survive storage restoration", () => {
  const timer = makeTimer();
  for (const sound of sounds) {
    timer.tracks = [makeTrack(sound.id)];
    timer.tracks[0].events = [
      { id: "preserve", at: 4, duration: 10, mode: "hold" },
    ];
    assert.deepEqual(restoreTimers(JSON.parse(JSON.stringify([timer]))), [
      timer,
    ]);
  }
  assert.equal(sounds.filter((sound) => sound.kind === "sample").length, 12);
});
