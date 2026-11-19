import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AudioEngine, type SampleLoadState } from './audio/AudioEngine';
import { exportParsedMidiToBlob, transcribeAudioFileToMidi } from './audio/AudioToMidi';
import { getTranslations } from './i18n/translations';
import { DEMO_SONGS } from './midi/DemoSongs';
import { parseMidiBuffer } from './midi/MidiParser';
import { isMagicTriggerKey, qwertyCodeToMidi } from './midi/QwertyPiano';
import { WebMidiController, type MidiDeviceInfo } from './midi/WebMidiInput';
import {
  clearAllStoredState,
  deleteMediaBlob,
  loadMediaBlob,
  loadPersistedMeta,
  loadPersistedSettings,
  saveMediaBlob,
  savePersistedMeta,
  savePersistedSettings,
} from './storage/SettingsStorage';
import {
  DEFAULT_SETTINGS,
  VISUAL_PRESETS,
  type ParsedMidi,
  type PlayMode,
  type TrackOverride,
  type VisualizerSettings,
} from './types/visualizer';
import { CleanModeOverlay } from './ui/CleanModeOverlay';
import { InspectorDrawer } from './ui/InspectorDrawer';
import { TopBar } from './ui/TopBar';
import { TransportBar } from './ui/TransportBar';
import {
  VisualizerStage,
  type PerfStats,
  type VisualizerStageHandle,
} from './ui/VisualizerStage';
import { downloadRecording, VideoExporter } from './video/VideoExporter';

export const App: React.FC = () => {
  const audioEngine = useMemo(() => new AudioEngine(), []);
  const exporter = useMemo(() => new VideoExporter(), []);
  const stageRef = useRef<VisualizerStageHandle | null>(null);
  const initialMeta = useMemo(() => loadPersistedMeta(), []);

  const [settings, setSettings] = useState<VisualizerSettings>(loadPersistedSettings);
  const [activePresetId, setActivePresetId] = useState<string | null>(initialMeta.activePresetId);
  const [activeDemoId, setActiveDemoId] = useState<string | null>(DEMO_SONGS[0].id);
  const [midi, setMidi] = useState<ParsedMidi | null>(() => DEMO_SONGS[0].build());
  const [trackOverrides, setTrackOverrides] = useState<Record<number, TrackOverride>>({});

  const [isPlaying, setIsPlaying] = useState(false);
  const [playMode, setPlayMode] = useState<PlayMode>('auto');
  const [qwertyOctaveShift, setQwertyOctaveShift] = useState(0);
  const [magicProgress, setMagicProgress] = useState({ stepIndex: 0, totalSteps: 0 });
  const [transcribeProgress, setTranscribeProgress] = useState<number | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(initialMeta.playbackSpeed);
  const [loopEnabled, setLoopEnabled] = useState(initialMeta.loopEnabled);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);

  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [cleanMode, setCleanMode] = useState(false);
  const [cursorHidden, setCursorHidden] = useState(false);
  const [isWebGL2, setIsWebGL2] = useState(true);
  const [perfStats, setPerfStats] = useState<PerfStats | null>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);

  const [sampleState, setSampleState] = useState<SampleLoadState>('idle');
  const [sampleProgress, setSampleProgress] = useState({ loaded: 0, total: 20 });
  const [customAudioName, setCustomAudioName] = useState<string | null>(null);

  const usbMidiSupported = useMemo(() => WebMidiController.isSupported(), []);
  const [usbMidiConnected, setUsbMidiConnected] = useState(false);
  const [usbMidiDevices, setUsbMidiDevices] = useState<MidiDeviceInfo[]>([]);
  const webMidiRef = useRef<WebMidiController | null>(null);

  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const toastTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const prevCleanBeforeRecRef = useRef(false);
  const heldQwertyRef = useRef<Map<string, number>>(new Map());

  const t = getTranslations(settings.language);

  const showToast = useCallback((msg: string, durationMs = 2800) => {
    setToastMsg(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), durationMs);
  }, []);

  // Auto-save settings & app meta to browser localStorage
  useEffect(() => {
    savePersistedSettings(settings);
  }, [settings]);

  useEffect(() => {
    savePersistedMeta({
      activePresetId,
      playbackSpeed,
      loopEnabled,
      customMidiName: activeDemoId === null ? midi?.name ?? null : null,
    });
  }, [activePresetId, playbackSpeed, loopEnabled, activeDemoId, midi?.name]);

  // Hydrate persisted Custom Background Image & Last Custom MIDI from IndexedDB on startup!
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const savedBg = await loadMediaBlob('customBg');
      if (!cancelled && savedBg) {
        const bgUrl = URL.createObjectURL(savedBg);
        setSettings((prev) => ({
          ...prev,
          customBgUrl: bgUrl,
        }));
      }
      const savedMidi = await loadMediaBlob('customMidi');
      if (!cancelled && savedMidi) {
        try {
          const buf = await savedMidi.arrayBuffer();
          const meta = loadPersistedMeta();
          const parsed = parseMidiBuffer(buf, meta.customMidiName || 'Saved Song.mid');
          if (parsed.notes.length > 0) {
            setActiveDemoId(null);
            setMidi(parsed);
          }
        } catch {
          // ignore corrupted cached midi
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Wire audio engine & Web MIDI controller
  useEffect(() => {
    audioEngine.setSampleStateListener((state, loaded, total) => {
      setSampleState(state);
      setSampleProgress({ loaded, total });
    });

    const midiCtrl = new WebMidiController({
      onNoteOn: (m, vel) => stageRef.current?.pressLiveNote(m, vel, 'usb-midi'),
      onNoteOff: (m) => stageRef.current?.releaseLiveNote(m, 'usb-midi'),
      onSustainChange: (down) => stageRef.current?.setLiveSustain(down),
      onDevicesChange: (devices) => setUsbMidiDevices(devices),
    });
    webMidiRef.current = midiCtrl;

    return () => {
      midiCtrl.disconnect();
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

  // Auto-hide cursor after 1.4s in Clean Video Mode
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

  const applyPreset = useCallback(
    (presetId: string) => {
      const preset = VISUAL_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      setSettings((prev) => ({
        ...prev,
        ...preset.patch,
        customBgUrl: prev.customBgUrl,
        customVideoUrl: prev.customVideoUrl,
      }));
      setActivePresetId(presetId);
      showToast(`Preset: "${preset.name}"`);
    },
    [showToast]
  );

  const handleExportPresetJson = useCallback(() => {
    const payload = {
      app: 'SyntheCia Studio',
      version: 2,
      settings: { ...settings, customBgUrl: null },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `synthecia-preset-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast(settings.language === 'en' ? 'Exported preset JSON!' : 'Đã xuất file preset .json!');
  }, [settings, showToast]);

  const handleImportPresetJson = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const data = JSON.parse(text) as { settings?: Partial<VisualizerSettings> } & Partial<VisualizerSettings>;
        const imported = data.settings ?? data;
        setSettings((prev) => ({
          ...prev,
          ...imported,
          customBgUrl: prev.customBgUrl,
        }));
        setActivePresetId(null);
        showToast(
          settings.language === 'en'
            ? `Imported preset "${file.name}"`
            : `Đã nhập preset "${file.name}"`
        );
      } catch {
        showToast(
          settings.language === 'en' ? 'Invalid preset JSON file.' : 'File preset JSON không hợp lệ.',
          3200
        );
      }
    },
    [settings.language, showToast]
  );

  const handleSelectDemo = useCallback(
    (demoId: string) => {
      const demo = DEMO_SONGS.find((d) => d.id === demoId);
      if (!demo) return;
      audioEngine.stopAllNotes();
      setIsPlaying(false);
      setActiveDemoId(demo.id);
      setTrackOverrides({});
      setLoopA(null);
      setLoopB(null);
      setMidi(demo.build());
      setCurrentTime(0);
      void deleteMediaBlob('customMidi');
      showToast(`${demo.title} (${demo.bpm} BPM)`);
    },
    [audioEngine, showToast]
  );

  const handleTranscribeAudio = useCallback(
    async (file: File) => {
      try {
        audioEngine.stopAllNotes();
        setIsPlaying(false);
        setTranscribeProgress(2);
        showToast(
          settings.language === 'en'
            ? `Analyzing "${file.name}" into 88-key MIDI...`
            : `Đang phân tích "${file.name}" thành nốt MIDI...`,
          4000
        );

        const parsed = await transcribeAudioFileToMidi(file, {
          sensitivity: settings.transcriptionSensitivity,
          onProgress: (pct) => setTranscribeProgress(pct),
        });

        setTranscribeProgress(null);
        if (parsed.notes.length === 0) {
          showToast(
            settings.language === 'en'
              ? 'No pitched notes detected — try "Dense" sensitivity.'
              : 'Không phát hiện đủ nốt nhạc — hãy thử mức nhạy "Dày hợp âm".',
            4000
          );
          return;
        }

        // Load original song into AudioEngine synced to generated MIDI so it sounds identical!
        await audioEngine.loadCustomAudioFile(file);
        setCustomAudioName(file.name);
        setSettings((prev) => ({ ...prev, audioMode: 'custom-audio', customAudioOffsetMs: 0 }));

        setActiveDemoId(null);
        setTrackOverrides({});
        setLoopA(null);
        setLoopB(null);
        setMidi(parsed);
        setCurrentTime(0);

        // Persist transcribed MIDI to IndexedDB so refresh keeps it!
        void saveMediaBlob('customMidi', exportParsedMidiToBlob(parsed));

        showToast(
          settings.language === 'en'
            ? `Generated ${parsed.notes.length} notes (~${parsed.bpm} BPM) synced with "${file.name}"!`
            : `Đã tạo ${parsed.notes.length} nốt MIDI (~${parsed.bpm} BPM) khớp với "${file.name}"!`,
          4500
        );
      } catch {
        setTranscribeProgress(null);
        showToast(
          settings.language === 'en'
            ? 'Could not transcribe this audio file.'
            : 'Không thể giải mã hoặc chuyển file âm thanh này sang MIDI.',
          3800
        );
      }
    },
    [audioEngine, settings.language, settings.transcriptionSensitivity, showToast]
  );

  const handleExportCurrentMidi = useCallback(() => {
    if (!midi) return;
    const blob = exportParsedMidiToBlob(midi);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${midi.name.replace(/[^a-z0-9-_]+/gi, '_') || 'synthecia'}.mid`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    showToast(settings.language === 'en' ? 'Exported .mid file!' : 'Đã tải file .mid về máy!');
  }, [midi, settings.language, showToast]);

  const handleClearBrowserStorage = useCallback(async () => {
    await clearAllStoredState();
    setSettings((prev) => {
      if (prev.customBgUrl) URL.revokeObjectURL(prev.customBgUrl);
      if (prev.customVideoUrl) URL.revokeObjectURL(prev.customVideoUrl);
      return { ...DEFAULT_SETTINGS, language: prev.language };
    });
    setActivePresetId('rainbow-neon-3d');
    setActiveDemoId(DEMO_SONGS[0].id);
    setMidi(DEMO_SONGS[0].build());
    showToast(
      settings.language === 'en'
        ? 'Cleared saved browser settings & cached media!'
        : 'Đã xóa toàn bộ cài đặt & ảnh/MIDI lưu trong trình duyệt!'
    );
  }, [settings.language, showToast]);

  const handleUploadMidi = useCallback(
    async (file: File) => {
      const lower = file.name.toLowerCase();
      // If user picks an MP3/WAV via the Open MIDI button, automatically run Audio -> MIDI!
      if (
        !lower.endsWith('.mid') &&
        !lower.endsWith('.midi') &&
        (file.type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|m4a)$/i.test(lower))
      ) {
        await handleTranscribeAudio(file);
        return;
      }

      try {
        const buffer = await file.arrayBuffer();
        const parsed = parseMidiBuffer(buffer, file.name);
        if (parsed.notes.length === 0) {
          showToast(
            settings.language === 'en'
              ? 'No playable piano notes found in this MIDI file!'
              : 'File MIDI này không có nốt piano hợp lệ!',
            3500
          );
          return;
        }
        audioEngine.stopAllNotes();
        setIsPlaying(false);
        setActiveDemoId(null);
        setTrackOverrides({});
        setLoopA(null);
        setLoopB(null);
        setMidi(parsed);
        setCurrentTime(0);
        void saveMediaBlob('customMidi', file);
        showToast(`${parsed.name} (${parsed.notes.length} ${t.notesUnit} • ${parsed.bpm} BPM)`);
      } catch {
        showToast(
          settings.language === 'en'
            ? 'Could not parse this MIDI file.'
            : 'Không thể đọc file MIDI. Hãy thử file .mid hợp lệ.',
          3500
        );
      }
    },
    [audioEngine, handleTranscribeAudio, settings.language, showToast, t.notesUnit]
  );

  const handleUpdateTrackOverride = useCallback((trackIndex: number, patch: Partial<TrackOverride>) => {
    setTrackOverrides((prev) => ({
      ...prev,
      [trackIndex]: { ...(prev[trackIndex] ?? {}), ...patch },
    }));
  }, []);

  const handleChangePlayMode = useCallback(
    (mode: PlayMode) => {
      setPlayMode(mode);
      if (mode === 'magic-keys') {
        setIsPlaying(false);
        audioEngine.ensureInitialized();
        showToast(t.magicHint, 4200);
      } else if (mode === 'qwerty') {
        setIsPlaying(false);
        audioEngine.ensureInitialized();
        showToast(t.qwertyHint, 4200);
      } else {
        showToast(settings.language === 'en' ? 'Auto Play mode' : 'Đã về chế độ Phát tự động');
      }
    },
    [audioEngine, settings.language, showToast, t.magicHint, t.qwertyHint]
  );

  const handleToggleUsbMidi = useCallback(async () => {
    const ctrl = webMidiRef.current;
    if (!ctrl) return;
    if (usbMidiConnected) {
      ctrl.disconnect();
      setUsbMidiConnected(false);
      showToast(settings.language === 'en' ? 'USB MIDI disconnected' : 'Đã ngắt kết nối MIDI USB');
      return;
    }
    audioEngine.ensureInitialized();
    const res = await ctrl.connect();
    if (res.ok) {
      setUsbMidiConnected(true);
      setUsbMidiDevices(res.devices);
      showToast(
        res.devices.length > 0
          ? `USB MIDI: ${res.devices[0].name}`
          : t.usbMidiNone,
        3500
      );
    } else {
      showToast(res.error ?? 'Web MIDI error', 3800);
    }
  }, [audioEngine, settings.language, showToast, t.usbMidiNone, usbMidiConnected]);

  const handleUploadBackground = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      void saveMediaBlob('customBg', file);
      setSettings((prev) => {
        if (prev.customBgUrl) URL.revokeObjectURL(prev.customBgUrl);
        return {
          ...prev,
          backgroundPreset: 'custom',
          customBgUrl: url,
          bgOpacity: Math.max(prev.bgOpacity, 0.72),
        };
      });
      showToast(`${settings.language === 'en' ? 'Backdrop saved' : 'Đã lưu ảnh nền'}: ${file.name}`);
    },
    [settings.language, showToast]
  );

  const handleClearBackground = useCallback(() => {
    void deleteMediaBlob('customBg');
    setSettings((prev) => {
      if (prev.customBgUrl) URL.revokeObjectURL(prev.customBgUrl);
      return { ...prev, backgroundPreset: 'nebula', customBgUrl: null };
    });
  }, []);

  const handleUploadVideo = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      setSettings((prev) => {
        if (prev.customVideoUrl) URL.revokeObjectURL(prev.customVideoUrl);
        return {
          ...prev,
          customVideoUrl: url,
        };
      });
      showToast(`${settings.language === 'en' ? 'Loaded video' : 'Đã nạp video'}: ${file.name}`);
    },
    [settings.language, showToast]
  );

  const handleClearVideo = useCallback(() => {
    setSettings((prev) => {
      if (prev.customVideoUrl) URL.revokeObjectURL(prev.customVideoUrl);
      return { ...prev, customVideoUrl: null, hideSyntheticKeyboard: false };
    });
  }, []);

  const handleUploadCustomAudio = useCallback(
    async (file: File) => {
      try {
        await audioEngine.loadCustomAudioFile(file);
        setCustomAudioName(file.name);
        setSettings((prev) => ({ ...prev, audioMode: 'custom-audio' }));
        showToast(`${settings.language === 'en' ? 'Synced audio' : 'Đã đồng bộ nhạc'}: ${file.name}`);
      } catch {
        showToast('Could not decode audio file.', 3500);
      }
    },
    [audioEngine, settings.language, showToast]
  );

  const handleClearCustomAudio = useCallback(() => {
    audioEngine.clearCustomAudio();
    setCustomAudioName(null);
    setSettings((prev) => ({
      ...prev,
      audioMode: prev.audioMode === 'custom-audio' ? 'salamander' : prev.audioMode,
    }));
  }, [audioEngine]);

  const handleCycleABLoop = useCallback(() => {
    if (!midi) return;
    if (loopA === null) {
      setLoopA(currentTime);
      setLoopB(null);
      showToast(`A = ${currentTime.toFixed(1)}s`);
    } else if (loopB === null) {
      if (currentTime > loopA + 0.3) {
        setLoopB(currentTime);
        showToast(`A-B Loop: ${loopA.toFixed(1)}s ↔ ${currentTime.toFixed(1)}s`);
      } else {
        setLoopA(currentTime);
        showToast(`A = ${currentTime.toFixed(1)}s`);
      }
    } else {
      setLoopA(null);
      setLoopB(null);
      showToast(settings.language === 'en' ? 'Cleared A-B loop' : 'Đã xóa vòng lặp A-B');
    }
  }, [currentTime, loopA, loopB, midi, settings.language, showToast]);

  const startActualRecording = useCallback(() => {
    const canvas = stageRef.current?.getCanvas();
    if (!canvas) return;

    if (settings.recordAutoStart && playMode === 'auto') {
      stageRef.current?.seekTo(0);
      stageRef.current?.clearVisuals();
    }

    const audioStream = audioEngine.getRecordStream();
    setIsRecording(true);
    if (playMode === 'auto') setIsPlaying(true);

    exporter.start(canvas, audioStream, settings.recordBitrateMbps, (result) => {
      setIsRecording(false);
      setCleanMode(prevCleanBeforeRecRef.current);
      downloadRecording(result, midi?.name ?? 'synthecia');
      showToast(
        `${settings.language === 'en' ? 'Saved clean video' : 'Đã lưu video sạch'} (${result.durationSec.toFixed(1)}s • .${result.extension.toUpperCase()})!`,
        4000
      );
    });
  }, [
    audioEngine,
    exporter,
    midi?.name,
    playMode,
    settings.language,
    settings.recordAutoStart,
    settings.recordBitrateMbps,
    showToast,
  ]);

  const handleToggleRecording = useCallback(() => {
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
      showToast('Direct recording unsupported — use Clean Video Mode + OBS!', 4000);
      return;
    }

    prevCleanBeforeRecRef.current = cleanMode;
    setInspectorOpen(false);
    setCleanMode(true);
    audioEngine.ensureInitialized();

    if (settings.recordCountdown) {
      setIsPlaying(false);
      if (settings.recordAutoStart && playMode === 'auto') {
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
    playMode,
    settings.recordAutoStart,
    settings.recordCountdown,
    showToast,
    startActualRecording,
  ]);

  const handleSongEnded = useCallback(() => {
    setIsPlaying(false);
    if (isRecording && settings.recordAutoStop) {
      window.setTimeout(() => {
        if (exporter.isRecording()) exporter.stop();
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
    showToast(settings.language === 'en' ? 'Snapshot PNG saved!' : 'Đã lưu ảnh khung hình PNG!');
  }, [settings.language, showToast]);

  const handleTogglePlay = useCallback(() => {
    if (!midi) return;
    if (playMode !== 'auto') {
      setPlayMode('auto');
    }
    audioEngine.ensureInitialized();
    setIsPlaying((prev) => {
      if (!prev && currentTime >= midi.duration - 0.15) {
        stageRef.current?.seekTo(0);
      }
      return !prev;
    });
  }, [audioEngine, currentTime, midi, playMode]);

  // Global keyboard handler: Magic Keys ("Giả bấm") + QWERTY Piano + Studio Shortcuts!
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Always allow Escape to exit Clean Mode / Recording / Drawer
      if (e.key === 'Escape') {
        if (isRecording) {
          exporter.stop();
          setIsPlaying(false);
        } else if (cleanMode) {
          setCleanMode(false);
        } else if (inspectorOpen) {
          setInspectorOpen(false);
        }
        return;
      }

      // Shift acts as live Sustain Pedal in Magic Keys / QWERTY modes!
      if (e.key === 'Shift' && playMode !== 'auto') {
        stageRef.current?.setLiveSustain(true);
        return;
      }

      // 1. MAGIC KEYS ("Giả bấm") MODE: ANY letter/number key triggers the exact next MIDI chord!
      if (playMode === 'magic-keys' && isMagicTriggerKey(e.code)) {
        e.preventDefault();
        if (e.repeat) return;
        stageRef.current?.triggerMagicKeyDown(e.code);
        return;
      }

      // 2. QWERTY PIANO MODE: Play live notes across 2+ octaves on computer keyboard!
      if (playMode === 'qwerty') {
        if (e.code === 'BracketLeft') {
          e.preventDefault();
          setQwertyOctaveShift((s) => Math.max(-2, s - 1));
          return;
        }
        if (e.code === 'BracketRight') {
          e.preventDefault();
          setQwertyOctaveShift((s) => Math.min(2, s + 1));
          return;
        }
        const midiKey = qwertyCodeToMidi(e.code, qwertyOctaveShift);
        if (midiKey !== null) {
          e.preventDefault();
          if (e.repeat) return;
          heldQwertyRef.current.set(e.code, midiKey);
          stageRef.current?.pressLiveNote(midiKey, 0.85, e.code);
          return;
        }
      }

      // 3. Standard Studio Hotkeys
      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        setCleanMode((v) => !v);
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

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        stageRef.current?.setLiveSustain(false);
        return;
      }
      if (playMode === 'magic-keys') {
        stageRef.current?.triggerMagicKeyUp(e.code);
      }
      const heldMidi = heldQwertyRef.current.get(e.code);
      if (heldMidi !== undefined) {
        heldQwertyRef.current.delete(e.code);
        stageRef.current?.releaseLiveNote(heldMidi, e.code);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [
    cleanMode,
    currentTime,
    exporter,
    handleTogglePlay,
    handleToggleRecording,
    inspectorOpen,
    isRecording,
    playMode,
    qwertyOctaveShift,
  ]);

  // Global Drag & Drop for MIDI, Custom Background Images, Audio, and Preset JSON
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
    } else if (lower.endsWith('.json')) {
      void handleImportPresetJson(file);
    } else if (file.type.startsWith('image/')) {
      handleUploadBackground(file);
    } else if (file.type.startsWith('video/') || lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov')) {
      handleUploadVideo(file);
    } else if (file.type.startsWith('audio/') || /\.(mp3|wav|ogg|flac|m4a)$/i.test(lower)) {
      // Dropping a normal audio song auto-transcribes it into synced MIDI falling notes!
      void handleTranscribeAudio(file);
    } else {
      showToast(t.dropOverlayDesc, 3500);
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
        playMode={playMode}
        playbackSpeed={playbackSpeed}
        loopEnabled={loopEnabled}
        loopA={loopA}
        loopB={loopB}
        settings={settings}
        trackOverrides={trackOverrides}
        audioEngine={audioEngine}
        cleanMode={cleanMode}
        stageRef={stageRef}
        onTimeUpdate={setCurrentTime}
        onSongEnded={handleSongEnded}
        onEngineReady={setIsWebGL2}
        onPerfStats={setPerfStats}
        onMagicProgress={(stepIndex, totalSteps) => setMagicProgress({ stepIndex, totalSteps })}
      />

      {/* Studio Chrome (100% Hidden in Clean Video Mode) */}
      {!cleanMode && (
        <>
          <TopBar
            midi={midi}
            activeDemoId={activeDemoId}
            settings={settings}
            playMode={playMode}
            inspectorOpen={inspectorOpen}
            isRecording={isRecording}
            recordingSec={recordingSec}
            isWebGL2={isWebGL2}
            usbMidiCount={usbMidiDevices.length}
            onSelectDemo={handleSelectDemo}
            onUploadMidi={(f) => void handleUploadMidi(f)}
            onUpdateSettings={updateSettings}
            onChangePlayMode={handleChangePlayMode}
            onToggleInspector={() => setInspectorOpen((v) => !v)}
            onEnterCleanMode={() => {
              setInspectorOpen(false);
              setCleanMode(true);
            }}
            onToggleRecording={handleToggleRecording}
          />

          {/* Optional Live Performance Telemetry Pill (never shown in Clean Video Mode) */}
          {settings.showPerfStats && perfStats && (
            <div className="fixed top-16 left-3 z-20 px-2.5 py-1 rounded-lg bg-slate-950/75 backdrop-blur-md border border-white/10 text-[10px] font-mono text-slate-300 flex items-center gap-2 pointer-events-none">
              <span className="text-emerald-400 font-bold">{perfStats.fps} FPS</span>
              <span>•</span>
              <span>{perfStats.particles.toLocaleString()} pts</span>
              <span>•</span>
              <span>{perfStats.isWebGL2 ? 'WebGL2' : '2D'}</span>
            </div>
          )}

          {/* Subtle Active Play Mode Banner (Magic Keys / QWERTY) */}
          {playMode !== 'auto' && !toastMsg && (
            <div className="fixed top-16 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1.5 rounded-full bg-slate-950/80 backdrop-blur-xl border border-amber-400/35 text-[11px] text-amber-100 shadow-lg flex items-center gap-2.5">
              {playMode === 'magic-keys' ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span>
                    {settings.language === 'en'
                      ? 'Magic Keys — Tap ANY key to play the MIDI song!'
                      : 'Giả bấm (Magic Keys) — Gõ bất kỳ phím nào để chơi bài MIDI theo nhịp!'}
                  </span>
                  <span className="font-mono text-amber-300 font-semibold">
                    {magicProgress.stepIndex}/{magicProgress.totalSteps}
                  </span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>
                    {settings.language === 'en'
                      ? `QWERTY Piano (C${4 + qwertyOctaveShift}) — Z–M & Q–P • [ / ] Octave`
                      : `Đàn QWERTY (C${4 + qwertyOctaveShift}) — Z–M & Q–P • [ / ] Đổi quãng`}
                  </span>
                </>
              )}
              <button
                type="button"
                onClick={() => handleChangePlayMode('auto')}
                className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                {settings.language === 'en' ? 'Exit' : 'Tắt'}
              </button>
            </div>
          )}

          <TransportBar
            midi={midi}
            currentTime={currentTime}
            isPlaying={isPlaying}
            playbackSpeed={playbackSpeed}
            loopEnabled={loopEnabled}
            loopA={loopA}
            loopB={loopB}
            volume={settings.masterVolume}
            pianoHeightRatio={settings.pianoHeightRatio}
            inspectorOpen={inspectorOpen}
            language={settings.language}
            onTogglePlay={handleTogglePlay}
            onSeek={(tSec) => stageRef.current?.seekTo(tSec)}
            onRestart={() => {
              stageRef.current?.seekTo(0);
              if (playMode === 'auto') setIsPlaying(true);
            }}
            onChangeSpeed={setPlaybackSpeed}
            onToggleLoop={() => setLoopEnabled((v) => !v)}
            onCycleABLoop={handleCycleABLoop}
            onChangeVolume={(v) => updateSettings({ masterVolume: v })}
          />

          <InspectorDrawer
            open={inspectorOpen}
            midi={midi}
            settings={settings}
            activePresetId={activePresetId}
            playMode={playMode}
            qwertyOctaveShift={qwertyOctaveShift}
            magicProgress={magicProgress}
            trackOverrides={trackOverrides}
            sampleState={sampleState}
            sampleProgress={sampleProgress}
            customAudioName={customAudioName}
            usbMidiSupported={usbMidiSupported}
            usbMidiConnected={usbMidiConnected}
            usbMidiDevices={usbMidiDevices}
            isRecording={isRecording}
            transcribeProgress={transcribeProgress}
            onClose={() => setInspectorOpen(false)}
            onUpdateSettings={updateSettings}
            onApplyPreset={applyPreset}
            onExportPresetJson={handleExportPresetJson}
            onImportPresetJson={(f) => void handleImportPresetJson(f)}
            onClearBrowserStorage={() => void handleClearBrowserStorage()}
            onTranscribeAudio={(f) => void handleTranscribeAudio(f)}
            onExportCurrentMidi={handleExportCurrentMidi}
            onUpdateTrackOverride={handleUpdateTrackOverride}
            onResetTrackOverrides={() => setTrackOverrides({})}
            onChangePlayMode={handleChangePlayMode}
            onChangeQwertyOctave={setQwertyOctaveShift}
            onToggleUsbMidi={() => void handleToggleUsbMidi()}
            onUploadBackground={handleUploadBackground}
            onClearBackground={handleClearBackground}
            onUploadVideo={handleUploadVideo}
            onClearVideo={handleClearVideo}
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
        language={settings.language}
        onExitCleanMode={() => setCleanMode(false)}
      />

      {/* Drag & Drop File Overlay */}
      {isDraggingFile && !cleanMode && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-6 pointer-events-none">
          <div className="max-w-md w-full rounded-3xl border-2 border-dashed border-violet-400/70 bg-violet-950/30 p-10 text-center shadow-[0_0_60px_rgba(139,92,246,0.35)]">
            <div className="text-xl font-bold text-white font-[var(--font-display)]">
              {t.dropOverlayTitle}
            </div>
            <p className="text-xs text-slate-300 mt-2 leading-relaxed">{t.dropOverlayDesc}</p>
          </div>
        </div>
      )}

      {/* Audio -> MIDI Auto-Transcription Live Progress Pill */}
      {transcribeProgress !== null && !cleanMode && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-2xl bg-slate-950/92 backdrop-blur-xl border border-violet-400/50 shadow-[0_12px_40px_rgba(139,92,246,0.4)] flex items-center gap-3">
          <div className="w-3.5 h-3.5 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
          <div className="text-xs font-semibold text-white">
            {settings.language === 'en'
              ? `Transcribing Audio → MIDI... ${transcribeProgress}%`
              : `Đang phân tích Nhạc → MIDI... ${transcribeProgress}%`}
          </div>
          <div className="w-24 h-1.5 rounded-full bg-white/15 overflow-hidden">
            <div
              style={{ width: `${transcribeProgress}%` }}
              className="h-full bg-gradient-to-r from-violet-400 to-fuchsia-400 transition-all duration-150"
            />
          </div>
        </div>
      )}

      {/* Subtle Toast Notifications (never shown while recording or in Clean Mode) */}
      {toastMsg && !isRecording && !cleanMode && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-full bg-slate-950/88 backdrop-blur-xl border border-violet-400/35 text-xs font-medium text-slate-100 shadow-[0_10px_30px_rgba(0,0,0,0.6)] pointer-events-none">
          {toastMsg}
        </div>
      )}
    </div>
  );
};

export default App;
