import { clamp, type SoundId, type Timer } from "./model.ts";
import { getSound, type SynthSoundId } from "./sounds.ts";

// Share decoded recordings between the editor preview and timer transport.
// Failed requests are evicted so the same button can retry after reconnecting.
const sampleCache = new Map<string, Promise<AudioBuffer>>();
const loopCache = new WeakMap<AudioBuffer, AudioBuffer>();

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

function loopBuffer(ctx: AudioContext, buffer: AudioBuffer): AudioBuffer {
  // Very short percussion repeats no faster than once every 0.75 s.
  // Prepared files have faded endpoints, so a full-recording loop cannot click.
  if (buffer.duration >= 0.75) return buffer;
  let padded = loopCache.get(buffer);
  if (!padded) {
    padded = ctx.createBuffer(
      buffer.numberOfChannels,
      Math.ceil(buffer.sampleRate * 0.75),
      buffer.sampleRate,
    );
    for (let channel = 0; channel < buffer.numberOfChannels; channel++)
      padded.copyToChannel(buffer.getChannelData(channel), channel);
    loopCache.set(buffer, padded);
  }
  return padded;
}

// Events are scheduled against the audio clock, never against rendering frames.
export class AudioEngine {
  context: AudioContext | null = null;
  master: GainNode | null = null;
  sources = new Set<AudioScheduledSourceNode>();
  private cleanups = new Map<AudioScheduledSourceNode, () => void>();
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
      (track) => !track.muted && track.volume > 0 && track.events.length > 0,
    );
    const buffers = new Map<SoundId, AudioBuffer>();
    try {
      await Promise.all(
        [...new Set(activeTracks.map((track) => track.sound))].map(
          async (sound) => {
            if (getSound(sound).kind === "sample")
              buffers.set(sound, await loadSample(ctx, sound));
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
    activeTracks.forEach((track) =>
      track.events.forEach((e) => {
        const buffer = buffers.get(track.sound);
        const duration =
          e.mode === "hit" ? (buffer?.duration ?? 0.65) : e.duration;
        if (
          e.at < position &&
          (e.at + duration <= position || (e.mode === "hit" && !buffer))
        )
          return;
        const elapsed = Math.max(0, position - e.at);
        const remaining = Math.min(
          duration - elapsed,
          timer.duration - Math.max(position, e.at),
        );
        if (remaining > 0) {
          const at = this.startedAt + Math.max(0, e.at - position);
          if (buffer)
            this.sample(
              buffer,
              at,
              remaining,
              track.volume / 100,
              e.mode === "hold",
              elapsed,
            );
          else
            this.synth(
              track.sound as SynthSoundId,
              at,
              remaining,
              track.volume / 100,
              e.mode === "hold",
            );
        }
      }),
    );
    return true;
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
    let buffer: AudioBuffer | undefined;
    try {
      if (getSound(sound).kind === "sample")
        buffer = await loadSample(ctx, sound);
    } catch (error) {
      if (generation !== this.generation) return false;
      throw error;
    }
    if (generation !== this.generation) return false;
    const finished = () => {
      if (generation === this.generation) onEnded();
    };
    if (buffer)
      this.sample(
        buffer,
        ctx.currentTime + 0.02,
        buffer.duration,
        volume / 100,
        false,
        0,
        finished,
      );
    else
      this.synth(
        sound as SynthSoundId,
        ctx.currentTime + 0.02,
        0.8,
        volume / 100,
        false,
        finished,
      );
    return true;
  }
  private sample(
    buffer: AudioBuffer,
    at: number,
    duration: number,
    volume: number,
    held: boolean,
    elapsed: number,
    onEnded = () => {},
  ) {
    const ctx = this.context!;
    const source = ctx.createBufferSource();
    source.buffer = held ? loopBuffer(ctx, buffer) : buffer;
    source.loop = held;
    const gain = ctx.createGain();
    const level = clamp(volume, 0, 1);
    const end = at + duration;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(
      level,
      at + Math.min(elapsed > 0 ? 0.01 : 0.002, duration / 4),
    );
    gain.gain.setValueAtTime(
      level,
      end - Math.min(held ? 0.1 : 0.04, duration / 3),
    );
    gain.gain.linearRampToValueAtTime(0, end);
    source.connect(gain);
    gain.connect(this.master!);
    this.track(source, () => {
      gain.disconnect();
      onEnded();
    });
    source.start(at, held ? elapsed % source.buffer.duration : elapsed);
    source.stop(end);
  }
  private synth(
    sound: SynthSoundId,
    at: number,
    duration: number,
    volume: number,
    held: boolean,
    onEnded = () => {},
  ) {
    const ctx = this.context!;
    const gain = ctx.createGain();
    gain.connect(this.master!);
    const level = clamp(volume, 0, 1) * 0.24;
    const end = at + duration;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(
      level,
      at + Math.min(sound === "air" ? 0.3 : 0.015, duration / 4),
    );
    if (held) {
      gain.gain.setValueAtTime(
        level * 0.75,
        Math.max(at + duration / 4, end - Math.min(0.3, duration / 3)),
      );
      gain.gain.linearRampToValueAtTime(0, end);
    } else gain.gain.exponentialRampToValueAtTime(0.0001, end);
    let voices = 0;
    const trackSource = (
      source: AudioScheduledSourceNode,
      cleanup: () => void,
    ) => {
      voices++;
      this.track(source, () => {
        cleanup();
        if (--voices === 0) {
          gain.disconnect();
          onEnded();
        }
      });
      source.start(at);
      source.stop(end + 0.01);
    };
    if (sound === "air" || sound === "wood") {
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = sound === "air" ? "lowpass" : "bandpass";
      filter.frequency.value = sound === "air" ? 900 : 600;
      filter.Q.value = sound === "air" ? 0.7 : 9;
      source.connect(filter);
      filter.connect(gain);
      trackSource(source, () => filter.disconnect());
    } else {
      const frequencies: Record<
        Exclude<SynthSoundId, "air" | "wood">,
        number[]
      > = {
        bell: [660, 1320],
        pulse: [440],
        bowl: [174, 348, 522],
        chime: [784, 988, 1175],
      };
      frequencies[sound].forEach((frequency, index) => {
        const osc = ctx.createOscillator();
        osc.type = sound === "pulse" ? "triangle" : "sine";
        osc.frequency.value = frequency;
        const partial = ctx.createGain();
        partial.gain.value = 1 / (index + 1);
        osc.connect(partial);
        partial.connect(gain);
        trackSource(osc, () => partial.disconnect());
      });
    }
  }
}
