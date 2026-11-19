import React, { useRef, useState } from 'react';
import {
  Camera,
  EyeOff,
  Flame,
  Image as ImageIcon,
  Music,
  Palette,
  RotateCcw,
  Sparkles,
  Trash2,
  Upload,
  Video,
  Volume2,
  X,
} from 'lucide-react';
import type { SampleLoadState } from '../audio/AudioEngine';
import {
  DEFAULT_SETTINGS,
  VISUAL_PRESETS,
  type AspectRatioMode,
  type AudioMode,
  type BackgroundPreset,
  type ColorMode,
  type HandStyle,
  type NoteStyle,
  type VisualizerSettings,
} from '../types/visualizer';

type TabId = 'presets' | 'notes' | 'fx' | 'bg' | 'audio' | 'video';

interface InspectorDrawerProps {
  open: boolean;
  settings: VisualizerSettings;
  activePresetId: string | null;
  sampleState: SampleLoadState;
  sampleProgress: { loaded: number; total: number };
  customAudioName: string | null;
  isRecording: boolean;
  onClose: () => void;
  onUpdateSettings: (patch: Partial<VisualizerSettings>) => void;
  onApplyPreset: (presetId: string) => void;
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

const TABS: Array<{ id: TabId; label: string; icon: React.ReactNode }> = [
  { id: 'presets', label: 'Preset', icon: <Sparkles className="w-3.5 h-3.5" /> },
  { id: 'notes', label: 'Nốt/3D', icon: <Music className="w-3.5 h-3.5" /> },
  { id: 'fx', label: 'Glow/Hạt', icon: <Flame className="w-3.5 h-3.5" /> },
  { id: 'bg', label: 'Nền', icon: <ImageIcon className="w-3.5 h-3.5" /> },
  { id: 'audio', label: 'Âm thanh', icon: <Volume2 className="w-3.5 h-3.5" /> },
  { id: 'video', label: 'Video', icon: <Video className="w-3.5 h-3.5" /> },
];

export const InspectorDrawer: React.FC<InspectorDrawerProps> = ({
  open,
  settings,
  activePresetId,
  sampleState,
  sampleProgress,
  customAudioName,
  isRecording,
  onClose,
  onUpdateSettings,
  onApplyPreset,
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

  if (!open) return null;

  return (
    <aside className="fixed top-16 right-3 bottom-3 z-30 w-[min(92vw,340px)] rounded-2xl bg-slate-950/84 backdrop-blur-2xl border border-white/12 shadow-[0_20px_60px_rgba(0,0,0,0.75)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-violet-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-white">
            Studio Controls
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onUpdateSettings({ ...DEFAULT_SETTINGS, customBgUrl: settings.customBgUrl })}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Khôi phục thông số mặc định"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Đóng bảng tùy chỉnh"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-6 gap-1 p-1.5 border-b border-white/10 bg-black/25">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 rounded-xl text-[10px] font-semibold transition cursor-pointer ${
                active
                  ? 'bg-violet-500/25 text-white border border-violet-400/35 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
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
              Chọn nhanh 1 phong cách đồ họa mẫu (mô phỏng Embers, Arctic Silk, 3D Neon Highway...) rồi tinh chỉnh sâu ở các tab bên cạnh.
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
                    {preset.subtitle}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* NOTES & 3D TAB */}
        {tab === 'notes' && (
          <div className="space-y-3.5">
            <SectionTitle>Góc nhìn (Camera)</SectionTitle>
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
                label="Độ nghiêng phối cảnh 3D"
                valueText={`${Math.round(settings.perspectiveTilt * 100)}%`}
                value={settings.perspectiveTilt}
                min={0.35}
                max={0.82}
                step={0.02}
                onChange={(v) => onUpdateSettings({ perspectiveTilt: v })}
              />
            )}

            <SectionTitle>Kiểu dáng Nốt (Note Style)</SectionTitle>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'crystal', label: 'Crystal Gem' },
                  { id: 'neon-hollow', label: 'Neon Viền Rỗng' },
                  { id: 'glass-bar', label: 'Kính Phát Quang' },
                  { id: 'plasma-beam', label: 'Tia Plasma' },
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

            <SectionTitle>Bảng màu Nốt</SectionTitle>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'dual-hand', label: '2 Tay (Custom)' },
                  { id: 'rainbow', label: 'Cầu vồng Cao độ' },
                  { id: 'velocity', label: 'Theo lực đánh' },
                  { id: 'track', label: 'Theo Track MIDI' },
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
                  <span className="text-[11px] text-slate-300">Tay trái</span>
                  <input
                    type="color"
                    value={settings.leftHandColor}
                    onChange={(e) => onUpdateSettings({ leftHandColor: e.target.value })}
                    className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                  />
                </label>
                <label className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
                  <span className="text-[11px] text-slate-300">Tay phải</span>
                  <input
                    type="color"
                    value={settings.rightHandColor}
                    onChange={(e) => onUpdateSettings({ rightHandColor: e.target.value })}
                    className="w-6 h-6 rounded bg-transparent border-0 cursor-pointer"
                  />
                </label>
              </div>
            )}

            <SectionTitle>Thông số Rơi & Đàn Piano</SectionTitle>
            <SliderRow
              label="Tốc độ rơi nốt"
              valueText={`${settings.noteSpeed.toFixed(1)}s`}
              value={settings.noteSpeed}
              min={1.2}
              max={4.8}
              step={0.1}
              onChange={(v) => onUpdateSettings({ noteSpeed: v })}
            />
            <SliderRow
              label="Độ rộng nốt"
              valueText={`${Math.round(settings.noteWidthScale * 100)}%`}
              value={settings.noteWidthScale}
              min={0.6}
              max={1.05}
              step={0.02}
              onChange={(v) => onUpdateSettings({ noteWidthScale: v })}
            />
            <SliderRow
              label="Chiều cao bàn phím"
              valueText={`${Math.round(settings.pianoHeightRatio * 100)}%`}
              value={settings.pianoHeightRatio}
              min={0.11}
              max={0.22}
              step={0.005}
              onChange={(v) => onUpdateSettings({ pianoHeightRatio: v })}
            />
            <SliderRow
              label="Độ lan sáng trên phím"
              valueText={`${Math.round(settings.keyGlowSpread * 100)}%`}
              value={settings.keyGlowSpread}
              min={0.2}
              max={2.0}
              step={0.05}
              onChange={(v) => onUpdateSettings({ keyGlowSpread: v })}
            />

            <ToggleRow
              label="Hiện tên nốt trên thanh rơi (C#, D...)"
              checked={settings.showNoteLabels}
              onChange={(v) => onUpdateSettings({ showNoteLabels: v })}
            />
            <ToggleRow
              label="Vạch ô nhịp & đường quãng tám"
              checked={settings.showMeasureGrid}
              onChange={(v) => onUpdateSettings({ showMeasureGrid: v })}
            />
            <ToggleRow
              label="Tự nhận diện ký hiệu Hợp âm (B, F, D#...)"
              checked={settings.showChordLabels}
              onChange={(v) => onUpdateSettings({ showChordLabels: v })}
            />
            <ToggleRow
              label="Hiện nhãn quãng C1–C8 trên phím đàn"
              checked={settings.showKeyOctaveLabels}
              onChange={(v) => onUpdateSettings({ showKeyOctaveLabels: v })}
            />

            <SectionTitle>Bàn tay Giả lập Chơi đàn</SectionTitle>
            <ToggleRow
              label="Hiện bàn tay đánh phím (10 ngón)"
              hint="Tự chia ngón hợp âm & vươn phím đen/trắng mượt theo nhạc"
              checked={settings.showHands}
              onChange={(v) => onUpdateSettings({ showHands: v })}
            />
            {settings.showHands && (
              <div className="space-y-2.5 pl-1 border-l-2 border-amber-400/35">
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'realistic', label: 'Thực tế' },
                      { id: 'hologram', label: 'Hologram' },
                      { id: 'neon-wire', label: 'Viền Neon' },
                    ] as Array<{ id: HandStyle; label: string }>
                  ).map((hs) => (
                    <button
                      key={hs.id}
                      type="button"
                      onClick={() => onUpdateSettings({ handStyle: hs.id })}
                      className={`py-1.5 px-1.5 rounded-xl text-[11px] font-semibold border transition cursor-pointer ${
                        settings.handStyle === hs.id
                          ? 'bg-amber-500/25 border-amber-400/50 text-white'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {hs.label}
                    </button>
                  ))}
                </div>
                <SliderRow
                  label="Độ rõ bàn tay"
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

        {/* GLOW & PARTICLES FX TAB */}
        {tab === 'fx' && (
          <div className="space-y-3.5">
            <SectionTitle>Độ sắc nét & HDR Bloom (Không mờ lóa)</SectionTitle>
            <SliderRow
              label="Độ sắc nét khung hình (Sharpness)"
              valueText={`${Math.round(settings.sharpness * 100)}%`}
              value={settings.sharpness}
              min={0}
              max={1.0}
              step={0.05}
              onChange={(v) => onUpdateSettings({ sharpness: v })}
            />
            <SliderRow
              label="Độ rực lõi nốt (Note Luminance)"
              valueText={`${Math.round(settings.noteGlowIntensity * 100)}%`}
              value={settings.noteGlowIntensity}
              min={0}
              max={1.5}
              step={0.05}
              onChange={(v) => onUpdateSettings({ noteGlowIntensity: v })}
            />
            <SliderRow
              label="Cường độ Glow (HDR Bloom)"
              valueText={`${Math.round(settings.bloomIntensity * 100)}%`}
              value={settings.bloomIntensity}
              min={0}
              max={3.0}
              step={0.05}
              onChange={(v) => onUpdateSettings({ bloomIntensity: v })}
            />
            <SliderRow
              label="Bán kính lan tỏa Glow"
              valueText={`${settings.bloomRadius.toFixed(2)}x`}
              value={settings.bloomRadius}
              min={0.4}
              max={2.5}
              step={0.05}
              onChange={(v) => onUpdateSettings({ bloomRadius: v })}
            />
            <SliderRow
              label="Ngưỡng tách sáng (Threshold)"
              valueText={`${Math.round(settings.bloomThreshold * 100)}%`}
              value={settings.bloomThreshold}
              min={0.1}
              max={0.75}
              step={0.02}
              onChange={(v) => onUpdateSettings({ bloomThreshold: v })}
            />
            <SliderRow
              label="Tán sắc Lăng kính (Chromatic)"
              valueText={`${Math.round(settings.chromaticAberration * 100)}%`}
              value={settings.chromaticAberration}
              min={0}
              max={1.0}
              step={0.02}
              onChange={(v) => onUpdateSettings({ chromaticAberration: v })}
            />

            <SectionTitle>Hiệu ứng Viền Phím & Cột Sáng</SectionTitle>
            <ToggleRow
              label="Dải sóng năng lượng Plasma mép phím"
              checked={settings.plasmaEdgeWave}
              onChange={(v) => onUpdateSettings({ plasmaEdgeWave: v })}
            />
            {settings.plasmaEdgeWave && (
              <SliderRow
                label="Cường độ sóng Plasma"
                valueText={`${Math.round(settings.plasmaEdgeIntensity * 100)}%`}
                value={settings.plasmaEdgeIntensity}
                min={0.2}
                max={2.2}
                step={0.05}
                onChange={(v) => onUpdateSettings({ plasmaEdgeIntensity: v })}
              />
            )}
            <ToggleRow
              label="Cột ánh sáng hắt lên (God-Rays)"
              checked={settings.keyLightBeams}
              onChange={(v) => onUpdateSettings({ keyLightBeams: v })}
            />
            {settings.keyLightBeams && (
              <SliderRow
                label="Độ rực cột sáng"
                valueText={`${Math.round(settings.keyBeamIntensity * 100)}%`}
                value={settings.keyBeamIntensity}
                min={0.2}
                max={2.0}
                step={0.05}
                onChange={(v) => onUpdateSettings({ keyBeamIntensity: v })}
              />
            )}

            <SectionTitle>Hệ thống Hạt GPU (Particles)</SectionTitle>
            <ToggleRow
              label="Bật toàn bộ hiệu ứng Hạt"
              checked={settings.particlesEnabled}
              onChange={(v) => onUpdateSettings({ particlesEnabled: v })}
            />
            {settings.particlesEnabled && (
              <div className="space-y-2.5 pl-1 border-l-2 border-violet-500/30">
                <ToggleRow
                  label="Lụa khói Curl-Noise (Embers/SeeMusic)"
                  checked={settings.fluidSilkEnabled}
                  onChange={(v) => onUpdateSettings({ fluidSilkEnabled: v })}
                />
                <ToggleRow
                  label="Tia lửa văng khi chạm phím (Sparks)"
                  checked={settings.sparksEnabled}
                  onChange={(v) => onUpdateSettings({ sparksEnabled: v })}
                />
                <ToggleRow
                  label="Bụi sao bay lơ lửng (Stardust)"
                  checked={settings.stardustEnabled}
                  onChange={(v) => onUpdateSettings({ stardustEnabled: v })}
                />
                <ToggleRow
                  label="Vòng sóng chấn động (Shockwaves)"
                  checked={settings.shockwavesEnabled}
                  onChange={(v) => onUpdateSettings({ shockwavesEnabled: v })}
                />

                <SliderRow
                  label="Mật độ hạt"
                  valueText={`${Math.round(settings.particleDensity * 100)}%`}
                  value={settings.particleDensity}
                  min={0.2}
                  max={2.5}
                  step={0.05}
                  onChange={(v) => onUpdateSettings({ particleDensity: v })}
                />
                <SliderRow
                  label="Độ cuộn xoáy (Turbulence)"
                  valueText={`${settings.particleTurbulence.toFixed(2)}x`}
                  value={settings.particleTurbulence}
                  min={0.2}
                  max={2.5}
                  step={0.05}
                  onChange={(v) => onUpdateSettings({ particleTurbulence: v })}
                />
                <SliderRow
                  label="Tốc độ bay"
                  valueText={`${settings.particleSpeed.toFixed(2)}x`}
                  value={settings.particleSpeed}
                  min={0.4}
                  max={2.2}
                  step={0.05}
                  onChange={(v) => onUpdateSettings({ particleSpeed: v })}
                />
                <SliderRow
                  label="Kích thước hạt"
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
            <SectionTitle>Ảnh nền Custom</SectionTitle>
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
                <span>Chọn ảnh nền từ máy</span>
              </button>
              {settings.customBgUrl && (
                <button
                  type="button"
                  onClick={onClearBackground}
                  className="p-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 border border-rose-400/30 text-rose-300 cursor-pointer"
                  title="Xóa ảnh nền custom"
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
                  <span className="text-[10px] font-medium text-white">Ảnh nền custom đang bật</span>
                </div>
              </div>
            )}

            <SectionTitle>Nền động tích hợp</SectionTitle>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'void', label: 'Obsidian Void' },
                  { id: 'aurora', label: 'Cực Quang Aurora' },
                  { id: 'nebula', label: 'Tinh Vân Nebula' },
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

            <SectionTitle>Tinh chỉnh Ánh sáng & Độ mờ nền</SectionTitle>
            <SliderRow
              label="Độ rõ / Độ mờ nền (Opacity)"
              valueText={`${Math.round(settings.bgOpacity * 100)}%`}
              value={settings.bgOpacity}
              min={0}
              max={1}
              step={0.02}
              onChange={(v) => onUpdateSettings({ bgOpacity: v })}
            />
            <SliderRow
              label="Độ nhòe nền (Blur)"
              valueText={`${settings.bgBlur.toFixed(0)} px`}
              value={settings.bgBlur}
              min={0}
              max={30}
              step={1}
              onChange={(v) => onUpdateSettings({ bgBlur: v })}
            />
            <SliderRow
              label="Độ sáng nền (Brightness)"
              valueText={`${Math.round(settings.bgBrightness * 100)}%`}
              value={settings.bgBrightness}
              min={0.2}
              max={1.8}
              step={0.05}
              onChange={(v) => onUpdateSettings({ bgBrightness: v })}
            />
            <SliderRow
              label="Độ rực màu (Saturation)"
              valueText={`${Math.round(settings.bgSaturation * 100)}%`}
              value={settings.bgSaturation}
              min={0}
              max={2.0}
              step={0.05}
              onChange={(v) => onUpdateSettings({ bgSaturation: v })}
            />
            <SliderRow
              label="Làm tối 4 góc (Vignette)"
              valueText={`${Math.round(settings.bgVignette * 100)}%`}
              value={settings.bgVignette}
              min={0}
              max={1}
              step={0.02}
              onChange={(v) => onUpdateSettings({ bgVignette: v })}
            />
            <SliderRow
              label="Nhịp thở nền theo Bass nhạc"
              valueText={`${Math.round(settings.bgAudioPulse * 100)}%`}
              value={settings.bgAudioPulse}
              min={0}
              max={1.5}
              step={0.05}
              onChange={(v) => onUpdateSettings({ bgAudioPulse: v })}
            />
          </div>
        )}

        {/* AUDIO TAB */}
        {tab === 'audio' && (
          <div className="space-y-3.5">
            <SectionTitle>Nguồn Âm thanh Piano</SectionTitle>
            <div className="space-y-1.5">
              {(
                [
                  {
                    id: 'salamander',
                    title: 'Grand Piano mẫu thật (Salamander)',
                    desc:
                      sampleState === 'ready'
                        ? 'Đã tải đủ bộ mẫu thu Grand Piano'
                        : sampleState === 'loading'
                          ? `Đang tải mẫu thu (${sampleProgress.loaded}/${sampleProgress.total})...`
                          : sampleState === 'fallback'
                            ? 'Không có mạng — tự động dùng Synth dự phòng'
                            : 'Tự động tải nhẹ khi bắt đầu phát nhạc',
                  },
                  {
                    id: 'synth',
                    title: 'Studio Piano Synth (100% Offline)',
                    desc: 'Tổng hợp âm thanh đàn piano đa hài âm + reverb',
                  },
                  {
                    id: 'custom-audio',
                    title: 'File nhạc rời (.mp3 / .wav)',
                    desc: customAudioName
                      ? `Đang dùng: ${customAudioName}`
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
                <span>Nạp file nhạc (.mp3/.wav)</span>
              </button>
              {customAudioName && (
                <button
                  type="button"
                  onClick={onClearCustomAudio}
                  className="p-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/35 text-rose-300 cursor-pointer"
                  title="Gỡ file nhạc rời"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            {settings.audioMode === 'custom-audio' && (
              <SliderRow
                label="Căn chỉnh độ trễ Audio (Offset)"
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
              label="Âm lượng tổng"
              valueText={`${Math.round(settings.masterVolume * 100)}%`}
              value={settings.masterVolume}
              min={0}
              max={1}
              step={0.02}
              onChange={(v) => onUpdateSettings({ masterVolume: v })}
            />
            <SliderRow
              label="Độ vang Phòng hòa nhạc (Hall Reverb)"
              valueText={`${Math.round(settings.reverbMix * 100)}%`}
              value={settings.reverbMix}
              min={0}
              max={1}
              step={0.02}
              onChange={(v) => onUpdateSettings({ reverbMix: v })}
            />
          </div>
        )}

        {/* VIDEO MODE TAB */}
        {tab === 'video' && (
          <div className="space-y-3.5">
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Chế độ quay video sạch 100% — ẩn toàn bộ thanh công cụ và con trỏ chuột. Bạn có thể quay bằng OBS hoặc bấm nút xuất video 60fps có tiếng ngay tại đây.
            </p>

            <SectionTitle>Tỷ lệ Khung hình (Aspect Ratio)</SectionTitle>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'full', label: 'Full Màn hình' },
                  { id: '16:9', label: '16:9 YouTube' },
                  { id: '9:16', label: '9:16 TikTok/Shorts' },
                  { id: '1:1', label: '1:1 Vuông' },
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

            <SectionTitle>Cài đặt Quay trực tiếp 60fps</SectionTitle>
            <SliderRow
              label="Chất lượng Video (Bitrate)"
              valueText={`${settings.recordBitrateMbps} Mbps`}
              value={settings.recordBitrateMbps}
              min={8}
              max={24}
              step={2}
              onChange={(v) => onUpdateSettings({ recordBitrateMbps: v })}
            />
            <ToggleRow
              label="Đếm ngược 3-2-1 trước khi quay"
              hint="Tự ẩn toàn bộ UI trước khung hình đầu tiên"
              checked={settings.recordCountdown}
              onChange={(v) => onUpdateSettings({ recordCountdown: v })}
            />
            <ToggleRow
              label="Tự động tua về đầu bài khi quay"
              checked={settings.recordAutoStart}
              onChange={(v) => onUpdateSettings({ recordAutoStart: v })}
            />
            <ToggleRow
              label="Tự dừng & tải video khi hết bài"
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
                <span>Vào Clean Video Mode (Cho OBS)</span>
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
                <span>{isRecording ? 'Dừng Quay & Lưu Video' : 'Bắt đầu Quay & Xuất Video 60fps'}</span>
              </button>

              <button
                type="button"
                onClick={onTakeSnapshot}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-white/8 hover:bg-white/14 text-slate-200 text-xs font-semibold transition cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Chụp ảnh khung hình hiện tại (PNG)</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};
