import React, { useEffect, useRef } from 'react';
import type { AudioEngine } from '../audio/AudioEngine';
import { getPianoLayout, TOTAL_KEYS } from '../engine/PianoGeometry';
import { SceneRenderer } from '../engine/SceneRenderer';
import { WebGLCompositor } from '../engine/WebGLCompositor';
import { buildMagicSteps, findMagicStepIndexAtTime, type MagicStep } from '../midi/MagicKeys';
import type {
  AspectRatioMode,
  ParsedMidi,
  PlayMode,
  TrackOverride,
  VisualizerSettings,
} from '../types/visualizer';

export interface PerfStats {
  fps: number;
  particles: number;
  isWebGL2: boolean;
}

export interface VisualizerStageHandle {
  getCanvas: () => HTMLCanvasElement | null;
  seekTo: (timeSec: number) => void;
  clearVisuals: () => void;
  pressLiveNote: (midi: number, velocity: number, sourceKey?: string) => void;
  releaseLiveNote: (midi: number, sourceKey?: string) => void;
  setLiveSustain: (down: boolean) => void;
  triggerMagicKeyDown: (keyCode: string) => { stepIndex: number; totalSteps: number } | null;
  triggerMagicKeyUp: (keyCode: string) => void;
  getMagicProgress: () => { stepIndex: number; totalSteps: number };
}

interface VisualizerStageProps {
  midi: ParsedMidi | null;
  isPlaying: boolean;
  playMode: PlayMode;
  playbackSpeed: number;
  loopEnabled: boolean;
  loopA: number | null;
  loopB: number | null;
  settings: VisualizerSettings;
  trackOverrides: Readonly<Record<number, TrackOverride>>;
  audioEngine: AudioEngine;
  cleanMode: boolean;
  stageRef: React.MutableRefObject<VisualizerStageHandle | null>;
  onTimeUpdate: (timeSec: number) => void;
  onSongEnded: () => void;
  onEngineReady?: (isWebGL2: boolean) => void;
  onPerfStats?: (stats: PerfStats) => void;
  onMagicProgress?: (stepIndex: number, totalSteps: number) => void;
}

function getAspectStyle(mode: AspectRatioMode): React.CSSProperties {
  if (mode === '16:9') {
    return { aspectRatio: '16 / 9', maxWidth: '100%', maxHeight: '100%', width: 'min(100vw, calc(100vh * 16 / 9))' };
  }
  if (mode === '9:16') {
    return { aspectRatio: '9 / 16', maxWidth: '100%', maxHeight: '100%', height: 'min(100vh, calc(100vw * 16 / 9))' };
  }
  if (mode === '1:1') {
    return { aspectRatio: '1 / 1', maxWidth: '100%', maxHeight: '100%', width: 'min(100vw, 100vh)' };
  }
  return { width: '100%', height: '100%' };
}

function isSustainDownAt(midi: ParsedMidi, timeSec: number): boolean {
  const list = midi.sustainIntervals;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s.start > timeSec) break;
    if (timeSec >= s.start && timeSec <= s.end) return true;
  }
  return false;
}

export const VisualizerStage: React.FC<VisualizerStageProps> = ({
  midi,
  isPlaying,
  playMode,
  playbackSpeed,
  loopEnabled,
  loopA,
  loopB,
  settings,
  trackOverrides,
  audioEngine,
  cleanMode,
  stageRef,
  onTimeUpdate,
  onSongEnded,
  onEngineReady,
  onPerfStats,
  onMagicProgress,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const sceneRef = useRef<SceneRenderer | null>(null);
  const compositorRef = useRef<WebGLCompositor | null>(null);

  // Mutable live refs for 60fps loop without React re-render overhead
  const midiRef = useRef<ParsedMidi | null>(midi);
  const isPlayingRef = useRef(isPlaying);
  const playModeRef = useRef(playMode);
  const speedRef = useRef(playbackSpeed);
  const loopRef = useRef(loopEnabled);
  const loopARef = useRef(loopA);
  const loopBRef = useRef(loopB);
  const settingsRef = useRef(settings);
  const trackOverridesRef = useRef(trackOverrides);

  const playTimeRef = useRef(0);
  const nextNoteIdxRef = useRef(0);

  // Live notes pressed via mouse, QWERTY, Web MIDI USB, or Magic Keys
  const manualNotesRef = useRef<Map<number, number>>(new Map());
  const liveSustainRef = useRef(false);
  const pointerDownKeyRef = useRef<number | null>(null);

  // Magic Keys ("Giả bấm") state
  const magicStepsRef = useRef<MagicStep[]>([]);
  const magicStepIdxRef = useRef(0);
  const magicTargetTimeRef = useRef<number | null>(null);
  const magicHeldByKeyRef = useRef<Map<string, number[]>>(new Map());

  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onSongEndedRef = useRef(onSongEnded);
  const onPerfStatsRef = useRef(onPerfStats);
  const onMagicProgressRef = useRef(onMagicProgress);

  useEffect(() => {
    midiRef.current = midi;
    playTimeRef.current = 0;
    nextNoteIdxRef.current = 0;
    magicStepsRef.current = buildMagicSteps(midi, trackOverridesRef.current);
    magicStepIdxRef.current = 0;
    magicTargetTimeRef.current =
      playModeRef.current === 'magic-keys' && magicStepsRef.current.length > 0
        ? Math.max(0, magicStepsRef.current[0].time - 0.015)
        : null;
    magicHeldByKeyRef.current.clear();
    manualNotesRef.current.clear();
    sceneRef.current?.resetKeyStates();
    compositorRef.current?.clearParticles();
    onTimeUpdateRef.current(0);
    onMagicProgressRef.current?.(0, magicStepsRef.current.length);
  }, [midi]);

  useEffect(() => {
    trackOverridesRef.current = trackOverrides;
    const steps = buildMagicSteps(midiRef.current, trackOverrides);
    magicStepsRef.current = steps;
    magicStepIdxRef.current = findMagicStepIndexAtTime(steps, playTimeRef.current);
    onMagicProgressRef.current?.(magicStepIdxRef.current, steps.length);
  }, [trackOverrides]);

  useEffect(() => {
    playModeRef.current = playMode;
    magicHeldByKeyRef.current.clear();
    manualNotesRef.current.clear();
    if (playMode === 'magic-keys') {
      const steps = magicStepsRef.current;
      const idx = findMagicStepIndexAtTime(steps, playTimeRef.current);
      magicStepIdxRef.current = idx;
      if (idx < steps.length) {
        magicTargetTimeRef.current = Math.max(0, steps[idx].time - 0.015);
      }
      onMagicProgressRef.current?.(idx, steps.length);
    } else {
      magicTargetTimeRef.current = null;
    }
  }, [playMode]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    if (isPlaying) {
      audioEngine.ensureInitialized();
      audioEngine.startCustomAudio(
        playTimeRef.current,
        settingsRef.current.customAudioOffsetMs,
        speedRef.current
      );
    } else {
      audioEngine.stopAllNotes();
    }
  }, [isPlaying, audioEngine]);

  useEffect(() => {
    speedRef.current = playbackSpeed;
    if (isPlayingRef.current && settingsRef.current.audioMode === 'custom-audio') {
      audioEngine.startCustomAudio(
        playTimeRef.current,
        settingsRef.current.customAudioOffsetMs,
        playbackSpeed
      );
    }
  }, [playbackSpeed, audioEngine]);

  useEffect(() => {
    loopRef.current = loopEnabled;
  }, [loopEnabled]);

  useEffect(() => {
    loopARef.current = loopA;
    loopBRef.current = loopB;
  }, [loopA, loopB]);

  useEffect(() => {
    settingsRef.current = settings;
    sceneRef.current?.setCustomBackground(
      settings.backgroundPreset === 'custom' ? settings.customBgUrl : null
    );
  }, [settings]);

  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
    onSongEndedRef.current = onSongEnded;
    onPerfStatsRef.current = onPerfStats;
    onMagicProgressRef.current = onMagicProgress;
  }, [onTimeUpdate, onSongEnded, onPerfStats, onMagicProgress]);

  // Expose imperative stage controls
  useEffect(() => {
    stageRef.current = {
      getCanvas: () => canvasRef.current,
      seekTo: (timeSec: number) => {
        const curMidi = midiRef.current;
        const clamped = curMidi ? Math.max(0, Math.min(curMidi.duration, timeSec)) : 0;
        playTimeRef.current = clamped;
        audioEngine.stopAllNotes();
        sceneRef.current?.resetKeyStates();
        manualNotesRef.current.clear();
        magicHeldByKeyRef.current.clear();

        if (curMidi) {
          let lo = 0;
          let hi = curMidi.notes.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (curMidi.notes[mid].start < clamped) lo = mid + 1;
            else hi = mid;
          }
          nextNoteIdxRef.current = lo;

          const steps = magicStepsRef.current;
          const mIdx = findMagicStepIndexAtTime(steps, clamped);
          magicStepIdxRef.current = mIdx;
          magicTargetTimeRef.current =
            playModeRef.current === 'magic-keys' && mIdx < steps.length
              ? Math.max(0, steps[mIdx].time - 0.015)
              : null;
          onMagicProgressRef.current?.(mIdx, steps.length);
        } else {
          nextNoteIdxRef.current = 0;
        }

        if (isPlayingRef.current) {
          audioEngine.startCustomAudio(
            clamped,
            settingsRef.current.customAudioOffsetMs,
            speedRef.current
          );
        }
        onTimeUpdateRef.current(clamped);
      },
      clearVisuals: () => {
        sceneRef.current?.resetKeyStates();
        compositorRef.current?.clearParticles();
      },
      pressLiveNote: (midiKey: number, velocity: number) => {
        audioEngine.ensureInitialized();
        manualNotesRef.current.set(midiKey, velocity);
        audioEngine.playNote(midiKey, velocity, 1.35, liveSustainRef.current);
      },
      releaseLiveNote: (midiKey: number) => {
        manualNotesRef.current.delete(midiKey);
      },
      setLiveSustain: (down: boolean) => {
        liveSustainRef.current = down;
      },
      triggerMagicKeyDown: (keyCode: string) => {
        const steps = magicStepsRef.current;
        if (steps.length === 0) return null;

        // Wrap around seamlessly if user finished the song and keeps tapping!
        if (magicStepIdxRef.current >= steps.length) {
          magicStepIdxRef.current = 0;
          playTimeRef.current = 0;
        }

        const step = steps[magicStepIdxRef.current];
        audioEngine.ensureInitialized();

        const playedMidis: number[] = [];
        for (const n of step.notes) {
          audioEngine.playNote(n.midi, n.velocity, Math.max(0.32, n.duration), step.sustained || liveSustainRef.current);
          manualNotesRef.current.set(n.midi, n.velocity);
          playedMidis.push(n.midi);
        }
        magicHeldByKeyRef.current.set(keyCode, playedMidis);

        // Snap hit time to this chord, then smoothly glide highway right up to the next chord!
        playTimeRef.current = step.time;
        magicStepIdxRef.current++;

        if (magicStepIdxRef.current < steps.length) {
          magicTargetTimeRef.current = Math.max(step.time, steps[magicStepIdxRef.current].time - 0.015);
        } else {
          magicTargetTimeRef.current = midiRef.current?.duration ?? step.time + 1.0;
        }

        onTimeUpdateRef.current(playTimeRef.current);
        onMagicProgressRef.current?.(magicStepIdxRef.current, steps.length);
        return { stepIndex: magicStepIdxRef.current, totalSteps: steps.length };
      },
      triggerMagicKeyUp: (keyCode: string) => {
        const midis = magicHeldByKeyRef.current.get(keyCode);
        if (!midis) return;
        magicHeldByKeyRef.current.delete(keyCode);
        for (const m of midis) {
          // Only release if no other held Magic key is still holding that same pitch
          let stillHeld = false;
          for (const other of magicHeldByKeyRef.current.values()) {
            if (other.includes(m)) {
              stillHeld = true;
              break;
            }
          }
          if (!stillHeld) manualNotesRef.current.delete(m);
        }
      },
      getMagicProgress: () => ({
        stepIndex: magicStepIdxRef.current,
        totalSteps: magicStepsRef.current.length,
      }),
    };
  }, [stageRef, audioEngine]);

  // Initialize SceneRenderer, WebGLCompositor & 60fps animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const scene = new SceneRenderer();
    const compositor = new WebGLCompositor(canvas);
    sceneRef.current = scene;
    compositorRef.current = compositor;
    onEngineReady?.(compositor.isWebGL2);

    if (settingsRef.current.backgroundPreset === 'custom' && settingsRef.current.customBgUrl) {
      scene.setCustomBackground(settingsRef.current.customBgUrl);
    }

    const syncSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(320, Math.round(rect.width * dpr));
      const h = Math.max(240, Math.round(rect.height * dpr));
      scene.resize(w, h);
      compositor.resize(w, h);
    };

    syncSize();
    const ro = new ResizeObserver(syncSize);
    ro.observe(container);

    let rafId = 0;
    let lastPerf = performance.now();
    let clockSec = 0;
    let lastUiSync = 0;
    let fpsFrames = 0;
    let fpsLastStamp = performance.now();

    const tick = (now: number) => {
      const rawDt = (now - lastPerf) / 1000;
      lastPerf = now;
      const dt = Math.min(0.05, Math.max(0.001, rawDt));
      clockSec += dt;

      const curMidi = midiRef.current;
      const curSettings = settingsRef.current;
      const overrides = trackOverridesRef.current;

      // 1. Advance playback time (Auto-play OR smooth Magic Keys highway glide)
      if (playModeRef.current === 'magic-keys') {
        if (magicTargetTimeRef.current !== null) {
          const diff = magicTargetTimeRef.current - playTimeRef.current;
          if (Math.abs(diff) > 0.001) {
            // Smoothly glide notes right down onto the strike bar waiting for your next tap!
            playTimeRef.current += diff * Math.min(1, dt * 11.5);
            if (now - lastUiSync > 90) {
              lastUiSync = now;
              onTimeUpdateRef.current(playTimeRef.current);
            }
          }
        }
      } else if (isPlayingRef.current && curMidi) {
        const prevT = playTimeRef.current;
        const nextT = prevT + dt * speedRef.current;
        playTimeRef.current = nextT;

        // Fire all MIDI notes whose start time was crossed in (prevT..nextT]
        const notes = curMidi.notes;
        let idx = nextNoteIdxRef.current;
        while (idx < notes.length && notes[idx].start <= nextT) {
          const n = notes[idx];
          const ov = overrides[n.trackIndex];
          if (!ov?.muted && !ov?.hidden && n.start >= prevT - 0.08) {
            const sustained = isSustainDownAt(curMidi, n.start);
            audioEngine.playNote(n.midi, n.velocity, n.duration / speedRef.current, sustained);
          }
          idx++;
        }
        nextNoteIdxRef.current = idx;

        // Check A-B Loop first
        const la = loopARef.current;
        const lb = loopBRef.current;
        if (la !== null && lb !== null && lb > la + 0.25 && nextT >= lb) {
          playTimeRef.current = la;
          let lo = 0;
          let hi = notes.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (notes[mid].start < la) lo = mid + 1;
            else hi = mid;
          }
          nextNoteIdxRef.current = lo;
          audioEngine.stopAllNotes();
          audioEngine.startCustomAudio(la, curSettings.customAudioOffsetMs, speedRef.current);
        } else if (nextT >= curMidi.duration) {
          if (loopRef.current) {
            playTimeRef.current = 0;
            nextNoteIdxRef.current = 0;
            audioEngine.stopAllNotes();
            audioEngine.startCustomAudio(0, curSettings.customAudioOffsetMs, speedRef.current);
          } else {
            playTimeRef.current = curMidi.duration;
            isPlayingRef.current = false;
            onTimeUpdateRef.current(curMidi.duration);
            onSongEndedRef.current();
          }
        }

        if (now - lastUiSync > 70) {
          lastUiSync = now;
          onTimeUpdateRef.current(playTimeRef.current);
        }
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const audioEnergy = audioEngine.getAudioEnergy(0);
      const spectrumBins = curSettings.eqSpectrumEnabled
        ? audioEngine.getSpectrumBins(audioEnergy.overall)
        : undefined;
      const sustainDown =
        liveSustainRef.current || (curMidi !== null && isSustainDownAt(curMidi, playTimeRef.current));

      const frame = scene.render(
        curMidi,
        playTimeRef.current,
        clockSec,
        dt,
        curSettings,
        audioEnergy,
        manualNotesRef.current,
        spectrumBins,
        overrides,
        sustainDown
      );

      const blendedEnergy = {
        bass: Math.max(audioEnergy.bass, frame.activeEnergy * 0.65),
        mid: Math.max(audioEnergy.mid, frame.activeEnergy * 0.55),
        treble: Math.max(audioEnergy.treble, frame.activeEnergy * 0.45),
        overall: Math.max(audioEnergy.overall, frame.activeEnergy * 0.72),
      };

      compositor.renderFrame(
        scene.canvas,
        frame.hitLineY,
        frame.triggers,
        clockSec,
        dt,
        dpr,
        curSettings,
        blendedEnergy
      );

      // Performance telemetry sampling (only fires callback when stats HUD is enabled)
      fpsFrames++;
      if (now - fpsLastStamp >= 450) {
        if (curSettings.showPerfStats) {
          const fps = Math.round((fpsFrames * 1000) / Math.max(1, now - fpsLastStamp));
          onPerfStatsRef.current?.({
            fps,
            particles: compositor.getActiveParticleCount(),
            isWebGL2: compositor.isWebGL2,
          });
        }
        fpsFrames = 0;
        fpsLastStamp = now;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      compositor.dispose();
    };
  }, [audioEngine, onEngineReady]);

  // Interactive mouse play directly on the 88 piano keys
  const hitTestPianoKey = (clientX: number, clientY: number): number | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const relX = (clientX - rect.left) / Math.max(1, rect.width);
    const relY = (clientY - rect.top) / Math.max(1, rect.height);
    const pianoTopRatio = 1 - settingsRef.current.pianoHeightRatio;
    if (relY < pianoTopRatio || relY > 1 || relX < 0 || relX > 1) return null;

    const keyYRatio = (relY - pianoTopRatio) / settingsRef.current.pianoHeightRatio;
    const layout = getPianoLayout();

    if (keyYRatio <= 0.64) {
      for (let i = 0; i < TOTAL_KEYS; i++) {
        const k = layout[i];
        if (k.isBlack && relX >= k.normX && relX <= k.normX + k.normWidth) {
          return k.midi;
        }
      }
    }
    for (let i = 0; i < TOTAL_KEYS; i++) {
      const k = layout[i];
      if (!k.isBlack && relX >= k.normX && relX <= k.normX + k.normWidth) {
        return k.midi;
      }
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (cleanMode) return;
    const midiKey = hitTestPianoKey(e.clientX, e.clientY);
    if (midiKey !== null) {
      e.currentTarget.setPointerCapture(e.pointerId);
      pointerDownKeyRef.current = midiKey;
      manualNotesRef.current.set(midiKey, 0.88);
      audioEngine.ensureInitialized();
      audioEngine.playNote(midiKey, 0.88, 1.2, liveSustainRef.current);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerDownKeyRef.current === null) return;
    const midiKey = hitTestPianoKey(e.clientX, e.clientY);
    if (midiKey !== pointerDownKeyRef.current) {
      manualNotesRef.current.delete(pointerDownKeyRef.current);
      pointerDownKeyRef.current = midiKey;
      if (midiKey !== null) {
        manualNotesRef.current.set(midiKey, 0.84);
        audioEngine.playNote(midiKey, 0.84, 1.0, liveSustainRef.current);
      }
    }
  };

  const handlePointerUp = () => {
    if (pointerDownKeyRef.current !== null) {
      manualNotesRef.current.delete(pointerDownKeyRef.current);
      pointerDownKeyRef.current = null;
    }
  };

  const isFramed = settings.aspectRatio !== 'full';

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#020306] overflow-hidden">
      <div
        ref={containerRef}
        style={getAspectStyle(settings.aspectRatio)}
        className={`relative overflow-hidden ${
          isFramed && !cleanMode
            ? 'ring-1 ring-white/15 shadow-[0_0_80px_rgba(139,92,246,0.22)] rounded-sm'
            : ''
        }`}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="block w-full h-full touch-none"
        />
      </div>
    </div>
  );
};
