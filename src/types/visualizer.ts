export type ViewMode = '2d' | '3d';
export type NoteStyle = 'crystal' | 'neon-hollow' | 'glass-bar' | 'plasma-beam';
export type ColorMode = 'dual-hand' | 'rainbow' | 'velocity' | 'track';
export type BackgroundPreset = 'void' | 'aurora' | 'nebula' | 'midnight-ember' | 'custom';
export type AspectRatioMode = 'full' | '16:9' | '9:16' | '1:1';
export type AudioMode = 'salamander' | 'synth' | 'custom-audio';
export type HandStyle = 'aura' | 'hologram' | 'neon-wire';
export type Language = 'vi' | 'en';
export type PlayMode = 'auto' | 'qwerty' | 'magic-keys';
export type RenderQuality = 'ultra' | 'high' | 'performance';

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
  sharpness: number; // 0..1.0 crisp unsharp clarity
  chromaticAberration: number; // 0..1.0
  keyLightBeams: boolean;
  keyBeamIntensity: number; // 0..1.5
  plasmaEdgeWave: boolean;
  plasmaEdgeIntensity: number; // 0..2.0

  // Phase 2 AAA Concert FX
  eqSpectrumEnabled: boolean;
  eqSpectrumHeight: number; // 0.2..1.5
  mirrorReflectionEnabled: boolean;
  mirrorReflectionIntensity: number; // 0..1.0
  sustainAuraEnabled: boolean;

  // GPU Physics Particles
  particlesEnabled: boolean;
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

  // Custom Background
  backgroundPreset: BackgroundPreset;
  customBgUrl: string | null;
  bgOpacity: number; // 0..1.0
  bgBlur: number; // 0..30 px
  bgBrightness: number; // 0.2..1.8
  bgSaturation: number; // 0..2.0
  bgVignette: number; // 0..1.0
  bgAudioPulse: number; // 0..1.5

  // Audio
  audioMode: AudioMode;
  masterVolume: number; // 0..1.0
  reverbMix: number; // 0..1.0
  customAudioOffsetMs: number; // -2000..2000

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
  chromaticAberration: 0.14,
  keyLightBeams: true,
  keyBeamIntensity: 0.45,
  plasmaEdgeWave: true,
  plasmaEdgeIntensity: 1.15,

  eqSpectrumEnabled: true,
  eqSpectrumHeight: 0.75,
  mirrorReflectionEnabled: true,
  mirrorReflectionIntensity: 0.52,
  sustainAuraEnabled: true,

  particlesEnabled: true,
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
  bgOpacity: 0.68,
  bgBlur: 0,
  bgBrightness: 0.95,
  bgSaturation: 1.18,
  bgVignette: 0.5,
  bgAudioPulse: 0.6,

  audioMode: 'salamander',
  masterVolume: 0.82,
  reverbMix: 0.36,
  customAudioOffsetMs: 0,

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
    subtitle: 'Mặc định: Viền neon cầu vồng tách nốt sắc nét + Bloom 3 tầng & Hạt vật lý',
    subtitleEn: 'Default: Rainbow neon outlines, 3-octave HDR bloom & physics spark trails',
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
      bloomIntensity: 1.52,
      bloomRadius: 1.38,
      bloomThreshold: 0.24,
      sharpness: 0.48,
      chromaticAberration: 0.14,
      keyLightBeams: true,
      keyBeamIntensity: 0.45,
      plasmaEdgeWave: true,
      plasmaEdgeIntensity: 1.15,
      eqSpectrumEnabled: true,
      mirrorReflectionEnabled: true,
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
    id: 'embers-stardust',
    name: 'Embers Stardust',
    subtitle: 'Viên pha lê cắt cạnh tím-vàng + lụa khói Curl-Noise & tia lửa vật lý',
    subtitleEn: 'Cut amber-violet crystal gems with curl-noise silk plumes & plasma edge',
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
      bloomIntensity: 1.58,
      bloomRadius: 1.45,
      bloomThreshold: 0.22,
      sharpness: 0.46,
      chromaticAberration: 0.14,
      keyLightBeams: true,
      keyBeamIntensity: 0.42,
      plasmaEdgeWave: true,
      plasmaEdgeIntensity: 1.18,
      eqSpectrumEnabled: false,
      mirrorReflectionEnabled: true,
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
  {
    id: 'arctic-silk',
    name: 'Arctic Silk',
    subtitle: 'Khói băng xanh huyền ảo + thanh kính 3D phát quang & anamorphic flare',
    subtitleEn: 'Ethereal glacier-blue smoke ribbons, 3D glass bars & concert flares',
    accentFrom: '#38bdf8',
    accentTo: '#fde047',
    patch: {
      viewMode: '2d',
      noteStyle: 'glass-bar',
      colorMode: 'dual-hand',
      leftHandColor: '#38bdf8',
      rightHandColor: '#e9d267',
      noteWidthScale: 0.8,
      noteGlowIntensity: 0.88,
      showNoteLabels: false,
      showMeasureGrid: false,
      showHands: false,
      bloomIntensity: 1.65,
      bloomRadius: 1.55,
      bloomThreshold: 0.22,
      sharpness: 0.48,
      chromaticAberration: 0.16,
      keyLightBeams: true,
      keyBeamIntensity: 0.58,
      plasmaEdgeWave: true,
      plasmaEdgeIntensity: 1.05,
      eqSpectrumEnabled: true,
      mirrorReflectionEnabled: true,
      fluidSilkEnabled: true,
      sparksEnabled: true,
      stardustEnabled: true,
      shockwavesEnabled: true,
      particleDensity: 1.7,
      particleTurbulence: 1.65,
      backgroundPreset: 'void',
      bgOpacity: 0.9,
    },
  },
  {
    id: 'neon-highway-3d',
    name: 'Neon Highway 3D (Dual)',
    subtitle: '3D nghiêng 2 màu Cam-Tím + nốt viền neon tên nốt & nền Cực Quang',
    subtitleEn: 'Tilted 3D amber-violet neon highway with chord badges & aurora sky',
    accentFrom: '#f97316',
    accentTo: '#c084fc',
    patch: {
      viewMode: '3d',
      noteStyle: 'neon-hollow',
      colorMode: 'dual-hand',
      leftHandColor: '#fb923c',
      rightHandColor: '#c084fc',
      noteWidthScale: 0.78,
      noteGlowIntensity: 0.92,
      showNoteLabels: true,
      showMeasureGrid: true,
      showChordLabels: true,
      perspectiveTilt: 0.6,
      showHands: false,
      bloomIntensity: 1.48,
      bloomRadius: 1.35,
      bloomThreshold: 0.24,
      sharpness: 0.52,
      chromaticAberration: 0.12,
      keyLightBeams: true,
      keyBeamIntensity: 0.42,
      plasmaEdgeWave: true,
      plasmaEdgeIntensity: 1.12,
      eqSpectrumEnabled: true,
      mirrorReflectionEnabled: true,
      fluidSilkEnabled: true,
      sparksEnabled: true,
      stardustEnabled: true,
      shockwavesEnabled: true,
      particleDensity: 1.4,
      particleTurbulence: 1.25,
      backgroundPreset: 'aurora',
      bgOpacity: 0.72,
    },
  },
  {
    id: 'cyber-plasma',
    name: 'Cyber Plasma 3D',
    subtitle: 'Tia năng lượng cực đại + Bloom 185% & tia lửa bắn nảy dày đặc',
    subtitleEn: 'High-energy plasma beams, 185% bloom & explosive bouncing spark showers',
    accentFrom: '#06b6d4',
    accentTo: '#f43f5e',
    patch: {
      viewMode: '3d',
      noteStyle: 'plasma-beam',
      colorMode: 'rainbow',
      noteWidthScale: 0.76,
      noteGlowIntensity: 1.15,
      showNoteLabels: false,
      showMeasureGrid: true,
      showChordLabels: true,
      showHands: false,
      bloomIntensity: 1.85,
      bloomRadius: 1.65,
      bloomThreshold: 0.2,
      sharpness: 0.5,
      chromaticAberration: 0.22,
      keyLightBeams: true,
      keyBeamIntensity: 0.6,
      plasmaEdgeWave: true,
      plasmaEdgeIntensity: 1.35,
      eqSpectrumEnabled: true,
      mirrorReflectionEnabled: true,
      fluidSilkEnabled: true,
      sparksEnabled: true,
      stardustEnabled: true,
      shockwavesEnabled: true,
      particleDensity: 1.85,
      particleTurbulence: 1.6,
      backgroundPreset: 'midnight-ember',
      bgOpacity: 0.8,
    },
  },
];
