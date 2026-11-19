import type { AudioEnergy } from '../audio/AudioEngine';
import { findVisibleNoteRange } from '../midi/MidiParser';
import type { ParsedMidi, TrackOverride, VisualizerSettings } from '../types/visualizer';
import { hexToRgb, lightenRgb, resolveNoteColor, rgbToCss, type RGB } from './ColorUtils';
import {
  FIRST_MIDI,
  getKeyLayoutByMidi,
  getPianoLayout,
  projectHighwayPoint,
  TOTAL_KEYS,
} from './PianoGeometry';
import { VirtualHandsController } from './VirtualHands';

export interface ActiveKeyState {
  midi: number;
  intensity: number; // 0..1 smooth attack/decay
  velocity: number;
  pressed: boolean;
  color: RGB;
}

export interface FrameTrigger {
  midi: number;
  xNorm: number; // 0..1
  velocity: number;
  color: RGB;
  isAttack: boolean; // true on initial hit, false while sustained/held
}

export interface SceneFrameResult {
  hitLineY: number;
  triggers: FrameTrigger[];
  activeEnergy: number;
}

function darkenRgb(rgb: RGB, factor: number): RGB {
  const f = Math.max(0, Math.min(1, factor));
  return {
    r: Math.round(rgb.r * (1 - f)),
    g: Math.round(rgb.g * (1 - f)),
    b: Math.round(rgb.b * (1 - f)),
  };
}

export class SceneRenderer {
  public readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private customBgImage: HTMLImageElement | null = null;
  private customBgUrl: string | null = null;

  // Offscreen blurred background cache (3-5x faster FPS when custom background has blur!)
  private readonly bgCacheCanvas: HTMLCanvasElement;
  private readonly bgCacheCtx: CanvasRenderingContext2D | null;
  private bgCacheKey = '';

  private readonly keyStates: ActiveKeyState[];
  private prevPressedSet = new Set<number>();
  private readonly hands = new VirtualHandsController();
  private sustainSmooth = 0;
  private cameraPunch = 0;

  // Precomputed smoothed wave arrays for the plasma keyboard edge
  private readonly waveSamples = 180;
  private readonly waveEnergy = new Float32Array(180);
  private readonly waveColorR = new Float32Array(180);
  private readonly waveColorG = new Float32Array(180);
  private readonly waveColorB = new Float32Array(180);

  constructor() {
    this.canvas = document.createElement('canvas');
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      throw new Error('Could not initialize 2D scene context');
    }
    this.ctx = ctx;
    this.bgCacheCanvas = document.createElement('canvas');
    this.bgCacheCtx = this.bgCacheCanvas.getContext('2d', { alpha: false });

    this.keyStates = Array.from({ length: TOTAL_KEYS }, (_, idx) => ({
      midi: FIRST_MIDI + idx,
      intensity: 0,
      velocity: 0,
      pressed: false,
      color: { r: 155, g: 109, b: 255 },
    }));
  }

  public resize(width: number, height: number): void {
    const w = Math.max(2, Math.floor(width));
    const h = Math.max(2, Math.floor(height));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  public setCustomBackground(url: string | null): void {
    if (url === this.customBgUrl) return;
    this.customBgUrl = url;
    this.bgCacheKey = '';
    if (!url) {
      this.customBgImage = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (this.customBgUrl === url) {
        this.customBgImage = img;
        this.bgCacheKey = '';
      }
    };
    img.src = url;
  }

  public resetKeyStates(): void {
    this.prevPressedSet.clear();
    for (const ks of this.keyStates) {
      ks.intensity = 0;
      ks.pressed = false;
      ks.velocity = 0;
    }
    this.waveEnergy.fill(0);
    this.hands.reset();
  }

  public render(
    midi: ParsedMidi | null,
    currentTime: number,
    clockSec: number,
    dt: number,
    settings: VisualizerSettings,
    audioEnergy: AudioEnergy,
    manualPressedNotes: ReadonlyMap<number, number>,
    spectrumBins?: Float32Array,
    trackOverrides?: Readonly<Record<number, TrackOverride>>,
    sustainPedalDown = false,
    videoEl?: HTMLVideoElement | null
  ): SceneFrameResult {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const pianoHeight = Math.round(height * settings.pianoHeightRatio);
    const hitLineY = height - pianoHeight;
    const is3D = settings.viewMode === '3d';

    // Smooth sustain resonance aura intensity
    const sustainTarget = sustainPedalDown ? 1 : 0;
    this.sustainSmooth += (sustainTarget - this.sustainSmooth) * Math.min(1, dt * 8);

    // 1. Determine active notes & triggers for this frame via O(log N) binary search!
    const currentlyPressed = new Map<number, { velocity: number; color: RGB }>();
    const triggers: FrameTrigger[] = [];

    if (midi) {
      const [startIdx, endIdx] = findVisibleNoteRange(
        midi.notes,
        currentTime,
        currentTime,
        midi.maxNoteDuration
      );
      for (let i = startIdx; i < endIdx; i++) {
        const n = midi.notes[i];
        if (trackOverrides?.[n.trackIndex]?.hidden) continue;
        if (n.start <= currentTime && n.end >= currentTime) {
          const col = resolveNoteColor(n, settings, trackOverrides);
          const existing = currentlyPressed.get(n.midi);
          if (!existing || n.velocity > existing.velocity) {
            currentlyPressed.set(n.midi, { velocity: n.velocity, color: col });
          }
        }
      }
    }

    // Merge live manual pointer / QWERTY / Web MIDI / Magic Keys pressed notes
    for (const [m, vel] of manualPressedNotes.entries()) {
      const col = resolveNoteColor(
        { midi: m, hand: m < 60 ? 'left' : 'right', velocity: vel, trackIndex: m < 60 ? 0 : 1 },
        settings
      );
      currentlyPressed.set(m, { velocity: vel, color: col });
    }

    let activeEnergySum = 0;
    let attackImpact = 0;

    // Update smooth key states & collect particle triggers
    for (let i = 0; i < TOTAL_KEYS; i++) {
      const ks = this.keyStates[i];
      const active = currentlyPressed.get(ks.midi);
      const wasPressed = this.prevPressedSet.has(ks.midi);

      if (active) {
        ks.pressed = true;
        ks.velocity = active.velocity;
        ks.color = active.color;
        ks.intensity = Math.min(1, ks.intensity + dt * 28);
        activeEnergySum += active.velocity;

        if (!wasPressed) {
          // Bass/strong chord attacks fuel subtle cinematic camera punch
          const bassBoost = ks.midi < 55 ? 1.55 : 0.7;
          attackImpact += active.velocity * bassBoost;
        }

        const keyLayout = getKeyLayoutByMidi(ks.midi);
        if (keyLayout) {
          triggers.push({
            midi: ks.midi,
            xNorm: keyLayout.normCenterX,
            velocity: active.velocity,
            color: active.color,
            isAttack: !wasPressed,
          });
        }
      } else {
        ks.pressed = false;
        ks.intensity = Math.max(0, ks.intensity - dt * 6.4);
      }
    }

    // Smooth spring-decay camera bass punch
    const punchTarget = Math.min(1, attackImpact * 0.28 + audioEnergy.bass * 0.45);
    if (punchTarget > this.cameraPunch) {
      this.cameraPunch += (punchTarget - this.cameraPunch) * Math.min(1, dt * 18);
    } else {
      this.cameraPunch *= Math.exp(-dt * 7.5);
    }

    this.prevPressedSet = new Set(currentlyPressed.keys());
    const activeEnergy = Math.min(1, activeEnergySum / 4.2);

    if (settings.showHands) {
      this.hands.update(
        midi,
        currentTime,
        dt,
        (n) => resolveNoteColor(n, settings, trackOverrides),
        manualPressedNotes
      );
    }

    const hasVideoReady = Boolean(videoEl && videoEl.readyState >= 2 && settings.customVideoUrl);
    const isOverheadHandsVideo = hasVideoReady && settings.customVideoMode === 'overhead-hands';

    // 2. Render Background (Image / Looping Video / Animated Procedural)
    this.renderBackground(ctx, width, height, hitLineY, clockSec, settings, audioEnergy, hasVideoReady && !isOverheadHandsVideo ? videoEl : null);

    // Apply subtle Bass Camera Punch ONLY to the upper falling-note stage (keeps keyboard rock solid!)
    const punchAmt = this.cameraPunch * settings.cameraPunchIntensity;
    ctx.save();
    if (punchAmt > 0.004) {
      const zoom = 1 + punchAmt * 0.015;
      const shiftY = -punchAmt * 2.5;
      ctx.translate(width * 0.5, hitLineY * 0.5 + shiftY);
      ctx.scale(zoom, zoom);
      ctx.translate(-width * 0.5, -hitLineY * 0.5);
    }

    // 3. Render Octave Grid, Measure Lines & Chord Markers
    if (settings.showMeasureGrid || is3D) {
      this.renderHighwayGrid(ctx, midi, currentTime, width, hitLineY, settings);
    }

    // 4. Render Live Audio EQ Spectrum behind strike line
    if (settings.eqSpectrumEnabled && spectrumBins) {
      this.renderAudioSpectrum(ctx, width, hitLineY, spectrumBins, settings, audioEnergy);
    }

    // 5. Render Delicate Concert Key Light Beams
    if (settings.keyLightBeams && settings.keyBeamIntensity > 0.01) {
      this.renderKeyBeams(ctx, width, hitLineY, settings);
    }

    // 6. Render Crisp Upgraded Falling Notes (O(log N) windowed, clipped above hitLineY)
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, hitLineY + 2);
    ctx.clip();

    if (midi) {
      this.renderFallingNotes(ctx, midi, currentTime, width, hitLineY, settings, trackOverrides);
    }
    ctx.restore();

    ctx.restore(); // end camera punch transform

    // 7. Render Electric Chord Lightning Arcs jumping between simultaneously struck keys!
    if (settings.electricArcsEnabled) {
      this.renderElectricChordArcs(ctx, width, hitLineY, clockSec);
    }

    // 8. Render Refined Plasma Energy Wave + Anamorphic Strike Flares along hitLineY
    if (settings.plasmaEdgeWave && settings.plasmaEdgeIntensity > 0.01) {
      this.renderPlasmaEdge(ctx, width, hitLineY, clockSec, dt, settings, audioEnergy);
    }

    // 9. Render Piano Keyboard &/OR Overhead Real-Hands Video Overlay (Rousseau / SeeMusic style!)
    if (!isOverheadHandsVideo || !settings.hideSyntheticKeyboard) {
      this.renderPianoKeyboard(ctx, width, height, hitLineY, pianoHeight, settings);
    } else {
      // Dark clean backdrop behind real overhead hands video
      ctx.fillStyle = '#04050a';
      ctx.fillRect(0, hitLineY, width, pianoHeight);
    }

    if (isOverheadHandsVideo && videoEl) {
      this.renderOverheadHandsVideo(ctx, videoEl, width, height, hitLineY, pianoHeight, settings);
    }

    // 10. Render Piano Keybed Mirror Reflection & Sustain Pedal Resonance Aura
    if (settings.mirrorReflectionEnabled && settings.mirrorReflectionIntensity > 0.02) {
      this.renderKeybedMirrorReflection(ctx, width, hitLineY, pianoHeight, settings);
    }
    if (settings.sustainAuraEnabled && this.sustainSmooth > 0.02) {
      this.renderSustainAura(ctx, width, height, hitLineY, pianoHeight, settings);
    }

    // 11. Render Optional Sleek Finger Energy Guide
    if (settings.showHands) {
      const leftTheme = hexToRgb(settings.leftHandColor);
      const rightTheme = hexToRgb(settings.rightHandColor);
      this.hands.render(
        ctx,
        width,
        hitLineY,
        pianoHeight,
        settings.handStyle,
        settings.handOpacity,
        leftTheme,
        rightTheme
      );
    }

    // 12. Render Cinematic Title Intro Card & Channel Watermark directly onto Canvas (baked into video!)
    this.renderTitleAndWatermark(ctx, midi, currentTime, width, hitLineY, settings);

    return { hitLineY, triggers, activeEnergy };
  }

  private renderBackground(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    hitLineY: number,
    clockSec: number,
    settings: VisualizerSettings,
    audioEnergy: AudioEnergy,
    backdropVideo?: HTMLVideoElement | null
  ): void {
    ctx.fillStyle = '#030408';
    ctx.fillRect(0, 0, width, height);

    const pulse = 1 + audioEnergy.bass * settings.bgAudioPulse * 0.22;
    const scalePulse = 1 + audioEnergy.bass * settings.bgAudioPulse * 0.035;

    if (backdropVideo && backdropVideo.videoWidth > 0 && backdropVideo.videoHeight > 0) {
      const vidRatio = backdropVideo.videoWidth / backdropVideo.videoHeight;
      const canvasRatio = width / Math.max(1, height);
      let drawW = width;
      let drawH = height;
      if (vidRatio > canvasRatio) {
        drawH = height * scalePulse;
        drawW = drawH * vidRatio;
      } else {
        drawW = width * scalePulse;
        drawH = drawW / vidRatio;
      }
      const blurPad = settings.bgBlur * 1.8;
      drawW += blurPad * 2;
      drawH += blurPad * 2;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, settings.bgOpacity));
      const filters: string[] = [];
      if (settings.bgBlur > 0.5) filters.push(`blur(${settings.bgBlur.toFixed(0)}px)`);
      filters.push(`brightness(${settings.bgBrightness.toFixed(2)})`);
      filters.push(`saturate(${settings.bgSaturation.toFixed(2)})`);
      ctx.filter = filters.join(' ');
      ctx.drawImage(backdropVideo, (width - drawW) * 0.5, (height - drawH) * 0.5, drawW, drawH);
      ctx.restore();
    } else if (settings.backgroundPreset === 'custom' && this.customBgImage) {
      const img = this.customBgImage;
      // Rebuild offscreen blurred background cache ONLY when image, size, or filter sliders change!
      const cacheKey = `${this.customBgUrl}|${width}x${height}|${settings.bgBlur.toFixed(1)}|${settings.bgBrightness.toFixed(2)}|${settings.bgSaturation.toFixed(2)}`;
      if (this.bgCacheCtx && this.bgCacheKey !== cacheKey) {
        if (this.bgCacheCanvas.width !== width || this.bgCacheCanvas.height !== height) {
          this.bgCacheCanvas.width = width;
          this.bgCacheCanvas.height = height;
        }
        const bctx = this.bgCacheCtx;
        bctx.fillStyle = '#030408';
        bctx.fillRect(0, 0, width, height);

        const imgRatio = img.naturalWidth / Math.max(1, img.naturalHeight);
        const canvasRatio = width / Math.max(1, height);
        const blurPad = settings.bgBlur * 2.2;
        let drawW = width;
        let drawH = height;
        if (imgRatio > canvasRatio) {
          drawH = height + blurPad * 2;
          drawW = drawH * imgRatio;
        } else {
          drawW = width + blurPad * 2;
          drawH = drawW / imgRatio;
        }
        const dx = (width - drawW) * 0.5;
        const dy = (height - drawH) * 0.5;

        bctx.save();
        const filters: string[] = [];
        if (settings.bgBlur > 0.2) filters.push(`blur(${settings.bgBlur.toFixed(1)}px)`);
        filters.push(`brightness(${settings.bgBrightness.toFixed(2)})`);
        filters.push(`saturate(${settings.bgSaturation.toFixed(2)})`);
        bctx.filter = filters.join(' ');
        bctx.drawImage(img, dx, dy, drawW, drawH);
        bctx.restore();
        this.bgCacheKey = cacheKey;
      }

      // Ultra-fast 60fps blit of pre-blurred background with smooth bass breathing
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, settings.bgOpacity));
      const bw = width * scalePulse;
      const bh = height * scalePulse;
      ctx.drawImage(this.bgCacheCanvas, (width - bw) * 0.5, (height - bh) * 0.5, bw, bh);
      ctx.restore();
    } else if (settings.backgroundPreset === 'aurora') {
      ctx.save();
      ctx.globalAlpha = settings.bgOpacity;
      const bgGrad = ctx.createLinearGradient(0, 0, 0, hitLineY);
      bgGrad.addColorStop(0, '#041218');
      bgGrad.addColorStop(0.55, '#071a22');
      bgGrad.addColorStop(1, '#04070e');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, hitLineY);

      ctx.globalCompositeOperation = 'screen';
      const blobs = [
        { x: 0.22 + Math.sin(clockSec * 0.22) * 0.12, y: 0.28, r: 0.52, col: '16, 185, 129', a: 0.22 },
        { x: 0.72 + Math.cos(clockSec * 0.18) * 0.14, y: 0.34, r: 0.48, col: '45, 212, 191', a: 0.18 },
        { x: 0.48 + Math.sin(clockSec * 0.15 + 1.5) * 0.18, y: 0.52, r: 0.55, col: '99, 102, 241', a: 0.14 },
      ];
      for (const b of blobs) {
        const cx = b.x * width;
        const cy = b.y * hitLineY;
        const rad = Math.max(width, height) * b.r * pulse;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(0, `rgba(${b.col}, ${(b.a * settings.bgBrightness).toFixed(3)})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, hitLineY);
      }
      ctx.restore();
    } else if (settings.backgroundPreset === 'nebula') {
      ctx.save();
      ctx.globalAlpha = settings.bgOpacity;
      const base = ctx.createRadialGradient(
        width * 0.5,
        hitLineY * 0.45,
        width * 0.05,
        width * 0.5,
        hitLineY * 0.5,
        Math.max(width, height) * 0.8
      );
      base.addColorStop(0, '#120b26');
      base.addColorStop(0.55, '#080614');
      base.addColorStop(1, '#03040a');
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, width, hitLineY);

      ctx.globalCompositeOperation = 'screen';
      const nebulae = [
        { x: 0.28 + Math.sin(clockSec * 0.14) * 0.08, y: 0.35, r: 0.44, col: '139, 92, 246', a: 0.18 },
        { x: 0.74 + Math.cos(clockSec * 0.19) * 0.09, y: 0.42, r: 0.42, col: '56, 189, 248', a: 0.14 },
        { x: 0.52, y: 0.85, r: 0.48, col: '249, 115, 22', a: 0.1 },
      ];
      for (const nb of nebulae) {
        const g = ctx.createRadialGradient(
          nb.x * width,
          nb.y * hitLineY,
          0,
          nb.x * width,
          nb.y * hitLineY,
          Math.max(width, height) * nb.r * pulse
        );
        g.addColorStop(0, `rgba(${nb.col}, ${(nb.a * settings.bgBrightness).toFixed(3)})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, hitLineY);
      }
      ctx.restore();
    } else if (settings.backgroundPreset === 'midnight-ember') {
      ctx.save();
      ctx.globalAlpha = settings.bgOpacity;
      const g = ctx.createLinearGradient(0, 0, 0, hitLineY);
      g.addColorStop(0, '#070512');
      g.addColorStop(0.65, '#170a1d');
      g.addColorStop(1, '#230c17');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, hitLineY);

      ctx.globalCompositeOperation = 'screen';
      const glow = ctx.createRadialGradient(
        width * 0.5,
        hitLineY * 0.92,
        10,
        width * 0.5,
        hitLineY * 0.75,
        Math.max(width, height) * 0.65 * pulse
      );
      glow.addColorStop(0, `rgba(244, 63, 94, ${(0.18 * settings.bgBrightness).toFixed(3)})`);
      glow.addColorStop(0.5, `rgba(14, 165, 233, ${(0.1 * settings.bgBrightness).toFixed(3)})`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, hitLineY);
      ctx.restore();
    }

    if (settings.bgVignette > 0.01) {
      const vig = ctx.createRadialGradient(
        width * 0.5,
        hitLineY * 0.55,
        Math.min(width, hitLineY) * 0.25,
        width * 0.5,
        hitLineY * 0.5,
        Math.max(width, height) * 0.78
      );
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, `rgba(2, 3, 7, ${(settings.bgVignette * 0.88).toFixed(3)})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, width, hitLineY);
    }
  }

  private renderHighwayGrid(
    ctx: CanvasRenderingContext2D,
    midi: ParsedMidi | null,
    currentTime: number,
    width: number,
    hitLineY: number,
    settings: VisualizerSettings
  ): void {
    const is3D = settings.viewMode === '3d';
    const layout = getPianoLayout();
    const pxScale = Math.max(1, width / 1360);

    ctx.save();

    for (let i = 0; i < layout.length; i++) {
      const k = layout[i];
      const isOctaveC = !k.isBlack && k.midi % 12 === 0;
      const isEdge = i === 0 || i === layout.length - 1;
      if (!isOctaveC && !(is3D && isEdge)) continue;

      const nx = i === layout.length - 1 ? 1.0 : k.normX;
      const p0 = projectHighwayPoint(nx, 0, width, hitLineY, is3D, settings.perspectiveTilt);
      const p1 = projectHighwayPoint(nx, 1, width, hitLineY, is3D, settings.perspectiveTilt);

      const lineGrad = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
      const alpha = isEdge ? 0.3 : is3D ? 0.14 : 0.07;
      lineGrad.addColorStop(0, `rgba(226, 232, 240, ${alpha})`);
      lineGrad.addColorStop(0.75, `rgba(148, 163, 184, ${alpha * 0.5})`);
      lineGrad.addColorStop(1, 'rgba(148, 163, 184, 0)');

      ctx.strokeStyle = lineGrad;
      ctx.lineWidth = (isEdge ? 1.45 : 1.05) * pxScale;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }

    if (midi && settings.showMeasureGrid) {
      const lookahead = settings.noteSpeed;
      for (const m of midi.measures) {
        const dtBar = m.time - currentTime;
        if (dtBar < -0.05 || dtBar > lookahead) continue;

        const normT = dtBar / lookahead;
        const leftPt = projectHighwayPoint(0, normT, width, hitLineY, is3D, settings.perspectiveTilt);
        const rightPt = projectHighwayPoint(1, normT, width, hitLineY, is3D, settings.perspectiveTilt);

        const fade = Math.min(1, (1 - normT) * 2.2);
        ctx.strokeStyle = `rgba(226, 232, 240, ${(0.2 * fade).toFixed(3)})`;
        ctx.lineWidth = Math.max(0.7, 1.25 * leftPt.scale);
        ctx.beginPath();
        ctx.moveTo(leftPt.x, leftPt.y);
        ctx.lineTo(rightPt.x, rightPt.y);
        ctx.stroke();

        if (settings.showChordLabels && m.chordLabel) {
          const fontSize = Math.max(12, Math.round(22 * leftPt.scale));
          ctx.font = `700 ${fontSize}px "Space Grotesk", sans-serif`;
          ctx.textAlign = is3D ? 'right' : 'left';
          ctx.textBaseline = 'middle';
          const labelX = is3D ? leftPt.x - 14 * leftPt.scale : 14;
          const labelY = leftPt.y + 12 * leftPt.scale;
          ctx.lineWidth = 3;
          ctx.strokeStyle = `rgba(4, 6, 12, ${(0.85 * fade).toFixed(3)})`;
          ctx.strokeText(m.chordLabel, labelX, labelY);
          ctx.fillStyle = `rgba(241, 245, 249, ${(0.92 * fade).toFixed(3)})`;
          ctx.fillText(m.chordLabel, labelX, labelY);
        }
      }
    }

    ctx.restore();
  }

  private renderKeyBeams(
    ctx: CanvasRenderingContext2D,
    width: number,
    hitLineY: number,
    settings: VisualizerSettings
  ): void {
    const layout = getPianoLayout();
    const is3D = settings.viewMode === '3d';
    const power = settings.keyBeamIntensity;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < TOTAL_KEYS; i++) {
      const ks = this.keyStates[i];
      if (ks.intensity < 0.04) continue;

      const key = layout[i];
      // Sleek, translucent concert light shaft — never thick or opaque enough to wash out falling notes!
      const beamH = hitLineY * (0.3 + ks.velocity * 0.34) * Math.min(1.25, 0.55 + power * 0.65);
      const cx = key.normCenterX * width;
      const bw = key.normWidth * width * (1.08 + ks.intensity * 0.35);

      const pTop = projectHighwayPoint(
        key.normCenterX,
        Math.min(0.88, beamH / Math.max(1, hitLineY)),
        width,
        hitLineY,
        is3D,
        settings.perspectiveTilt
      );

      const grad = ctx.createLinearGradient(cx, hitLineY, pTop.x, pTop.y);
      const alpha = ks.intensity * 0.2 * power;
      grad.addColorStop(0, rgbToCss(ks.color, Math.min(0.42, alpha * 1.45)));
      grad.addColorStop(0.32, rgbToCss(ks.color, alpha * 0.52));
      grad.addColorStop(1, rgbToCss(ks.color, 0));

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx - bw * 0.5, hitLineY);
      ctx.lineTo(cx + bw * 0.5, hitLineY);
      ctx.lineTo(pTop.x + bw * 0.25 * pTop.scale, pTop.y);
      ctx.lineTo(pTop.x - bw * 0.25 * pTop.scale, pTop.y);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  private renderFallingNotes(
    ctx: CanvasRenderingContext2D,
    midi: ParsedMidi,
    currentTime: number,
    width: number,
    hitLineY: number,
    settings: VisualizerSettings,
    trackOverrides?: Readonly<Record<number, TrackOverride>>
  ): void {
    const lookahead = settings.noteSpeed;
    const is3D = settings.viewMode === '3d';
    const glowAmt = settings.noteGlowIntensity;
    const notes = midi.notes;
    // Scale line widths & corner radii consistently with SSAA supersampled buffer resolution!
    const pxScale = Math.max(1, width / 1360);

    // O(log N + visible) binary-search windowing for 60fps even on 50,000-note Black MIDI!
    const [startIdx, endIdx] = findVisibleNoteRange(
      notes,
      currentTime - 0.04,
      currentTime + lookahead,
      midi.maxNoteDuration
    );

    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // Render white-key notes first, then black-key notes slightly on top
    for (let pass = 0; pass < 2; pass++) {
      const renderBlack = pass === 1;

      for (let i = startIdx; i < endIdx; i++) {
        const n = notes[i];
        if (trackOverrides?.[n.trackIndex]?.hidden) continue;
        if (n.end < currentTime - 0.04) continue;

        const key = getKeyLayoutByMidi(n.midi);
        if (!key || key.isBlack !== renderBlack) continue;

        const tBottom = Math.max(0, (n.start - currentTime) / lookahead);
        // Clean visual vertical separation so consecutive repeated notes never fuse together
        const gapSec = Math.min(n.duration * 0.24, 0.055);
        const visualEnd = Math.max(n.start + 0.035, n.end - gapSec);
        const tTop = Math.min(1.06, (visualEnd - currentTime) / lookahead);
        if (tTop <= tBottom) continue;

        const isHitting = currentTime >= n.start && currentTime <= n.end;
        const baseColor = resolveNoteColor(n, settings, trackOverrides);
        const color = renderBlack ? darkenRgb(baseColor, 0.08) : baseColor;
        const brightColor = lightenRgb(baseColor, isHitting ? 0.42 * glowAmt : 0.26 * glowAmt);

        // Clean horizontal separation between adjacent white/black chord notes
        const effectiveWidthScale = renderBlack
          ? Math.min(0.86, settings.noteWidthScale * 0.92)
          : Math.min(0.84, settings.noteWidthScale);
        const padRatio = (1 - effectiveWidthScale) * 0.5;
        const nLeft = key.normX + key.normWidth * padRatio;
        const nRight = key.normX + key.normWidth * (1 - padRatio);

        const bl = projectHighwayPoint(nLeft, tBottom, width, hitLineY, is3D, settings.perspectiveTilt);
        const br = projectHighwayPoint(nRight, tBottom, width, hitLineY, is3D, settings.perspectiveTilt);
        const tl = projectHighwayPoint(nLeft, tTop, width, hitLineY, is3D, settings.perspectiveTilt);
        const tr = projectHighwayPoint(nRight, tTop, width, hitLineY, is3D, settings.perspectiveTilt);

        // Enforce minimum readable vertical pixel height while preserving gap
        const rawBoxH = bl.y - tl.y;
        const minH = Math.max(6 * pxScale, 9 * bl.scale * pxScale);
        if (rawBoxH < minH) {
          tl.y = bl.y - minH;
          tr.y = br.y - minH;
        }
        const boxH = Math.max(minH, bl.y - tl.y);
        const botW = Math.max(4 * pxScale, br.x - bl.x);
        const topW = Math.max(2.5 * pxScale, tr.x - tl.x);
        const fadeFar = Math.min(1, Math.max(0.24, (1.06 - tBottom) * 1.45));

        if (settings.noteStyle === 'crystal') {
          this.drawCrystalNote(ctx, bl, br, tl, tr, botW, boxH, color, brightColor, isHitting, glowAmt, fadeFar);
        } else if (settings.noteStyle === 'neon-hollow') {
          this.drawNeonHollowNote(
            ctx,
            bl,
            br,
            tl,
            tr,
            botW,
            boxH,
            color,
            brightColor,
            isHitting,
            glowAmt,
            pxScale,
            fadeFar
          );
        } else if (settings.noteStyle === 'plasma-beam') {
          this.drawPlasmaBeamNote(ctx, bl, br, tl, tr, botW, topW, color, brightColor, isHitting, glowAmt, fadeFar);
        } else {
          this.drawGlassBarNote(ctx, bl, br, tl, tr, botW, boxH, color, brightColor, isHitting, glowAmt, is3D, fadeFar);
        }

        // Crisp HiDPI vector pitch label (smooth drop shadow instead of crunchy jagged strokeText!)
        if (settings.showNoteLabels && boxH > 14 * pxScale && botW > 9 * pxScale) {
          const cx = (bl.x + br.x) * 0.5;
          const fontSize = Math.max(
            Math.round(9 * pxScale),
            Math.min(Math.round(15 * pxScale), Math.round(botW * 0.64))
          );
          const labelY = bl.y - Math.max(3 * pxScale, 4.2 * bl.scale * pxScale);
          ctx.save();
          ctx.font = `700 ${fontSize}px "Inter", "Space Grotesk", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.shadowColor = `rgba(2, 4, 10, ${(0.95 * fadeFar).toFixed(2)})`;
          ctx.shadowBlur = 4 * pxScale;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 1 * pxScale;
          ctx.fillStyle =
            settings.noteStyle === 'neon-hollow'
              ? rgbToCss(lightenRgb(baseColor, 0.78), 0.98 * fadeFar)
              : `rgba(255, 255, 255, ${(0.97 * fadeFar).toFixed(2)})`;
          ctx.fillText(n.pitchClass, cx, labelY);
          ctx.restore();
        }
      }
    }
  }

  private drawCrystalNote(
    ctx: CanvasRenderingContext2D,
    bl: { x: number; y: number; scale: number },
    br: { x: number; y: number; scale: number },
    tl: { x: number; y: number; scale: number },
    tr: { x: number; y: number; scale: number },
    botW: number,
    boxH: number,
    color: RGB,
    bright: RGB,
    isHitting: boolean,
    glowAmt: number,
    fade: number
  ): void {
    // True 3D Multi-Faceted Cut Gemstone (crisp bevels, saturated color, NO white washout!)
    const chX = Math.min(botW * 0.3, boxH * 0.32);
    const chY = Math.min(boxH * 0.3, botW * 0.42);
    const topChX = chX * (tl.scale / Math.max(0.01, bl.scale));

    const traceOuter = () => {
      ctx.beginPath();
      ctx.moveTo(tl.x + topChX, tl.y);
      ctx.lineTo(tr.x - topChX, tr.y);
      ctx.lineTo(tr.x, tr.y + chY);
      ctx.lineTo(br.x, br.y - chY);
      ctx.lineTo(br.x - chX, br.y);
      ctx.lineTo(bl.x + chX, bl.y);
      ctx.lineTo(bl.x, bl.y - chY);
      ctx.lineTo(tl.x, tl.y + chY);
      ctx.closePath();
    };

    const deep = darkenRgb(color, 0.36);
    const mid = color;
    const hi = lightenRgb(color, isHitting ? 0.35 + glowAmt * 0.25 : 0.22 + glowAmt * 0.14);

    // 1. Rich jewel body gradient (left lit -> right shaded for 3D depth)
    traceOuter();
    const g = ctx.createLinearGradient(bl.x, bl.y, br.x, br.y);
    g.addColorStop(0, rgbToCss(hi, 0.96 * fade));
    g.addColorStop(0.48, rgbToCss(mid, 0.94 * fade));
    g.addColorStop(1, rgbToCss(deep, 0.95 * fade));
    ctx.fillStyle = g;
    ctx.fill();

    // 2. Inner raised crown table facet (gives unmistakable cut-gemstone sharpness!)
    const inX = botW * 0.22;
    const inTopX = topChX * 0.9;
    const inY = Math.min(boxH * 0.24, chY * 1.15);
    if (boxH > 12 && botW > 7) {
      ctx.beginPath();
      ctx.moveTo(tl.x + inTopX + (tr.x - tl.x) * 0.14, tl.y + inY);
      ctx.lineTo(tr.x - inTopX - (tr.x - tl.x) * 0.14, tr.y + inY);
      ctx.lineTo(br.x - inX, br.y - inY);
      ctx.lineTo(bl.x + inX, bl.y - inY);
      ctx.closePath();

      const crownG = ctx.createLinearGradient(0, tl.y, 0, bl.y);
      crownG.addColorStop(0, rgbToCss(lightenRgb(color, 0.42 * glowAmt), 0.72 * fade));
      crownG.addColorStop(0.65, rgbToCss(mid, 0.48 * fade));
      crownG.addColorStop(1, rgbToCss(lightenRgb(color, isHitting ? 0.62 : 0.28), 0.85 * fade));
      ctx.fillStyle = crownG;
      ctx.fill();

      // Crisp inner facet highlight lines
      ctx.strokeStyle = `rgba(255, 255, 255, ${((isHitting ? 0.58 : 0.34) * fade).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.7, 0.95 * bl.scale);
      ctx.stroke();
    }

    // 3. Dark contrast outline + bright crisp jewel rim (keeps adjacent notes razor-distinct!)
    traceOuter();
    ctx.strokeStyle = `rgba(4, 6, 12, ${(0.62 * fade).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.6, 2.2 * bl.scale);
    ctx.stroke();

    ctx.strokeStyle = rgbToCss(lightenRgb(bright, 0.28), (isHitting ? 0.98 : 0.84) * fade);
    ctx.lineWidth = Math.max(1.0, 1.35 * bl.scale);
    ctx.stroke();
  }

  private drawNeonHollowNote(
    ctx: CanvasRenderingContext2D,
    bl: { x: number; y: number; scale: number },
    br: { x: number; y: number; scale: number },
    tl: { x: number; y: number; scale: number },
    tr: { x: number; y: number; scale: number },
    botW: number,
    boxH: number,
    color: RGB,
    bright: RGB,
    isHitting: boolean,
    glowAmt: number,
    pxScale: number,
    fade: number
  ): void {
    const r = Math.min(5.5 * bl.scale * pxScale, botW * 0.34, boxH * 0.34);

    // 1. Deep dark smoked-glass interior with rich colored bottom illumination
    this.traceRoundedQuad(ctx, tl, tr, br, bl, r);
    const fillG = ctx.createLinearGradient(0, tl.y, 0, bl.y);
    const darkTint = darkenRgb(color, 0.68);
    fillG.addColorStop(0, `rgba(5, 7, 15, ${(0.88 * fade).toFixed(3)})`);
    fillG.addColorStop(0.68, rgbToCss(darkTint, (isHitting ? 0.68 : 0.42) * fade));
    fillG.addColorStop(1, rgbToCss(color, (isHitting ? 0.56 : 0.28) * fade));
    ctx.fillStyle = fillG;
    ctx.fill();

    // 2. Clean outer dark separation moat (scaled smoothly with pxScale)
    ctx.strokeStyle = `rgba(2, 4, 9, ${(0.84 * fade).toFixed(3)})`;
    ctx.lineWidth = Math.max(3.6 * pxScale, 4.6 * bl.scale * pxScale);
    ctx.stroke();

    // 3. Smooth saturated outer neon tube (>= 2.1*pxScale prevents sub-pixel diagonal stair-stepping!)
    ctx.strokeStyle = rgbToCss(color, (isHitting ? 1.0 : 0.96) * fade);
    ctx.lineWidth = Math.max(2.1 * pxScale, (isHitting ? 3.1 : 2.5) * bl.scale * pxScale);
    ctx.stroke();

    // 4. Silky bright inner neon core (smoothly nested inside the outer tube — zero Moiré jaggies!)
    if (glowAmt > 0.05) {
      ctx.strokeStyle = rgbToCss(
        lightenRgb(bright, isHitting ? 0.72 : 0.45 * glowAmt),
        (isHitting ? 0.95 : 0.65) * fade
      );
      ctx.lineWidth = Math.max(1.15 * pxScale, (isHitting ? 1.6 : 1.25) * bl.scale * pxScale);
      ctx.stroke();
    }

    // 5. Bright leading contact bar right at the bottom striking edge
    const capInset = Math.min(r, botW * 0.24);
    ctx.strokeStyle = rgbToCss(lightenRgb(color, isHitting ? 0.85 : 0.55), (isHitting ? 1.0 : 0.82) * fade);
    ctx.lineWidth = Math.max(2.0 * pxScale, (isHitting ? 3.2 : 2.3) * bl.scale * pxScale);
    ctx.beginPath();
    ctx.moveTo(bl.x + capInset, bl.y - 0.5 * pxScale);
    ctx.lineTo(br.x - capInset, br.y - 0.5 * pxScale);
    ctx.stroke();
  }

  private drawGlassBarNote(
    ctx: CanvasRenderingContext2D,
    bl: { x: number; y: number; scale: number },
    br: { x: number; y: number; scale: number },
    tl: { x: number; y: number; scale: number },
    tr: { x: number; y: number; scale: number },
    botW: number,
    boxH: number,
    color: RGB,
    bright: RGB,
    isHitting: boolean,
    glowAmt: number,
    is3D: boolean,
    fade: number
  ): void {
    const r = Math.min(5 * bl.scale, botW * 0.38, boxH * 0.38);
    const deep = darkenRgb(color, 0.38);

    // Subtle 3D thickness extrusion beneath the bottom edge in 3D mode
    if (is3D && boxH > 8) {
      const depthPx = Math.max(2, 4.2 * bl.scale);
      ctx.fillStyle = rgbToCss(darkenRgb(color, 0.58), 0.9 * fade);
      ctx.beginPath();
      ctx.moveTo(bl.x + r * 0.5, bl.y);
      ctx.lineTo(br.x - r * 0.5, br.y);
      ctx.lineTo(br.x - r * 0.5, br.y + depthPx);
      ctx.lineTo(bl.x + r * 0.5, bl.y + depthPx);
      ctx.closePath();
      ctx.fill();
    }

    // Sculpted 3D glossy studio piano tile
    this.traceRoundedQuad(ctx, tl, tr, br, bl, r);
    const g = ctx.createLinearGradient(bl.x, bl.y, br.x, bl.y);
    g.addColorStop(0, rgbToCss(lightenRgb(color, 0.24), 0.96 * fade));
    g.addColorStop(0.28, rgbToCss(lightenRgb(color, isHitting ? 0.42 : 0.32 * glowAmt), 0.98 * fade));
    g.addColorStop(0.62, rgbToCss(color, 0.95 * fade));
    g.addColorStop(1, rgbToCss(deep, 0.96 * fade));
    ctx.fillStyle = g;
    ctx.fill();

    // Subtle glossy left-edge reflection streak (glass look without haziness)
    if (botW > 7 && boxH > 10) {
      const stripX1 = tl.x + (tr.x - tl.x) * 0.18;
      const stripX2 = bl.x + (br.x - bl.x) * 0.18;
      ctx.strokeStyle = `rgba(255, 255, 255, ${((isHitting ? 0.55 : 0.34) * fade).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, botW * 0.11);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(stripX1, tl.y + r + 1);
      ctx.lineTo(stripX2, bl.y - r - 1);
      ctx.stroke();
    }

    // Crisp dark contour + thin luminous bevel edge so stacked chord notes stay crystal clear!
    this.traceRoundedQuad(ctx, tl, tr, br, bl, r);
    ctx.strokeStyle = `rgba(3, 5, 11, ${(0.72 * fade).toFixed(3)})`;
    ctx.lineWidth = Math.max(1.5, 2.0 * bl.scale);
    ctx.stroke();

    ctx.strokeStyle = rgbToCss(lightenRgb(bright, 0.3), (isHitting ? 0.98 : 0.72) * fade);
    ctx.lineWidth = Math.max(0.85, 1.15 * bl.scale);
    ctx.stroke();
  }

  private drawPlasmaBeamNote(
    ctx: CanvasRenderingContext2D,
    bl: { x: number; y: number; scale: number },
    br: { x: number; y: number; scale: number },
    tl: { x: number; y: number; scale: number },
    tr: { x: number; y: number; scale: number },
    botW: number,
    topW: number,
    color: RGB,
    bright: RGB,
    isHitting: boolean,
    glowAmt: number,
    fade: number
  ): void {
    const bx = (bl.x + br.x) * 0.5;
    const tx = (tl.x + tr.x) * 0.5;
    const beamBotW = Math.max(3, botW * 0.48);
    const beamTopW = Math.max(1.4, topW * 0.28);

    const grad = ctx.createLinearGradient(bx, bl.y, tx, tl.y);
    grad.addColorStop(0, rgbToCss(lightenRgb(bright, 0.45 * glowAmt), 0.96 * fade));
    grad.addColorStop(0.28, rgbToCss(color, 0.9 * fade));
    grad.addColorStop(1, rgbToCss(color, 0.3 * fade));

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(bx - beamBotW * 0.5, bl.y);
    ctx.lineTo(bx + beamBotW * 0.5, bl.y);
    ctx.lineTo(tx + beamTopW * 0.5, tl.y);
    ctx.lineTo(tx - beamTopW * 0.5, tl.y);
    ctx.closePath();
    ctx.fill();

    // Focused core filament
    ctx.strokeStyle = `rgba(255,255,255,${((isHitting ? 0.92 : 0.58) * fade).toFixed(3)})`;
    ctx.lineWidth = Math.max(0.9, beamBotW * 0.22);
    ctx.beginPath();
    ctx.moveTo(bx, bl.y);
    ctx.lineTo(tx, tl.y);
    ctx.stroke();
  }

  private traceRoundedQuad(
    ctx: CanvasRenderingContext2D,
    tl: { x: number; y: number },
    tr: { x: number; y: number },
    br: { x: number; y: number },
    bl: { x: number; y: number },
    r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(tl.x + r, tl.y);
    ctx.lineTo(tr.x - r, tr.y);
    ctx.quadraticCurveTo(tr.x, tr.y, tr.x, tr.y + r);
    ctx.lineTo(br.x, br.y - r);
    ctx.quadraticCurveTo(br.x, br.y, br.x - r, br.y);
    ctx.lineTo(bl.x + r, bl.y);
    ctx.quadraticCurveTo(bl.x, bl.y, bl.x, bl.y - r);
    ctx.lineTo(tl.x, tl.y + r);
    ctx.quadraticCurveTo(tl.x, tl.y, tl.x + r, tl.y);
    ctx.closePath();
  }

  private renderPlasmaEdge(
    ctx: CanvasRenderingContext2D,
    width: number,
    hitLineY: number,
    clockSec: number,
    dt: number,
    settings: VisualizerSettings,
    audioEnergy: AudioEnergy
  ): void {
    const N = this.waveSamples;
    const layout = getPianoLayout();
    const intensity = settings.plasmaEdgeIntensity;

    const leftRgb = resolveNoteColor(
      { midi: 42, hand: 'left', velocity: 0.8, trackIndex: 0 },
      settings
    );
    const rightRgb = resolveNoteColor(
      { midi: 76, hand: 'right', velocity: 0.8, trackIndex: 1 },
      settings
    );

    const decay = Math.exp(-dt * 10.5);
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      this.waveEnergy[i] *= decay;
      const baseR = leftRgb.r * (1 - t) + rightRgb.r * t;
      const baseG = leftRgb.g * (1 - t) + rightRgb.g * t;
      const baseB = leftRgb.b * (1 - t) + rightRgb.b * t;
      this.waveColorR[i] += (baseR - this.waveColorR[i]) * Math.min(1, dt * 6);
      this.waveColorG[i] += (baseG - this.waveColorG[i]) * Math.min(1, dt * 6);
      this.waveColorB[i] += (baseB - this.waveColorB[i]) * Math.min(1, dt * 6);
    }

    for (let k = 0; k < TOTAL_KEYS; k++) {
      const ks = this.keyStates[k];
      if (ks.intensity < 0.04) continue;
      const centerIdx = Math.round(layout[k].normCenterX * (N - 1));
      const spread = 5;
      for (let d = -spread; d <= spread; d++) {
        const idx = centerIdx + d;
        if (idx < 0 || idx >= N) continue;
        const falloff = Math.exp(-(d * d) / 5.5);
        const boost = ks.intensity * (0.38 + ks.velocity * 0.6) * falloff;
        if (boost > this.waveEnergy[idx]) {
          this.waveEnergy[idx] = Math.min(1.25, boost);
        }
        const blend = Math.min(1, falloff * ks.intensity * 0.88);
        this.waveColorR[idx] = this.waveColorR[idx] * (1 - blend) + ks.color.r * blend;
        this.waveColorG[idx] = this.waveColorG[idx] * (1 - blend) + ks.color.g * blend;
        this.waveColorB[idx] = this.waveColorB[idx] * (1 - blend) + ks.color.b * blend;
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // Sleek, crisp plasma filament (colorful outer ribbon + fine bright filament — no milky glare!)
    const layers = [
      { width: 4.0 * intensity, alpha: 0.34, whiteMix: 0.06, ampScale: 1.0 },
      { width: 1.6 * Math.max(0.65, intensity * 0.78), alpha: 0.86, whiteMix: 0.42, ampScale: 0.7 },
    ];

    for (const layer of layers) {
      ctx.lineWidth = layer.width;
      ctx.lineCap = 'round';

      const step = 2;
      for (let i = 0; i < N - step; i += step) {
        const x1 = (i / (N - 1)) * width;
        const x2 = ((i + step) / (N - 1)) * width;
        const e1 = this.waveEnergy[i];
        const e2 = this.waveEnergy[i + step];

        const ripple1 =
          (Math.sin(i * 0.36 + clockSec * 9.5) * 0.55 + Math.cos(i * 0.74 - clockSec * 14.2) * 0.45) *
          (1.6 + audioEnergy.overall * 3.4 + e1 * 9.5) *
          intensity *
          layer.ampScale;
        const ripple2 =
          (Math.sin((i + step) * 0.36 + clockSec * 9.5) * 0.55 +
            Math.cos((i + step) * 0.74 - clockSec * 14.2) * 0.45) *
          (1.6 + audioEnergy.overall * 3.4 + e2 * 9.5) *
          intensity *
          layer.ampScale;

        const y1 = hitLineY - Math.abs(ripple1) - e1 * 3.2 * intensity;
        const y2 = hitLineY - Math.abs(ripple2) - e2 * 3.2 * intensity;

        const r = Math.min(255, Math.round(this.waveColorR[i] + (255 - this.waveColorR[i]) * (layer.whiteMix + e1 * 0.2)));
        const g = Math.min(255, Math.round(this.waveColorG[i] + (255 - this.waveColorG[i]) * (layer.whiteMix + e1 * 0.2)));
        const b = Math.min(255, Math.round(this.waveColorB[i] + (255 - this.waveColorB[i]) * (layer.whiteMix + e1 * 0.2)));

        ctx.strokeStyle = `rgba(${r},${g},${b},${Math.min(0.95, layer.alpha + e1 * 0.28).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    }

    // Compact, sharp colored impact flares + AAA cinema anamorphic horizontal lens streaks!
    for (let k = 0; k < TOTAL_KEYS; k++) {
      const ks = this.keyStates[k];
      if (ks.intensity < 0.22) continue;
      const cx = layout[k].normCenterX * width;
      const flareR = (12 + ks.velocity * 16) * intensity * ks.intensity;
      const fg = ctx.createRadialGradient(cx, hitLineY, 0, cx, hitLineY, flareR);
      fg.addColorStop(0, rgbToCss(lightenRgb(ks.color, 0.75), 0.86 * ks.intensity));
      fg.addColorStop(0.38, rgbToCss(ks.color, 0.48 * ks.intensity));
      fg.addColorStop(1, rgbToCss(ks.color, 0));
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(cx, hitLineY, flareR, 0, Math.PI * 2);
      ctx.fill();

      // Delicate AAA anamorphic horizontal streak along the strike edge
      if (ks.velocity > 0.45) {
        const streakHalfW = (48 + ks.velocity * 95) * intensity * ks.intensity;
        const streakH = Math.max(2, 3.6 * ks.intensity);
        const ag = ctx.createLinearGradient(cx - streakHalfW, hitLineY, cx + streakHalfW, hitLineY);
        ag.addColorStop(0, rgbToCss(ks.color, 0));
        ag.addColorStop(0.35, rgbToCss(ks.color, 0.32 * ks.intensity));
        ag.addColorStop(0.5, rgbToCss(lightenRgb(ks.color, 0.72), 0.72 * ks.intensity));
        ag.addColorStop(0.65, rgbToCss(ks.color, 0.32 * ks.intensity));
        ag.addColorStop(1, rgbToCss(ks.color, 0));
        ctx.fillStyle = ag;
        ctx.fillRect(cx - streakHalfW, hitLineY - streakH * 0.5, streakHalfW * 2, streakH);
      }
    }

    ctx.restore();
  }

  private renderPianoKeyboard(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    hitLineY: number,
    pianoHeight: number,
    settings: VisualizerSettings
  ): void {
    const layout = getPianoLayout();
    const blackKeyH = pianoHeight * 0.62;

    ctx.fillStyle = '#07080d';
    ctx.fillRect(0, hitLineY, width, pianoHeight);

    // 1. White Keys
    for (let i = 0; i < TOTAL_KEYS; i++) {
      const k = layout[i];
      if (k.isBlack) continue;
      const ks = this.keyStates[i];
      const x = k.normX * width;
      const w = k.normWidth * width;
      const pressShift = ks.intensity * 3.5;

      const grad = ctx.createLinearGradient(x, hitLineY, x, height);
      if (ks.intensity > 0.02) {
        const hi = lightenRgb(ks.color, 0.3);
        grad.addColorStop(0, rgbToCss(lightenRgb(ks.color, 0.45), 1));
        grad.addColorStop(0.32, rgbToCss(hi, 1));
        grad.addColorStop(0.86, rgbToCss(ks.color, 0.98));
        grad.addColorStop(1, rgbToCss(darkenRgb(ks.color, 0.2), 1));
      } else {
        grad.addColorStop(0, '#9ba6b8');
        grad.addColorStop(0.08, '#d4dce8');
        grad.addColorStop(0.82, '#c8d2e0');
        grad.addColorStop(0.94, '#a6b2c4');
        grad.addColorStop(1, '#7c899e');
      }

      ctx.fillStyle = grad;
      ctx.fillRect(x + 0.75, hitLineY + pressShift, Math.max(1, w - 1.5), pianoHeight - pressShift);

      ctx.fillStyle = ks.intensity > 0.05 ? 'rgba(255,255,255,0.22)' : 'rgba(10, 15, 28, 0.38)';
      ctx.fillRect(x + 0.75, height - 4, Math.max(1, w - 1.5), 4);

      if (settings.showKeyOctaveLabels && k.midi % 12 === 0 && w >= 12) {
        const octave = Math.floor(k.midi / 12) - 1;
        ctx.font = `600 ${Math.min(11, Math.max(8, Math.floor(w * 0.48)))}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillStyle = ks.intensity > 0.2 ? '#ffffff' : 'rgba(51, 65, 85, 0.75)';
        ctx.fillText(`C${octave}`, x + w * 0.5, height - 6);
      }
    }

    // 2. Subtle Neighbor Key Light Bleed across white keys
    if (settings.keyGlowSpread > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < TOTAL_KEYS; i++) {
        const ks = this.keyStates[i];
        if (ks.intensity < 0.06) continue;
        const cx = layout[i].normCenterX * width;
        const radius = (pianoHeight * 0.65 + layout[i].normWidth * width * 2.2) * settings.keyGlowSpread;
        const bleed = ctx.createRadialGradient(
          cx,
          hitLineY + pianoHeight * 0.18,
          0,
          cx,
          hitLineY + pianoHeight * 0.22,
          radius
        );
        bleed.addColorStop(0, rgbToCss(lightenRgb(ks.color, 0.25), 0.36 * ks.intensity));
        bleed.addColorStop(0.5, rgbToCss(ks.color, 0.14 * ks.intensity));
        bleed.addColorStop(1, rgbToCss(ks.color, 0));
        ctx.fillStyle = bleed;
        ctx.fillRect(cx - radius, hitLineY, radius * 2, pianoHeight);
      }
      ctx.restore();
    }

    // 3. Black Keys (deep glossy concert ebony)
    for (let i = 0; i < TOTAL_KEYS; i++) {
      const k = layout[i];
      if (!k.isBlack) continue;
      const ks = this.keyStates[i];
      const x = k.normX * width;
      const w = k.normWidth * width;
      const pressShift = ks.intensity * 2.5;
      const kh = blackKeyH - pressShift * 0.4;

      ctx.fillStyle = 'rgba(2, 6, 23, 0.52)';
      ctx.fillRect(x - 1.2, hitLineY, w + 2.6, kh + 3);

      const bodyGrad = ctx.createLinearGradient(x, hitLineY, x, hitLineY + kh);
      if (ks.intensity > 0.03) {
        bodyGrad.addColorStop(0, rgbToCss(lightenRgb(ks.color, 0.36), 1));
        bodyGrad.addColorStop(0.55, rgbToCss(ks.color, 1));
        bodyGrad.addColorStop(1, rgbToCss(darkenRgb(ks.color, 0.25), 1));
      } else {
        bodyGrad.addColorStop(0, '#141824');
        bodyGrad.addColorStop(0.12, '#05060b');
        bodyGrad.addColorStop(0.82, '#0a0d16');
        bodyGrad.addColorStop(1, '#1d2436');
      }

      ctx.fillStyle = bodyGrad;
      ctx.fillRect(x, hitLineY, w, kh);

      const innerPad = Math.max(1, w * 0.14);
      ctx.fillStyle =
        ks.intensity > 0.05
          ? `rgba(255, 255, 255, ${(0.35 * ks.intensity).toFixed(3)})`
          : 'rgba(255, 255, 255, 0.08)';
      ctx.fillRect(x + innerPad, hitLineY + 2, Math.max(1, w - innerPad * 2), kh - 7);

      if (ks.intensity > 0.05) {
        ctx.strokeStyle = rgbToCss(lightenRgb(ks.color, 0.55), 0.9 * ks.intensity);
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x + 0.5, hitLineY + 0.5, w - 1, kh - 1);
      }
    }

    const feltGrad = ctx.createLinearGradient(0, hitLineY, 0, hitLineY + 6);
    feltGrad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
    feltGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = feltGrad;
    ctx.fillRect(0, hitLineY, width, 6);
  }

  /**
   * Phase 2 AAA FX: Live Harmonic Audio EQ Spectrum gently undulating behind the strike bar.
   */
  private renderAudioSpectrum(
    ctx: CanvasRenderingContext2D,
    width: number,
    hitLineY: number,
    bins: Float32Array,
    settings: VisualizerSettings,
    audioEnergy: AudioEnergy
  ): void {
    const count = bins.length;
    if (count < 4) return;
    const maxBarH = hitLineY * 0.22 * settings.eqSpectrumHeight;
    if (maxBarH < 4) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const barSlot = width / count;
    const barW = Math.max(2, barSlot * 0.44);

    for (let i = 0; i < count; i++) {
      // Symmetrical bass-at-center / concert-mirror visual feel blended with low->high sweep
      const val = bins[i];
      if (val < 0.03) continue;

      const x = (i + 0.5) * barSlot;
      const h = Math.max(2, Math.pow(val, 1.25) * maxBarH * (0.85 + audioEnergy.overall * 0.35));
      const midiApprox = 21 + Math.round((i / (count - 1)) * 87);
      const col = resolveNoteColor(
        { midi: midiApprox, hand: midiApprox < 60 ? 'left' : 'right', velocity: val, trackIndex: i % 2 },
        settings
      );

      const g = ctx.createLinearGradient(x, hitLineY, x, hitLineY - h);
      g.addColorStop(0, rgbToCss(col, 0.34 * val));
      g.addColorStop(0.55, rgbToCss(lightenRgb(col, 0.2), 0.16 * val));
      g.addColorStop(1, rgbToCss(col, 0));

      ctx.fillStyle = g;
      ctx.fillRect(x - barW * 0.5, hitLineY - h, barW, h);

      // Tiny luminous peak cap floating cleanly at top of active EQ bar
      if (val > 0.22) {
        ctx.fillStyle = rgbToCss(lightenRgb(col, 0.55), 0.52 * val);
        ctx.fillRect(x - barW * 0.5, hitLineY - h - 2, barW, 2);
      }
    }

    ctx.restore();
  }

  /**
   * Phase 2 AAA FX: Glossy Grand-Piano Fallboard Mirror Reflection along top key hinge.
   */
  private renderKeybedMirrorReflection(
    ctx: CanvasRenderingContext2D,
    width: number,
    hitLineY: number,
    pianoHeight: number,
    settings: VisualizerSettings
  ): void {
    const layout = getPianoLayout();
    const reflH = Math.min(pianoHeight * 0.38, 42);
    const strength = settings.mirrorReflectionIntensity;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // Subtle dark glossy fallboard sheen bar right along key hinge
    const sheen = ctx.createLinearGradient(0, hitLineY, 0, hitLineY + reflH);
    sheen.addColorStop(0, `rgba(255, 255, 255, ${(0.09 * strength).toFixed(3)})`);
    sheen.addColorStop(0.28, `rgba(255, 255, 255, ${(0.02 * strength).toFixed(3)})`);
    sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, hitLineY, width, reflH);

    // Inverted mirrored vertical light reflections from struck notes onto glossy key surfaces
    for (let i = 0; i < TOTAL_KEYS; i++) {
      const ks = this.keyStates[i];
      if (ks.intensity < 0.08) continue;
      const k = layout[i];
      const cx = k.normCenterX * width;
      const rw = k.normWidth * width * 1.4;
      const rh = reflH * (0.65 + ks.velocity * 0.55) * ks.intensity;
      const g = ctx.createLinearGradient(cx, hitLineY, cx, hitLineY + rh);
      g.addColorStop(0, rgbToCss(lightenRgb(ks.color, 0.45), 0.48 * strength * ks.intensity));
      g.addColorStop(0.5, rgbToCss(ks.color, 0.18 * strength * ks.intensity));
      g.addColorStop(1, rgbToCss(ks.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - rw * 0.5, hitLineY, rw, rh);
    }

    ctx.restore();
  }

  /**
   * Phase 2 AAA FX: Sustain Pedal (CC64) Resonance Aura along bottom rim of the keyboard.
   */
  private renderSustainAura(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    hitLineY: number,
    pianoHeight: number,
    settings: VisualizerSettings
  ): void {
    const a = this.sustainSmooth;
    const colL = hexToRgb(settings.leftHandColor);
    const colR = hexToRgb(settings.rightHandColor);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const bandH = Math.max(10, pianoHeight * 0.24);
    const g = ctx.createLinearGradient(0, height - bandH, 0, height);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.65, `rgba(${Math.round((colL.r + colR.r) * 0.5)},${Math.round((colL.g + colR.g) * 0.5)},${Math.round((colL.b + colR.b) * 0.5)},${(0.16 * a).toFixed(3)})`);
    g.addColorStop(1, `rgba(255, 255, 255, ${(0.34 * a).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, height - bandH, width, bandH);

    // Subtle crisp glow line at bottom edge of the 88-key bed
    const lineG = ctx.createLinearGradient(0, 0, width, 0);
    lineG.addColorStop(0, rgbToCss(colL, 0.55 * a));
    lineG.addColorStop(0.5, `rgba(255, 255, 255, ${(0.72 * a).toFixed(3)})`);
    lineG.addColorStop(1, rgbToCss(colR, 0.55 * a));
    ctx.fillStyle = lineG;
    ctx.fillRect(0, height - 2.5, width, 2.5);

    // Subtle glowing side edge rails during sustained resonance
    ctx.fillStyle = `rgba(255, 255, 255, ${(0.18 * a).toFixed(3)})`;
    ctx.fillRect(0, hitLineY, 2, pianoHeight);
    ctx.fillRect(width - 2, hitLineY, 2, pianoHeight);
    ctx.restore();
  }

  /**
   * v3.0 SeeMusic Feature: Overhead Real-Hands Video Overlay aligned with the piano keybed,
   * complete with Y-position, zoom scale, soft top feather blend, and colored key-light bounce!
   */
  private renderOverheadHandsVideo(
    ctx: CanvasRenderingContext2D,
    videoEl: HTMLVideoElement,
    width: number,
    height: number,
    hitLineY: number,
    pianoHeight: number,
    settings: VisualizerSettings
  ): void {
    if (videoEl.videoWidth <= 0 || videoEl.videoHeight <= 0) return;

    const vidRatio = videoEl.videoWidth / videoEl.videoHeight;
    const drawW = width * settings.customVideoScale;
    const drawH = drawW / vidRatio;
    const dx = (width - drawW) * 0.5;
    // Anchor around the piano keyboard area, adjustable via customVideoY (-0.4..0.4)
    const dy = height - drawH + settings.customVideoY * height;

    // Region to show overhead hands video (bottom keyboard + adjustable top feather above hitLineY)
    const featherPx = Math.max(8, pianoHeight * 0.9 * settings.customVideoFeather);
    const clipTop = Math.max(0, hitLineY - featherPx * 0.55);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, clipTop, width, height - clipTop);
    ctx.clip();

    ctx.globalAlpha = Math.max(0, Math.min(1, settings.customVideoOpacity));
    ctx.filter = `brightness(${settings.bgBrightness.toFixed(2)}) saturate(${settings.bgSaturation.toFixed(2)})`;
    ctx.drawImage(videoEl, dx, dy, drawW, drawH);
    ctx.filter = 'none';

    // Smooth dark gradient feather along top edge so real footage melts seamlessly into neon highway
    if (featherPx > 10) {
      const grad = ctx.createLinearGradient(0, clipTop, 0, clipTop + featherPx);
      grad.addColorStop(0, 'rgba(3, 4, 8, 0.95)');
      grad.addColorStop(0.55, 'rgba(3, 4, 8, 0.35)');
      grad.addColorStop(1, 'rgba(3, 4, 8, 0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = grad;
      ctx.fillRect(0, clipTop, width, featherPx);
    }

    // Add luminous colored LED reflection onto the filmed hands/keys when keys are struck!
    const layout = getPianoLayout();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < TOTAL_KEYS; i++) {
      const ks = this.keyStates[i];
      if (ks.intensity < 0.08) continue;
      const k = layout[i];
      const cx = k.normCenterX * width;
      const rad = k.normWidth * width * 2.4;
      const g = ctx.createRadialGradient(cx, hitLineY + pianoHeight * 0.25, 0, cx, hitLineY + pianoHeight * 0.28, rad);
      g.addColorStop(0, rgbToCss(lightenRgb(ks.color, 0.35), 0.5 * ks.intensity));
      g.addColorStop(1, rgbToCss(ks.color, 0));
      ctx.fillStyle = g;
      ctx.fillRect(cx - rad, hitLineY, rad * 2, pianoHeight);
    }

    ctx.restore();
  }

  /**
   * v3.0 AAA Concert FX: Electric Lightning Arcs jumping dynamically between struck chord keys!
   */
  private renderElectricChordArcs(
    ctx: CanvasRenderingContext2D,
    width: number,
    hitLineY: number,
    clockSec: number
  ): void {
    const layout = getPianoLayout();
    const pxScale = Math.max(1, width / 1360);
    const active: Array<{ midi: number; x: number; intensity: number; color: RGB }> = [];

    for (let i = 0; i < TOTAL_KEYS; i++) {
      const ks = this.keyStates[i];
      if (ks.intensity > 0.35) {
        active.push({
          midi: ks.midi,
          x: layout[i].normCenterX * width,
          intensity: ks.intensity,
          color: ks.color,
        });
      }
    }

    if (active.length < 2) return;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Connect adjacent simultaneously active keys within ~1.3 octaves (16 semitones)
    const timeTick = Math.floor(clockSec * 28); // crisp 28Hz crackling lightning flicker
    for (let i = 0; i < active.length - 1; i++) {
      const a = active[i];
      const b = active[i + 1];
      const span = b.midi - a.midi;
      if (span < 2 || span > 16) continue;

      const dist = b.x - a.x;
      const segs = Math.max(6, Math.min(16, Math.floor(dist / (18 * pxScale))));
      const amp = Math.min(26 * pxScale, (8 + dist * 0.08) * Math.min(a.intensity, b.intensity));
      const pts: Array<{ x: number; y: number }> = [];

      for (let s = 0; s <= segs; s++) {
        const t = s / segs;
        const x = a.x + dist * t;
        const arch = Math.sin(t * Math.PI);
        const seed = Math.sin((timeTick * 17.3 + i * 31.7 + s * 13.1)) * 43758.5453;
        const jitter = (seed - Math.floor(seed) - 0.5) * 2;
        const y = hitLineY - arch * amp * (0.6 + Math.abs(jitter) * 0.7) - jitter * amp * 0.45 * arch;
        pts.push({ x, y });
      }

      const boltGrad = ctx.createLinearGradient(a.x, hitLineY, b.x, hitLineY);
      const alpha = Math.min(1, (a.intensity + b.intensity) * 0.5);
      boltGrad.addColorStop(0, rgbToCss(a.color, 0.85 * alpha));
      boltGrad.addColorStop(1, rgbToCss(b.color, 0.85 * alpha));

      // Outer colored electric sheath
      ctx.strokeStyle = boltGrad;
      ctx.lineWidth = 3.2 * pxScale;
      ctx.beginPath();
      pts.forEach((p, idx) => (idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();

      // Razor white-hot plasma bolt core
      ctx.strokeStyle = `rgba(255, 255, 255, ${(0.92 * alpha).toFixed(3)})`;
      ctx.lineWidth = 1.15 * pxScale;
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * v3.0 YouTube/TikTok Ready: Renders optional Cinematic Title Intro Card & Channel Watermark
   * directly onto the canvas so they appear cleanly in Clean Video Mode & 60fps exports!
   */
  private renderTitleAndWatermark(
    ctx: CanvasRenderingContext2D,
    midi: ParsedMidi | null,
    currentTime: number,
    width: number,
    hitLineY: number,
    settings: VisualizerSettings
  ): void {
    const pxScale = Math.max(1, width / 1360);

    // 1. Cinematic Intro Title Card
    if (settings.showIntroTitle) {
      const titleText = (settings.introTitle.trim() || midi?.name || 'SyntheCia Studio').trim();
      const subtitleText = settings.introSubtitle.trim();

      let alpha = 1;
      let slideX = 0;
      if (!settings.introAlwaysShow) {
        const dur = Math.max(2, settings.introDurationSec);
        if (currentTime > dur + 0.6) {
          alpha = 0;
        } else if (currentTime < 0.75) {
          const tIn = Math.max(0, currentTime / 0.75);
          const ease = 1 - Math.pow(1 - tIn, 3);
          alpha = ease;
          slideX = (1 - ease) * -28 * pxScale;
        } else if (currentTime > dur - 1.1) {
          const tOut = Math.max(0, Math.min(1, (dur - currentTime) / 1.1));
          alpha = tOut * tOut;
          slideX = (1 - tOut) * -14 * pxScale;
        }
      }

      if (alpha > 0.01) {
        const padX = 44 * pxScale + slideX;
        const baseY = hitLineY - 96 * pxScale;
        const leftCol = hexToRgb(settings.leftHandColor);
        const rightCol = hexToRgb(settings.rightHandColor);

        ctx.save();
        ctx.globalAlpha = alpha;

        // Glowing vertical accent bar
        const barGrad = ctx.createLinearGradient(padX, baseY - 36 * pxScale, padX, baseY + 26 * pxScale);
        barGrad.addColorStop(0, rgbToCss(leftCol, 0.95));
        barGrad.addColorStop(1, rgbToCss(rightCol, 0.95));
        ctx.fillStyle = barGrad;
        ctx.fillRect(padX, baseY - 34 * pxScale, 4 * pxScale, 58 * pxScale);

        // Song Title
        ctx.shadowColor = 'rgba(2, 4, 12, 0.9)';
        ctx.shadowBlur = 14 * pxScale;
        ctx.font = `700 ${Math.round(30 * pxScale)}px "Space Grotesk", "Inter", sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(titleText, padX + 18 * pxScale, baseY - 2 * pxScale);

        // Artist / Subtitle
        if (subtitleText.length > 0) {
          ctx.font = `500 ${Math.round(14 * pxScale)}px "Inter", sans-serif`;
          ctx.fillStyle = 'rgba(203, 213, 225, 0.86)';
          ctx.fillText(subtitleText, padX + 18 * pxScale, baseY + 21 * pxScale);
        }

        ctx.restore();
      }
    }

    // 2. Subtle Channel Watermark (bottom-right cleanly above keyboard)
    const wm = settings.watermarkText.trim();
    if (wm.length > 0 && settings.watermarkOpacity > 0.02) {
      ctx.save();
      ctx.globalAlpha = settings.watermarkOpacity;
      ctx.font = `600 ${Math.round(14 * pxScale)}px "Space Grotesk", "Inter", sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
      ctx.shadowBlur = 8 * pxScale;
      ctx.fillStyle = 'rgba(241, 245, 249, 0.92)';
      ctx.fillText(wm, width - 24 * pxScale, hitLineY - 18 * pxScale);
      ctx.restore();
    }
  }
}
