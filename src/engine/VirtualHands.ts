import type { HandStyle, MidiNoteEvent, ParsedMidi } from '../types/visualizer';
import { lightenRgb, rgbToCss, type RGB } from './ColorUtils';
import { getKeyLayoutByMidi, WHITE_KEY_COUNT } from './PianoGeometry';

export interface FingerKinematics {
  /** Normalized X along the 88-key keyboard (0..1) */
  tipX: number;
  /** Target Y offset within piano keyboard height (0 = top hinge, 1 = bottom key edge) */
  tipYRatio: number;
  /** 0 = resting hovered above key, 1 = fully pressing key */
  press: number;
  /** Currently assigned MIDI key (or null if resting) */
  targetMidi: number | null;
  /** Active glow tint reflected from pressed key */
  glowColor: RGB;
  glowIntensity: number;
}

export interface HandState {
  side: 'left' | 'right';
  palmX: number; // normalized 0..1 across keyboard
  palmYRatio: number; // relative to pianoHeight (e.g., 1.12 = wrist below keyboard edge)
  tiltRad: number; // slight wrist rotation
  presence: number; // 0..1 smooth fade-in when hand has notes
  fingers: FingerKinematics[]; // 5 fingers, ordered left-to-right on screen!
}

// Anatomical finger proportions ordered left-to-right on screen:
// Left hand (screen left->right): Pinky(0), Ring(1), Middle(2), Index(3), Thumb(4)
// Right hand (screen left->right): Thumb(0), Index(1), Middle(2), Ring(3), Pinky(4)
const LEFT_FINGER_OFFSETS_WK = [-2.05, -1.02, 0.0, 1.02, 2.2];
const RIGHT_FINGER_OFFSETS_WK = [-2.2, -1.02, 0.0, 1.02, 2.05];

const LEFT_FINGER_LEN = [0.74, 0.94, 1.0, 0.92, 0.62];
const RIGHT_FINGER_LEN = [0.62, 0.92, 1.0, 0.94, 0.74];

const LEFT_FINGER_WIDTH = [0.46, 0.51, 0.55, 0.52, 0.62]; // in white-key widths
const RIGHT_FINGER_WIDTH = [0.62, 0.52, 0.55, 0.51, 0.46];

const WHITE_KEY_NORM = 1 / WHITE_KEY_COUNT;
const MAX_HUMAN_SPAN_SEMITONES = 13; // realistic concert pianist hand span (~octave + 1)

export interface ActiveHandNote {
  midi: number;
  start: number;
  isBlack: boolean;
  normCenterX: number;
  velocity: number;
  color: RGB;
  isPressed: boolean;
}

/**
 * Filters a hand's sounding/upcoming notes down to a physically playable human hand cluster
 * (<= 13 semitones span), prioritizing the most recently struck notes (older bass notes
 * outside hand span are naturally held by the sustain pedal!).
 */
export function selectPlayableCluster(notes: ActiveHandNote[]): ActiveHandNote[] {
  if (notes.length <= 1) return notes;

  // Deduplicate by midi, keeping pressed & latest start
  const byMidi = new Map<number, ActiveHandNote>();
  for (const n of notes) {
    const prev = byMidi.get(n.midi);
    if (!prev || (n.isPressed && !prev.isPressed) || n.start > prev.start) {
      byMidi.set(n.midi, n);
    }
  }

  const list = Array.from(byMidi.values());
  // Anchor on the most recently triggered note (pressed first, then latest start time)
  list.sort((a, b) => {
    if (a.isPressed !== b.isPressed) return a.isPressed ? -1 : 1;
    return b.start - a.start;
  });

  const anchor = list[0];
  let minMidi = anchor.midi;
  let maxMidi = anchor.midi;
  const cluster: ActiveHandNote[] = [anchor];

  for (let i = 1; i < list.length; i++) {
    const cand = list[i];
    const nextMin = Math.min(minMidi, cand.midi);
    const nextMax = Math.max(maxMidi, cand.midi);
    if (nextMax - nextMin <= MAX_HUMAN_SPAN_SEMITONES) {
      cluster.push(cand);
      minMidi = nextMin;
      maxMidi = nextMax;
    }
  }

  return cluster;
}

/**
 * Ergonomically maps up to 5 playable notes (sorted low -> high pitch) to the 5 fingers
 * (ordered left -> right on screen) of a single pianist hand.
 */
export function assignNotesToFingers(
  side: 'left' | 'right',
  notes: ActiveHandNote[]
): Array<ActiveHandNote | null> {
  const slots: Array<ActiveHandNote | null> = [null, null, null, null, null];
  if (notes.length === 0) return slots;

  const cluster = selectPlayableCluster(notes);
  const sorted = [...cluster].sort((a, b) => a.midi - b.midi);

  const picked: ActiveHandNote[] =
    sorted.length <= 5
      ? sorted
      : [
          sorted[0],
          sorted[Math.floor(sorted.length * 0.28)],
          sorted[Math.floor(sorted.length * 0.52)],
          sorted[Math.floor(sorted.length * 0.76)],
          sorted[sorted.length - 1],
        ];

  if (picked.length === 1) {
    const idx = side === 'left' ? 2 : 1;
    slots[idx] = picked[0];
    return slots;
  }

  if (picked.length === 2) {
    const spanSemis = picked[1].midi - picked[0].midi;
    if (spanSemis >= 9) {
      slots[0] = picked[0];
      slots[4] = picked[1];
    } else if (spanSemis >= 5) {
      if (side === 'left') {
        slots[1] = picked[0];
        slots[4] = picked[1];
      } else {
        slots[0] = picked[0];
        slots[3] = picked[1];
      }
    } else {
      if (side === 'left') {
        slots[2] = picked[0];
        slots[3] = picked[1];
      } else {
        slots[1] = picked[0];
        slots[2] = picked[1];
      }
    }
    return slots;
  }

  if (picked.length === 3) {
    const spanSemis = picked[2].midi - picked[0].midi;
    if (spanSemis >= 8) {
      slots[0] = picked[0];
      slots[2] = picked[1];
      slots[4] = picked[2];
    } else if (side === 'left') {
      slots[1] = picked[0];
      slots[2] = picked[1];
      slots[4] = picked[2];
    } else {
      slots[0] = picked[0];
      slots[2] = picked[1];
      slots[3] = picked[2];
    }
    return slots;
  }

  if (picked.length === 4) {
    if (side === 'left') {
      slots[0] = picked[0];
      slots[1] = picked[1];
      slots[2] = picked[2];
      slots[4] = picked[3];
    } else {
      slots[0] = picked[0];
      slots[1] = picked[1];
      slots[3] = picked[2];
      slots[4] = picked[3];
    }
    return slots;
  }

  for (let i = 0; i < 5; i++) slots[i] = picked[i];
  return slots;
}

function createInitialHand(side: 'left' | 'right', defaultNormX: number): HandState {
  const offsets = side === 'left' ? LEFT_FINGER_OFFSETS_WK : RIGHT_FINGER_OFFSETS_WK;
  return {
    side,
    palmX: defaultNormX,
    palmYRatio: 1.14,
    tiltRad: 0,
    presence: 0.72,
    fingers: offsets.map((off) => ({
      tipX: defaultNormX + off * WHITE_KEY_NORM,
      tipYRatio: 0.65,
      press: 0,
      targetMidi: null,
      glowColor: side === 'left' ? { r: 255, g: 150, b: 64 } : { r: 155, g: 109, b: 255 },
      glowIntensity: 0,
    })),
  };
}

export class VirtualHandsController {
  public readonly left: HandState;
  public readonly right: HandState;

  constructor() {
    this.left = createInitialHand('left', 0.34);
    this.right = createInitialHand('right', 0.62);
  }

  public reset(): void {
    Object.assign(this.left, createInitialHand('left', 0.34));
    Object.assign(this.right, createInitialHand('right', 0.62));
  }

  public update(
    midi: ParsedMidi | null,
    currentTime: number,
    dt: number,
    colorResolver: (n: Pick<MidiNoteEvent, 'midi' | 'hand' | 'velocity' | 'trackIndex'>) => RGB,
    manualPressedNotes: ReadonlyMap<number, number>
  ): void {
    const leftNotes: ActiveHandNote[] = [];
    const rightNotes: ActiveHandNote[] = [];

    const lookaheadSec = 0.35;

    if (midi) {
      for (let i = 0; i < midi.notes.length; i++) {
        const n = midi.notes[i];
        if (n.start > currentTime + lookaheadSec) break;
        if (n.end < currentTime - 0.02) continue;

        const key = getKeyLayoutByMidi(n.midi);
        if (!key) continue;

        const isPressed = currentTime >= n.start && currentTime <= n.end;
        const item: ActiveHandNote = {
          midi: n.midi,
          start: n.start,
          isBlack: key.isBlack,
          normCenterX: key.normCenterX,
          velocity: n.velocity,
          color: colorResolver(n),
          isPressed,
        };
        if (n.hand === 'left') leftNotes.push(item);
        else rightNotes.push(item);
      }
    }

    for (const [m, vel] of manualPressedNotes.entries()) {
      const key = getKeyLayoutByMidi(m);
      if (!key) continue;
      const hand: 'left' | 'right' = m < 60 ? 'left' : 'right';
      const item: ActiveHandNote = {
        midi: m,
        start: currentTime,
        isBlack: key.isBlack,
        normCenterX: key.normCenterX,
        velocity: vel,
        color: colorResolver({ midi: m, hand, velocity: vel, trackIndex: hand === 'left' ? 0 : 1 }),
        isPressed: true,
      };
      if (hand === 'left') leftNotes.push(item);
      else rightNotes.push(item);
    }

    this.stepHand(this.left, leftNotes, dt);
    this.stepHand(this.right, rightNotes, dt);

    // Keep hands neatly separated if both visit middle C
    const minSeparation = WHITE_KEY_NORM * 4.8;
    if (this.right.palmX - this.left.palmX < minSeparation) {
      const mid = (this.left.palmX + this.right.palmX) * 0.5;
      this.left.palmX = mid - minSeparation * 0.5;
      this.right.palmX = mid + minSeparation * 0.5;
    }
  }

  private stepHand(hand: HandState, notes: ActiveHandNote[], dt: number): void {
    const offsets = hand.side === 'left' ? LEFT_FINGER_OFFSETS_WK : RIGHT_FINGER_OFFSETS_WK;
    const lengths = hand.side === 'left' ? LEFT_FINGER_LEN : RIGHT_FINGER_LEN;

    const pressedOnly = notes.filter((n) => n.isPressed);
    const activePool = pressedOnly.length > 0 ? pressedOnly : notes;
    const assigned = assignNotesToFingers(hand.side, activePool);

    let targetPalmX = hand.palmX;
    let targetPalmY = 1.13;
    let targetTilt = 0;

    let count = 0;
    let sumX = 0;
    let blackCount = 0;

    for (let f = 0; f < 5; f++) {
      const a = assigned[f];
      if (!a) continue;
      sumX += a.normCenterX - offsets[f] * WHITE_KEY_NORM * 0.78;
      count++;
      if (a.isBlack) blackCount++;
    }

    if (count > 0) {
      targetPalmX = Math.max(0.06, Math.min(0.94, sumX / count));
      const blackRatio = blackCount / count;
      targetPalmY = 1.11 - blackRatio * 0.16;
      const centerBias = hand.side === 'left' ? targetPalmX - 0.35 : targetPalmX - 0.65;
      targetTilt = Math.max(-0.16, Math.min(0.16, centerBias * 0.35));
      hand.presence += (1 - hand.presence) * Math.min(1, dt * 7.0);
    } else {
      targetPalmY = 1.24;
      hand.presence += (0.55 - hand.presence) * Math.min(1, dt * 2.4);
    }

    // Fast, responsive palm glide so fingers never lag far behind their wrist
    const palmLerp = 1 - Math.exp(-dt * 17.5);
    hand.palmX += (targetPalmX - hand.palmX) * palmLerp;
    hand.palmYRatio += (targetPalmY - hand.palmYRatio) * (1 - Math.exp(-dt * 11));
    hand.tiltRad += (targetTilt - hand.tiltRad) * (1 - Math.exp(-dt * 9));

    const fingerLerp = 1 - Math.exp(-dt * 24);
    const pressAttack = 1 - Math.exp(-dt * 36);
    const pressRelease = 1 - Math.exp(-dt * 15);

    for (let f = 0; f < 5; f++) {
      const fg = hand.fingers[f];
      const assignedNote = assigned[f];
      const isThumb = (hand.side === 'left' && f === 4) || (hand.side === 'right' && f === 0);

      // Strict anatomical lateral limit relative to palm center (prevents rubber-finger stretch!)
      const naturalX = hand.palmX + offsets[f] * WHITE_KEY_NORM;
      const maxLateralOffset = (isThumb ? 2.1 : 1.75) * WHITE_KEY_NORM;

      if (assignedNote) {
        const clampedX = Math.max(
          naturalX - maxLateralOffset,
          Math.min(naturalX + maxLateralOffset, assignedNote.normCenterX)
        );
        const tgtY = assignedNote.isBlack
          ? 0.44
          : isThumb
            ? 0.8
            : 0.66 - (lengths[f] - 0.86) * 0.2;

        fg.tipX += (clampedX - fg.tipX) * fingerLerp;
        fg.tipYRatio += (tgtY - fg.tipYRatio) * fingerLerp;
        fg.targetMidi = assignedNote.midi;

        if (assignedNote.isPressed) {
          fg.press += (1 - fg.press) * pressAttack;
          fg.glowColor = assignedNote.color;
          fg.glowIntensity += (0.65 + assignedNote.velocity * 0.35 - fg.glowIntensity) * pressAttack;
        } else {
          fg.press += (0.14 - fg.press) * pressRelease;
          fg.glowIntensity *= Math.exp(-dt * 8);
        }
      } else {
        const restY = isThumb ? 0.84 : 0.72 - (lengths[f] - 0.82) * 0.24;
        fg.tipX += (naturalX - fg.tipX) * (1 - Math.exp(-dt * 13));
        fg.tipYRatio += (restY - fg.tipYRatio) * (1 - Math.exp(-dt * 13));
        fg.press += (0 - fg.press) * pressRelease;
        fg.targetMidi = null;
        fg.glowIntensity *= Math.exp(-dt * 9);
      }
    }
  }

  public render(
    ctx: CanvasRenderingContext2D,
    width: number,
    hitLineY: number,
    pianoHeight: number,
    style: HandStyle,
    opacity: number,
    leftThemeColor: RGB,
    rightThemeColor: RGB
  ): void {
    if (opacity <= 0.01) return;
    this.renderSingleHand(ctx, this.left, width, hitLineY, pianoHeight, style, opacity, leftThemeColor);
    this.renderSingleHand(ctx, this.right, width, hitLineY, pianoHeight, style, opacity, rightThemeColor);
  }

  private renderSingleHand(
    ctx: CanvasRenderingContext2D,
    hand: HandState,
    width: number,
    hitLineY: number,
    pianoHeight: number,
    style: HandStyle,
    opacity: number,
    themeColor: RGB
  ): void {
    const whiteW = width / WHITE_KEY_COUNT;
    const palmCx = hand.palmX * width;
    const palmCy = hitLineY + hand.palmYRatio * pianoHeight;
    const palmHalfW = whiteW * 2.15;
    const palmH = pianoHeight * 0.36;

    const widths = hand.side === 'left' ? LEFT_FINGER_WIDTH : RIGHT_FINGER_WIDTH;
    const offsets = hand.side === 'left' ? LEFT_FINGER_OFFSETS_WK : RIGHT_FINGER_OFFSETS_WK;
    const lengths = hand.side === 'left' ? LEFT_FINGER_LEN : RIGHT_FINGER_LEN;

    const cosT = Math.cos(hand.tiltRad);
    const sinT = Math.sin(hand.tiltRad);
    const rot = (lx: number, ly: number) => ({
      x: palmCx + lx * cosT - ly * sinT,
      y: palmCy + lx * sinT + ly * cosT,
    });

    // Compute anatomical knuckle (MCP) positions & physically clamped fingertips
    const knuckles: Array<{ x: number; y: number }> = [];
    const tips: Array<{ x: number; y: number; fw: number; press: number; isThumb: boolean }> = [];

    for (let f = 0; f < 5; f++) {
      const fg = hand.fingers[f];
      const isThumb = (hand.side === 'left' && f === 4) || (hand.side === 'right' && f === 0);
      const kxLocal = offsets[f] * whiteW * (isThumb ? 0.85 : 0.78);
      const kyLocal = isThumb ? -palmH * 0.05 : -palmH * (0.72 - Math.abs(f - 2) * 0.1);
      const kn = rot(kxLocal, kyLocal);
      knuckles.push(kn);

      const rawTipX = fg.tipX * width;
      const rawTipY = hitLineY + fg.tipYRatio * pianoHeight + fg.press * 2.8;

      // Hard anatomical bone-length clamp so fingers ALWAYS look naturally proportioned
      const maxBoneLen = pianoHeight * (0.42 + lengths[f] * 0.32);
      const dx = rawTipX - kn.x;
      const dy = rawTipY - kn.y;
      const dist = Math.hypot(dx, dy);
      let tx = rawTipX;
      let ty = rawTipY;
      if (dist > maxBoneLen && dist > 1) {
        const s = maxBoneLen / dist;
        tx = kn.x + dx * s;
        ty = kn.y + dy * s;
      }

      tips.push({
        x: tx,
        y: ty,
        fw: Math.max(4.5, widths[f] * whiteW),
        press: fg.press,
        isThumb,
      });
    }

    // Determine strongest active bounce glow color for palm lighting
    let bounceColor = themeColor;
    let maxGlow = 0;
    for (const fg of hand.fingers) {
      if (fg.glowIntensity > maxGlow) {
        maxGlow = fg.glowIntensity;
        bounceColor = fg.glowColor;
      }
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, opacity * hand.presence));

    // Build sculpted anatomical back-of-hand (metacarpal) polygon
    const wristLeft = rot(-palmHalfW * 0.78, palmH * 0.92);
    const wristRight = rot(palmHalfW * 0.78, palmH * 0.92);
    const outerLeft = rot(-palmHalfW * 1.02, -palmH * 0.25);
    const outerRight = rot(palmHalfW * 1.02, -palmH * 0.25);
    const topCenter = rot(0, -palmH * 0.86);

    const tracePalmShape = () => {
      ctx.beginPath();
      ctx.moveTo(wristLeft.x, wristLeft.y);
      ctx.quadraticCurveTo(outerLeft.x, palmCy + palmH * 0.22, knuckles[0].x, knuckles[0].y + 2);
      ctx.quadraticCurveTo(topCenter.x, topCenter.y - 3, knuckles[4].x, knuckles[4].y + 2);
      ctx.quadraticCurveTo(outerRight.x, palmCy + palmH * 0.22, wristRight.x, wristRight.y);
      ctx.closePath();
    };

    // STYLE 1: 'aura' — Minimalist AAA Energy Fingertips & Ethereal Constellation Arcs (no cheesy 2D skin!)
    if (style === 'aura') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // Subtle curved energy bridge linking active fingertips
      ctx.strokeStyle = rgbToCss(themeColor, 0.24 + maxGlow * 0.26);
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      for (let f = 0; f < 5; f++) {
        const tp = tips[f];
        if (f === 0) ctx.moveTo(tp.x, tp.y);
        else ctx.lineTo(tp.x, tp.y);
      }
      ctx.stroke();

      // Delicate glowing energy nodes on each fingertip (pulsing & expanding when striking!)
      for (let f = 0; f < 5; f++) {
        const fg = hand.fingers[f];
        const tp = tips[f];
        const col = fg.glowIntensity > 0.12 ? fg.glowColor : themeColor;
        const r = tp.fw * (0.42 + tp.press * 0.45);

        // Soft energy tether down to wrist shadow
        const tether = ctx.createLinearGradient(tp.x, tp.y, palmCx, hitLineY + pianoHeight);
        tether.addColorStop(0, rgbToCss(col, 0.25 + tp.press * 0.4));
        tether.addColorStop(1, rgbToCss(col, 0));
        ctx.strokeStyle = tether;
        ctx.lineWidth = Math.max(1.2, tp.fw * 0.25);
        ctx.beginPath();
        ctx.moveTo(tp.x, tp.y);
        ctx.quadraticCurveTo(knuckles[f].x, knuckles[f].y, palmCx, hitLineY + pianoHeight);
        ctx.stroke();

        // Luminous fingertip halo
        const glow = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, r * 2.4);
        glow.addColorStop(0, rgbToCss(lightenRgb(col, 0.65), 0.78 * (0.35 + tp.press * 0.65)));
        glow.addColorStop(0.45, rgbToCss(col, 0.35 * (0.3 + tp.press * 0.7)));
        glow.addColorStop(1, rgbToCss(col, 0));
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, r * 2.4, 0, Math.PI * 2);
        ctx.fill();

        // Crisp concentric ring when pressing
        ctx.strokeStyle = rgbToCss(lightenRgb(col, 0.6), 0.45 + tp.press * 0.55);
        ctx.lineWidth = tp.press > 0.3 ? 1.6 : 1.0;
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, r * 0.85, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
      ctx.restore();
      return;
    }

    // STYLES 2 & 3: 'hologram' & 'neon-wire' — Clean translucent cyber silhouettes
    for (let f = 0; f < 5; f++) {
      const fg = hand.fingers[f];
      const kn = knuckles[f];
      const tp = tips[f];

      const dx = tp.x - kn.x;
      const dy = tp.y - kn.y;
      const len = Math.max(1, Math.hypot(dx, dy));
      const nx = -dy / len;
      const ny = dx / len;

      const baseHalfW = tp.fw * 0.54;
      const midHalfW = tp.fw * 0.46;
      const tipHalfW = tp.fw * 0.36;

      const midX = kn.x + dx * 0.54;
      const midY = kn.y + dy * 0.54 - (1 - tp.press) * 1.8;

      ctx.beginPath();
      ctx.moveTo(kn.x - nx * baseHalfW, kn.y - ny * baseHalfW);
      ctx.quadraticCurveTo(midX - nx * midHalfW, midY - ny * midHalfW, tp.x - nx * tipHalfW, tp.y - ny * tipHalfW);
      ctx.arc(tp.x, tp.y, tipHalfW, Math.atan2(-ny, -nx), Math.atan2(ny, nx), false);
      ctx.quadraticCurveTo(midX + nx * midHalfW, midY + ny * midHalfW, kn.x + nx * baseHalfW, kn.y + ny * baseHalfW);
      ctx.closePath();

      const col = fg.glowIntensity > 0.15 ? fg.glowColor : themeColor;
      if (style === 'hologram') {
        const holoGrad = ctx.createLinearGradient(kn.x, kn.y, tp.x, tp.y);
        holoGrad.addColorStop(0, rgbToCss(col, 0.16));
        holoGrad.addColorStop(0.65, rgbToCss(lightenRgb(col, 0.22), 0.38 + tp.press * 0.28));
        holoGrad.addColorStop(1, rgbToCss(lightenRgb(col, 0.5), 0.72 + tp.press * 0.22));
        ctx.fillStyle = holoGrad;
        ctx.fill();

        ctx.strokeStyle = rgbToCss(lightenRgb(col, 0.48), 0.62 + tp.press * 0.32);
        ctx.lineWidth = 1.1;
        ctx.stroke();

        if (tp.press > 0.25) {
          ctx.fillStyle = rgbToCss(lightenRgb(col, 0.72), 0.85 * tp.press);
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, tipHalfW * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = 'rgba(6, 8, 16, 0.42)';
        ctx.fill();
        ctx.strokeStyle = rgbToCss(lightenRgb(col, tp.press * 0.45), 0.85);
        ctx.lineWidth = tp.press > 0.3 ? 1.7 : 1.15;
        ctx.stroke();

        ctx.fillStyle = rgbToCss(lightenRgb(col, 0.6), 0.9);
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, Math.max(1.8, tipHalfW * 0.44), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    tracePalmShape();
    if (style === 'hologram') {
      const holoPalm = ctx.createLinearGradient(topCenter.x, topCenter.y, palmCx, palmCy + palmH);
      holoPalm.addColorStop(0, rgbToCss(lightenRgb(bounceColor, 0.3), 0.34));
      holoPalm.addColorStop(1, rgbToCss(themeColor, 0.06));
      ctx.fillStyle = holoPalm;
      ctx.fill();
      ctx.strokeStyle = rgbToCss(lightenRgb(themeColor, 0.45), 0.5);
      ctx.lineWidth = 1.05;
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(6, 8, 16, 0.38)';
      ctx.fill();
      ctx.strokeStyle = rgbToCss(themeColor, 0.72);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    ctx.restore();
  }
}
