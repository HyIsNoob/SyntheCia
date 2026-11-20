import type { ColorMode, MidiNoteEvent, TrackOverride, VisualizerSettings } from '../types/visualizer';

export interface RGB {
  r: number; // 0..255
  g: number; // 0..255
  b: number; // 0..255
}

const TRACK_PALETTE: string[] = [
  '#ff9640', // solar amber
  '#9b6dff', // electric violet
  '#38bdf8', // glacier cyan
  '#f472b6', // neon rose
  '#34d399', // aurora emerald
  '#fbbf24', // champagne gold
  '#fb7185', // coral crimson
  '#a78bfa', // lavender glow
];

const hexCache = new Map<string, RGB>();

export function hexToRgb(hex: string): RGB {
  const cached = hexCache.get(hex);
  if (cached) return cached;

  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
      : clean.padEnd(6, '0');
  const num = parseInt(full.slice(0, 6), 16);
  const rgb: RGB = {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
  hexCache.set(hex, rgb);
  return rgb;
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;

  if (hue < 60) {
    r1 = c;
    g1 = x;
  } else if (hue < 120) {
    r1 = x;
    g1 = c;
  } else if (hue < 180) {
    g1 = c;
    b1 = x;
  } else if (hue < 240) {
    g1 = x;
    b1 = c;
  } else if (hue < 300) {
    r1 = x;
    b1 = c;
  } else {
    r1 = c;
    b1 = x;
  }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

export function rgbToCss(rgb: RGB, alpha = 1): string {
  if (alpha >= 0.999) return `rgb(${rgb.r},${rgb.g},${rgb.b})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha.toFixed(3)})`;
}

export function lightenRgb(rgb: RGB, amount: number): RGB {
  const a = Math.max(0, Math.min(1, amount));
  return {
    r: Math.round(rgb.r + (255 - rgb.r) * a),
    g: Math.round(rgb.g + (255 - rgb.g) * a),
    b: Math.round(rgb.b + (255 - rgb.b) * a),
  };
}

export function resolveNoteColor(
  note: Pick<MidiNoteEvent, 'midi' | 'hand' | 'velocity' | 'trackIndex'> & { start?: number },
  settings: Pick<VisualizerSettings, 'colorMode' | 'leftHandColor' | 'rightHandColor'> & {
    rgbFlowEnabled?: boolean;
    rgbFlowSpeed?: number;
  },
  trackOverrides?: Readonly<Record<number, TrackOverride>>,
  rgbHueShiftDeg = 0
): RGB {
  const override = trackOverrides?.[note.trackIndex];
  if (override?.color) {
    return hexToRgb(override.color);
  }
  const effectiveHand = override?.hand ?? note.hand;
  const mode: ColorMode = settings.colorMode;
  if (mode === 'dual-hand') {
    return hexToRgb(effectiveHand === 'left' ? settings.leftHandColor : settings.rightHandColor);
  }
  if (mode === 'rgb-wave') {
    // Liquid traveling RGB Prism Aurora flowing smoothly across pitch AND time!
    const t = Math.max(0, Math.min(1, (note.midi - 21) / 87));
    const timeWave = (note.start ?? 0) * 38;
    const hue = (190 + t * 320 + rgbHueShiftDeg + timeWave) % 360;
    return hslToRgb(hue, 0.98, 0.6);
  }
  if (mode === 'rainbow') {
    // AAA Neon Rainbow Spectrum across the 88-key range (optionally flows softly when rgbFlowEnabled!)
    const t = Math.max(0, Math.min(1, (note.midi - 21) / 87));
    const shift = settings.rgbFlowEnabled ? rgbHueShiftDeg * 0.45 : 0;
    const hue = (195 + t * 285 + shift) % 360;
    return hslToRgb(hue, 0.96, 0.6);
  }
  if (mode === 'velocity') {
    // Cool sapphire -> neon violet -> fiery solar gold/white-hot
    const v = Math.max(0, Math.min(1, note.velocity));
    const hue = 235 - v * 205; // 235 (blue) -> 30 (gold/orange)
    return hslToRgb(hue, 0.94, 0.56 + v * 0.12);
  }
  // 'track'
  const hex = TRACK_PALETTE[note.trackIndex % TRACK_PALETTE.length];
  return hexToRgb(hex);
}
