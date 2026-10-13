import test from "node:test";
import assert from "node:assert/strict";
import { makeEvent, makeTimer, makeTrack } from "./model.ts";
import { breathingTimer } from "./examples.ts";
import { cueMoments, currentSegment } from "./zen.ts";

test("zen follows 4–7–8 intervals and switches precisely on the next cue", () => {
  const timer = breathingTimer();
  const moments = cueMoments(timer);
  const inhale = currentSegment(moments, timer.duration, 3.5);
  assert.equal(inhale.current?.tracks[0].name, "Вдох");
  assert.equal(inhale.remaining, 0.5);
  assert.equal(inhale.progress, 3.5 / 4);
  const hold = currentSegment(moments, timer.duration, 4);
  assert.equal(hold.current?.tracks[0].name, "Задержка");
  assert.equal(hold.remaining, 7);
  assert.equal(hold.progress, 0);
  assert.equal(currentSegment(moments, timer.duration, 11).remaining, 8);
  assert.equal(
    currentSegment(moments, timer.duration, 19).current?.tracks[0].name,
    "Вдох",
  );
});

test("simultaneous cues remain grouped, including muted and zero-volume tracks", () => {
  const timer = makeTimer();
  timer.tracks = [
    { ...makeTrack("bell"), muted: true, events: [makeEvent(3), makeEvent(0)] },
    { ...makeTrack("pulse"), volume: 0, events: [makeEvent(0)] },
  ];
  const moments = cueMoments(timer);
  assert.deepEqual(
    moments.map((m) => [m.at, m.tracks.length]),
    [
      [0, 2],
      [3, 1],
    ],
  );
  assert.deepEqual(
    currentSegment(moments, 10, 0).current?.tracks.map((t) => t.id),
    timer.tracks.map((t) => t.id),
  );
});

test("preparation, final interval and completion do not invent a next cue", () => {
  const timer = { ...makeTimer(), duration: 12 };
  timer.tracks[0].events = [makeEvent(4), makeEvent(7)];
  const moments = cueMoments(timer);
  const before = currentSegment(moments, 12, 1);
  assert.equal(before.current, null);
  assert.equal(before.remaining, 3);
  assert.equal(before.start, 0);
  const last = currentSegment(moments, 12, 10);
  assert.equal(last.next, null);
  assert.equal(last.remaining, 2);
  assert.equal(last.finished, false);
  const done = currentSegment(moments, 12, 12.1);
  assert.equal(done.finished, true);
  assert.equal(done.progress, 1);
  assert.equal(done.remaining, 0);
  assert.equal(currentSegment(moments, 12, 0).current, null);
});

test("an empty sequence still has a finite silent interval", () => {
  const segment = currentSegment([], 10, 5);
  assert.equal(segment.current, null);
  assert.equal(segment.next, null);
  assert.equal(segment.remaining, 5);
  assert.equal(segment.progress, 0.5);
});
