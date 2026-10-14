import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { AudioEngine, SoundLoadError } from "./audio.ts";
import { createRecipe, renderRecipe } from "uisfx";
import { getSound, sounds } from "./sounds.ts";
import { makeTimer, makeTrack, makeTickTrack, type SoundId } from "./model.ts";

class Param {
  value = 0;
  setValueAtTime(value: number) {
    this.value = value;
  }
  setTargetAtTime(value: number) {
    this.value = value;
  }
  linearRampToValueAtTime() {}
  exponentialRampToValueAtTime() {}
}
class Node {
  gain = new Param();
  frequency = new Param();
  Q = new Param();
  threshold = new Param();
  knee = new Param();
  ratio = new Param();
  attack = new Param();
  release = new Param();
  type = "";
  disconnected = false;
  connections: Node[] = [];
  connect(node: Node) {
    this.connections.push(node);
  }
  disconnect() {
    this.disconnected = true;
  }
}
class Buffer {
  duration: number;
  numberOfChannels: number;
  sampleRate: number;
  channels: Float32Array[];
  constructor(channels: number, length: number, rate: number) {
    this.duration = length / rate;
    this.numberOfChannels = channels;
    this.sampleRate = rate;
    this.channels = Array.from(
      { length: channels },
      () => new Float32Array(length),
    );
  }
  getChannelData(channel: number) {
    return this.channels[channel];
  }
  copyToChannel(data: Float32Array, channel: number) {
    this.channels[channel].set(data);
  }
}
class Source extends Node {
  buffer: Buffer | null = null;
  loop = false;
  starts: number[][] = [];
  stops: number[] = [];
  onended: (() => void) | null = null;
  start(...args: number[]) {
    this.starts.push(args);
  }
  stop(at = 0) {
    this.stops.push(at);
  }
}
class Context {
  static resumeGate: Promise<void> | null = null;
  static rate = 8000;
  currentTime = 0;
  state = Context.resumeGate ? "suspended" : "running";
  sampleRate = Context.rate;
  destination = new Node();
  buffers: Source[] = [];
  oscillators: Source[] = [];
  async resume() {
    await Context.resumeGate;
    this.state = "running";
  }
  createGain() {
    return new Node();
  }
  createDynamicsCompressor() {
    return new Node();
  }
  createBiquadFilter() {
    return new Node();
  }
  createBuffer(channels: number, length: number, rate: number) {
    return new Buffer(channels, length, rate);
  }
  createBufferSource() {
    const source = new Source();
    this.buffers.push(source);
    return source;
  }
  createOscillator() {
    const source = new Source();
    this.oscillators.push(source);
    return source;
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
function timerWith(sound: SoundId, length = 10) {
  const timer = makeTimer();
  timer.duration = length;
  timer.tracks = [makeTrack(sound)];
  timer.tracks[0].events = [{ id: "event", at: 0 }];
  return timer;
}
const context = (engine: AudioEngine) => engine.context as unknown as Context;
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 0.0002, `${actual} != ${expected}`);
beforeEach(() => {
  Context.resumeGate = null;
  Context.rate = 8000;
  globalThis.AudioContext = Context as unknown as typeof AudioContext;
  globalThis.fetch = async () => { throw new Error("Glass must not fetch audio files"); };
});

test("preview and transport use the actual Glass renderer and share cached buffers", async () => {
  const preview = new AudioEngine();
  const timer = new AudioEngine();
  await Promise.all([preview.preview("notification", 70, 0), timer.start(timerWith("notification"), 0, 0)]);
  const buffer = context(preview).buffers[0].buffer!;
  const expected = renderRecipe(createRecipe("glass", "notification"), Context.rate);
  assert.deepEqual(buffer.getChannelData(0), expected.left);
  assert.deepEqual(buffer.getChannelData(1), expected.right);
  assert.equal(context(timer).buffers[0].buffer, buffer);
  assert.equal(preview.master!.gain.value, 0);
  assert.equal(timer.master!.gain.value, 0);
  assert.equal(context(timer).oscillators.length, 0);
  assert.equal(context(timer).buffers[0].loop, false);
});

test("Glass buffer cache respects each context sample rate", async () => {
  const first = new AudioEngine();
  await first.preview("notification");
  Context.rate = 16000;
  const second = new AudioEngine();
  await second.preview("notification");
  const a = context(first).buffers[0].buffer!;
  const b = context(second).buffers[0].buffer!;
  assert.notEqual(a, b);
  assert.equal(a.sampleRate, 8000);
  assert.equal(b.sampleRate, 16000);
  near(a.duration, b.duration);
});

test("timer clock waits for audio unlock and cancellation prevents late playback", async () => {
  const gate = deferred<void>();
  Context.resumeGate = gate.promise;
  const engine = new AudioEngine();
  const starting = engine.start(timerWith("start"), 0, 65);
  assert.equal(engine.running, false);
  assert.equal(context(engine).buffers.length, 0);
  context(engine).currentTime = 20;
  gate.resolve();
  assert.equal(await starting, true);
  assert.equal(engine.startedAt, 20.06);
  assert.equal(context(engine).buffers[0].starts[0][0], 20.06);

  const pending = deferred<void>();
  Context.resumeGate = pending.promise;
  const cancelled = new AudioEngine();
  const playing = cancelled.start(timerWith("start"), 0, 65);
  cancelled.stop();
  pending.resolve();
  assert.equal(await playing, false);
  assert.equal(cancelled.running, false);
  assert.equal(context(cancelled).buffers.length, 0);
});

test("cancelling a pending preview cannot play late or call its end callback", async () => {
  const gate = deferred<void>();
  Context.resumeGate = gate.promise;
  const engine = new AudioEngine();
  let ended = false;
  const playing = engine.preview("select", 70, 65, () => { ended = true; });
  engine.stop();
  gate.resolve();
  assert.equal(await playing, false);
  assert.equal(context(engine).buffers.length, 0);
  assert.equal(ended, false);
});

test("resuming a cue continues its tail without repeating the attack", async () => {
  const engine = new AudioEngine();
  await engine.start(timerWith("success"), 0.3, 65);
  const source = context(engine).buffers[0];
  assert.equal(source.loop, false);
  assert.deepEqual(source.starts, [[0.06, 0.3]]);
  near(source.stops[0], 0.06 + source.buffer!.duration - 0.3);
  engine.stop();
  assert.equal(engine.sources.size, 0);
  assert.equal(source.disconnected, true);
});

test("one-shot tails stop exactly at the timer boundary", async () => {
  const timer = timerWith("achievement", 5);
  timer.tracks[0].events[0].at = 4;
  const engine = new AudioEngine();
  await engine.start(timer, 0, 65);
  const source = context(engine).buffers[0];
  assert.equal(source.loop, false);
  assert.deepEqual(source.starts, [[4.06, 0]]);
  near(source.stops[0], 5.06);
});

test("Glass state loops play just one cycle in the sequencer and preview", async () => {
  const engine = new AudioEngine();
  await engine.start(timerWith("processing"), 0, 65);
  await engine.preview("processing");
  const [transport, preview] = context(engine).buffers;
  assert.equal(transport.loop, false);
  assert.equal(preview.loop, false);
  near(transport.stops[0], 1.66);
  near(preview.stops[0], 1.62);
});

test("muted, zero-volume and empty tracks do not render or schedule audio", async () => {
  const timer = timerWith("error");
  timer.tracks[0].muted = true;
  timer.tracks.push(makeTrack("warning"), { ...timerWith("blocked").tracks[0], volume: 0 });
  const engine = new AudioEngine();
  assert.equal(await engine.start(timer, 0, 65), true);
  assert.equal(context(engine).buffers.length, 0);
});

test("completed short cues do not restart after seeking past their tail", async () => {
  const engine = new AudioEngine();
  await engine.start(timerWith("press"), 1, 65);
  assert.equal(engine.sources.size, 0);
});

test("preview ends once and releases its source", async () => {
  const engine = new AudioEngine();
  let ended = 0;
  await engine.preview("press", 70, 65, () => { ended++; });
  const source = context(engine).buffers[0];
  source.onended!();
  source.onended!();
  assert.equal(ended, 1);
  assert.equal(engine.sources.size, 0);
  assert.equal(source.disconnected, true);
});

test("failed Glass preparation reports the sound and can be retried", async () => {
  const engine = new AudioEngine();
  const createBuffer = Context.prototype.createBuffer;
  let attempts = 0;
  Context.prototype.createBuffer = function (...args) {
    if (++attempts === 1) throw new Error("Audio allocation failed");
    return createBuffer.apply(this, args);
  };
  try {
    await assert.rejects(engine.preview("coupon"), (error: Error) =>
      error instanceof SoundLoadError && error.message.includes("Купон"));
    assert.equal(engine.sources.size, 0);
    assert.equal(await engine.preview("coupon"), true);
    assert.equal(attempts, 2);
  } finally {
    Context.prototype.createBuffer = createBuffer;
  }
});

test("all 78 Glass cues render audible finite audio with accurate short durations", () => {
  assert.equal(sounds.length, 78);
  for (const sound of sounds) {
    const rendered = renderRecipe(createRecipe("glass", sound.id), 44100);
    near(rendered.duration, getSound(sound.id).duration);
    assert.ok(rendered.duration > 0 && rendered.duration <= 3, sound.id);
    assert.ok(rendered.left.every(Number.isFinite), sound.id);
    assert.ok(rendered.right.every(Number.isFinite), sound.id);
    assert.ok(rendered.peak > 0, sound.id);
  }
});

test("one-second stopwatch loops precisely using one source for an hour", async () => {
  const timer = {
    ...makeTimer(),
    duration: 3600,
    tracks: [makeTickTrack(1)],
  };
  const engine = new AudioEngine();
  await engine.start(timer, 0, 65);
  const sources = context(engine).buffers;
  assert.equal(sources.length, 1);
  assert.deepEqual(
    sources.map((s) => s.buffer!.duration),
    [1],
  );
  assert.deepEqual(
    sources.map((s) => s.starts[0]),
    [[1.06, 0]],
  );
  assert.ok(sources.every((s) => s.loop && s.stops[0] === 3600.06));
  engine.stop();
  assert.equal(engine.sources.size, 0);
  assert.ok(sources.every((s) => s.disconnected));
});

test("stopwatch mute and unmute work during playback without resetting position", async () => {
  const one = makeTickTrack(1);
  const timer = { ...makeTimer(), duration: 20, tracks: [one] };
  const engine = new AudioEngine();
  await engine.start(timer, 0, 65);
  const ctx = context(engine),
    sources = ctx.buffers;
  const oneGain = sources[0].connections[0];
  assert.equal(oneGain.gain.value, 0.28);
  ctx.currentTime = 3;
  const position = engine.position;
  engine.setTickMuted({ ...one, muted: true });
  assert.equal(oneGain.gain.value, 0);
  engine.setTickMuted({ ...one, muted: false });
  assert.equal(oneGain.gain.value, 0.28);
  assert.equal(engine.position, position);
  assert.equal(engine.running, true);
  assert.equal(ctx.buffers.length, 1);
  engine.stop();
});

test("stopwatch resumes on the original second boundaries and resets its phase on a new cycle", async () => {
  const timer = {
    ...makeTimer(),
    duration: 20,
    step: 10,
    tracks: [makeTickTrack(1)],
  };
  const engine = new AudioEngine();
  await engine.start(timer, 7.3, 65);
  const sources = context(engine).buffers;
  assert.ok(Math.abs(sources[0].starts[0][1] - 0.3) < 1e-9);
  assert.equal(sources[0].starts[0][0], engine.startedAt);
  await engine.start(timer, 0, 65);
  assert.deepEqual(
    context(engine)
      .buffers.slice(-1)
      .map((s) => s.starts[0]),
    [[1.06, 0]],
  );
  await engine.start({ ...timer, duration: 1 }, 0, 65);
  assert.equal(engine.sources.size, 0);
});
