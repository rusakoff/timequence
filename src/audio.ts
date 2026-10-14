import { createRecipe, renderRecipe } from "uisfx";
import { clamp, type SoundId, type Timer, type Track } from "./model.ts";
import { getSound, MAX_SOUND_DURATION, SOUND_PACK } from "./sounds.ts";

// Share deterministic Glass buffers between preview and transport, per sample rate.
const soundCache = new Map<string, AudioBuffer>();
export class SoundLoadError extends Error {}

async function loadSound(ctx: AudioContext, sound: SoundId): Promise<AudioBuffer> {
  const key = `${sound}:${ctx.sampleRate}`;
  const cached = soundCache.get(key);
  if (cached) return cached;
  try {
    const rendered = renderRecipe(createRecipe(SOUND_PACK, sound), ctx.sampleRate);
    const buffer = ctx.createBuffer(2, rendered.left.length, rendered.sampleRate);
    buffer.copyToChannel(rendered.left, 0);
    buffer.copyToChannel(rendered.right, 1);
    soundCache.set(key, buffer);
    return buffer;
  } catch {
    throw new SoundLoadError(`Не удалось подготовить «${getSound(sound).name}». Попробуйте ещё раз.`);
  }
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
