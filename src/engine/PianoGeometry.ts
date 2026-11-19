export const FIRST_MIDI = 21; // A0
export const LAST_MIDI = 108; // C8
export const TOTAL_KEYS = 88;
export const WHITE_KEY_COUNT = 52;

const BLACK_KEY_PATTERN = new Set([1, 3, 6, 8, 10]); // C#, D#, F#, G#, A#

export function isBlackKey(midi: number): boolean {
  return BLACK_KEY_PATTERN.has(((midi % 12) + 12) % 12);
}

export interface KeyLayout {
  midi: number;
  isBlack: boolean;
  /** Normalized horizontal bounds in [0, 1] across the 88-key keyboard */
  normX: number;
  normWidth: number;
  normCenterX: number;
  whiteIndex: number; // -1 for black keys
}

// Fine-tuned offsets matching real concert grand piano key spacing
const BLACK_OFFSET_RATIO: Record<number, number> = {
  1: -0.07, // C# slightly left of seam
  3: 0.07, // D# slightly right
  6: -0.09, // F# slightly left
  8: 0.0, // G# centered
  10: 0.09, // A# slightly right
};

let cachedLayout: KeyLayout[] | null = null;

export function getPianoLayout(): KeyLayout[] {
  if (cachedLayout) return cachedLayout;

  const whiteW = 1 / WHITE_KEY_COUNT;
  const blackW = whiteW * 0.62;
  const keys: KeyLayout[] = [];
  let whiteIdx = 0;

  for (let midi = FIRST_MIDI; midi <= LAST_MIDI; midi++) {
    const black = isBlackKey(midi);
    if (!black) {
      const normX = whiteIdx * whiteW;
      keys.push({
        midi,
        isBlack: false,
        normX,
        normWidth: whiteW,
        normCenterX: normX + whiteW * 0.5,
        whiteIndex: whiteIdx,
      });
      whiteIdx++;
    } else {
      const pc = ((midi % 12) + 12) % 12;
      const offset = (BLACK_OFFSET_RATIO[pc] ?? 0) * whiteW;
      const seamX = whiteIdx * whiteW;
      const normX = seamX - blackW * 0.5 + offset;
      keys.push({
        midi,
        isBlack: true,
        normX,
        normWidth: blackW,
        normCenterX: normX + blackW * 0.5,
        whiteIndex: -1,
      });
    }
  }

  cachedLayout = keys;
  return keys;
}

export function getKeyLayoutByMidi(midi: number): KeyLayout | undefined {
  if (midi < FIRST_MIDI || midi > LAST_MIDI) return undefined;
  return getPianoLayout()[midi - FIRST_MIDI];
}

export interface ProjectedPoint {
  x: number;
  y: number;
  scale: number;
}

/**
 * Projects a normalized keyboard coordinate `normX` (0..1) and normalized
 * time-above-keyboard `normT` (0 = hit line at keyboard top, 1 = top horizon)
 * into screen pixel coordinates for either 2D or 3D Perspective Highway mode.
 */
export function projectHighwayPoint(
  normX: number,
  normT: number,
  width: number,
  hitLineY: number,
  is3D: boolean,
  perspectiveTilt: number,
  vanishXOffset = 0
): ProjectedPoint {
  if (!is3D) {
    return {
      x: normX * width,
      y: hitLineY * (1 - normT),
      scale: 1,
    };
  }

  // Non-linear projective foreshortening for authentic 3D piano highway look
  // tilt in [0.35..0.82] controls vanishing point strength
  const k = 0.55 + perspectiveTilt * 1.45; // depth compression factor
  const depth = Math.max(-0.15, normT);
  const persp = 1 / (1 + depth * k); // 1 at hit line, shrinks toward horizon
  const topEdgeFactor = 1 / (1 + k);

  // Map persp cleanly so normT=0 -> y=hitLineY and normT=1 -> y=0
  const progressY = (1 - persp) / (1 - topEdgeFactor);
  const y = hitLineY * (1 - progressY);

  // Dynamic camera vanishing-point drift shifts smoothly toward upper horizon while keeping hitLineY locked to keys!
  const centerX = width * (0.5 + vanishXOffset * (1 - persp));
  const x = centerX + (normX - 0.5) * width * persp;

  return { x, y, scale: persp };
}
