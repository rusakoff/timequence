import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { AudioEngine, SampleLoadError } from "./audio.ts";
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
  currentTime = 0;
  state = "running";
  sampleRate = 100;
  destination = new Node();
  buffers: Source[] = [];
  oscillators: Source[] = [];
  async resume() {
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
  async decodeAudioData(data: ArrayBuffer) {
    return new Buffer(2, new Uint8Array(data)[0] * 10, 100);
  }
}
const response = (duration = 3) =>
  new Response(new Uint8Array([duration * 10]));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
function timerWith(sound: SoundId, length = 10) {
  const timer = makeTimer();
  timer.duration = length;
  timer.tracks = [makeTrack(sound)];
  timer.tracks[0].events = [{ id: "event", at: 0 }];
  return timer;
}
class OfflineContext extends Context {
  result: Buffer;
  constructor(channels: number, length: number, rate: number) {
    super();
    this.sampleRate = rate;
    this.result = new Buffer(channels, length, rate);
  }
  async startRendering() {
    return this.result;
  }
}
const context = (engine: AudioEngine) => engine.context as unknown as Context;
const tick = () => new Promise((resolve) => setImmediate(resolve));
beforeEach(() => {
  globalThis.AudioContext = Context as unknown as typeof AudioContext;
  globalThis.OfflineAudioContext =
    OfflineContext as unknown as typeof OfflineAudioContext;
  globalThis.fetch = async () => response();
});

test("timer clock starts only after recordings finish loading", async () => {
  const pending = deferred<Response>();
  globalThis.fetch = () => pending.promise;
  const engine = new AudioEngine();
  const started = engine.start(timerWith("nepal-bell"), 0, 65);
  await tick();
  assert.equal(engine.running, false);
  assert.equal(context(engine).buffers.length, 0);
  context(engine).currentTime = 20;
  pending.resolve(response());
  assert.equal(await started, true);
  assert.equal(engine.startedAt, 20.06);
  assert.equal(context(engine).buffers[0].starts[0][0], 20.06);
});

test("master volume changes during a download are not overwritten at playback", async () => {
  const pending = deferred<Response>();
  globalThis.fetch = () => pending.promise;
  const engine = new AudioEngine();
  const started = engine.start(timerWith("bell-tree"), 0, 65);
  await tick();
  engine.setVolume(0);
  pending.resolve(response());
  await started;
  assert.equal(engine.master!.gain.value, 0);
});

test("resuming a cue continues its short tail without repeating the recording", async () => {
  const engine = new AudioEngine();
  await engine.start(timerWith("hand-chime"), 1, 65);
  const source = context(engine).buffers[0];
  assert.equal(source.loop, false);
  assert.deepEqual(source.starts, [[0.06, 1]]);
  assert.equal(source.stops[0], 2.06);
  engine.stop();
  assert.equal(engine.sources.size, 0);
  assert.equal(source.disconnected, true);
});

test("natural one-shot tails are clipped exactly at the timer boundary", async () => {
  const timer = timerWith("glockenspiel", 5);
  timer.tracks[0].events[0].at = 4;
  const engine = new AudioEngine();
  await engine.start(timer, 0, 65);
  const source = context(engine).buffers[0];
  assert.equal(source.loop, false);
  assert.deepEqual(source.starts, [[4.06, 0]]);
  assert.ok(Math.abs(source.stops[0] - 5.06) < 1e-10);
});

test("continuing during a one-shot tail resumes the sample without another attack", async () => {
  const engine = new AudioEngine();
  await engine.start(timerWith("vibraphone", 3), 1, 65);
  const source = context(engine).buffers[0];
  assert.deepEqual(source.starts, [[0.06, 1]]);
  assert.equal(source.stops[0], 2.06);
});

test("cancelling a pending preview cannot play late or call its end callback", async () => {
  const pending = deferred<Response>();
  globalThis.fetch = () => pending.promise;
  const engine = new AudioEngine();
  let ended = false;
  const playing = engine.preview("marimba", 70, 65, () => {
    ended = true;
  });
  await tick();
  engine.stop();
  pending.resolve(response());
  assert.equal(await playing, false);
  assert.equal(context(engine).buffers.length, 0);
  assert.equal(ended, false);
});

test("failed sample loads report the sound name and can be retried", async () => {
  let requests = 0;
  globalThis.fetch = async () =>
    ++requests === 1 ? new Response(null, { status: 503 }) : response();
  const engine = new AudioEngine();
  await assert.rejects(
    engine.preview("woodblock"),
    (error: Error) =>
      error instanceof SampleLoadError && error.message.includes("Вудблок"),
  );
  assert.equal(engine.sources.size, 0);
  assert.equal(await engine.preview("woodblock"), true);
  assert.equal(requests, 2);
});

test("preview and timer share one download and honor zero master volume", async () => {
  let requests = 0;
  globalThis.fetch = async () => {
    requests++;
    return response();
  };
  const preview = new AudioEngine();
  const timer = new AudioEngine();
  await Promise.all([
    preview.preview("claves", 70, 0),
    timer.start(timerWith("claves"), 0, 0),
  ]);
  assert.equal(requests, 1);
  assert.equal(preview.master!.gain.value, 0);
  assert.equal(timer.master!.gain.value, 0);
  assert.equal(context(timer).oscillators.length, 0);
});

test("muted and empty sample tracks need no download; legacy synth still works", async () => {
  globalThis.fetch = async () => {
    throw new Error("Unexpected network request");
  };
  const timer = timerWith("triangle");
  timer.tracks[0].muted = true;
  timer.tracks.push(makeTrack("gong"), ...timerWith("pulse").tracks);
  const engine = new AudioEngine();
  assert.equal(await engine.start(timer, 0, 65), true);
  assert.equal(context(engine).buffers.length, 1);
  assert.equal(context(engine).buffers[0].buffer!.duration, 0.65);
  assert.equal(context(engine).buffers[0].loop, false);
});

test("short percussion plays once and never fills the interval with repeats", async () => {
  globalThis.fetch = async () => response(0.2);
  const engine = new AudioEngine();
  await engine.start(timerWith("shaker"), 0, 65);
  const source = context(engine).buffers[0];
  assert.equal(source.buffer!.duration, 0.2);
  assert.equal(source.loop, false);
  assert.deepEqual(source.starts, [[0.06, 0]]);
  assert.equal(source.stops[0], 0.26);
  await engine.start(timerWith("shaker"), 1, 65);
  assert.equal(engine.sources.size, 0);
});

test("stopping transport while it loads prevents an unexpected late start", async () => {
  const pending = deferred<Response>();
  globalThis.fetch = () => pending.promise;
  const engine = new AudioEngine();
  const playing = engine.start(timerWith("tubular-bell"), 0, 65);
  await tick();
  engine.stop();
  pending.resolve(response());
  assert.equal(await playing, false);
  assert.equal(engine.running, false);
  assert.equal(context(engine).buffers.length, 0);
});

test("even an oversized recording is capped at three seconds in transport and preview", async () => {
  globalThis.fetch = async () => response(8);
  const engine = new AudioEngine();
  await engine.start(timerWith("gong"), 0, 65);
  assert.equal(context(engine).buffers[0].loop, false);
  assert.equal(context(engine).buffers[0].stops[0], 3.06);
  await engine.preview("gong");
  assert.equal(context(engine).buffers[1].loop, false);
  assert.equal(context(engine).buffers[1].stops[0], 3.02);
});

test("completed cues do not restart after seeking past their tail", async () => {
  const engine = new AudioEngine();
  await engine.start(timerWith("vibraphone"), 4, 65);
  assert.equal(context(engine).buffers.length, 0);
});

test("synthesized cues also play once and resume without another attack", async () => {
  const engine = new AudioEngine();
  await engine.start(timerWith("pulse"), 0.3, 65);
  const source = context(engine).buffers[0];
  assert.equal(source.loop, false);
  assert.equal(source.buffer!.duration, 0.65);
  assert.equal(source.starts[0][1], 0.3);
  assert.ok(Math.abs(source.stops[0] - 0.41) < 1e-10);
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
