# Contributing to SyntheCia Studio

Thank you for your interest in contributing to **SyntheCia Studio**!

## Development Setup

```bash
git clone <your-repo-url>
cd SyntheCia
npm install
npm run dev
```

## Verification Before Opening a PR

1. Run unit tests: `npm test`
2. Run type-checking & production build: `npm run build`
3. Verify WebGL2 rendering & Clean Video Mode in Chrome/Edge with zero console errors.

## Areas Welcoming Contributions

- New note shaders / visual presets (`src/types/visualizer.ts`, `src/engine/SceneRenderer.ts`)
- Additional curated open-domain classical MIDI demo pieces (`src/midi/DemoSongs.ts`)
- Offline WebCodecs / FFmpeg.wasm frame-by-frame 4K MP4 export
- Additional language packs (`src/i18n/translations.ts`)
