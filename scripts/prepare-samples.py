"""Rebuild the bundled CC0 VCSL selection (Python 3 + ffmpeg required)."""

import array
import hashlib
import json
import math
import pathlib
import subprocess
import tempfile
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
COMMIT = "c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e"
BASE = f"https://raw.githubusercontent.com/sgossner/VCSL/{COMMIT}/"
SAMPLES = {
    "nepal-bell": "Hand Bells, Nepalese/HB_2.wav",
    "hand-chime": "Hand Chimes/sus_C5_r01_main.wav",
    "glockenspiel": "Glockenspiel/glock_medium_C5_01.wav",
    "vibraphone": "Vibraphone/Soft Mallets/Vibes_soft_C3_v1_rr2_Main.wav",
    "marimba": "Marimba/Marimba_hit_Outrigger_C4_soft_01.wav",
    "woodblock": "Woodblock/wood_click_mp.wav",
    "claves": "Claves/Claves1_Hit_v2_rr1_Mid.wav",
    "triangle": "Triangles/Triangle1_Hit_v1_rr1_Mid.wav",
    "gong": "Gong 1/gong_2_mp.wav",
    "tubular-bell": "Tubular Bells 1/chimes_C4_p_rr1.wav",
    "shaker": "Shaker, Small/Mid_ShakerDouble_Down_rr1.wav",
    "bell-tree": "Bell Tree/Stroke/BellTree_Stroke_1_Mid.wav",
}
RATE = 44100
CHANNELS = 2
MAX_DURATION = 3
OUT = ROOT / "public/audio/vcsl"
OUT.mkdir(parents=True, exist_ok=True)


def download(path):
    url = BASE + urllib.parse.quote(path, safe="/")
    request = urllib.request.Request(url, headers={"User-Agent": "Timequence"})
    with urllib.request.urlopen(request, timeout=45) as response:
        return response.read(), url


def ffmpeg(args, data=None):
    return subprocess.run(
        ["ffmpeg", "-v", "error", "-y", *args], input=data, capture_output=True, check=True
    ).stdout


manifest = []
metadata = {}
with tempfile.TemporaryDirectory(prefix="timequence-samples-") as work:
    for key, relative in SAMPLES.items():
        source = "Idiophones/Struck Idiophones/" + relative
        original, url = download(source)
        wav = pathlib.Path(work) / "source.wav"
        wav.write_bytes(original)
        pcm = array.array("f", ffmpeg([
            "-i", str(wav), "-f", "f32le", "-ac", str(CHANNELS), "-ar", str(RATE), "pipe:1"
        ]))
        peak = max(abs(x) for x in pcm)
        # Trim leading room tone, retain 5 ms before the attack and 150 ms of tail.
        threshold = max(0.0003, peak * 0.003)
        audible = [i for i in range(0, len(pcm), CHANNELS)
                   if max(abs(pcm[i]), abs(pcm[i + 1])) > threshold]
        begin = max(0, audible[0] // CHANNELS - int(RATE * 0.005))
        end = min(len(pcm) // CHANNELS, audible[-1] // CHANNELS + int(RATE * 0.15))
        end = min(end, begin + MAX_DURATION * RATE)
        pcm = pcm[begin * CHANNELS:end * CHANNELS]
        duration = len(pcm) / (RATE * CHANNELS)
        # Match the loudest 400 ms RMS, avoiding silence-heavy tail bias.
        # Peak cap keeps sharp percussion clean; no compression/time stretching.
        window = min(len(pcm), int(RATE * CHANNELS * 0.4))
        energy = sum(x * x for x in pcm[:window])
        maximum = energy
        hop = int(RATE * CHANNELS * 0.05)
        for i in range(hop, len(pcm) - window + 1, hop):
            energy += sum(x * x for x in pcm[i + window - hop:i + window])
            energy -= sum(x * x for x in pcm[i - hop:i])
            maximum = max(maximum, energy)
        rms = math.sqrt(maximum / window)
        gain = min(10 ** (-21 / 20) / rms, 10 ** (-4 / 20) / peak)
        for frame in range(len(pcm) // CHANNELS):
            second = frame / RATE
            envelope = min(1, second / 0.002, (duration - second) / min(0.18, duration / 4))
            for channel in range(CHANNELS):
                pcm[frame * CHANNELS + channel] *= gain * envelope
        output = OUT / f"{key}.mp3"
        ffmpeg([
            "-f", "f32le", "-ar", str(RATE), "-ac", str(CHANNELS), "-i", "pipe:0",
            "-c:a", "libmp3lame", "-b:a", "192k", "-map_metadata", "-1", str(output)
        ], pcm.tobytes())
        # Small waveform for UI; it represents the recording rather than decoration.
        bars = [max(abs(x) for x in pcm[int(i * len(pcm) / 66):int((i + 1) * len(pcm) / 66)])
                for i in range(66)]
        top = max(bars)
        metadata[key] = {"duration": round(duration, 4), "waveform": [round(x / top, 3) for x in bars]}
        manifest.append({
            "id": key, "file": f"{key}.mp3", "source": source, "sourceUrl": url,
            "sourceSha256": hashlib.sha256(original).hexdigest(),
            "outputSha256": hashlib.sha256(output.read_bytes()).hexdigest(),
            "duration": round(duration, 4), "gainDb": round(20 * math.log10(gain), 2),
            "trimStartSeconds": round(begin / RATE, 4), "bytes": output.stat().st_size,
        })
        print(f"{key}: {duration:.2f}s, {output.stat().st_size / 1024:.0f} KiB", flush=True)

license_data, _ = download("LICENSE")
(OUT / "LICENSE.txt").write_bytes(license_data)
(OUT / "manifest.json").write_text(json.dumps({
    "library": "Versilian Community Sample Library (VCSL)",
    "repository": "https://github.com/sgossner/VCSL", "commit": COMMIT, "license": "CC0-1.0",
    "processing": "44.1 kHz stereo, silence trim, max 3s, active RMS normalization with -4 dBFS peak cap, fades, 192 kbps MP3",
    "samples": manifest,
}, indent=2) + "\n")
(ROOT / "src/sample-metadata.ts").write_text(
    "// Generated by scripts/prepare-samples.py.\nexport const sampleMetadata = "
    + json.dumps(metadata, indent=2) + " as const;\n"
)
