import React, { useEffect, useRef } from 'react';
import type { AudioEngine } from '../audio/AudioEngine';
import { getPianoLayout, TOTAL_KEYS } from '../engine/PianoGeometry';
import { SceneRenderer } from '../engine/SceneRenderer';
import { WebGLCompositor } from '../engine/WebGLCompositor';
import { buildMagicSteps, findMagicStepIndexAtTime, type MagicStep } from '../midi/MagicKeys';
import type {
  AspectRatioMode,
  LyricLine,
  ParsedMidi,
  PlayMode,
  RhythmFeedback,
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
  lyrics?: LyricLine[];
  stageRef: React.MutableRefObject<VisualizerStageHandle | null>;
  onTimeUpdate: (timeSec: number) => void;
  onSongEnded: () => void;
  onEngineReady?: (isWebGL2: boolean) => void;
  onPerfStats?: (stats: PerfStats) => void;
  onMagicProgress?: (stepIndex: number, totalSteps: number) => void;
  onRhythmFeedback?: (fb: RhythmFeedback | null) => void;
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
  lyrics,
  stageRef,
  onTimeUpdate,
  onSongEnded,
  onEngineReady,
  onPerfStats,
  onMagicProgress,
  onRhythmFeedback,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

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
  const lyricsRef = useRef<LyricLine[]>(lyrics ?? []);

  const playTimeRef = useRef(0);
  const nextNoteIdxRef = useRef(0);
  const lastMetroBeatRef = useRef(-1);

  // Wait-for-Note Practice Mode & Rhythm Combo HUD refs
  const practiceWaitingRef = useRef<Set<number>>(new Set());
  const practiceSatisfiedRef = useRef<Set<number>>(new Set());
  const practiceWaitAnchorRef = useRef<number>(-1);
  const rhythmStatsRef = useRef({ combo: 0, maxCombo: 0, scoreSum: 0, hits: 0 });

  // Live notes pressed via mouse, QWERTY, Web MIDI USB, or Magic Keys
  const manualNotesRef = useRef<Map<number, number>>(new Map());
  const liveSustainRef = useRef(false);
  const pointerDownKeyRef = useRef<number | null>(null);

  // Magic Keys ("Giả bấm") state with Adaptive Rubato Glide!
  const magicStepsRef = useRef<MagicStep[]>([]);
  const magicStepIdxRef = useRef(0);
  const magicTargetTimeRef = useRef<number | null>(null);
  const magicHeldByKeyRef = useRef<Map<string, number[]>>(new Map());
  const magicLastTapPerfRef = useRef<number>(0);
  const magicLastStepTimeRef = useRef<number>(0);
  const magicFlowRateRef = useRef<number>(1.0);

  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onSongEndedRef = useRef(onSongEnded);
  const onPerfStatsRef = useRef(onPerfStats);
  const onMagicProgressRef = useRef(onMagicProgress);
  const onRhythmFeedbackRef = useRef(onRhythmFeedback);

  const recordRhythmHit = (rating: 'PERFECT' | 'GREAT' | 'GOOD') => {
    const st = rhythmStatsRef.current;
    st.combo += 1;
    if (st.combo > st.maxCombo) st.maxCombo = st.combo;
    st.hits += 1;
    st.scoreSum += rating === 'PERFECT' ? 100 : rating === 'GREAT' ? 88 : 72;
    const accuracy = Math.round(st.scoreSum / Math.max(1, st.hits));
    onRhythmFeedbackRef.current?.({
      rating,
      combo: st.combo,
      maxCombo: st.maxCombo,
      accuracy,
      hits: st.hits,
      timestamp: performance.now(),
    });
  };

  useEffect(() => {
    lyricsRef.current = lyrics ?? [];
  }, [lyrics]);

  useEffect(() => {
    midiRef.current = midi;
    playTimeRef.current = 0;
    nextNoteIdxRef.current = 0;
    lastMetroBeatRef.current = -1;
    practiceWaitingRef.current.clear();
    practiceSatisfiedRef.current.clear();
    practiceWaitAnchorRef.current = -1;
    rhythmStatsRef.current = { combo: 0, maxCombo: 0, scoreSum: 0, hits: 0 };
    onRhythmFeedbackRef.current?.(null);
    magicStepsRef.current = buildMagicSteps(
      midi,
      trackOverridesRef.current,
      settingsRef.current.magicChordWindowMs
    );
    magicStepIdxRef.current = 0;
    magicLastTapPerfRef.current = 0;
    magicFlowRateRef.current = 1.0;
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
    const steps = buildMagicSteps(
      midiRef.current,
      trackOverrides,
      settings.magicChordWindowMs
    );
    magicStepsRef.current = steps;
    magicStepIdxRef.current = findMagicStepIndexAtTime(steps, playTimeRef.current);
    onMagicProgressRef.current?.(magicStepIdxRef.current, steps.length);
  }, [trackOverrides, settings.magicChordWindowMs]);

  useEffect(() => {
    playModeRef.current = playMode;
    magicHeldByKeyRef.current.clear();
    manualNotesRef.current.clear();
    practiceWaitingRef.current.clear();
    practiceSatisfiedRef.current.clear();
    practiceWaitAnchorRef.current = -1;
    rhythmStatsRef.current = { combo: 0, maxCombo: 0, scoreSum: 0, hits: 0 };
    onRhythmFeedbackRef.current?.(null);
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
    const vid = videoRef.current;
    if (isPlaying) {
      audioEngine.ensureInitialized();
      audioEngine.startCustomAudio(
        playTimeRef.current,
        settingsRef.current.customAudioOffsetMs,
        speedRef.current
      );
      if (vid && settingsRef.current.customVideoUrl && settingsRef.current.customVideoMode === 'overhead-hands') {
        const target = Math.max(0, playTimeRef.current + settingsRef.current.customVideoOffsetMs / 1000);
        if (Number.isFinite(vid.duration) && target < vid.duration) vid.currentTime = target;
        vid.playbackRate = speedRef.current;
        void vid.play().catch(() => {});
      }
    } else {
      audioEngine.stopAllNotes();
      if (vid && settingsRef.current.customVideoMode === 'overhead-hands') {
        vid.pause();
      }
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
    // Sync custom video element (looping backdrop vs MIDI-synced overhead real-hands)
    const vid = videoRef.current;
    if (vid) {
      if (!settings.customVideoUrl) {
        vid.pause();
        if (vid.src) {
          vid.removeAttribute('src');
          vid.load();
        }
      } else {
        if (vid.dataset.url !== settings.customVideoUrl) {
          vid.dataset.url = settings.customVideoUrl;
          vid.src = settings.customVideoUrl;
          vid.load();
        }
        vid.loop = settings.customVideoMode === 'backdrop';
        vid.playbackRate = speedRef.current;
        if (settings.customVideoMode === 'backdrop') {
          void vid.play().catch(() => {});
        } else if (isPlayingRef.current) {
          const target = Math.max(0, playTimeRef.current + settings.customVideoOffsetMs / 1000);
          if (Number.isFinite(vid.duration) && target < vid.duration) {
            vid.currentTime = target;
          }
          void vid.play().catch(() => {});
        } else {
          vid.pause();
        }
      }
    }
    // Re-sync SSAA buffer resolution immediately when user switches Render Quality
    const container = containerRef.current;
    if (container && sceneRef.current && compositorRef.current) {
      const rect = container.getBoundingClientRect();
      const nativeDpr = window.devicePixelRatio || 1;
      const quality = settings.renderQuality ?? 'ultra';
      const targetScale =
        quality === 'ultra'
          ? Math.max(nativeDpr, 1.75)
          : quality === 'high'
            ? Math.max(nativeDpr, 1.35)
            : Math.min(nativeDpr, 1.0);
      const maxWidth = quality === 'ultra' ? 2560 : quality === 'high' ? 1920 : 1440;
      const clampedScale = Math.min(2.0, targetScale, maxWidth / Math.max(1, rect.width));
      const w = Math.max(320, Math.round(rect.width * clampedScale));
      const h = Math.max(240, Math.round(rect.height * clampedScale));
      sceneRef.current.resize(w, h);
      compositorRef.current.resize(w, h);
    }
  }, [settings]);

  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
    onSongEndedRef.current = onSongEnded;
    onPerfStatsRef.current = onPerfStats;
    onMagicProgressRef.current = onMagicProgress;
    onRhythmFeedbackRef.current = onRhythmFeedback;
  }, [onTimeUpdate, onSongEnded, onPerfStats, onMagicProgress, onRhythmFeedback]);

  // Expose imperative stage controls
  useEffect(() => {
    stageRef.current = {
      getCanvas: () => canvasRef.current,
      seekTo: (timeSec: number) => {
        const curMidi = midiRef.current;
        const clamped = curMidi ? Math.max(0, Math.min(curMidi.duration, timeSec)) : 0;
        playTimeRef.current = clamped;
        lastMetroBeatRef.current = -1;
        practiceWaitingRef.current.clear();
        practiceSatisfiedRef.current.clear();
        practiceWaitAnchorRef.current = -1;
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

        // Wait-for-Note Practice Mode: mark matching required pitch as satisfied!
        if (playModeRef.current === 'practice' && practiceWaitingRef.current.has(midiKey)) {
          practiceWaitingRef.current.delete(midiKey);
          practiceSatisfiedRef.current.add(midiKey);
          if (practiceWaitingRef.current.size === 0) {
            recordRhythmHit('PERFECT');
            // Advance slightly past the waited chord so playback resumes smoothly
            playTimeRef.current += 0.024;
            practiceWaitAnchorRef.current = -1;
            practiceSatisfiedRef.current.clear();
          }
        } else if (playModeRef.current === 'qwerty' && midiRef.current && isPlayingRef.current) {
          // Optional Rhythm Accuracy scoring during live QWERTY / USB MIDI playalong!
          const tNow = playTimeRef.current;
          const notes = midiRef.current.notes;
          let bestErr = Infinity;
          for (let i = Math.max(0, nextNoteIdxRef.current - 12); i < Math.min(notes.length, nextNoteIdxRef.current + 12); i++) {
            if (notes[i].midi === midiKey) {
              const err = Math.abs(notes[i].start - tNow);
              if (err < bestErr) bestErr = err;
            }
          }
          if (bestErr <= 0.18) {
            recordRhythmHit(bestErr <= 0.065 ? 'PERFECT' : bestErr <= 0.12 ? 'GREAT' : 'GOOD');
          }
        }
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
          magicLastTapPerfRef.current = 0;
        }

        const step = steps[magicStepIdxRef.current];
        const nowPerf = performance.now();

        // Adaptive Rubato Tempo Estimator: learns your natural live tapping pace!
        if (magicLastTapPerfRef.current > 0) {
          const realDt = (nowPerf - magicLastTapPerfRef.current) / 1000;
          const scoreDt = Math.max(0.05, step.time - magicLastStepTimeRef.current);
          if (realDt > 0.04 && realDt < 2.2) {
            const instantRate = Math.max(0.35, Math.min(2.2, scoreDt / realDt));
            magicFlowRateRef.current = magicFlowRateRef.current * 0.65 + instantRate * 0.35;
          }
        }
        magicLastTapPerfRef.current = nowPerf;
        magicLastStepTimeRef.current = step.time;

        audioEngine.ensureInitialized();

        // Humanized subtle micro-strum across multi-note chords (0..10ms) for concert-pianist warmth!
        const sortedChord = [...step.notes].sort((a, b) => a.midi - b.midi);
        const playedMidis: number[] = [];
        sortedChord.forEach((n, idx) => {
          const strumMs = sortedChord.length > 1 ? Math.min(12, idx * 3.5) : 0;
          const vel = Math.max(0.22, Math.min(1, n.velocity * (0.94 + Math.random() * 0.12)));
          if (strumMs > 0) {
            window.setTimeout(() => {
              audioEngine.playNote(n.midi, vel, Math.max(0.45, n.duration * 1.15), true);
            }, strumMs);
          } else {
            audioEngine.playNote(n.midi, vel, Math.max(0.45, n.duration * 1.15), true);
          }
          manualNotesRef.current.set(n.midi, vel);
          playedMidis.push(n.midi);
        });
        magicHeldByKeyRef.current.set(keyCode, playedMidis);

        // Smoothly pull highway forward (never harsh teleport backward!)
        if (playTimeRef.current < step.time - 0.12) {
          playTimeRef.current = step.time - 0.06;
        }
        magicStepIdxRef.current++;

        if (magicStepIdxRef.current < steps.length) {
          magicTargetTimeRef.current = Math.max(step.time, steps[magicStepIdxRef.current].time - 0.014);
        } else {
          magicTargetTimeRef.current = midiRef.current?.duration ?? step.time + 1.0;
        }

        onTimeUpdateRef.current(playTimeRef.current);
        onMagicProgressRef.current?.(magicStepIdxRef.current, steps.length);

        // Score smooth Magic Keys rubato timing for optional Rhythm Combo HUD!
        const rateErr = Math.abs(magicFlowRateRef.current - 1.0);
        recordRhythmHit(rateErr < 0.28 ? 'PERFECT' : rateErr < 0.55 ? 'GREAT' : 'GOOD');

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
      const nativeDpr = window.devicePixelRatio || 1;
      const quality = settingsRef.current.renderQuality ?? 'ultra';
      const targetScale =
        quality === 'ultra'
          ? Math.max(nativeDpr, 1.75)
          : quality === 'high'
            ? Math.max(nativeDpr, 1.35)
            : Math.min(nativeDpr, 1.0);

      // Cap max width at 2560px to keep WebGL2 60fps silky even on 4K displays
      const maxWidth = quality === 'ultra' ? 2560 : quality === 'high' ? 1920 : 1440;
      const clampedScale = Math.min(2.0, targetScale, maxWidth / Math.max(1, rect.width));
      const w = Math.max(320, Math.round(rect.width * clampedScale));
      const h = Math.max(240, Math.round(rect.height * clampedScale));
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

      // 1. Advance playback time (Auto-play OR Butter-Smooth Adaptive Rubato Magic Keys Glide)
      if (playModeRef.current === 'magic-keys') {
        if (magicTargetTimeRef.current !== null) {
          const diff = magicTargetTimeRef.current - playTimeRef.current;
          if (diff > 0.0008) {
            const smooth = curSettings.magicSmoothness ?? 0.82;
            // Combine constant rubato flow velocity with gentle exponential cushion approaching next chord!
            const flowStep = dt * magicFlowRateRef.current * (0.65 + (1 - smooth) * 0.75);
            const springStep = diff * Math.min(1, dt * (3.8 + (1 - smooth) * 8.5));
            const advance = Math.min(diff, Math.max(springStep, Math.min(diff * 0.65, flowStep)));
            playTimeRef.current += advance;
            if (now - lastUiSync > 90) {
              lastUiSync = now;
              onTimeUpdateRef.current(playTimeRef.current);
            }
          }
        }
      } else if (isPlayingRef.current && curMidi) {
        const notes = curMidi.notes;
        const isPractice = playModeRef.current === 'practice';
        const pHand = curSettings.practiceHand ?? 'both';

        // Wait-for-Note Practice Mode: check if we are paused waiting for user to press required keys!
        let frozenForPractice = false;
        if (isPractice) {
          if (practiceWaitingRef.current.size > 0) {
            frozenForPractice = true;
          } else {
            // Inspect upcoming note at nextNoteIdxRef
            let scan = nextNoteIdxRef.current;
            while (scan < notes.length) {
              const cand = notes[scan];
              const ov = overrides[cand.trackIndex];
              if (ov?.hidden || ov?.muted) {
                scan++;
                continue;
              }
              const effectiveHand = ov?.hand ?? cand.hand;
              const requiresUser = pHand === 'both' || effectiveHand === pHand;
              if (!requiresUser) {
                scan++;
                continue;
              }
              if (cand.start <= playTimeRef.current + dt * speedRef.current + 0.012 && cand.start > practiceWaitAnchorRef.current + 0.01) {
                // Collect simultaneous chord notes belonging to the practiced hand (within 45ms)
                const chordTime = cand.start;
                const req = new Set<number>();
                for (let j = scan; j < notes.length && notes[j].start <= chordTime + 0.045; j++) {
                  const nj = notes[j];
                  const ovj = overrides[nj.trackIndex];
                  if (ovj?.hidden || ovj?.muted) continue;
                  const h = ovj?.hand ?? nj.hand;
                  if (pHand === 'both' || h === pHand) {
                    if (!manualNotesRef.current.has(nj.midi) && !practiceSatisfiedRef.current.has(nj.midi)) {
                      req.add(nj.midi);
                    }
                  }
                }
                if (req.size > 0) {
                  playTimeRef.current = chordTime;
                  practiceWaitingRef.current = req;
                  practiceWaitAnchorRef.current = chordTime;
                  frozenForPractice = true;
                }
              }
              break;
            }
          }
        }

        if (!frozenForPractice) {
          const prevT = playTimeRef.current;
          const nextT = prevT + dt * speedRef.current;
          playTimeRef.current = nextT;

          // Optional Studio Metronome tick synced to song BPM & time signature!
          if (curSettings.metronomeEnabled && curMidi.bpm > 0) {
            const beatSec = 60 / curMidi.bpm;
            const curBeat = Math.floor(nextT / beatSec);
            if (curBeat > lastMetroBeatRef.current && nextT >= 0.01) {
              lastMetroBeatRef.current = curBeat;
              const beatsPerBar = Math.max(1, curMidi.timeSignature[0] || 4);
              audioEngine.playMetronomeClick(curBeat % beatsPerBar === 0);
            }
          }

          // Fire all MIDI notes whose start time was crossed in (prevT..nextT]
          // In Practice Mode, only auto-play the OTHER (backing) hand so the user hears their own playing!
          let idx = nextNoteIdxRef.current;
          while (idx < notes.length && notes[idx].start <= nextT) {
            const n = notes[idx];
            const ov = overrides[n.trackIndex];
            const effectiveHand = ov?.hand ?? n.hand;
            const skipForPractice = isPractice && (pHand === 'both' || effectiveHand === pHand);
            if (!ov?.muted && !ov?.hidden && !skipForPractice && n.start >= prevT - 0.08) {
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
            lastMetroBeatRef.current = -1;
            practiceWaitingRef.current.clear();
            practiceWaitAnchorRef.current = -1;
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
              lastMetroBeatRef.current = -1;
              practiceWaitingRef.current.clear();
              practiceWaitAnchorRef.current = -1;
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
      }

      const effectiveScale = compositor.canvas.width / Math.max(1, container.clientWidth);
      const audioEnergy = audioEngine.getAudioEnergy(0);
      const spectrumBins = curSettings.eqSpectrumEnabled
        ? audioEngine.getSpectrumBins(audioEnergy.overall)
        : undefined;
      const sustainDown =
        liveSustainRef.current || (curMidi !== null && isSustainDownAt(curMidi, playTimeRef.current));

      // Sync overhead real-hands video gently if drifted > 140ms
      const vid = videoRef.current;
      if (
        vid &&
        curSettings.customVideoUrl &&
        curSettings.customVideoMode === 'overhead-hands' &&
        vid.readyState >= 2
      ) {
        const targetVidTime = Math.max(0, playTimeRef.current + curSettings.customVideoOffsetMs / 1000);
        if (Number.isFinite(vid.duration) && targetVidTime < vid.duration) {
          if (Math.abs(vid.currentTime - targetVidTime) > 0.14) {
            vid.currentTime = targetVidTime;
          }
        }
      }

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
        sustainDown,
        vid,
        lyricsRef.current,
        practiceWaitingRef.current.size > 0 ? practiceWaitingRef.current : undefined
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
        effectiveScale,
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
      stageRef.current?.pressLiveNote(midiKey, 0.88);
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
        <video
          ref={videoRef}
          muted
          playsInline
          crossOrigin="anonymous"
          className="hidden"
        />
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
