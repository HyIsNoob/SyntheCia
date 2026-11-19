import React, { useRef, useState } from 'react';
import {
  Camera,
  Download,
  Eye,
  EyeOff,
  Flame,
  Image as ImageIcon,
  Keyboard,
  Music,
  Palette,
  Plug,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  Video,
  Volume2,
  VolumeX,
  Wand2,
  X,
} from 'lucide-react';
import type { SampleLoadState } from '../audio/AudioEngine';
import { getTranslations } from '../i18n/translations';
import type { MidiDeviceInfo } from '../midi/WebMidiInput';
import {
  DEFAULT_SETTINGS,
  VISUAL_PRESETS,
  type AspectRatioMode,
  type AudioMode,
  type BackgroundPreset,
  type ColorMode,
  type HandStyle,
  type NoteStyle,
  type ParsedMidi,
  type PlayMode,
  type TrackOverride,
  type VisualizerSettings,
} from '../types/visualizer';

type TabId = 'presets' | 'notes' | 'fx' | 'bg' | 'audio' | 'play' | 'video';

interface InspectorDrawerProps {
  open: boolean;
  midi: ParsedMidi | null;
  settings: VisualizerSettings;
  activePresetId: string | null;
  playMode: PlayMode;
  qwertyOctaveShift: number;
  magicProgress: { stepIndex: number; totalSteps: number };
  trackOverrides: Readonly<Record<number, TrackOverride>>;
  sampleState: SampleLoadState;
  sampleProgress: { loaded: number; total: number };
  customAudioName: string | null;
  usbMidiSupported: boolean;
  usbMidiConnected: boolean;
  usbMidiDevices: MidiDeviceInfo[];
  isRecording: boolean;
  onClose: () => void;
  onUpdateSettings: (patch: Partial<VisualizerSettings>) => void;
  onApplyPreset: (presetId: string) => void;
  onExportPresetJson: () => void;
  onImportPresetJson: (file: File) => void;
  onUpdateTrackOverride: (trackIndex: number, patch: Partial<TrackOverride>) => void;
  onResetTrackOverrides: () => void;
  onChangePlayMode: (mode: PlayMode) => void;
  onChangeQwertyOctave: (shift: number) => void;
  onToggleUsbMidi: () => void;
  onUploadBackground: (file: File) => void;
  onClearBackground: () => void;
  onUploadCustomAudio: (file: File) => void;
  onClearCustomAudio: () => void;
  onEnterCleanMode: () => void;
  onToggleRecording: () => void;
  onTakeSnapshot: () => void;
}

const SliderRow: React.FC<{
  label: string;
  valueText: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
}> = ({ label, valueText, value, min, max, step, onChange }) => (
  <div className="space-y-1.5">
    <div className="flex items-center justify-between text-[11px]">
      <span className="text-slate-300 font-medium">{label}</span>
      <span className="font-mono text-violet-300">{valueText}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="studio-slider"
    />
  </div>
);

const ToggleRow: React.FC<{
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, hint, checked, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className="w-full flex items-center justify-between gap-2 py-1.5 text-left group cursor-pointer"
  >
    <div>
      <div className="text-xs font-medium text-slate-200 group-hover:text-white">{label}</div>
      {hint && <div className="text-[10px] text-slate-400">{hint}</div>}
    </div>
    <div
      className={`w-9 h-5 rounded-full p-0.5 transition-colors shrink-0 ${
        checked ? 'bg-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.6)]' : 'bg-white/15'
      }`}
    >
      <div
        className={`w-4 h-4 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </div>
  </button>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 pt-2 pb-1 border-b border-white/8">
    {children}
  </div>
);

export const InspectorDrawer: React.FC<InspectorDrawerProps> = ({
  open,
  midi,
  settings,
  activePresetId,
  playMode,
  qwertyOctaveShift,
  magicProgress,
  trackOverrides,
  sampleState,
  sampleProgress,
  customAudioName,
  usbMidiSupported,
  usbMidiConnected,
  usbMidiDevices,
  isRecording,
  onClose,
  onUpdateSettings,
  onApplyPreset,
  onExportPresetJson,
  onImportPresetJson,
  onUpdateTrackOverride,
  onResetTrackOverrides,
  onChangePlayMode,
  onChangeQwertyOctave,
  onToggleUsbMidi,
  onUploadBackground,
  onClearBackground,
  onUploadCustomAudio,
  onClearCustomAudio,
  onEnterCleanMode,
  onToggleRecording,
  onTakeSnapshot,
}) => {
  const [tab, setTab] = useState<TabId>('presets');
  const bgInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const presetInputRef = useRef<HTMLInputElement | null>(null);
  const t = getTranslations(settings.language);
  const isEn = settings.language === 'en';

  if (!open) return null;

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
    { id: 'presets', label: t.tabPresets, icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'notes', label: t.tabNotes, icon: <Music className="w-3.5 h-3.5" /> },
    { id: 'fx', label: t.tabFx, icon: <Flame className="w-3.5 h-3.5" /> },
    { id: 'bg', label: t.tabBg, icon: <ImageIcon className="w-3.5 h-3.5" /> },
    { id: 'audio', label: t.tabAudio, icon: <Volume2 className="w-3.5 h-3.5" /> },
    { id: 'play', label: t.tabPlay, icon: <Keyboard className="w-3.5 h-3.5" /> },
    { id: 'video', label: t.tabVideo, icon: <Video className="w-3.5 h-3.5" /> },
  ];

  return (
    <aside className="fixed top-16 right-3 bottom-3 z-30 w-[min(94vw,356px)] rounded-2xl bg-slate-950/86 backdrop-blur-2xl border border-white/12 shadow-[0_20px_60px_rgba(0,0,0,0.75)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-white">
            {t.studioControls}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              onUpdateSettings({
                ...DEFAULT_SETTINGS,
                language: settings.language,
                customBgUrl: settings.customBgUrl,
              })
            }
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title={t.resetDefaults}
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 7 Compact Tabs */}
      <div className="grid grid-cols-7 gap-0.5 p-1.5 border-b border-white/10 bg-black/25">
        {tabs.map((tb) => {
          const active = tab === tb.id;
          return (
            <button
              key={tb.id}
              type="button"
              onClick={() => setTab(tb.id)}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 px-0.5 rounded-xl text-[9px] font-semibold transition cursor-pointer ${
                active
                  ? 'bg-violet-500/25 text-white border border-violet-400/35 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
              }`}
            >
              {tb.icon}
              <span className="truncate max-w-full">{tb.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto studio-scroll p-4 space-y-4">
        {/* PRESETS TAB */}
        {tab === 'presets' && (
          <div className="space-y-2.5">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {isEn
                ? 'Choose a curated AAA visual style or export/import custom presets (.json). Settings auto-save locally.'
                : 'Chọn nhanh phong cách đồ họa AAA hoặc xuất/nhập file preset (.json). Mọi tùy chỉnh tự động lưu vào trình duyệt.'}
            </p>
            {VISUAL_PRESETS.map((preset) => {
              const selected = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onApplyPreset(preset.id)}
                  className={`w-full text-left p-3 rounded-xl border transition cursor-pointer ${
                    selected
                      ? 'bg-violet-500/18 border-violet-400/50 shadow-[0_0_24px_rgba(139,92,246,0.25)]'
                      : 'bg-white/[0.03] hover:bg-white/[0.07] border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-white">{preset.name}</span>
                    <div
                      className="w-10 h-3 rounded-full shadow-inner"
                      style={{
                        background: `linear-gradient(90deg, ${preset.accentFrom}, ${preset.accentTo})`,
                      }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 leading-snug">
                    {isEn ? preset.subtitleEn : preset.subtitle}
                  </div>
                </button>
              );
            })}

            <SectionTitle>{isEn ? 'Share & Preferences' : 'Chia sẻ Preset & Tùy chọn'}</SectionTitle>
            <input
              ref={presetInputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onImportPresetJson(file);
                  e.target.value = '';
                }
              }}
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onExportPresetJson}
                className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-white/8 hover:bg-white/14 border border-white/10 text-xs font-semibold text-slate-200 transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-violet-300" />
                <span>{t.exportPreset}</span>
              </button>
              <button
                type="button"
                onClick={() => presetInputRef.current?.click()}
                className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-white/8 hover:bg-white/14 border border-white/10 text-xs font-semibold text-slate-200 transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-cyan-300" />
                <span>{t.importPreset}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5 pt-1">
              {(['vi', 'en'] as const).map((lang) => (
                <button
                  key={lang}
                  type="button"
                  onClick={() => onUpdateSettings({ language: lang })}
                  className={`py-1.5 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                    settings.language === lang
                      ? 'bg-violet-500/25 border-violet-400/50 text-white'
                      : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {lang === 'vi' ? 'Tiếng Việt' : 'English'}
                </button>
              ))}
            </div>

            <ToggleRow
              label={isEn ? 'Show FPS & Particle Telemetry' : 'Hiện bộ đếm FPS & Số hạt GPU'}
              hint={isEn ? 'Auto-hidden in Clean Video Mode' : 'Tự động ẩn 100% khi vào Video Mode'}
              checked={settings.showPerfStats}
              onChange={(v) => onUpdateSettings({ showPerfStats: v })}
            />
          </div>
        )}

        {/* NOTES & 3D TAB */}
        {tab === 'notes' && (
          <div className="space-y-3.5">
            <SectionTitle>{isEn ? 'Camera View' : 'Góc nhìn (Camera)'}</SectionTitle>
            <div className="grid grid-cols-2 gap-1.5">
              {(['2d', '3d'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onUpdateSettings({ viewMode: m })}
                  className={`py-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    settings.viewMode === m
                      ? 'bg-violet-500/25 border-violet-400/50 text-white'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {m === '2d' ? '2D Classic (Embers)' : '3D Perspective Highway'}
                </button>
              ))}
            </div>

            {settings.viewMode === '3d' && (
              <SliderRow
                label={isEn ? '3D Perspective Tilt' : 'Độ nghiêng phối cảnh 3D'}
                valueText={`${Math.round(settings.perspectiveTilt * 100)}%`}
                value={settings.perspectiveTilt}
                min={0.35}
                max={0.82}
                step={0.02}
                onChange={(v) => onUpdateSettings({ perspectiveTilt: v })}
              />
            )}

            <SectionTitle>{isEn ? 'Note Style' : 'Kiểu dáng Nốt'}</SectionTitle>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'neon-hollow', label: isEn ? 'Hollow Neon' : 'Neon Viền Rỗng' },
                  { id: 'crystal', label: 'Crystal Gem' },
                  { id: 'glass-bar', label: isEn ? '3D Glass Bar' : 'Kính Phát Quang' },
                  { id: 'plasma-beam', label: isEn ? 'Plasma Beam' : 'Tia Plasma' },
                ] as Array<{ id: NoteStyle; label: string }>
              ).map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => onUpdateSettings({ noteStyle: st.id })}
                  className={`py-2 px-2 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                    settings.noteStyle === st.id
                      ? 'bg-violet-500/25 border-violet-400/50 text-white'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <SectionTitle>{isEn ? 'Color Palette' : 'Bảng màu Nốt'}</SectionTitle>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'rainbow', label: isEn ? 'Neon Rainbow' : 'Cầu vồng Neon' },
                  { id: 'dual-hand', label: isEn ? 'Left / Right' : '2 Tay (Custom)' },
                  { id: 'velocity', label: isEn ? 'Velocity Heat' : 'Theo lực đánh' },
                  { id: 'track', label: isEn ? 'Per MIDI Track' : 'Theo Track MIDI' },
                ] as Array<{ id: ColorMode; label: string }>
              ).map((cm) => (
                <button
                  key={cm.id}
                  type="button"
                  onClick={() => onUpdateSettings({ colorMode: cm.id })}
                  className={`py-1.5 px-2 rounded-xl text-[11px] font-medium border transition cursor-pointer ${
                    settings.colorMode === cm.id
                      ? 'bg-violet-500/25 border-violet-400/50 text-white'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {cm.label}
                </button>
              ))}
            </div>

            {settings.colorMode === 'dual-hand' && (
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <label className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
                  <span className="text-[11px] text-slate-300">{isEn ? 'Left' : 'Tay trái'}</span>
                  <input
                    type="color"
                    value={settings.leftHandColor}
                    onChange={(e) => onUpdateSettings({ leftHandColor: e.target.value })}
                    className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
                  <span className="text-[11px] text-slate-300">{isEn ? 'Right' : 'Tay phải'}</span>
                  <input
                    type="color"
                    value={settings.rightHandColor}
                    onChange={(e) => onUpdateSettings({ rightHandColor: e.target.value })}
                    className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                  />
                </label>
              </div>
            )}

            <SectionTitle>{isEn ? 'Fall Speed & Piano Bed' : 'Thông số Rơi & Đàn Piano'}</SectionTitle>
            <SliderRow
              label={isEn ? 'Note Lookahead Speed' : 'Tốc độ rơi nốt'}
              valueText={`${settings.noteSpeed.toFixed(1)}s`}
              value={settings.noteSpeed}
              min={1.2}
              max={4.8}
              step={0.1}
              onChange={(v) => onUpdateSettings({ noteSpeed: v })}
            />
            <SliderRow
              label={isEn ? 'Note Separation Width' : 'Độ rộng nốt (tách khe)'}
              valueText={`${Math.round(settings.noteWidthScale * 100)}%`}
              value={settings.noteWidthScale}
              min={0.6}
              max={0.96}
              step={0.02}
              onChange={(v) => onUpdateSettings({ noteWidthScale: v })}
            />
            <SliderRow
              label={isEn ? 'Keyboard Height' : 'Chiều cao bàn phím'}
              valueText={`${Math.round(settings.pianoHeightRatio * 100)}%`}
              value={settings.pianoHeightRatio}
              min={0.11}
              max={0.22}
              step={0.005}
              onChange={(v) => onUpdateSettings({ pianoHeightRatio: v })}
            />
            <SliderRow
              label={isEn ? 'Key Glow Bleed' : 'Độ lan sáng trên phím'}
              valueText={`${Math.round(settings.keyGlowSpread * 100)}%`}
              value={settings.keyGlowSpread}
              min={0.2}
              max={2.0}
              step={0.05}
              onChange={(v) => onUpdateSettings({ keyGlowSpread: v })}
            />

            <ToggleRow
              label={isEn ? 'Note Pitch Labels (C#, D...)' : 'Hiện tên nốt trên thanh rơi (C#, D...)'}
              checked={settings.showNoteLabels}
              onChange={(v) => onUpdateSettings({ showNoteLabels: v })}
            />
            <ToggleRow
              label={isEn ? 'Measure Bars & Octave Lines' : 'Vạch ô nhịp & đường quãng tám'}
              checked={settings.showMeasureGrid}
              onChange={(v) => onUpdateSettings({ showMeasureGrid: v })}
            />
            <ToggleRow
              label={isEn ? 'Auto Chord Badges (Cmaj7, F#...)' : 'Tự nhận diện ký hiệu Hợp âm'}
              checked={settings.showChordLabels}
              onChange={(v) => onUpdateSettings({ showChordLabels: v })}
            />
            <ToggleRow
              label={isEn ? 'Keyboard Octave Labels (C1–C8)' : 'Hiện nhãn quãng C1–C8 trên phím'}
              checked={settings.showKeyOctaveLabels}
              onChange={(v) => onUpdateSettings({ showKeyOctaveLabels: v })}
            />

            <SectionTitle>{isEn ? 'Optional Energy Finger Guide' : 'Hiệu ứng Dẫn ngón (Tùy chọn)'}</SectionTitle>
            <ToggleRow
              label={isEn ? 'Enable Sleek Finger Aura Guide' : 'Bật hiệu ứng điểm sáng vị trí ngón'}
              hint={isEn ? 'Minimalist glowing energy fingertips (off by default)' : 'Tắt mặc định — hiển thị vệt năng lượng ngón tay tối giản'}
              checked={settings.showHands}
              onChange={(v) => onUpdateSettings({ showHands: v })}
            />
            {settings.showHands && (
              <div className="space-y-2.5 pl-1 border-l-2 border-violet-400/35">
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'aura', label: 'Finger Aura' },
                      { id: 'hologram', label: 'Hologram' },
                      { id: 'neon-wire', label: 'Neon Wire' },
                    ] as Array<{ id: HandStyle; label: string }>
                  ).map((hs) => (
                    <button
                      key={hs.id}
                      type="button"
                      onClick={() => onUpdateSettings({ handStyle: hs.id })}
                      className={`py-1.5 px-1.5 rounded-xl text-[10px] font-semibold border transition cursor-pointer ${
                        settings.handStyle === hs.id
                          ? 'bg-violet-500/25 border-violet-400/50 text-white'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {hs.label}
                    </button>
                  ))}
                </div>
                <SliderRow
                  label={isEn ? 'Guide Opacity' : 'Độ rõ hiệu ứng'}
                  valueText={`${Math.round(settings.handOpacity * 100)}%`}
                  value={settings.handOpacity}
                  min={0.2}
                  max={1.0}
                  step={0.04}
                  onChange={(v) => onUpdateSettings({ handOpacity: v })}
                />
              </div>
            )}
          </div>
        )}

        {/* GLOW, CONCERT FX & PARTICLES TAB */}
        {tab === 'fx' && (
          <div className="space-y-3.5">
            <SectionTitle>{isEn ? '3-Octave Optical HDR Bloom' : 'AAA Optical HDR Bloom (3 Tầng)'}</SectionTitle>
            <SliderRow
              label={isEn ? 'Glow / Bloom Intensity' : 'Cường độ Glow (HDR Bloom)'}
              valueText={`${Math.round(settings.bloomIntensity * 100)}%`}
              value={settings.bloomIntensity}
              min={0}
              max={3.0}
              step={0.05}
              onChange={(v) => onUpdateSettings({ bloomIntensity: v })}
            />
            <SliderRow
              label={isEn ? 'Bloom Spread Radius' : 'Bán kính lan tỏa Glow'}
              valueText={`${settings.bloomRadius.toFixed(2)}x`}
              value={settings.bloomRadius}
              min={0.4}
              max={2.5}
              step={0.05}
              onChange={(v) => onUpdateSettings({ bloomRadius: v })}
            />
            <SliderRow
              label={isEn ? 'Bloom Threshold' : 'Ngưỡng tách sáng (Threshold)'}
              valueText={`${Math.round(settings.bloomThreshold * 100)}%`}
              value={settings.bloomThreshold}
              min={0.1}
              max={0.75}
              step={0.02}
              onChange={(v) => onUpdateSettings({ bloomThreshold: v })}
            />
            <SliderRow
              label={isEn ? 'Note Edge Luminance' : 'Độ rực lõi nốt (Note Glow)'}
              valueText={`${Math.round(settings.noteGlowIntensity * 100)}%`}
              value={settings.noteGlowIntensity}
              min={0}
              max={1.5}
              step={0.05}
              onChange={(v) => onUpdateSettings({ noteGlowIntensity: v })}
            />
            <SliderRow
              label={isEn ? 'Image Clarity (Sharpness)' : 'Độ sắc nét khung hình (Sharpness)'}
              valueText={`${Math.round(settings.sharpness * 100)}%`}
              value={settings.sharpness}
              min={0}
              max={1.0}
              step={0.05}
              onChange={(v) => onUpdateSettings({ sharpness: v })}
            />
            <SliderRow
              label={isEn ? 'Chromatic Prism' : 'Tán sắc Lăng kính (Chromatic)'}
              valueText={`${Math.round(settings.chromaticAberration * 100)}%`}
              value={settings.chromaticAberration}
              min={0}
              max={1.0}
              step={0.02}
              onChange={(v) => onUpdateSettings({ chromaticAberration: v })}
            />

            <SectionTitle>{isEn ? 'Concert Stage FX' : 'Hiệu ứng Sân khấu Concert'}</SectionTitle>
            <ToggleRow
              label={isEn ? 'Live Audio EQ Spectrum' : 'Sóng quang phổ Audio EQ theo nhạc'}
              checked={settings.eqSpectrumEnabled}
              onChange={(v) => onUpdateSettings({ eqSpectrumEnabled: v })}
            />
            {settings.eqSpectrumEnabled && (
              <SliderRow
                label={isEn ? 'EQ Spectrum Height' : 'Chiều cao sóng EQ'}
                valueText={`${Math.round(settings.eqSpectrumHeight * 100)}%`}
                value={settings.eqSpectrumHeight}
                min={0.25}
                max={1.5}
                step={0.05}
                onChange={(v) => onUpdateSettings({ eqSpectrumHeight: v })}
              />
            )}
            <ToggleRow
              label={isEn ? 'Piano Mirror Reflection' : 'Phản chiếu gương mặt đàn Piano'}
              checked={settings.mirrorReflectionEnabled}
              onChange={(v) => onUpdateSettings({ mirrorReflectionEnabled: v })}
            />
            {settings.mirrorReflectionEnabled && (
              <SliderRow
                label={isEn ? 'Reflection Intensity' : 'Độ bóng phản chiếu'}
                valueText={`${Math.round(settings.mirrorReflectionIntensity * 100)}%`}
                value={settings.mirrorReflectionIntensity}
                min={0.1}
                max={1.0}
                step={0.04}
                onChange={(v) => onUpdateSettings({ mirrorReflectionIntensity: v })}
              />
            )}
            <ToggleRow
              label={isEn ? 'Sustain Pedal (CC64) Resonance Aura' : 'Ánh sáng cộng hưởng bàn đạp Sustain'}
              checked={settings.sustainAuraEnabled}
              onChange={(v) => onUpdateSettings({ sustainAuraEnabled: v })}
            />
            <ToggleRow
              label={isEn ? 'Plasma Strike Edge & Lens Flares' : 'Dải sóng Plasma & Anamorphic Flare'}
              checked={settings.plasmaEdgeWave}
              onChange={(v) => onUpdateSettings({ plasmaEdgeWave: v })}
            />
            {settings.plasmaEdgeWave && (
              <SliderRow
                label={isEn ? 'Plasma Intensity' : 'Cường độ sóng Plasma'}
                valueText={`${Math.round(settings.plasmaEdgeIntensity * 100)}%`}
                value={settings.plasmaEdgeIntensity}
                min={0.2}
                max={2.2}
                step={0.05}
                onChange={(v) => onUpdateSettings({ plasmaEdgeIntensity: v })}
              />
            )}
            <ToggleRow
              label={isEn ? 'Vertical Key Light Shafts' : 'Cột ánh sáng hắt lên (God-Rays)'}
              checked={settings.keyLightBeams}
              onChange={(v) => onUpdateSettings({ keyLightBeams: v })}
            />
            {settings.keyLightBeams && (
              <SliderRow
                label={isEn ? 'Light Shaft Strength' : 'Độ rực cột sáng'}
                valueText={`${Math.round(settings.keyBeamIntensity * 100)}%`}
                value={settings.keyBeamIntensity}
                min={0.15}
                max={1.5}
                step={0.05}
                onChange={(v) => onUpdateSettings({ keyBeamIntensity: v })}
              />
            )}

            <SectionTitle>{isEn ? 'GPU Physics Particles' : 'Hạt Vật lý GPU (Physics Particles)'}</SectionTitle>
            <ToggleRow
              label={isEn ? 'Enable Particle System' : 'Bật toàn bộ hiệu ứng Hạt'}
              checked={settings.particlesEnabled}
              onChange={(v) => onUpdateSettings({ particlesEnabled: v })}
            />
            {settings.particlesEnabled && (
              <div className="space-y-2.5 pl-1 border-l-2 border-violet-500/30">
                <ToggleRow
                  label={isEn ? 'Curl-Noise Fluid Silk Plumes' : 'Lụa khói Curl-Noise (Buoyancy)'}
                  checked={settings.fluidSilkEnabled}
                  onChange={(v) => onUpdateSettings({ fluidSilkEnabled: v })}
                />
                <ToggleRow
                  label={isEn ? 'Bouncing Comet Spark Streaks' : 'Tia lửa kéo vệt & nảy mép phím'}
                  checked={settings.sparksEnabled}
                  onChange={(v) => onUpdateSettings({ sparksEnabled: v })}
                />
                <ToggleRow
                  label={isEn ? '4-Point Star Glints & Stardust' : 'Bụi sao & ánh sao 4 cánh'}
                  checked={settings.stardustEnabled}
                  onChange={(v) => onUpdateSettings({ stardustEnabled: v })}
                />
                <ToggleRow
                  label={isEn ? 'Impact Shockwave Rings' : 'Vòng sóng chấn động (Shockwaves)'}
                  checked={settings.shockwavesEnabled}
                  onChange={(v) => onUpdateSettings({ shockwavesEnabled: v })}
                />

                <SliderRow
                  label={isEn ? 'Density' : 'Mật độ hạt'}
                  valueText={`${Math.round(settings.particleDensity * 100)}%`}
                  value={settings.particleDensity}
                  min={0.2}
                  max={2.5}
                  step={0.05}
                  onChange={(v) => onUpdateSettings({ particleDensity: v })}
                />
                <SliderRow
                  label={isEn ? 'Curl Turbulence' : 'Độ cuộn xoáy (Turbulence)'}
                  valueText={`${settings.particleTurbulence.toFixed(2)}x`}
                  value={settings.particleTurbulence}
                  min={0.2}
                  max={2.5}
                  step={0.05}
                  onChange={(v) => onUpdateSettings({ particleTurbulence: v })}
                />
                <SliderRow
                  label={isEn ? 'Velocity' : 'Tốc độ bay'}
                  valueText={`${settings.particleSpeed.toFixed(2)}x`}
                  value={settings.particleSpeed}
                  min={0.4}
                  max={2.2}
                  step={0.05}
                  onChange={(v) => onUpdateSettings({ particleSpeed: v })}
                />
                <SliderRow
                  label={isEn ? 'Particle Size' : 'Kích thước hạt'}
                  valueText={`${settings.particleSize.toFixed(2)}x`}
                  value={settings.particleSize}
                  min={0.5}
                  max={2.2}
                  step={0.05}
                  onChange={(v) => onUpdateSettings({ particleSize: v })}
                />
              </div>
            )}
          </div>
        )}

        {/* BACKGROUND TAB */}
        {tab === 'bg' && (
          <div className="space-y-3.5">
            <SectionTitle>{isEn ? 'Custom Backdrop Image' : 'Ảnh nền Custom (Có Cache GPU)'}</SectionTitle>
            <input
              ref={bgInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onUploadBackground(file);
                  e.target.value = '';
                }
              }}
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => bgInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-violet-600/85 hover:bg-violet-500 text-white text-xs font-semibold transition cursor-pointer shadow-md"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isEn ? 'Upload Custom Image' : 'Chọn ảnh nền từ máy'}</span>
              </button>
              {settings.customBgUrl && (
                <button
                  type="button"
                  onClick={onClearBackground}
                  className="p-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/30 text-rose-300 cursor-pointer"
                  title="Remove"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {settings.customBgUrl && (
              <div className="relative h-20 rounded-xl overflow-hidden border border-white/15">
                <img
                  src={settings.customBgUrl}
                  alt="Custom background preview"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end p-2">
                  <span className="text-[10px] font-medium text-white">
                    {isEn ? 'Custom backdrop active' : 'Ảnh nền custom đang bật'}
                  </span>
                </div>
              </div>
            )}

            <SectionTitle>{isEn ? 'Animated Backdrops' : 'Nền động tích hợp'}</SectionTitle>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'void', label: 'Obsidian Void' },
                  { id: 'aurora', label: isEn ? 'Northern Aurora' : 'Cực Quang Aurora' },
                  { id: 'nebula', label: isEn ? 'Deep Nebula' : 'Tinh Vân Nebula' },
                  { id: 'midnight-ember', label: 'Midnight Ember' },
                ] as Array<{ id: BackgroundPreset; label: string }>
              ).map((bg) => (
                <button
                  key={bg.id}
                  type="button"
                  onClick={() => onUpdateSettings({ backgroundPreset: bg.id })}
                  className={`py-2 px-2 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                    settings.backgroundPreset === bg.id
                      ? 'bg-violet-500/25 border-violet-400/50 text-white'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {bg.label}
                </button>
              ))}
            </div>

            <SectionTitle>{isEn ? 'Backdrop Adjustments' : 'Tinh chỉnh Ánh sáng & Độ mờ nền'}</SectionTitle>
            <SliderRow
              label={isEn ? 'Opacity / Dim' : 'Độ rõ / Độ mờ nền (Opacity)'}
              valueText={`${Math.round(settings.bgOpacity * 100)}%`}
              value={settings.bgOpacity}
              min={0}
              max={1}
              step={0.02}
              onChange={(v) => onUpdateSettings({ bgOpacity: v })}
            />
            <SliderRow
              label={isEn ? 'Gaussian Blur (Cached)' : 'Độ nhòe nền (Blur mượt)'}
              valueText={`${settings.bgBlur.toFixed(0)} px`}
              value={settings.bgBlur}
              min={0}
              max={30}
              step={1}
              onChange={(v) => onUpdateSettings({ bgBlur: v })}
            />
            <SliderRow
              label={isEn ? 'Brightness' : 'Độ sáng nền'}
              valueText={`${Math.round(settings.bgBrightness * 100)}%`}
              value={settings.bgBrightness}
              min={0.2}
              max={1.8}
              step={0.05}
              onChange={(v) => onUpdateSettings({ bgBrightness: v })}
            />
            <SliderRow
              label={isEn ? 'Saturation' : 'Độ rực màu'}
              valueText={`${Math.round(settings.bgSaturation * 100)}%`}
              value={settings.bgSaturation}
              min={0}
              max={2.0}
              step={0.05}
              onChange={(v) => onUpdateSettings({ bgSaturation: v })}
            />
            <SliderRow
              label={isEn ? 'Vignette' : 'Làm tối 4 góc (Vignette)'}
              valueText={`${Math.round(settings.bgVignette * 100)}%`}
              value={settings.bgVignette}
              min={0}
              max={1}
              step={0.02}
              onChange={(v) => onUpdateSettings({ bgVignette: v })}
            />
            <SliderRow
              label={isEn ? 'Bass Audio Pulse' : 'Nhịp thở nền theo Bass nhạc'}
              valueText={`${Math.round(settings.bgAudioPulse * 100)}%`}
              value={settings.bgAudioPulse}
              min={0}
              max={1.5}
              step={0.05}
              onChange={(v) => onUpdateSettings({ bgAudioPulse: v })}
            />
          </div>
        )}

        {/* AUDIO & MIDI TRACK MANAGER TAB */}
        {tab === 'audio' && (
          <div className="space-y-3.5">
            <SectionTitle>{isEn ? 'Piano Sound Engine' : 'Nguồn Âm thanh Piano'}</SectionTitle>
            <div className="space-y-1.5">
              {(
                [
                  {
                    id: 'salamander',
                    title: isEn ? 'Salamander Grand Piano (Sampled)' : 'Grand Piano mẫu thật (Salamander)',
                    desc:
                      sampleState === 'ready'
                        ? isEn
                          ? 'Concert grand samples loaded'
                          : 'Đã tải đủ bộ mẫu thu Grand Piano'
                        : sampleState === 'loading'
                          ? `${isEn ? 'Loading samples' : 'Đang tải mẫu thu'} (${sampleProgress.loaded}/${sampleProgress.total})...`
                          : sampleState === 'fallback'
                            ? isEn
                              ? 'Offline — using Studio Synth fallback'
                              : 'Không có mạng — dùng Synth dự phòng'
                            : isEn
                              ? 'Loads automatically on first play'
                              : 'Tự động tải nhẹ khi bắt đầu phát nhạc',
                  },
                  {
                    id: 'synth',
                    title: isEn ? 'Offline Studio Piano Synth' : 'Studio Piano Synth (100% Offline)',
                    desc: isEn
                      ? 'Multi-harmonic acoustic piano synth + hall reverb'
                      : 'Tổng hợp âm thanh đàn piano đa hài âm + reverb',
                  },
                  {
                    id: 'custom-audio',
                    title: isEn ? 'Custom Sync Audio (.mp3 / .wav)' : 'File nhạc rời (.mp3 / .wav)',
                    desc: customAudioName
                      ? `${isEn ? 'Loaded' : 'Đang dùng'}: ${customAudioName}`
                      : isEn
                        ? 'Sync your real studio recording to the MIDI'
                        : 'Đồng bộ bản thu thật của bạn với file MIDI',
                  },
                ] as Array<{ id: AudioMode; title: string; desc: string }>
              ).map((am) => (
                <button
                  key={am.id}
                  type="button"
                  onClick={() => onUpdateSettings({ audioMode: am.id })}
                  className={`w-full text-left p-2.5 rounded-xl border transition cursor-pointer ${
                    settings.audioMode === am.id
                      ? 'bg-violet-500/20 border-violet-400/50 text-white'
                      : 'bg-white/[0.03] border-white/10 text-slate-300 hover:bg-white/[0.07]'
                  }`}
                >
                  <div className="text-xs font-semibold">{am.title}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{am.desc}</div>
                </button>
              ))}
            </div>

            <input
              ref={audioInputRef}
              type="file"
              accept="audio/*,.mp3,.wav,.ogg,.flac,.m4a"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  onUploadCustomAudio(file);
                  e.target.value = '';
                }
              }}
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => audioInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isEn ? 'Load Sync Audio (.mp3/.wav)' : 'Nạp file nhạc (.mp3/.wav)'}</span>
              </button>
              {customAudioName && (
                <button
                  type="button"
                  onClick={onClearCustomAudio}
                  className="p-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {settings.audioMode === 'custom-audio' && (
              <SliderRow
                label={isEn ? 'Audio Sync Offset' : 'Căn chỉnh độ trễ Audio (Offset)'}
                valueText={`${settings.customAudioOffsetMs >= 0 ? '+' : ''}${settings.customAudioOffsetMs} ms`}
                value={settings.customAudioOffsetMs}
                min={-2000}
                max={2000}
                step={10}
                onChange={(v) => onUpdateSettings({ customAudioOffsetMs: v })}
              />
            )}

            <SectionTitle>Master Mix</SectionTitle>
            <SliderRow
              label={isEn ? 'Master Volume' : 'Âm lượng tổng'}
              valueText={`${Math.round(settings.masterVolume * 100)}%`}
              value={settings.masterVolume}
              min={0}
              max={1}
              step={0.02}
              onChange={(v) => onUpdateSettings({ masterVolume: v })}
            />
            <SliderRow
              label={isEn ? 'Concert Hall Reverb' : 'Độ vang Phòng hòa nhạc'}
              valueText={`${Math.round(settings.reverbMix * 100)}%`}
              value={settings.reverbMix}
              min={0}
              max={1}
              step={0.02}
              onChange={(v) => onUpdateSettings({ reverbMix: v })}
            />

            {/* Phase 2: MIDI Track Manager */}
            {midi && midi.tracks.length > 0 && (
              <>
                <div className="flex items-center justify-between pt-2 pb-1 border-b border-white/8">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {t.tracksTitle} ({midi.tracks.length})
                  </span>
                  {Object.keys(trackOverrides).length > 0 && (
                    <button
                      type="button"
                      onClick={onResetTrackOverrides}
                      className="text-[10px] text-violet-300 hover:text-violet-200 underline cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {midi.tracks.map((tr) => {
                    const ov = trackOverrides[tr.trackIndex] ?? {};
                    const muted = !!ov.muted;
                    const hidden = !!ov.hidden;
                    const hand = ov.hand ?? tr.defaultHand;
                    const col = ov.color ?? tr.defaultColor;

                    return (
                      <div
                        key={tr.trackIndex}
                        className="flex items-center gap-2 p-2 rounded-xl bg-white/[0.03] border border-white/10"
                      >
                        <input
                          type="color"
                          value={col}
                          onChange={(e) =>
                            onUpdateTrackOverride(tr.trackIndex, { color: e.target.value })
                          }
                          className="w-5 h-5 rounded bg-transparent border-0 cursor-pointer shrink-0"
                          title={isEn ? 'Track custom color' : 'Đổi màu riêng cho track này'}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-semibold text-slate-200 truncate">
                            {tr.name}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {tr.noteCount} {t.notesUnit}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateTrackOverride(tr.trackIndex, {
                              hand: hand === 'left' ? 'right' : 'left',
                            })
                          }
                          className="px-1.5 py-0.5 rounded bg-white/8 hover:bg-white/15 text-[10px] font-mono text-slate-300 cursor-pointer"
                          title={isEn ? 'Toggle Left / Right hand' : 'Đổi Tay Trái / Tay Phải'}
                        >
                          {hand === 'left' ? 'LH' : 'RH'}
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateTrackOverride(tr.trackIndex, { muted: !muted })}
                          className={`p-1 rounded-lg transition cursor-pointer ${
                            muted
                              ? 'bg-rose-500/25 text-rose-300'
                              : 'text-slate-300 hover:bg-white/10'
                          }`}
                          title={muted ? 'Unmute track' : 'Mute track'}
                        >
                          {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateTrackOverride(tr.trackIndex, { hidden: !hidden })}
                          className={`p-1 rounded-lg transition cursor-pointer ${
                            hidden
                              ? 'bg-amber-500/25 text-amber-300'
                              : 'text-slate-300 hover:bg-white/10'
                          }`}
                          title={hidden ? 'Show track' : 'Hide track'}
                        >
                          {hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* PLAY / PERFORM TAB (Magic Keys + QWERTY Piano + Web MIDI USB!) */}
        {tab === 'play' && (
          <div className="space-y-3.5">
            <SectionTitle>{isEn ? 'Performance Mode' : 'Chế độ Chơi đàn tương tác'}</SectionTitle>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => onChangePlayMode('auto')}
                className={`w-full text-left p-2.5 rounded-xl border transition cursor-pointer ${
                  playMode === 'auto'
                    ? 'bg-violet-500/22 border-violet-400/50 text-white'
                    : 'bg-white/[0.03] border-white/10 text-slate-300 hover:bg-white/[0.07]'
                }`}
              >
                <div className="text-xs font-bold">{t.playModeAuto}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {isEn
                    ? 'Standard automatic MIDI playback with transport controls.'
                    : 'Phát nhạc MIDI tự động chuẩn để nghe và quay video.'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => onChangePlayMode('magic-keys')}
                className={`w-full text-left p-2.5 rounded-xl border transition cursor-pointer ${
                  playMode === 'magic-keys'
                    ? 'bg-amber-500/22 border-amber-400/55 text-white shadow-[0_0_20px_rgba(245,158,11,0.2)]'
                    : 'bg-white/[0.03] border-white/10 text-slate-300 hover:bg-white/[0.07]'
                }`}
              >
                <div className="text-xs font-bold flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Wand2 className="w-3.5 h-3.5 text-amber-300" />
                    <span>{t.playModeMagic}</span>
                  </span>
                  {playMode === 'magic-keys' && magicProgress.totalSteps > 0 && (
                    <span className="font-mono text-[10px] text-amber-200">
                      {magicProgress.stepIndex}/{magicProgress.totalSteps}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                  {isEn
                    ? 'Tap ANY letter/number key to play the exact next MIDI chord with your own rubato timing — like a real pianist!'
                    : 'Gõ BẤT KỲ phím chữ/số nào trên bàn phím là tự đánh đúng hợp âm/nốt tiếp theo của bài MIDI — bạn chỉ cần giữ nhịp như chơi đàn thật!'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => onChangePlayMode('qwerty')}
                className={`w-full text-left p-2.5 rounded-xl border transition cursor-pointer ${
                  playMode === 'qwerty'
                    ? 'bg-emerald-500/20 border-emerald-400/50 text-white'
                    : 'bg-white/[0.03] border-white/10 text-slate-300 hover:bg-white/[0.07]'
                }`}
              >
                <div className="text-xs font-bold flex items-center gap-1.5">
                  <Keyboard className="w-3.5 h-3.5 text-emerald-300" />
                  <span>{t.playModeQwerty}</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                  {isEn
                    ? 'Play 2+ live octaves on your computer keyboard: Z–M (lower) and Q–P (upper). Hold Shift for sustain!'
                    : 'Chơi trực tiếp hơn 2 quãng tám bằng hàng phím Z–M (trầm) và Q–P (cao). Giữ Shift để đạp pedal Sustain!'}
                </div>
              </button>
            </div>

            {playMode === 'qwerty' && (
              <div className="p-3 rounded-xl bg-emerald-950/35 border border-emerald-400/25 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-emerald-200 font-semibold">
                    {isEn ? 'Base Octave' : 'Quãng tám gốc'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onChangeQwertyOctave(Math.max(-2, qwertyOctaveShift - 1))}
                      className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 font-mono text-white cursor-pointer"
                    >
                      −
                    </button>
                    <span className="font-mono text-emerald-300 w-9 text-center">
                      C{4 + qwertyOctaveShift}
                    </span>
                    <button
                      type="button"
                      onClick={() => onChangeQwertyOctave(Math.min(2, qwertyOctaveShift + 1))}
                      className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 font-mono text-white cursor-pointer"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div className="text-[10px] font-mono text-slate-300 leading-relaxed">
                  <div>Upper: Q 2 W 3 E R 5 T 6 Y 7 U I 9 O 0 P</div>
                  <div>Lower: Z S X D C V G B H N J M , L . ; /</div>
                </div>
              </div>
            )}

            <SectionTitle>USB MIDI Keyboard (Web MIDI API)</SectionTitle>
            <button
              type="button"
              onClick={onToggleUsbMidi}
              disabled={!usbMidiSupported}
              className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold border transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                usbMidiConnected
                  ? 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400/50 text-emerald-100'
                  : 'bg-white/8 hover:bg-white/14 border-white/15 text-white'
              }`}
            >
              <Plug className="w-4 h-4" />
              <span>{usbMidiConnected ? t.usbMidiDisconnect : t.usbMidiConnect}</span>
            </button>

            {!usbMidiSupported && (
              <p className="text-[10px] text-amber-300/90">
                {isEn
                  ? 'Web MIDI requires Chrome, Edge, or Opera.'
                  : 'Web MIDI API cần trình duyệt Chrome, Edge hoặc Opera.'}
              </p>
            )}

            {usbMidiConnected && (
              <div className="p-2.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-1">
                {usbMidiDevices.length === 0 ? (
                  <div className="text-[11px] text-slate-400">{t.usbMidiNone}</div>
                ) : (
                  usbMidiDevices.map((d) => (
                    <div key={d.id} className="flex items-center justify-between text-[11px]">
                      <span className="text-emerald-300 font-semibold truncate">{d.name}</span>
                      <span className="text-[10px] text-slate-400">LIVE</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* VIDEO MODE TAB */}
        {tab === 'video' && (
          <div className="space-y-3.5">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {isEn
                ? '100% zero-UI capture mode for OBS or direct 60fps WebM/MP4 video export with synced studio audio.'
                : 'Chế độ quay video sạch 100% — ẩn toàn bộ thanh công cụ và con trỏ chuột. Quay bằng OBS hoặc xuất video 60fps có tiếng ngay tại đây.'}
            </p>

            <SectionTitle>{isEn ? 'Aspect Ratio' : 'Tỷ lệ Khung hình'}</SectionTitle>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'full', label: isEn ? 'Full Window' : 'Full Màn hình' },
                  { id: '16:9', label: '16:9 YouTube' },
                  { id: '9:16', label: '9:16 TikTok/Shorts' },
                  { id: '1:1', label: isEn ? '1:1 Square' : '1:1 Vuông' },
                ] as Array<{ id: AspectRatioMode; label: string }>
              ).map((ar) => (
                <button
                  key={ar.id}
                  type="button"
                  onClick={() => onUpdateSettings({ aspectRatio: ar.id })}
                  className={`py-2 px-2 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                    settings.aspectRatio === ar.id
                      ? 'bg-cyan-500/25 border-cyan-400/50 text-white'
                      : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {ar.label}
                </button>
              ))}
            </div>

            <SectionTitle>{isEn ? 'Direct 60fps Capture' : 'Cài đặt Quay trực tiếp 60fps'}</SectionTitle>
            <SliderRow
              label={isEn ? 'Video Bitrate' : 'Chất lượng Video (Bitrate)'}
              valueText={`${settings.recordBitrateMbps} Mbps`}
              value={settings.recordBitrateMbps}
              min={8}
              max={24}
              step={2}
              onChange={(v) => onUpdateSettings({ recordBitrateMbps: v })}
            />
            <ToggleRow
              label={isEn ? '3-2-1 Countdown' : 'Đếm ngược 3-2-1 trước khi quay'}
              hint={isEn ? 'Hides all chrome before frame 1' : 'Tự ẩn toàn bộ UI trước khung hình đầu tiên'}
              checked={settings.recordCountdown}
              onChange={(v) => onUpdateSettings({ recordCountdown: v })}
            />
            <ToggleRow
              label={isEn ? 'Auto-restart from 0:00' : 'Tự động tua về đầu bài khi quay'}
              checked={settings.recordAutoStart}
              onChange={(v) => onUpdateSettings({ recordAutoStart: v })}
            />
            <ToggleRow
              label={isEn ? 'Auto-stop & download at end' : 'Tự dừng & tải video khi hết bài'}
              checked={settings.recordAutoStop}
              onChange={(v) => onUpdateSettings({ recordAutoStop: v })}
            />

            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={onEnterCleanMode}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-100 text-xs font-bold transition cursor-pointer"
              >
                <EyeOff className="w-4 h-4 text-cyan-300" />
                <span>{isEn ? 'Enter Clean Video Mode (OBS)' : 'Vào Clean Video Mode (Cho OBS)'}</span>
              </button>

              <button
                type="button"
                onClick={onToggleRecording}
                className={`w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer ${
                  isRecording
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-[0_0_24px_rgba(244,63,94,0.65)]'
                    : 'bg-gradient-to-r from-rose-600 to-violet-600 hover:from-rose-500 hover:to-violet-500 text-white shadow-[0_0_24px_rgba(139,92,246,0.4)]'
                }`}
              >
                <Video className="w-4 h-4" />
                <span>
                  {isRecording
                    ? isEn
                      ? 'Stop & Save Video'
                      : 'Dừng Quay & Lưu Video'
                    : isEn
                      ? 'Record & Export 60fps Video'
                      : 'Bắt đầu Quay & Xuất Video 60fps'}
                </span>
              </button>

              <button
                type="button"
                onClick={onTakeSnapshot}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/8 hover:bg-white/14 text-slate-200 text-xs font-semibold transition cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>{isEn ? 'Capture Frame Snapshot (PNG)' : 'Chụp ảnh khung hình (PNG)'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
