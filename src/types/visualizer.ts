export type ViewMode = '2d' | '3d';
export type NoteStyle = 'crystal' | 'neon-hollow' | 'glass-bar' | 'plasma-beam';
export type ColorMode = 'dual-hand' | 'rainbow' | 'velocity' | 'track';
export type BackgroundPreset = 'void' | 'aurora' | 'nebula' | 'midnight-ember' | 'custom' | 'video';
export type AspectRatioMode = 'full' | '16:9' | '9:16' | '1:1';
export type AudioMode = 'salamander' | 'synth' | 'custom-audio';
export type InstrumentPreset = 'grand' | 'felt' | 'rhodes' | 'musicbox' | 'strings';
export type HandStyle = 'aura' | 'hologram' | 'neon-wire';
export type Language = 'vi' | 'en';
export type PlayMode = 'auto' | 'qwerty' | 'magic-keys' | 'practice';
export type PracticeHand = 'both' | 'right' | 'left';
export type RenderQuality = 'ultra' | 'high' | 'performance';
export type ParticleTheme = 'cosmic' | 'fire' | 'sakura' | 'frost';
export type CustomVideoMode = 'backdrop' | 'overhead-hands';
export type TranscriptionSensitivity = 'melodic' | 'balanced' | 'polyphonic';

export interface LyricLine {
  time: number; // seconds
  endTime: number; // seconds
  text: string;
}

export interface RhythmFeedback {
  rating: 'PERFECT' | 'GREAT' | 'GOOD';
  combo: number;
  maxCombo: number;
  accuracy: number; // 0..100
  hits: number;
  timestamp: number;
}

export interface MidiTrackInfo {
  trackIndex: number;
  name: string;
  noteCount: number;
  defaultHand: 'left' | 'right';
  defaultColor: string;
}

export interface TrackOverride {
  muted?: boolean;
  hidden?: boolean;
  color?: string;
  hand?: 'left' | 'right';
}

export interface MidiNoteEvent {
  id: number;
  midi: number; // 21..108 for 88-key piano
  name: string; // e.g., "C#4"
  pitchClass: string; // e.g., "C#"
  start: number; // seconds
  duration: number; // seconds
  end: number; // seconds
  velocity: number; // 0..1
  trackIndex: number;
  hand: 'left' | 'right';
}

export interface SustainInterval {
  start: number;
  end: number;
}

export interface MeasureMarker {
  measureNumber: number;
  time: number; // seconds
  chordLabel: string | null; // e.g., "B", "F", "D#m"
}

export interface ParsedMidi {
  name: string;
  duration: number;
  maxNoteDuration: number; // enables O(log N + visible) binary-search windowing
  bpm: number;
  timeSignature: [number, number];
  trackCount: number;
  tracks: MidiTrackInfo[];
  notes: MidiNoteEvent[];
  sustainIntervals: SustainInterval[];
  measures: MeasureMarker[];
}

export interface VisualizerSettings {
  // Language & UI
  language: Language;
  showPerfStats: boolean;
  renderQuality: RenderQuality;

  // View & Notes
  viewMode: ViewMode;
  noteStyle: NoteStyle;
  colorMode: ColorMode;
  leftHandColor: string;
  rightHandColor: string;
  noteSpeed: number; // seconds visible on screen (smaller = faster fall), 1.2..5.0
  noteWidthScale: number; // 0.6..1.0
  noteGlowIntensity: number; // 0..1.5 crisp local note luminance/glow
  showNoteLabels: boolean;
  showMeasureGrid: boolean;
  showChordLabels: boolean;
  perspectiveTilt: number; // 0.35..0.82 for 3D mode

  // Optional Energy Finger Guide (off by default for clean AAA visuals)
  showHands: boolean;
  handStyle: HandStyle;
  handOpacity: number; // 0.2..1.0

  // Glow & AAA Optical HDR Bloom
  bloomIntensity: number; // 0..3.0 (0% - 300%)
  bloomRadius: number; // 0.4..2.5
  bloomThreshold: number; // 0.1..0.75
  sharpness: number; // 0..1.0 crisp clarity
  chromaticAberration: number; // 0..1.0
  keyLightBeams: boolean;
  keyBeamIntensity: number; // 0..1.5
  plasmaEdgeWave: boolean;
  plasmaEdgeIntensity: number; // 0..2.0

  // Concert Stage FX
  eqSpectrumEnabled: boolean;
  eqSpectrumHeight: number; // 0.2..1.5
  mirrorReflectionEnabled: boolean;
  mirrorReflectionIntensity: number; // 0..1.0
  sustainAuraEnabled: boolean;
  electricArcsEnabled: boolean;
  cameraPunchIntensity: number; // 0..1.0 subtle fortissimo bass impact zoom
  dynamicCameraEnabled: boolean; // smooth 3D vanishing-point camera drift following harmony
  showLyrics: boolean; // render loaded .lrc / .srt lyrics cleanly on canvas

  // GPU Physics Particles
  particlesEnabled: boolean;
  particleTheme: ParticleTheme;
  fluidSilkEnabled: boolean;
  sparksEnabled: boolean;
  stardustEnabled: boolean;
  shockwavesEnabled: boolean;
  particleDensity: number; // 0.2..2.5
  particleTurbulence: number; // 0.2..2.5
  particleSpeed: number; // 0.4..2.2
  particleSize: number; // 0.5..2.2

  // Piano Keyboard
  pianoHeightRatio: number; // 0.11..0.22
  keyGlowSpread: number; // 0.2..2.0
  showKeyOctaveLabels: boolean;

  // Custom Backdrop (Image & Video / Overhead Real-Hands Overlay)
  backgroundPreset: BackgroundPreset;
  customBgUrl: string | null;
  customVideoUrl: string | null;
  customVideoMode: CustomVideoMode;
  customVideoOffsetMs: number; // -3000..3000 sync with MIDI
  customVideoY: number; // -0.4..0.4 vertical alignment for overhead hands
  customVideoScale: number; // 0.6..2.0 zoom for overhead hands
  customVideoFeather: number; // 0..1.0 soft gradient blend mask at top edge
  customVideoOpacity: number; // 0..1.0
  hideSyntheticKeyboard: boolean; // let real filmed piano keys show cleanly underneath
  bgOpacity: number; // 0..1.0
  bgBlur: number; // 0..30 px
  bgBrightness: number; // 0.2..1.8
  bgSaturation: number; // 0..2.0
  bgVignette: number; // 0..1.0
  bgAudioPulse: number; // 0..1.5

  // Cinematic Title Intro Card & Channel Watermark (Rendered Directly on Canvas!)
  showIntroTitle: boolean;
  introTitle: string; // empty = auto-use loaded MIDI song name
  introSubtitle: string;
  introDurationSec: number; // 2..12s fade out
  introAlwaysShow: boolean;
  watermarkText: string;
  watermarkOpacity: number; // 0.1..1.0

  // Audio, Studio Instruments & Interactive Modes
  audioMode: AudioMode;
  instrument: InstrumentPreset;
  transposeSemitones: number; // -12..12
  metronomeEnabled: boolean;
  masterVolume: number; // 0..1.0
  reverbMix: number; // 0..1.0
  customAudioOffsetMs: number; // -2000..2000
  magicSmoothness: number; // 0.2..1.0 adaptive rubato flow smoothness
  magicChordWindowMs: number; // 25..110ms chord grouping window
  practiceHand: PracticeHand;
  showRhythmHud: boolean;
  transcriptionSensitivity: TranscriptionSensitivity;
  filterDrums: boolean; // HPSS percussive suppression in Audio -> MIDI

  // Video & Clean Mode
  aspectRatio: AspectRatioMode;
  recordAutoStart: boolean;
  recordAutoStop: boolean;
  recordCountdown: boolean;
  recordBitrateMbps: number; // 8..24
}

export interface VisualPreset {
  id: string;
  name: string;
  subtitle: string;
  subtitleEn: string;
  accentFrom: string;
  accentTo: string;
  patch: Partial<VisualizerSettings>;
}

export const DEFAULT_SETTINGS: VisualizerSettings = {
  language: 'en',
  showPerfStats: false,
  renderQuality: 'ultra',

  viewMode: '3d',
  noteStyle: 'neon-hollow',
  colorMode: 'rainbow',
  leftHandColor: '#ff9640',
  rightHandColor: '#9b6dff',
  noteSpeed: 2.5,
  noteWidthScale: 0.78,
  noteGlowIntensity: 0.92,
  showNoteLabels: true,
  showMeasureGrid: true,
  showChordLabels: true,
  perspectiveTilt: 0.58,

  showHands: false,
  handStyle: 'aura',
  handOpacity: 0.8,

  bloomIntensity: 1.42,
  bloomRadius: 1.32,
  bloomThreshold: 0.25,
  sharpness: 0.15,
  chromaticAberration: 0.12,
  keyLightBeams: true,
  keyBeamIntensity: 0.45,
  plasmaEdgeWave: true,
  plasmaEdgeIntensity: 1.15,

  eqSpectrumEnabled: true,
  eqSpectrumHeight: 0.75,
  mirrorReflectionEnabled: true,
  mirrorReflectionIntensity: 0.52,
  sustainAuraEnabled: true,
  electricArcsEnabled: false,
  cameraPunchIntensity: 0,
  dynamicCameraEnabled: false,
  showLyrics: true,

  particlesEnabled: true,
  particleTheme: 'cosmic',
  fluidSilkEnabled: true,
  sparksEnabled: true,
  stardustEnabled: true,
  shockwavesEnabled: true,
  particleDensity: 1.45,
  particleTurbulence: 1.4,
  particleSpeed: 1.1,
  particleSize: 1.0,

  pianoHeightRatio: 0.16,
  keyGlowSpread: 1.05,
  showKeyOctaveLabels: false,

  backgroundPreset: 'nebula',
  customBgUrl: null,
  customVideoUrl: null,
  customVideoMode: 'backdrop',
  customVideoOffsetMs: 0,
  customVideoY: 0,
  customVideoScale: 1.0,
  customVideoFeather: 0.35,
  customVideoOpacity: 0.85,
  hideSyntheticKeyboard: false,
  bgOpacity: 0.68,
  bgBlur: 0,
  bgBrightness: 0.95,
  bgSaturation: 1.18,
  bgVignette: 0.5,
  bgAudioPulse: 0.6,

  showIntroTitle: false,
  introTitle: '',
  introSubtitle: 'Performed on SyntheCia Studio',
  introDurationSec: 5.5,
  introAlwaysShow: false,
  watermarkText: '',
  watermarkOpacity: 0.55,

  audioMode: 'salamander',
  instrument: 'grand',
  transposeSemitones: 0,
  metronomeEnabled: false,
  masterVolume: 0.82,
  reverbMix: 0.36,
  customAudioOffsetMs: 0,
  magicSmoothness: 0.82,
  magicChordWindowMs: 55,
  practiceHand: 'both',
  showRhythmHud: true,
  transcriptionSensitivity: 'balanced',
  filterDrums: true,

  aspectRatio: 'full',
  recordAutoStart: true,
  recordAutoStop: true,
  recordCountdown: true,
  recordBitrateMbps: 16,
};

export const VISUAL_PRESETS: VisualPreset[] = [
  {
    id: 'rainbow-neon-3d',
    name: 'Rainbow Neon 3D (AAA)',
    subtitle: 'Mặc định: Viền neon cầu vồng + Tia sét hợp âm, Bloom 3 tầng & Hạt vật lý',
    subtitleEn: 'Default: Rainbow neon outlines, chord lightning arcs & 3-octave HDR bloom',
    accentFrom: '#38bdf8',
    accentTo: '#fb923c',
    patch: {
      viewMode: '3d',
      noteStyle: 'neon-hollow',
      colorMode: 'rainbow',
      noteWidthScale: 0.78,
      noteGlowIntensity: 0.92,
      showNoteLabels: true,
      showMeasureGrid: true,
      showChordLabels: true,
      perspectiveTilt: 0.58,
      showHands: false,
      bloomIntensity: 1.42,
      bloomRadius: 1.32,
      bloomThreshold: 0.25,
      sharpness: 0.15,
      chromaticAberration: 0.12,
      keyLightBeams: true,
      keyBeamIntensity: 0.45,
      plasmaEdgeWave: true,
      plasmaEdgeIntensity: 1.15,
      eqSpectrumEnabled: true,
      mirrorReflectionEnabled: true,
      electricArcsEnabled: false,
      cameraPunchIntensity: 0,
      particleTheme: 'cosmic',
      fluidSilkEnabled: true,
      sparksEnabled: true,
      stardustEnabled: true,
      shockwavesEnabled: true,
      particleDensity: 1.45,
      particleTurbulence: 1.4,
      backgroundPreset: 'nebula',
      bgOpacity: 0.68,
    },
  },
  {
    id: 'sakura-nocturne',
    name: 'Sakura Nocturne 3D',
    subtitle: 'Cánh hoa anh đào phát sáng rơi xoay theo gió + nốt kính hồng-tím thơ mộng',
    subtitleEn: 'Luminous drifting cherry blossom petals, rose-violet notes & moonlit sky',
    accentFrom: '#f472b6',
    accentTo: '#c084fc',
    patch: {
      viewMode: '3d',
      noteStyle: 'neon-hollow',
      colorMode: 'dual-hand',
      leftHandColor: '#c084fc',
      rightHandColor: '#f9a8d4',
      noteWidthScale: 0.78,
      noteGlowIntensity: 0.95,
      showNoteLabels: true,
      showMeasureGrid: true,
      showChordLabels: true,
      showHands: false,
      bloomIntensity: 1.48,
      bloomRadius: 1.45,
      bloomThreshold: 0.24,
      chromaticAberration: 0.1,
      keyLightBeams: true,
      keyBeamIntensity: 0.38,
      plasmaEdgeWave: true,
      plasmaEdgeIntensity: 1.05,
      eqSpectrumEnabled: true,
      mirrorReflectionEnabled: true,
      electricArcsEnabled: false,
      cameraPunchIntensity: 0.18,
      particleTheme: 'sakura',
      fluidSilkEnabled: true,
      sparksEnabled: true,
      stardustEnabled: true,
      shockwavesEnabled: true,
      particleDensity: 1.55,
      particleTurbulence: 1.25,
      backgroundPreset: 'midnight-ember',
      bgOpacity: 0.75,
    },
  },
  {
    id: 'inferno-lightning',
    name: 'Inferno & Lightning',
    subtitle: 'Ngọn lửa nhiệt độ thực + tia sét nối hợp âm & rung bass điện ảnh',
    subtitleEn: 'Volcanic blackbody fire embers, electric chord lightning & bass punch',
    accentFrom: '#f97316',
    accentTo: '#ef4444',
    patch: {
      viewMode: '2d',
      noteStyle: 'crystal',
      colorMode: 'dual-hand',
      leftHandColor: '#ef4444',
      rightHandColor: '#fbbf24',
      noteWidthScale: 0.8,
      noteGlowIntensity: 1.05,
      showNoteLabels: false,
      showMeasureGrid: false,
      showHands: false,
      bloomIntensity: 1.65,
      bloomRadius: 1.5,
      bloomThreshold: 0.22,
      chromaticAberration: 0.18,
      keyLightBeams: true,
      keyBeamIntensity: 0.55,
      plasmaEdgeWave: true,
      plasmaEdgeIntensity: 1.4,
      eqSpectrumEnabled: true,
      mirrorReflectionEnabled: true,
      electricArcsEnabled: true,
      cameraPunchIntensity: 0.45,
      particleTheme: 'fire',
      fluidSilkEnabled: true,
      sparksEnabled: true,
      stardustEnabled: true,
      shockwavesEnabled: true,
      particleDensity: 1.75,
      particleTurbulence: 1.65,
      backgroundPreset: 'void',
      bgOpacity: 0.88,
    },
  },
  {
    id: 'glacier-frost',
    name: 'Glacier Frost',
    subtitle: 'Tinh thể băng 6 cánh & khói xanh băng giá trên nền cực quang Bắc Cực',
    subtitleEn: 'Crystalline 6-point ice shards, arctic mist & northern aurora sky',
    accentFrom: '#38bdf8',
    accentTo: '#a5f3fc',
    patch: {
      viewMode: '2d',
      noteStyle: 'glass-bar',
      colorMode: 'dual-hand',
      leftHandColor: '#38bdf8',
      rightHandColor: '#e0f2fe',
      noteWidthScale: 0.8,
      noteGlowIntensity: 0.9,
      showNoteLabels: false,
      showMeasureGrid: false,
      showHands: false,
      bloomIntensity: 1.55,
      bloomRadius: 1.45,
      bloomThreshold: 0.24,
      chromaticAberration: 0.14,
      keyLightBeams: true,
      keyBeamIntensity: 0.52,
      plasmaEdgeWave: true,
      plasmaEdgeIntensity: 1.05,
      eqSpectrumEnabled: true,
      mirrorReflectionEnabled: true,
      electricArcsEnabled: true,
      cameraPunchIntensity: 0.2,
      particleTheme: 'frost',
      fluidSilkEnabled: true,
      sparksEnabled: true,
      stardustEnabled: true,
      shockwavesEnabled: true,
      particleDensity: 1.6,
      particleTurbulence: 1.35,
      backgroundPreset: 'aurora',
      bgOpacity: 0.78,
    },
  },
  {
    id: 'embers-stardust',
    name: 'Embers Stardust',
    subtitle: 'Viên pha lê cắt cạnh tím-vàng cổ điển + lụa khói Curl-Noise & tia lửa',
    subtitleEn: 'Classic amber-violet cut crystal gems with curl-noise silk plumes',
    accentFrom: '#ff9640',
    accentTo: '#9b6dff',
    patch: {
      viewMode: '2d',
      noteStyle: 'crystal',
      colorMode: 'dual-hand',
      leftHandColor: '#ff9640',
      rightHandColor: '#9b6dff',
      noteWidthScale: 0.8,
      noteGlowIntensity: 0.9,
      showNoteLabels: false,
      showMeasureGrid: false,
      showHands: false,
      bloomIntensity: 1.5,
      bloomRadius: 1.4,
      bloomThreshold: 0.24,
      chromaticAberration: 0.14,
      keyLightBeams: true,
      keyBeamIntensity: 0.42,
      plasmaEdgeWave: true,
      plasmaEdgeIntensity: 1.18,
      eqSpectrumEnabled: false,
      mirrorReflectionEnabled: true,
      electricArcsEnabled: false,
      cameraPunchIntensity: 0.2,
      particleTheme: 'cosmic',
      fluidSilkEnabled: true,
      sparksEnabled: true,
      stardustEnabled: true,
      shockwavesEnabled: true,
      particleDensity: 1.55,
      particleTurbulence: 1.5,
      backgroundPreset: 'void',
      bgOpacity: 0.85,
    },
  },
];
