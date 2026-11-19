# SyntheCia Studio

> **Luminous WebGL2 MIDI Piano Visualizer** — AAA 3-Octave Optical HDR Bloom, GPU Physics Particles, 3D Rainbow Neon Highway, Magic Keys Perform Mode, USB Web MIDI & Clean 60fps Video Recorder.

![SyntheCia Studio Preview](docs/preview-v2.png)

[![MIT License](https://img.shields.io/badge/License-MIT-violet.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![WebGL2](https://img.shields.io/badge/Renderer-WebGL2%20HDR-fuchsia.svg)](#architecture)
[![Vite](https://img.shields.io/badge/Build-Vite%206-646cff.svg)](https://vitejs.dev/)

---

## Highlights

- **AAA 3-Octave Optical HDR Bloom**: Multi-pass Dual-Kawase bloom (`Tight Core` + `Mid Satin` + `Wide Halo`) with color-saturation preservation and unsharp detail clarity — intense neon glow without milky haze or washed-out keys.
- **24,000+ GPU Physics Particles**:
  - **Velocity-Stretched Comet Spark Streaks** with gravity, quadratic air drag, and elastic piano-edge bounce
  - **Multi-Octave Curl-Noise Fluid Silk Plumes** with thermal buoyancy updraft
  - **4-Point Optical Diffraction Star Glints** & **Velocity Shockwave Rings**
- **Concert Stage Visuals**:
  - **2D Classic** & **3D Perspective Highway** with automatic measure bars & real-time chord detection (`Cmaj7`, `F#`, `B7`…)
  - **4 Note Styles**: *Hollow Neon Rainbow* (with crisp dark-outlined pitch labels), *Cut 3D Crystal Gem*, *3D Glass Bar*, and *Plasma Beam* — with clean vertical & horizontal separation gaps
  - **Live Audio EQ Spectrum**, **Glossy Piano Keybed Mirror Reflection**, **Anamorphic Horizontal Strike Flares**, **Audio-Reactive Plasma Edge Wave**, and **Sustain Pedal (CC64) Resonance Aura**
- **Custom Backdrops (GPU-Cached Blur)**: Drag & drop any image with cached offscreen Gaussian blur (`0–30px`), opacity, brightness, saturation, vignette, and bass-reactive breathing — plus 4 animated built-in backdrops.
- **3 Interactive Performance Modes**:
  - **Magic Keys ("Giả bấm")**: Load any MIDI song and tap **any** key on your keyboard — every tap performs the exact next MIDI chord with your own live rubato timing!
  - **QWERTY Live Piano**: Play 2+ octaves right on your computer keyboard (`Z–M` & `Q–P`, `[ / ]` octave shift, `Shift` sustain pedal).
  - **Web MIDI API (USB Piano)**: Plug in any real MIDI keyboard/digital piano for ultra-low-latency live performance & recording.
- **Studio Audio & MIDI Track Manager**:
  - Real sampled **Salamander Grand Piano** + **100% Offline Studio Synth** fallback + **Custom Sync Audio (`.mp3` / `.wav`)** with `±2000ms` offset
  - Per-track **Mute, Hide, Custom Color, and Left/Right Hand** controls + **A-B Loop**
- **Clean Video Mode & Direct 60fps Video Exporter**:
  - Press `V` for 100% zero-UI, cursor-hidden capture (OBS-ready) with `Full`, `16:9`, `9:16 TikTok/Shorts`, and `1:1` framing
  - Press `R` to record & download 60fps WebM/MP4 video with synced stereo audio directly from the WebGL2 canvas
- **Open-Source Ready**: Bilingual **English / Tiếng Việt** UI, auto-saved local settings, **JSON Preset Export/Import**, optional FPS telemetry, and `O(log N)` binary-search note windowing for massive MIDI files.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start local dev server (http://localhost:5173)
npm run dev

# 3. Run tests & production build
npm test
npm run build
```

> **Tip:** Drag and drop any `.mid` song, backdrop image (`.png`/`.jpg`/`.webp`), sync audio (`.mp3`/`.wav`), or `.json` preset file directly onto the window!

---

## Keyboard Shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / Pause (Auto Play mode) |
| `V` | Toggle **Clean Video Mode** (hide all UI + auto-hide cursor) |
| `R` | Start / Stop **Direct 60fps Video Recording** |
| `←` / `→` | Seek backward / forward 5 seconds |
| `Esc` | Exit Clean Video Mode / Stop Recording / Close Drawer |
| `Any Letter / Digit` | Fire next MIDI chord in **Magic Keys** mode |
| `Z–M`, `Q–P`, `[ / ]`, `Shift` | Live 2-octave keys, octave shift & sustain in **QWERTY Piano** mode |

---

## Architecture

SyntheCia Studio uses a **Hybrid Canvas 2D Scene + WebGL2 GPU Post-Processing** pipeline:

1. **`SceneRenderer`** (`src/engine/SceneRenderer.ts`): Renders cached blurred backdrops, `O(log N)` windowed 2D/3D falling notes, live EQ spectrum, mirror keybed reflections, plasma waves, and an 88-key piano onto a HiDPI scene buffer.
2. **`WebGLCompositor`** (`src/engine/WebGLCompositor.ts`): Uploads the scene to GPU, simulates & renders 24,000+ additive physics particles (`PARTICLE_VS`/`FS`), and executes a 3-octave Dual-Kawase HDR Bloom + ACES filmic clarity composite into a single master canvas — enabling one-stream `canvas.captureStream(60)` recording.
3. **`AudioEngine`** (`src/audio/AudioEngine.ts`): Unified Web Audio graph with Salamander Grand Piano samples, procedural concert-hall convolution reverb, offline synth fallback, custom audio sync, FFT analyser, and `MediaStreamAudioDestinationNode`.

---

## Deploying to Vercel

SyntheCia Studio is pre-configured for zero-config deployment via [`vercel.json`](vercel.json):

1. Import your GitHub repository on [vercel.com/new](https://vercel.com/new), or deploy from your terminal with `vercel`.
2. Vercel auto-detects **Vite** (`npm run build` → `dist`) and publishes your live HTTPS visualizer in seconds.

A GitHub Actions CI workflow at [`.github/workflows/ci.yml`](.github/workflows/ci.yml) automatically runs `npm test` and `npm run build` on every push and pull request.

---

## License

Released under the [MIT License](LICENSE).
