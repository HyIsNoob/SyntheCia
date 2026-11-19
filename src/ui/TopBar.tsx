import React, { useRef, useState } from 'react';
import {
  Box,
  ChevronDown,
  Circle,
  EyeOff,
  FileMusic,
  Hand,
  Layers,
  SlidersHorizontal,
  Sparkles,
  Square,
  Upload,
} from 'lucide-react';
import { DEMO_SONGS } from '../midi/DemoSongs';
import type { ParsedMidi, VisualizerSettings } from '../types/visualizer';

interface TopBarProps {
  midi: ParsedMidi | null;
  activeDemoId: string | null;
  settings: VisualizerSettings;
  inspectorOpen: boolean;
  isRecording: boolean;
  recordingSec: number;
  isWebGL2: boolean;
  onSelectDemo: (demoId: string) => void;
  onUploadMidi: (file: File) => void;
  onUpdateSettings: (patch: Partial<VisualizerSettings>) => void;
  onToggleInspector: () => void;
  onEnterCleanMode: () => void;
  onToggleRecording: () => void;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export const TopBar: React.FC<TopBarProps> = ({
  midi,
  activeDemoId,
  settings,
  inspectorOpen,
  isRecording,
  recordingSec,
  isWebGL2,
  onSelectDemo,
  onUploadMidi,
  onUpdateSettings,
  onToggleInspector,
  onEnterCleanMode,
  onToggleRecording,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [demoMenuOpen, setDemoMenuOpen] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadMidi(file);
      e.target.value = '';
    }
  };

  return (
    <header className="fixed top-3 left-3 right-3 z-30 flex items-center justify-between gap-2 pointer-events-none">
      {/* Left: Brand + Song Picker + Upload MIDI */}
      <div className="flex items-center gap-2 pointer-events-auto">
        <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-950/70 backdrop-blur-xl border border-white/10 shadow-lg">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 via-fuchsia-500 to-amber-400 flex items-center justify-center shadow-[0_0_18px_rgba(139,92,246,0.55)]">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="leading-tight hidden sm:block">
            <div className="text-[13px] font-bold tracking-tight text-white font-[var(--font-display)]">
              SyntheCia <span className="text-violet-400">Studio</span>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
              <span>{isWebGL2 ? 'WebGL2 HDR' : 'Canvas 2D'}</span>
              {midi && (
                <>
                  <span>•</span>
                  <span>{midi.notes.length} nốt</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Upload MIDI button */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".mid,.midi,audio/midi,audio/x-midi"
          className="hidden"
          onChange={handleFileChange}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-violet-600/90 hover:bg-violet-500 text-white text-xs font-semibold whitespace-nowrap shrink-0 shadow-[0_0_20px_rgba(124,58,237,0.45)] transition cursor-pointer"
          title="Mở file MIDI (.mid / .midi)"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Mở MIDI</span>
        </button>

        {/* Demo & Current Song Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setDemoMenuOpen((v) => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-950/70 hover:bg-slate-900/85 backdrop-blur-xl border border-white/10 text-xs text-slate-200 max-w-[200px] sm:max-w-[240px] transition cursor-pointer"
          >
            <FileMusic className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate font-medium">{midi ? midi.name : 'Chọn bài Demo'}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {demoMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-10"
                onClick={() => setDemoMenuOpen(false)}
              />
              <div className="absolute left-0 mt-2 w-72 z-20 rounded-2xl bg-slate-950/92 backdrop-blur-2xl border border-white/12 shadow-2xl p-1.5">
                <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Nhạc MIDI Demo Tích Hợp
                </div>
                {DEMO_SONGS.map((demo) => {
                  const selected = activeDemoId === demo.id;
                  return (
                    <button
                      key={demo.id}
                      type="button"
                      onClick={() => {
                        onSelectDemo(demo.id);
                        setDemoMenuOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-xl transition cursor-pointer ${
                        selected
                          ? 'bg-violet-500/20 border border-violet-400/30 text-white'
                          : 'hover:bg-white/6 text-slate-200 border border-transparent'
                      }`}
                    >
                      <div className="text-xs font-semibold flex items-center justify-between">
                        <span>{demo.title}</span>
                        <span className="text-[10px] font-mono text-violet-300">{demo.bpm} BPM</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{demo.subtitle}</div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Right: Quick 2D/3D Switch + Clean Video Mode + Record + Inspector */}
      <div className="flex items-center gap-2 pointer-events-auto">
        {/* Quick 2D / 3D Switch */}
        <div className="hidden md:flex items-center p-1 rounded-xl bg-slate-950/70 backdrop-blur-xl border border-white/10">
          <button
            type="button"
            onClick={() => onUpdateSettings({ viewMode: '2d' })}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
              settings.viewMode === '2d'
                ? 'bg-white/15 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>2D</span>
          </button>
          <button
            type="button"
            onClick={() => onUpdateSettings({ viewMode: '3d' })}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
              settings.viewMode === '3d'
                ? 'bg-violet-500/35 text-violet-100 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Box className="w-3.5 h-3.5" />
            <span>3D</span>
          </button>
        </div>

        {/* Quick Virtual Hands Toggle */}
        <button
          type="button"
          onClick={() => onUpdateSettings({ showHands: !settings.showHands })}
          className={`hidden lg:flex items-center gap-1.5 px-2.5 py-2 rounded-xl backdrop-blur-xl border text-xs font-semibold transition cursor-pointer ${
            settings.showHands
              ? 'bg-amber-500/20 border-amber-400/40 text-amber-100'
              : 'bg-slate-950/70 hover:bg-slate-900/90 border-white/10 text-slate-400 hover:text-slate-200'
          }`}
          title="Bật/tắt bàn tay giả lập chơi đàn"
        >
          <Hand className="w-3.5 h-3.5" />
          <span>Tay</span>
        </button>

        {/* Clean Video Mode button */}
        <button
          type="button"
          onClick={onEnterCleanMode}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-950/75 hover:bg-slate-900/90 backdrop-blur-xl border border-cyan-400/25 hover:border-cyan-400/50 text-cyan-200 text-xs font-semibold whitespace-nowrap shrink-0 transition cursor-pointer shadow-lg"
          title="Ẩn toàn bộ giao diện để quay video siêu sạch (Phím tắt: V)"
        >
          <EyeOff className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden sm:inline">Video Mode</span>
          <kbd className="hidden xl:inline px-1.5 py-0.5 text-[10px] rounded bg-white/10 text-slate-300 font-mono">
            V
          </kbd>
        </button>

        {/* Direct 60fps Video Record button */}
        <button
          type="button"
          onClick={onToggleRecording}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition cursor-pointer shadow-lg border ${
            isRecording
              ? 'bg-rose-600/90 hover:bg-rose-500 border-rose-400/50 text-white shadow-[0_0_22px_rgba(244,63,94,0.6)]'
              : 'bg-slate-950/75 hover:bg-rose-950/70 backdrop-blur-xl border-rose-500/30 hover:border-rose-400/60 text-rose-200'
          }`}
          title="Quay và xuất video 60fps trực tiếp có tiếng (Phím tắt: R)"
        >
          {isRecording ? (
            <>
              <Square className="w-3 h-3 fill-current" />
              <span className="font-mono">{formatDuration(recordingSec)}</span>
            </>
          ) : (
            <>
              <Circle className="w-3 h-3 fill-rose-500 text-rose-500" />
              <span className="hidden sm:inline">Quay Video</span>
            </>
          )}
        </button>

        {/* Toggle Inspector Drawer */}
        <button
          type="button"
          onClick={onToggleInspector}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl backdrop-blur-xl border text-xs font-semibold transition cursor-pointer ${
            inspectorOpen
              ? 'bg-violet-500/25 border-violet-400/45 text-white'
              : 'bg-slate-950/75 hover:bg-slate-900/90 border-white/10 text-slate-200'
          }`}
          title="Mở bảng tùy chỉnh hiệu ứng, Glow, Nền & Video"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Tùy chỉnh</span>
        </button>
      </div>
    </header>
  );
};
