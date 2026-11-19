# SyntheCia Studio — Design Specification

Date: 2026-11-19
Status: Approved

## 1. Goal
Build **SyntheCia Studio**, a local-first web application (Vite + React + TypeScript + WebGL2) for MIDI piano visualization that surpasses traditional Synthesia with Embers/SeeMusic-grade GPU fluid particles, multi-pass HDR bloom, 2D & 3D perspective note highways, photorealistic 88-key piano effects, custom background controls, triple-mode piano audio, and a zero-chrome Clean Video Mode + direct 60fps video exporter.

## 2. Architecture (Approach A: Hybrid Canvas 2D Scene + WebGL2 GPU Post-Processing)
All visuals composite into a single master WebGL2 output canvas (`masterCanvas`) for locked 60fps rendering and one-stream `canvas.captureStream(60)` video recording.

### Modules
1. `src/types/visualizer.ts` — Shared immutable settings state, presets, note/MIDI models, track color palettes, aspect ratio configs.
2. `src/midi/MidiParser.ts` — Wraps `@tonejs/midi`, extracts notes (pitch 21..108, start, duration, velocity, track/hand), tempo/time-signature maps, measure boundaries, CC64 sustain pedal intervals, and automatic measure-level chord detection (`C`, `Dm`, `F#`, etc.).
3. `src/midi/DemoSongs.ts` — 3 built-in rich musical pieces (expressive Nocturne, cascading Stardust Etude, Moonlight-style arpeggio prelude) converted into the unified `ParsedMidi` structure.
4. `src/audio/AudioEngine.ts` — Unified Web Audio graph feeding both `destination` and `MediaStreamAudioDestinationNode` plus real-time FFT `AnalyserNode` (bass/mid/treble). Supports:
   - **Salamander Grand Piano** (sampled acoustic piano with automatic fallback and preload status)
   - **Offline Studio Synth** (polyphonic multi-harmonic piano synth + algorithmic stereo reverb)
   - **Custom Audio Sync** (user `.mp3`/`.wav`/`.ogg` with `±2000ms` offset slider)
5. `src/engine/PianoGeometry.ts` — Exact 88-key (A0–C8) layout math for 2D & 3D perspective projection, key hitboxes, white/black key geometry.
6. `src/engine/SceneRenderer.ts` — HiDPI offscreen 2D canvas rendering:
   - Custom uploaded background image or procedural animated backgrounds (*Obsidian Void*, *Northern Aurora*, *Deep Nebula*) with opacity/dim, blur, brightness/saturation, vignette, and audio-reactive pulse.
   - 2D Classic and 3D Perspective Highway modes with octave lines, scrolling measure bars, and chord markers.
   - 4 Note Styles: *Crystal Gem*, *Hollow Neon (+ note labels)*, *Luminous Glass Bar*, *Plasma Beam*.
   - Photorealistic 88-key 3D-beveled piano keyboard with key press depression, colored key glow & bleed, vertical god-ray light pillars, and audio-reactive Plasma Energy Wave along the keyboard edge.
7. `src/engine/WebGLCompositor.ts` — Master WebGL2 renderer:
   - Uploads `SceneRenderer` canvas to GPU texture.
   - Simulates & renders up to 25,000 additive GPU particles: **Curl-Noise Fluid Silk Ribbons**, **Impact Sparks**, **Stardust**, and **Velocity Shockwaves**.
   - Runs **Multi-Pass Dual-Kawase HDR Bloom** (bright threshold extract → 4-level downsample → 4-level upsample → filmic ACES tone-mapping + user Glow Intensity 0–300% & Bloom Radius).
   - Graceful Canvas 2D fallback if WebGL2 context is unavailable.
8. `src/video/VideoExporter.ts` — Direct `MediaRecorder` combining `masterCanvas.captureStream(60)` + `AudioEngine.getRecordStream()`, supporting VP9/H.264, countdown, auto-start-from-beginning, and auto-stop-at-end.
9. `src/ui/` — Floating obsidian studio chrome:
   - `TopBar.tsx` — File drop/open, demo song selector, quick view toggle (2D/3D), Clean Video Mode (`V`), Record button (`R`), Inspector toggle.
   - `TransportBar.tsx` — Play/pause (`Space`), seekable mini-pianoroll density timeline, time display, tempo speed (`0.25x–2.0x`), loop toggle, volume.
   - `InspectorDrawer.tsx` — Collapsible studio controls organized into 6 clean tabs: *Presets*, *Notes & View*, *Glow & FX*, *Background*, *Audio*, *Video*.
   - `CleanModeOverlay.tsx` — Zero-UI framing overlay for 16:9 / 9:16 / 1:1 / Fullscreen, auto-hiding cursor, subtle 1-second exit hint on entry (not shown during recording), and 3-2-1 pre-record countdown.

## 3. Verification Plan
- Unit tests (`vitest`) for `MidiParser` (chord detection, sustain pedal, measure grid), `PianoGeometry` (88-key coordinates & 3D projection), and `DemoSongs`.
- TypeScript type-check (`tsc --noEmit`) & production build (`npm run build`).
- Live browser verification of rendering, presets, 2D/3D switching, custom background, and Clean Video Mode.
