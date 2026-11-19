import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine, type SampleLoadState } from './audio/AudioEngine';
import { DEMO_SONGS } from './midi/DemoSongs';
import { parseMidiBuffer } from './midi/MidiParser';
import {
  DEFAULT_SETTINGS,
  VISUAL_PRESETS,
  type ParsedMidi,
  type VisualizerSettings,
} from './types/visualizer';
import { CleanModeOverlay } from './ui/CleanModeOverlay';
import { InspectorDrawer } from './ui/InspectorDrawer';
import { TopBar } from './ui/TopBar';
import { TransportBar } from './ui/TransportBar';
import { VisualizerStage, type VisualizerStageHandle } from './ui/VisualizerStage';
import { downloadRecording, VideoExporter } from './video/VideoExporter';

export const App: React.FC = () => {
  const audioEngine = useMemo(() => new AudioEngine(), []);
  const exporter = useMemo(() => new VideoExporter(), []);
  const stageRef = useRef<VisualizerStageHandle | null>(null);

  const [settings, setSettings] = useState<VisualizerSettings>(DEFAULT_SETTINGS);
  const [activePresetId, setActivePresetId] = useState<string | null>('rainbow-neon-3d');
  const [activeDemoId, setActiveDemoId] = useState<string | null>(DEMO_SONGS[0].id);
  const [midi, setMidi] = useState<ParsedMidi | null>(() => DEMO_SONGS[0].build());

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [loopEnabled, setLoopEnabled] = useState(false);

  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [cleanMode, setCleanMode] = useState(false);
  const [cursorHidden, setCursorHidden] = useState(false);
  const [isWebGL2, setIsWebGL2] = useState(true);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);

  const [sampleState, setSampleState] = useState<SampleLoadState>('idle');
  const [sampleProgress, setSampleProgress] = useState({ loaded: 0, total: 20 });
  const [customAudioName, setCustomAudioName] = useState<string | null>(null);

  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const toastTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const prevCleanBeforeRecRef = useRef(false);

  const showToast = useCallback((msg: string, durationMs = 2800) => {
    setToastMsg(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), durationMs);
  }, []);

  // Wire audio engine listeners & parameter sync
  useEffect(() => {
    audioEngine.setSampleStateListener((state, loaded, total) => {
      setSampleState(state);
      setSampleProgress({ loaded, total });
    });
    return () => {
      audioEngine.dispose();
    };
  }, [audioEngine]);

  useEffect(() => {
    audioEngine.setMode(settings.audioMode);
  }, [audioEngine, settings.audioMode]);

  useEffect(() => {
    audioEngine.setVolume(settings.masterVolume);
  }, [audioEngine, settings.masterVolume]);

  useEffect(() => {
    audioEngine.setReverbMix(settings.reverbMix);
  }, [audioEngine, settings.reverbMix]);

  // Recording elapsed timer
  useEffect(() => {
    if (!isRecording) {
      setRecordingSec(0);
      return;
    }
    const start = performance.now();
    const id = window.setInterval(() => {
      setRecordingSec((performance.now() - start) / 1000);
    }, 250);
    return () => window.clearInterval(id);
  }, [isRecording]);

  // Auto-hide cursor after 1.5s of mouse inactivity in Clean Video Mode
  useEffect(() => {
    if (!cleanMode) {
      setCursorHidden(false);
      return;
    }
    let timer = window.setTimeout(() => setCursorHidden(true), 1400);
    const onMove = () => {
      setCursorHidden(false);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setCursorHidden(true), 1400);
    };
    window.addEventListener('mousemove', onMove);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('mousemove', onMove);
    };
  }, [cleanMode]);

  const updateSettings = useCallback((patch: Partial<VisualizerSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
    setActivePresetId(null);
  }, []);

  const applyPreset = useCallback((presetId: string) => {
    const preset = VISUAL_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setSettings((prev) => ({
      ...prev,
      ...preset.patch,
      // Keep user's custom uploaded background if they had one active and didn't clear it
      customBgUrl: prev.customBgUrl,
    }));
    setActivePresetId(presetId);
    showToast(`Đã áp dụng preset "${preset.name}"`);
  }, [showToast]);

  const handleSelectDemo = useCallback(
    (demoId: string) => {
      const demo = DEMO_SONGS.find((d) => d.id === demoId);
      if (!demo) return;
      audioEngine.stopAllNotes();
      setIsPlaying(false);
      setActiveDemoId(demo.id);
      setMidi(demo.build());
      setCurrentTime(0);
      showToast(`Đã nạp bài demo: ${demo.title}`);
    },
    [audioEngine, showToast]
  );

  const handleUploadMidi = useCallback(
    async (file: File) => {
      try {
        const buffer = await file.arrayBuffer();
        const parsed = parseMidiBuffer(buffer, file.name);
        if (parsed.notes.length === 0) {
          showToast('File MIDI này không có nốt piano hợp lệ!', 3500);
          return;
        }
        audioEngine.stopAllNotes();
        setIsPlaying(false);
        setActiveDemoId(null);
        setMidi(parsed);
        setCurrentTime(0);
        showToast(`Đã tải "${parsed.name}" (${parsed.notes.length} nốt • ${parsed.bpm} BPM)`);
      } catch {
        showToast('Không thể đọc file MIDI. Hãy thử file .mid hợp lệ.', 3500);
      }
    },
    [audioEngine, showToast]
  );

  const handleUploadBackground = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      setSettings((prev) => {
        if (prev.customBgUrl) URL.revokeObjectURL(prev.customBgUrl);
        return {
          ...prev,
          backgroundPreset: 'custom',
          customBgUrl: url,
          bgOpacity: Math.max(prev.bgOpacity, 0.72),
        };
      });
      showToast(`Đã đổi ảnh nền: ${file.name}`);
    },
    [showToast]
  );

  const handleClearBackground = useCallback(() => {
    setSettings((prev) => {
      if (prev.customBgUrl) URL.revokeObjectURL(prev.customBgUrl);
      return {
        ...prev,
        backgroundPreset: 'nebula',
        customBgUrl: null,
      };
    });
    showToast('Đã gỡ ảnh nền custom');
  }, [showToast]);

  const handleUploadCustomAudio = useCallback(
    async (file: File) => {
      try {
        await audioEngine.loadCustomAudioFile(file);
        setCustomAudioName(file.name);
        setSettings((prev) => ({ ...prev, audioMode: 'custom-audio' }));
        showToast(`Đã đồng bộ file nhạc: ${file.name}`);
      } catch {
        showToast('Không thể giải mã file âm thanh này.', 3500);
      }
    },
    [audioEngine, showToast]
  );

  const handleClearCustomAudio = useCallback(() => {
    audioEngine.clearCustomAudio();
    setCustomAudioName(null);
    setSettings((prev) => ({
      ...prev,
      audioMode: prev.audioMode === 'custom-audio' ? 'salamander' : prev.audioMode,
    }));
  }, [audioEngine]);

  const startActualRecording = useCallback(() => {
    const canvas = stageRef.current?.getCanvas();
    if (!canvas) return;

    if (settings.recordAutoStart) {
      stageRef.current?.seekTo(0);
      stageRef.current?.clearVisuals();
    }

    const audioStream = audioEngine.getRecordStream();
    setIsRecording(true);
    setIsPlaying(true);

    exporter.start(canvas, audioStream, settings.recordBitrateMbps, (result) => {
      setIsRecording(false);
      setCleanMode(prevCleanBeforeRecRef.current);
      downloadRecording(result, midi?.name ?? 'synthecia');
      showToast(
        `Đã lưu video sạch (${result.durationSec.toFixed(1)}s • .${result.extension.toUpperCase()})!`,
        4000
      );
    });
  }, [audioEngine, exporter, midi?.name, settings.recordAutoStart, settings.recordBitrateMbps, showToast]);

  const handleToggleRecording = useCallback(() => {
    // Cancel pending countdown
    if (countdown !== null) {
      if (countdownTimerRef.current) window.clearTimeout(countdownTimerRef.current);
      setCountdown(null);
      setCleanMode(prevCleanBeforeRecRef.current);
      return;
    }

    if (isRecording) {
      exporter.stop();
      setIsPlaying(false);
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      showToast('Trình duyệt không hỗ trợ ghi hình trực tiếp. Hãy dùng Clean Video Mode + OBS!', 4000);
      return;
    }

    prevCleanBeforeRecRef.current = cleanMode;
    setInspectorOpen(false);
    setCleanMode(true); // Automatically hide ALL UI for a 100% clean recording!
    audioEngine.ensureInitialized();

    if (settings.recordCountdown) {
      setIsPlaying(false);
      if (settings.recordAutoStart) {
        stageRef.current?.seekTo(0);
      }
      setCountdown(3);
      let remaining = 3;
      const step = () => {
        remaining--;
        if (remaining > 0) {
          setCountdown(remaining);
          countdownTimerRef.current = window.setTimeout(step, 850);
        } else {
          setCountdown(null);
          // Give 1 frame for countdown overlay to fully unmount before capture begins
          requestAnimationFrame(() => startActualRecording());
        }
      };
      countdownTimerRef.current = window.setTimeout(step, 850);
    } else {
      requestAnimationFrame(() => startActualRecording());
    }
  }, [
    audioEngine,
    cleanMode,
    countdown,
    exporter,
    isRecording,
    settings.recordAutoStart,
    settings.recordCountdown,
    showToast,
    startActualRecording,
  ]);

  const handleSongEnded = useCallback(() => {
    setIsPlaying(false);
    if (isRecording && settings.recordAutoStop) {
      // Hold 0.9s after final note so trailing glow & fluid particles finish gracefully
      window.setTimeout(() => {
        if (exporter.isRecording()) {
          exporter.stop();
        }
      }, 900);
    }
  }, [exporter, isRecording, settings.recordAutoStop]);

  const handleTakeSnapshot = useCallback(() => {
    const canvas = stageRef.current?.getCanvas();
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `synthecia-frame-${Date.now()}.png`;
    a.click();
    showToast('Đã chụp & tải ảnh khung hình PNG!');
  }, [showToast]);

  const handleTogglePlay = useCallback(() => {
    if (!midi) return;
    audioEngine.ensureInitialized();
    setIsPlaying((prev) => {
      if (!prev && currentTime >= midi.duration - 0.15) {
        stageRef.current?.seekTo(0);
      }
      return !prev;
    });
  }, [audioEngine, currentTime, midi]);

  // Global keyboard shortcuts (Space, V, Esc, R, Arrows)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        setCleanMode((v) => !v);
      } else if (e.key === 'Escape') {
        if (isRecording) {
          exporter.stop();
          setIsPlaying(false);
        } else if (cleanMode) {
          setCleanMode(false);
        } else if (inspectorOpen) {
          setInspectorOpen(false);
        }
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleToggleRecording();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stageRef.current?.seekTo(Math.max(0, currentTime - 5));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stageRef.current?.seekTo(currentTime + 5);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cleanMode, currentTime, exporter, handleTogglePlay, handleToggleRecording, inspectorOpen, isRecording]);

  // Global Drag & Drop for MIDI, Custom Background Images, and Custom Audio
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDraggingFile) setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setIsDraggingFile(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.mid') || lower.endsWith('.midi')) {
      void handleUploadMidi(file);
    } else if (file.type.startsWith('image/')) {
      handleUploadBackground(file);
    } else if (file.type.startsWith('audio/')) {
      void handleUploadCustomAudio(file);
    } else {
      showToast('Hỗ trợ kéo thả: file MIDI (.mid), ảnh nền (.png/.jpg), hoặc nhạc (.mp3/.wav)', 3500);
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`relative w-screen h-screen overflow-hidden bg-[#020306] ${
        cursorHidden ? 'cursor-hidden' : ''
      }`}
    >
      {/* Master Hybrid WebGL2 Visualizer Stage */}
      <VisualizerStage
        midi={midi}
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        loopEnabled={loopEnabled}
        settings={settings}
        audioEngine={audioEngine}
        cleanMode={cleanMode}
        stageRef={stageRef}
        onTimeUpdate={setCurrentTime}
        onSongEnded={handleSongEnded}
        onEngineReady={setIsWebGL2}
      />

      {/* Studio Chrome (100% Hidden in Clean Video Mode) */}
      {!cleanMode && (
        <>
          <TopBar
            midi={midi}
            activeDemoId={activeDemoId}
            settings={settings}
            inspectorOpen={inspectorOpen}
            isRecording={isRecording}
            recordingSec={recordingSec}
            isWebGL2={isWebGL2}
            onSelectDemo={handleSelectDemo}
            onUploadMidi={(f) => void handleUploadMidi(f)}
            onUpdateSettings={updateSettings}
            onToggleInspector={() => setInspectorOpen((v) => !v)}
            onEnterCleanMode={() => {
              setInspectorOpen(false);
              setCleanMode(true);
            }}
            onToggleRecording={handleToggleRecording}
          />

          <TransportBar
            midi={midi}
            currentTime={currentTime}
            isPlaying={isPlaying}
            playbackSpeed={playbackSpeed}
            loopEnabled={loopEnabled}
            volume={settings.masterVolume}
            pianoHeightRatio={settings.pianoHeightRatio}
            inspectorOpen={inspectorOpen}
            onTogglePlay={handleTogglePlay}
            onSeek={(t) => stageRef.current?.seekTo(t)}
            onRestart={() => {
              stageRef.current?.seekTo(0);
              setIsPlaying(true);
            }}
            onChangeSpeed={setPlaybackSpeed}
            onToggleLoop={() => setLoopEnabled((v) => !v)}
            onChangeVolume={(v) => updateSettings({ masterVolume: v })}
          />

          <InspectorDrawer
            open={inspectorOpen}
            settings={settings}
            activePresetId={activePresetId}
            sampleState={sampleState}
            sampleProgress={sampleProgress}
            customAudioName={customAudioName}
            isRecording={isRecording}
            onClose={() => setInspectorOpen(false)}
            onUpdateSettings={updateSettings}
            onApplyPreset={applyPreset}
            onUploadBackground={handleUploadBackground}
            onClearBackground={handleClearBackground}
            onUploadCustomAudio={(f) => void handleUploadCustomAudio(f)}
            onClearCustomAudio={handleClearCustomAudio}
            onEnterCleanMode={() => {
              setInspectorOpen(false);
              setCleanMode(true);
            }}
            onToggleRecording={handleToggleRecording}
            onTakeSnapshot={handleTakeSnapshot}
          />
        </>
      )}

      {/* Clean Video Mode Overlay & Recording Countdown */}
      <CleanModeOverlay
        cleanMode={cleanMode}
        isRecording={isRecording}
        countdown={countdown}
        onExitCleanMode={() => setCleanMode(false)}
      />

      {/* Drag & Drop File Overlay */}
      {isDraggingFile && !cleanMode && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-6 pointer-events-none">
          <div className="max-w-md w-full rounded-3xl border-2 border-dashed border-violet-400/70 bg-violet-950/30 p-10 text-center shadow-[0_0_60px_rgba(139,92,246,0.35)]">
            <div className="text-xl font-bold text-white font-[var(--font-display)]">
              Thả file vào đây
            </div>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">
              Hỗ trợ file <strong className="text-violet-300">.mid / .midi</strong>, ảnh nền custom{' '}
              <strong className="text-cyan-300">.jpg / .png / .webp</strong>, hoặc file nhạc đồng bộ{' '}
              <strong className="text-amber-300">.mp3 / .wav</strong>.
            </p>
          </div>
        </div>
      )}

      {/* Subtle Toast Notifications (never shown while recording) */}
      {toastMsg && !isRecording && !cleanMode && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-slate-950/85 backdrop-blur-xl border border-violet-400/35 text-xs font-medium text-slate-100 shadow-[0_10px_30px_rgba(0,0,0,0.6)] pointer-events-none">
          {toastMsg}
        </div>
      )}
    </div>
  );
};

export default App;
