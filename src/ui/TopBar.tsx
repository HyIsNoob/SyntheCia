import React, { useRef, useState } from 'react';
import {
  ChevronDown,
  Circle,
  EyeOff,
  FileMusic,
  SlidersHorizontal,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import { getTranslations } from '../i18n/translations';
import { DEMO_SONGS } from '../midi/DemoSongs';
import type { SavedSongMeta } from '../storage/SettingsStorage';
import type { ParsedMidi, PlayMode, VisualizerSettings } from '../types/visualizer';
import { BrandIcon } from './BrandIcon';

interface TopBarProps {
  midi: ParsedMidi | null;
  activeDemoId: string | null;
  savedSongs: SavedSongMeta[];
  activeLibrarySongId: string | null;
  settings: VisualizerSettings;
  playMode: PlayMode;
  inspectorOpen: boolean;
  isRecording: boolean;
  recordingSec: number;
  usbMidiCount: number;
  zenDimmed?: boolean;
  onGoHome: () => void;
  onSelectDemo: (demoId: string) => void;
  onSelectSavedSong: (songId: string) => void;
  onDeleteSavedSong: (songId: string) => void;
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
  savedSongs,
  activeLibrarySongId,
  settings,
  playMode,
  inspectorOpen,
  isRecording,
  recordingSec,
  usbMidiCount,
  zenDimmed = false,
  onGoHome,
  onSelectDemo,
  onSelectSavedSong,
  onDeleteSavedSong,
  onUploadMidi,
  onUpdateSettings,
  onToggleInspector,
  onEnterCleanMode,
  onToggleRecording,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [songMenuOpen, setSongMenuOpen] = useState(false);
  const t = getTranslations(settings.language);
  const isEn = settings.language === 'en';

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadMidi(file);
      e.target.value = '';
    }
  };

  return (
    <header
      className={`fixed top-3.5 left-4 right-4 z-30 flex items-center justify-between gap-3 pointer-events-none transition-opacity duration-500 ${
        zenDimmed && !songMenuOpen && !inspectorOpen ? 'opacity-15 hover:opacity-100' : 'opacity-100'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".mid,.midi,audio/midi,audio/x-midi,audio/*,.mp3,.wav,.ogg,.flac,.m4a"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* LEFT: Single unified sleek Brand + Song Pill */}
      <div className="flex items-center gap-1 p-1 rounded-2xl bg-[#060911]/72 backdrop-blur-2xl border border-white/[0.09] shadow-[0_10px_30px_rgba(0,0,0,0.45)] pointer-events-auto">
        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-xl hover:bg-white/[0.07] transition cursor-pointer"
          title={isEn ? 'Back to Landing Page' : 'Về trang giới thiệu'}
        >
          <BrandIcon size={26} className="shrink-0" />
          <span className="hidden sm:inline text-[13px] font-bold tracking-tight text-white font-[var(--font-display)]">
            SyntheCia
          </span>
        </button>

        <div className="w-px h-4 bg-white/10" />

        {/* Song Dropdown Trigger */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setSongMenuOpen((v) => !v)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/[0.07] text-xs text-slate-200 max-w-[175px] sm:max-w-[230px] transition cursor-pointer"
          >
            <FileMusic className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="truncate font-medium">{midi ? midi.name : t.selectDemo}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {songMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setSongMenuOpen(false)} />
              <div className="absolute left-0 mt-2.5 w-76 max-h-[72vh] overflow-y-auto z-20 rounded-2xl bg-[#070b14]/96 backdrop-blur-2xl border border-white/12 shadow-2xl p-1.5 space-y-1 studio-scroll">
                <button
                  type="button"
                  onClick={() => {
                    setSongMenuOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs font-bold transition cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>{isEn ? 'Open MIDI / MP3 Song' : 'Mở file MIDI hoặc MP3'}</span>
                </button>

                {savedSongs.length > 0 && (
                  <div className="pt-1 pb-1 border-b border-white/8">
                    <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-sky-300">
                      {isEn ? `Saved Library (${savedSongs.length})` : `Thư viện đã lưu (${savedSongs.length})`}
                    </div>
                    {savedSongs.map((s) => {
                      const selected = activeLibrarySongId === s.id;
                      return (
                        <div
                          key={s.id}
                          className={`group flex items-center gap-1 px-2 py-1.5 rounded-xl transition ${
                            selected
                              ? 'bg-sky-400/18 border border-sky-400/35 text-white'
                              : 'hover:bg-white/6 text-slate-200 border border-transparent'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              onSelectSavedSong(s.id);
                              setSongMenuOpen(false);
                            }}
                            className="flex-1 text-left min-w-0 cursor-pointer"
                          >
                            <div className="text-xs font-semibold truncate">{s.name}</div>
                            <div className="text-[10px] text-slate-400">
                              {s.noteCount} {t.notesUnit} • {formatDuration(s.duration)}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteSavedSong(s.id);
                            }}
                            className="p-1 rounded-lg text-slate-500 hover:text-rose-300 hover:bg-rose-500/15 opacity-70 group-hover:opacity-100 cursor-pointer"
                            title={isEn ? 'Remove from library' : 'Xóa khỏi thư viện'}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                  {t.demoHeader}
                </div>
                {DEMO_SONGS.map((demo) => {
                  const selected = activeDemoId === demo.id;
                  return (
                    <button
                      key={demo.id}
                      type="button"
                      onClick={() => {
                        onSelectDemo(demo.id);
                        setSongMenuOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-2 rounded-xl transition cursor-pointer ${
                        selected
                          ? 'bg-sky-400/16 border border-sky-400/35 text-white'
                          : 'hover:bg-white/6 text-slate-200 border border-transparent'
                      }`}
                    >
                      <div className="text-xs font-semibold flex items-center justify-between">
                        <span>{demo.title}</span>
                        <span className="text-[10px] font-mono text-sky-300">{demo.bpm} BPM</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{demo.subtitle}</div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Subtle 1-click upload icon right inside left pill */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.08] transition cursor-pointer"
          title={isEn ? 'Upload MIDI or MP3 / WAV' : 'Nạp file MIDI hoặc MP3 / WAV'}
        >
          <Upload className="w-3.5 h-3.5" />
        </button>

        {usbMidiCount > 0 && (
          <span
            className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 mr-1 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-[10px] font-mono text-emerald-300"
            title="USB MIDI Connected"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            USB
          </span>
        )}
      </div>

      {/* RIGHT: Single ultra-clean control pill */}
      <div className="flex items-center gap-1 p-1 rounded-2xl bg-[#060911]/72 backdrop-blur-2xl border border-white/[0.09] shadow-[0_10px_30px_rgba(0,0,0,0.45)] pointer-events-auto shrink-0">
        {/* Compact 2D / 3D Switch */}
        <button
          type="button"
          onClick={() => onUpdateSettings({ viewMode: settings.viewMode === '3d' ? '2d' : '3d' })}
          className="hidden sm:inline-flex items-center justify-center px-2.5 py-1.5 rounded-xl text-[11px] font-mono font-semibold text-slate-300 hover:text-white hover:bg-white/[0.08] transition cursor-pointer"
          title={isEn ? 'Toggle 2D / 3D Highway' : 'Chuyển góc nhìn 2D / 3D'}
        >
          {settings.viewMode.toUpperCase()}
        </button>

        <div className="hidden sm:block w-px h-4 bg-white/10" />

        {/* Subtle Clean Video Mode Icon (V) */}
        <button
          type="button"
          onClick={onEnterCleanMode}
          className="p-2 rounded-xl text-slate-300 hover:text-sky-300 hover:bg-white/[0.08] transition cursor-pointer"
          title={isEn ? 'Clean Video Mode (V)' : 'Ẩn toàn bộ UI — Video Mode (V)'}
        >
          <EyeOff className="w-3.5 h-3.5" />
        </button>

        {/* Minimal Record Button (expands only while recording) */}
        <button
          type="button"
          onClick={onToggleRecording}
          className={`flex items-center gap-1.5 px-2 py-2 rounded-xl text-xs font-mono font-semibold transition cursor-pointer ${
            isRecording
              ? 'bg-rose-500/90 text-white shadow-[0_0_18px_rgba(244,63,94,0.65)] px-2.5'
              : 'text-slate-300 hover:text-rose-300 hover:bg-white/[0.08]'
          }`}
          title={isEn ? 'Record 60fps Video (R)' : 'Quay video 60fps (R)'}
        >
          {isRecording ? (
            <>
              <Square className="w-3 h-3 fill-current" />
              <span>{formatDuration(recordingSec)}</span>
            </>
          ) : (
            <Circle className="w-3.5 h-3.5 fill-rose-500 text-rose-500" />
          )}
        </button>

        {/* Studio Drawer Toggle */}
        <button
          type="button"
          onClick={onToggleInspector}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
            inspectorOpen
              ? 'bg-sky-400 text-slate-950 shadow-[0_0_16px_rgba(56,189,248,0.35)]'
              : playMode !== 'auto'
                ? 'bg-amber-400/20 text-amber-200 border border-amber-400/35 hover:bg-amber-400/30'
                : 'bg-white/[0.08] hover:bg-white/[0.14] text-slate-100'
          }`}
          title={isEn ? 'Studio Settings' : 'Cài đặt Studio'}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{isEn ? 'Studio' : 'Tùy chỉnh'}</span>
        </button>
      </div>
    </header>
  );
};
