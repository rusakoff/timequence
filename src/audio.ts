import { clamp, type SoundId, type Timer, type Track } from "./model.ts";
import { getSound, MAX_SOUND_DURATION, type SynthSoundId } from "./sounds.ts";

// Share decoded recordings between the editor preview and timer transport.
// Failed requests are evicted so the same button can retry after reconnecting.
const sampleCache = new Map<string, Promise<AudioBuffer>>();
const synthCache = new Map<string, Promise<AudioBuffer>>();

export class SampleLoadError extends Error {}

function loadSample(ctx: AudioContext, sound: SoundId): Promise<AudioBuffer> {
  const definition = getSound(sound);
  const url = definition.file!;
  let pending = sampleCache.get(url);
  if (!pending) {
    pending = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await ctx.decodeAudioData(await response.arrayBuffer());
      } catch {
        throw new SampleLoadError(
          `Не удалось загрузить «${definition.name}». Проверьте соединение и попробуйте ещё раз.`,
        );
      } finally {
        clearTimeout(timeout);
      }
    })();
    sampleCache.set(url, pending);
    void pending.catch(() => sampleCache.delete(url));
  }
  return pending;
}

// Render each synthesized cue once and share the same one-shot playback path.
function loadSound(ctx: AudioContext, sound: SoundId): Promise<AudioBuffer> {
  const definition = getSound(sound);
  if (definition.kind === "sample") return loadSample(ctx, sound);
  const key = `${sound}:${ctx.sampleRate}`;
  let pending = synthCache.get(key);
  if (!pending) {
    pending = (async () => {
      const duration = definition.duration;
      const offline = new OfflineAudioContext(
        1,
        Math.ceil(ctx.sampleRate * duration),
        ctx.sampleRate,
      );
      const gain = offline.createGain();
      gain.connect(offline.destination);
      gain.gain.setValueAtTime(0, 0);
      gain.gain.linearRampToValueAtTime(
        0.24,
        Math.min(
          sound.startsWith("tick") ? 0.001 : sound === "air" ? 0.3 : 0.015,
          duration / 4,
        ),
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, duration - 0.002);
      gain.gain.linearRampToValueAtTime(0, duration);
      const schedule = (source: AudioScheduledSourceNode) => {
        source.start(0);
        source.stop(duration);
      };
      if (sound === "air" || sound === "wood") {
        const buffer = offline.createBuffer(
          1,
          Math.ceil(offline.sampleRate * duration),
          offline.sampleRate,
        );
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const source = offline.createBufferSource();
        source.buffer = buffer;
        const filter = offline.createBiquadFilter();
        filter.type = sound === "air" ? "lowpass" : "bandpass";
        filter.frequency.value = sound === "air" ? 900 : 600;
        filter.Q.value = sound === "air" ? 0.7 : 9;
        source.connect(filter);
        filter.connect(gain);
        schedule(source);
      } else {
        const frequencies: Record<
          Exclude<SynthSoundId, "air" | "wood">,
          number[]
        > = {
          bell: [660, 1320],
          pulse: [440],
          bowl: [174, 348, 522],
          chime: [784, 988, 1175],
          tick: [1600, 3200],
          "tick-accent": [1100, 2200],
        };
        frequencies[sound as Exclude<SynthSoundId, "air" | "wood">].forEach(
          (frequency, index) => {
            const oscillator = offline.createOscillator();
            oscillator.type = sound === "pulse" ? "triangle" : "sine";
            oscillator.frequency.value = frequency;
            const partial = offline.createGain();
            partial.gain.value = 1 / (index + 1);
            oscillator.connect(partial);
            partial.connect(gain);
            schedule(oscillator);
          },
        );
      }
      return offline.startRendering();
    })();
    synthCache.set(key, pending);
    void pending.catch(() => synthCache.delete(key));
  }
  return pending;
}

// Events are scheduled against the audio clock, never against rendering frames.
export class AudioEngine {
  context: AudioContext | null = null;
  master: GainNode | null = null;
  sources = new Set<AudioScheduledSourceNode>();
  private cleanups = new Map<AudioScheduledSourceNode, () => void>();
  private tickGains = new Map<string, GainNode>();
  private tickBuffers = new Map<string, AudioBuffer>();
  startedAt = 0;
  offset = 0;
  running = false;
  generation = 0;
  private async ready() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.65;
      const limiter = this.context.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.2;
      this.master.connect(limiter);
      limiter.connect(this.context.destination);
    }
    if (this.context.state !== "running") await this.context.resume();
    return this.context;
  }
  setVolume(value: number) {
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(
        value / 100,
        this.context.currentTime,
        0.02,
      );
  }
  setTickMuted(track: Track) {
    const gain = this.tickGains.get(track.id);
    if (gain && this.context)
      gain.gain.setTargetAtTime(
        track.muted ? 0 : track.volume / 100,
        this.context.currentTime,
        0.005,
      );
  }
  get position() {
    return this.running && this.context
      ? this.offset + Math.max(0, this.context.currentTime - this.startedAt)
      : this.offset;
  }
  stop() {
    this.generation++;
    this.offset = this.position;
    this.running = false;
    for (const s of this.sources) {
      try {
        s.stop();
        s.disconnect();
      } catch {
        /* already ended */
      }
      this.cleanups.get(s)?.();
    }
    this.sources.clear();
    this.cleanups.clear();
    this.tickGains.clear();
  }
  private track(source: AudioScheduledSourceNode, cleanup: () => void) {
    this.sources.add(source);
    let cleaned = false;
    const finish = () => {
      if (cleaned) return;
      cleaned = true;
      this.sources.delete(source);
      this.cleanups.delete(source);
      source.disconnect();
      cleanup();
    };
    this.cleanups.set(source, finish);
    source.onended = finish;
  }
  async start(timer: Timer, position: number, volume: number) {
    this.stop();
    const generation = this.generation;
    const ctx = await this.ready();
    if (generation !== this.generation) return false;
    this.setVolume(volume);
    const activeTracks = timer.tracks.filter(
      (track) =>
        track.tickEvery ||
        (!track.muted && track.volume > 0 && track.events.length > 0),
    );
    const buffers = new Map<SoundId, AudioBuffer>();
    try {
      await Promise.all(
        [...new Set(activeTracks.map((track) => track.sound))].map(
          async (sound) => {
            buffers.set(sound, await loadSound(ctx, sound));
          },
        ),
      );
    } catch (error) {
      if (generation !== this.generation) return false;
      throw error;
    }
    if (generation !== this.generation) return false;
    this.offset = position;
    this.startedAt = ctx.currentTime + 0.06;
    this.running = true;
    activeTracks.forEach((track) => {
      if (track.tickEvery) {
        this.startTicks(
          track,
          buffers.get(track.sound)!,
          timer.duration,
          position,
        );
        return;
      }
      track.events.forEach((e) => {
        const buffer = buffers.get(track.sound)!;
        const duration = Math.min(buffer.duration, MAX_SOUND_DURATION);
        if (e.at + duration <= position) return;
        const elapsed = Math.max(0, position - e.at);
        const remaining = Math.min(
          duration - elapsed,
          timer.duration - Math.max(position, e.at),
        );
        if (remaining > 0) {
          const at = this.startedAt + Math.max(0, e.at - position);
          this.sample(buffer, at, remaining, track.volume / 100, elapsed);
        }
      });
    });
    return true;
  }

  /** A short click followed by silence loops on the audio clock with no JS drift. */
  private startTicks(
    track: Track,
    click: AudioBuffer,
    duration: number,
    position: number,
  ) {
    const ctx = this.context!;
    const every = track.tickEvery!;
    const at = this.startedAt + Math.max(0, every - position);
    const end = this.startedAt + duration - position;
    if (at >= end) return;
    const key = `${track.sound}:${every}`;
    let buffer = this.tickBuffers.get(key);
    if (!buffer) {
      const length = Math.ceil(ctx.sampleRate * every);
      buffer = ctx.createBuffer(click.numberOfChannels, length, ctx.sampleRate);
      for (let channel = 0; channel < click.numberOfChannels; channel++)
        buffer.copyToChannel(
          click.getChannelData(channel).subarray(0, length),
          channel,
        );
      this.tickBuffers.set(key, buffer);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(
      track.muted ? 0 : track.volume / 100,
      ctx.currentTime,
    );
    this.tickGains.set(track.id, gain);
    source.connect(gain);
    gain.connect(this.master!);
    this.track(source, () => {
      gain.disconnect();
      if (this.tickGains.get(track.id) === gain)
        this.tickGains.delete(track.id);
    });
    // The first pulse is after one complete interval, not at the timer's start.
    source.start(at, position < every ? 0 : position % every);
    source.stop(end);
  }
  async preview(
    sound: SoundId,
    volume = 70,
    masterVolume = 65,
    onEnded = () => {},
  ) {
    this.stop();
    const generation = this.generation;
    const ctx = await this.ready();
    if (generation !== this.generation) return false;
    this.setVolume(masterVolume);
    let buffer: AudioBuffer;
    try {
      buffer = await loadSound(ctx, sound);
    } catch (error) {
      if (generation !== this.generation) return false;
      throw error;
    }
    if (generation !== this.generation) return false;
    const finished = () => {
      if (generation === this.generation) onEnded();
    };
    this.sample(
      buffer,
      ctx.currentTime + 0.02,
      Math.min(buffer.duration, MAX_SOUND_DURATION),
      volume / 100,
      0,
      finished,
    );
    return true;
  }
  private sample(
    buffer: AudioBuffer,
    at: number,
    duration: number,
    volume: number,
    elapsed: number,
    onEnded = () => {},
  ) {
    const ctx = this.context!;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = false;
    const gain = ctx.createGain();
    const level = clamp(volume, 0, 1);
    const end = at + duration;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(
      level,
      at + Math.min(elapsed > 0 ? 0.01 : 0.002, duration / 4),
    );
    gain.gain.setValueAtTime(level, end - Math.min(0.03, duration / 3));
    gain.gain.linearRampToValueAtTime(0, end);
    source.connect(gain);
    gain.connect(this.master!);
    this.track(source, () => {
      gain.disconnect();
      onEnded();
    });
    source.start(at, Math.min(elapsed, buffer.duration));
    source.stop(end);
  }
}
