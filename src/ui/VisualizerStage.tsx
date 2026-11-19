import React, { useEffect, useRef } from 'react';
import type { AudioEngine } from '../audio/AudioEngine';
import { getPianoLayout, TOTAL_KEYS } from '../engine/PianoGeometry';
import { SceneRenderer } from '../engine/SceneRenderer';
import { WebGLCompositor } from '../engine/WebGLCompositor';
import type { AspectRatioMode, ParsedMidi, VisualizerSettings } from '../types/visualizer';

export interface VisualizerStageHandle {
  getCanvas: () => HTMLCanvasElement | null;
  seekTo: (timeSec: number) => void;
  clearVisuals: () => void;
}

interface VisualizerStageProps {
  midi: ParsedMidi | null;
  isPlaying: boolean;
  playbackSpeed: number;
  loopEnabled: boolean;
  settings: VisualizerSettings;
  audioEngine: AudioEngine;
  cleanMode: boolean;
  stageRef: React.MutableRefObject<VisualizerStageHandle | null>;
  onTimeUpdate: (timeSec: number) => void;
  onSongEnded: () => void;
  onEngineReady?: (isWebGL2: boolean) => void;
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
  playbackSpeed,
  loopEnabled,
  settings,
  audioEngine,
  cleanMode,
  stageRef,
  onTimeUpdate,
  onSongEnded,
  onEngineReady,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const sceneRef = useRef<SceneRenderer | null>(null);
  const compositorRef = useRef<WebGLCompositor | null>(null);

  // Mutable live refs for 60fps loop without React re-render overhead
  const midiRef = useRef<ParsedMidi | null>(midi);
  const isPlayingRef = useRef(isPlaying);
  const speedRef = useRef(playbackSpeed);
  const loopRef = useRef(loopEnabled);
  const settingsRef = useRef(settings);

  const playTimeRef = useRef(0);
  const nextNoteIdxRef = useRef(0);
  const manualNotesRef = useRef<Map<number, number>>(new Map());
  const pointerDownKeyRef = useRef<number | null>(null);

  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onSongEndedRef = useRef(onSongEnded);

  useEffect(() => {
    midiRef.current = midi;
    playTimeRef.current = 0;
    nextNoteIdxRef.current = 0;
    sceneRef.current?.resetKeyStates();
    compositorRef.current?.clearParticles();
    onTimeUpdateRef.current(0);
  }, [midi]);

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
    settingsRef.current = settings;
    sceneRef.current?.setCustomBackground(
      settings.backgroundPreset === 'custom' ? settings.customBgUrl : null
    );
  }, [settings]);

  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  useEffect(() => {
    onSongEndedRef.current = onSongEnded;
  }, [onSongEnded]);

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

        // Advance nextNoteIdx to match new seek position
        if (curMidi) {
          let lo = 0;
          let hi = curMidi.notes.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (curMidi.notes[mid].start < clamped) lo = mid + 1;
            else hi = mid;
          }
          nextNoteIdxRef.current = lo;
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

    const tick = (now: number) => {
      const rawDt = (now - lastPerf) / 1000;
      lastPerf = now;
      const dt = Math.min(0.05, Math.max(0.001, rawDt));
      clockSec += dt;

      const curMidi = midiRef.current;
      const curSettings = settingsRef.current;

      if (isPlayingRef.current && curMidi) {
        const prevT = playTimeRef.current;
        const nextT = prevT + dt * speedRef.current;
        playTimeRef.current = nextT;

        // Fire all MIDI notes whose start time was crossed in (prevT..nextT]
        const notes = curMidi.notes;
        let idx = nextNoteIdxRef.current;
        while (idx < notes.length && notes[idx].start <= nextT) {
          const n = notes[idx];
          if (n.start >= prevT - 0.08) {
            const sustained = isSustainDownAt(curMidi, n.start);
            audioEngine.playNote(n.midi, n.velocity, n.duration / speedRef.current, sustained);
          }
          idx++;
        }
        nextNoteIdxRef.current = idx;

        // Check song end
        if (nextT >= curMidi.duration) {
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
      const frame = scene.render(
        curMidi,
        playTimeRef.current,
        clockSec,
        dt,
        curSettings,
        audioEnergy,
        manualNotesRef.current
      );

      // Blend active MIDI energy so visual effects pulse even if audio is muted
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

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      compositor.dispose();
    };
  }, [audioEngine, onEngineReady]);

  // Interactive mouse play directly on the 88 piano keys!
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

    // Check black keys first (top 62% of keyboard)
    if (keyYRatio <= 0.64) {
      for (let i = 0; i < TOTAL_KEYS; i++) {
        const k = layout[i];
        if (k.isBlack && relX >= k.normX && relX <= k.normX + k.normWidth) {
          return k.midi;
        }
      }
    }
    // Then white keys
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
      audioEngine.playNote(midiKey, 0.88, 1.2, false);
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
        audioEngine.playNote(midiKey, 0.84, 1.0, false);
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
