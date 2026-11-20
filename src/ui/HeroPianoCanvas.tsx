import React, { useEffect, useRef } from 'react';
import type { AudioEngine } from '../audio/AudioEngine';

interface HeroPianoCanvasProps {
  audioEngine: AudioEngine;
  soundEnabled: boolean;
  scrollProgressRef: React.MutableRefObject<number>;
  scrollVelocityRef: React.MutableRefObject<number>;
  onUserKeyPlay?: (noteName: string) => void;
}

interface HeroKeyDef {
  midi: number;
  name: string;
  isBlack: boolean;
  u0: number;
  u1: number;
  uCenter: number;
}

interface Particle3D {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  r: number;
  g: number;
  b: number;
  kind: 'spark' | 'orb' | 'star';
  spin: number;
}

interface AmbientStar {
  nx: number;
  ny: number;
  depth: number;
  size: number;
  phase: number;
}

interface RippleRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  r: number;
  g: number;
  b: number;
}

interface DemoNote {
  midi: number;
  start: number;
  duration: number;
  velocity: number;
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BLACK_SET = new Set([1, 3, 6, 8, 10]);

// 3 full concert octaves (C3=48 .. C6=84, 37 sculptural 3D keys)
const START_MIDI = 48;
const END_MIDI = 84;

function buildHeroKeys(): HeroKeyDef[] {
  const whiteCount = 22;
  const whiteW = 1 / whiteCount;
  const blackW = whiteW * 0.62;
  const keys: HeroKeyDef[] = [];
  let wIdx = 0;

  for (let m = START_MIDI; m <= END_MIDI; m++) {
    const pc = m % 12;
    const isBlack = BLACK_SET.has(pc);
    const name = `${NOTE_NAMES[pc]}${Math.floor(m / 12) - 1}`;
    if (!isBlack) {
      const u0 = wIdx * whiteW;
      const u1 = u0 + whiteW;
      keys.push({ midi: m, name, isBlack: false, u0, u1, uCenter: (u0 + u1) * 0.5 });
      wIdx++;
    } else {
      const seam = wIdx * whiteW;
      const tweak = pc === 1 || pc === 6 ? -0.06 : pc === 3 || pc === 10 ? 0.06 : 0;
      const u0 = seam - blackW * 0.5 + tweak * whiteW;
      const u1 = u0 + blackW;
      keys.push({ midi: m, name, isBlack: true, u0, u1, uCenter: (u0 + u1) * 0.5 });
    }
  }
  return keys;
}

// Rich cinematic looping arpeggio (Em9 -> Cmaj9 -> Gmaj7 -> Dadd9)
function buildAmbientLoop(): { notes: DemoNote[]; duration: number } {
  const progression = [
    { bass: [52, 59, 64], arp: [67, 71, 74, 78, 76, 74, 71, 67, 74, 79] },
    { bass: [48, 55, 60], arp: [64, 67, 71, 74, 76, 74, 71, 67, 72, 76] },
    { bass: [55, 62, 67], arp: [71, 74, 78, 79, 83, 79, 74, 71, 78, 83] },
    { bass: [50, 57, 62], arp: [66, 69, 73, 76, 78, 76, 73, 69, 74, 78] },
  ];
  const notes: DemoNote[] = [];
  let t = 0.15;
  for (const bar of progression) {
    bar.bass.forEach((m, i) => {
      notes.push({ midi: m, start: t + i * 0.14, duration: 2.3, velocity: 0.78 - i * 0.06 });
    });
    bar.arp.forEach((m, i) => {
      notes.push({
        midi: m,
        start: t + 0.22 + i * 0.36,
        duration: 0.76,
        velocity: 0.68 + (i === 4 || i === 9 ? 0.26 : (i % 2) * 0.1),
      });
    });
    t += 4.0;
  }
  return { notes, duration: 16.0 };
}

type RGB3 = [number, number, number];

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerpRGB(a: RGB3, b: RGB3, t: number): RGB3 {
  const c = clamp01(t);
  return [
    Math.round(a[0] + (b[0] - a[0]) * c),
    Math.round(a[1] + (b[1] - a[1]) * c),
    Math.round(a[2] + (b[2] - a[2]) * c),
  ];
}

// 4-Act Color Choreography morphing organically with scrollProgress (0 -> 1):
// Act 1: Stage Cyan & Concert Gold
// Act 2: Electric Rose & Orchid Bloom
// Act 3: Molten Amber & Arctic Cyan Cathedral
// Act 4: Luminous Platinum Gold Crescendo
const ACT_PALETTES: Array<{ low: RGB3; mid: RGB3; high: RGB3 }> = [
  { low: [56, 189, 248], mid: [186, 230, 253], high: [245, 158, 11] },
  { low: [244, 63, 94], mid: [244, 114, 182], high: [192, 132, 252] },
  { low: [14, 165, 233], mid: [251, 191, 36], high: [249, 115, 22] },
  { low: [56, 189, 248], mid: [248, 250, 252], high: [251, 191, 36] },
];

function sampleActPalette(scrollP: number): { low: RGB3; mid: RGB3; high: RGB3 } {
  const scaled = clamp01(scrollP) * 3;
  const idx = Math.min(2, Math.floor(scaled));
  const frac = scaled - idx;
  const a = ACT_PALETTES[idx];
  const b = ACT_PALETTES[idx + 1];
  return {
    low: lerpRGB(a.low, b.low, frac),
    mid: lerpRGB(a.mid, b.mid, frac),
    high: lerpRGB(a.high, b.high, frac),
  };
}

function colorForU(u: number, pal: { low: RGB3; mid: RGB3; high: RGB3 }): RGB3 {
  return u < 0.5 ? lerpRGB(pal.low, pal.mid, u * 2) : lerpRGB(pal.mid, pal.high, (u - 0.5) * 2);
}

/**
 * Full-Viewport Scroll-Choreographed 3D Concert Piano & Volumetric Optical Stage.
 * Morphs camera orbit, particle turbulence, acoustic frequency halo, and lighting across 4 visual acts!
 */
export const HeroPianoCanvas: React.FC<HeroPianoCanvasProps> = ({
  audioEngine,
  soundEnabled,
  scrollProgressRef,
  scrollVelocityRef,
  onUserKeyPlay,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  const onUserKeyPlayRef = useRef(onUserKeyPlay);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    onUserKeyPlayRef.current = onUserKeyPlay;
  }, [onUserKeyPlay]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const keys = buildHeroKeys();
    const keyByMidi = new Map<number, HeroKeyDef>();
    keys.forEach((k) => keyByMidi.set(k.midi, k));
    const loop = buildAmbientLoop();

    const keyPress = new Float32Array(END_MIDI + 1);
    const keyGlow = new Float32Array(END_MIDI + 1);
    const manualHeld = new Set<number>();
    const particles: Particle3D[] = [];
    const ripples: RippleRing[] = [];
    const stars: AmbientStar[] = Array.from({ length: 110 }, () => ({
      nx: Math.random(),
      ny: Math.random() * 0.85,
      depth: 0.35 + Math.random() * 1.4,
      size: 0.7 + Math.random() * 1.6,
      phase: Math.random() * Math.PI * 2,
    }));

    let width = 1280;
    let height = 800;
    let dpr = 1;

    // Smoothly damped camera & scroll values (zero React state re-renders!)
    let targetMouseX = 0;
    let targetMouseY = 0;
    let camX = 0;
    let camY = 0;
    let smoothScroll = scrollProgressRef.current;
    let pointerDown = false;
    let hoveredMidi: number | null = null;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(320, Math.round(rect.width * dpr));
      height = Math.max(320, Math.round(rect.height * dpr));
      canvas.width = width;
      canvas.height = height;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Dynamic 3D Camera Parameters computed from smoothScroll (0..1)
    let curHorizonY = 0.2;
    let curFrontY = 0.96;
    let curVanishX = 0.56;
    let curSpread = 1.18;
    let curPerspK = 0.56;

    const updateCameraChoreography = (p: number) => {
      const w2 = smoothstep(0.08, 0.38, p) * (1 - smoothstep(0.46, 0.72, p)); // Act II orbit
      const w3 = smoothstep(0.45, 0.68, p) * (1 - smoothstep(0.78, 0.96, p)); // Act III cathedral
      const w4 = smoothstep(0.75, 1.0, p); // Act IV finale zoom

      curHorizonY =
        0.21 * (1 - w2 - w3 - w4) +
        0.13 * w2 +
        0.29 * w3 +
        0.24 * w4 +
        camY * 0.024;
      curFrontY = 0.955 + w2 * 0.035 - w3 * 0.015 + w4 * 0.045 + camY * 0.012;
      curVanishX = 0.54 - w2 * 0.16 + w3 * 0.0 + w4 * 0.0 + camX * 0.055;
      curSpread = 1.18 + w2 * 0.12 - w3 * 0.06 + w4 * 0.18;
      curPerspK = 0.56 + w2 * 0.3 + w3 * 0.18 - w4 * 0.06;
    };

    const projectStage = (u: number, z: number, liftPx = 0) => {
      const baseHorizonY = height * curHorizonY;
      const baseFrontY = height * curFrontY;
      const vanishX = width * curVanishX;
      const persp = 1 / (1 + z * curPerspK);
      const y = baseFrontY - (baseFrontY - baseHorizonY) * (1 - persp) - liftPx * persp;
      const spread = width * curSpread * persp;
      const x = vanishX + (u - 0.5) * spread;
      return { x, y, scale: persp };
    };

    const spawnKeyBurst = (
      uCenter: number,
      zHinge: number,
      vel: number,
      col: RGB3,
      boost = 1
    ) => {
      const pt = projectStage(uCenter, zHinge, 4 * dpr);
      const count = Math.round((12 + vel * 16) * boost);
      for (let i = 0; i < count; i++) {
        if (particles.length > 720) particles.shift();
        const angle = -Math.PI * 0.5 + (Math.random() - 0.5) * 1.45;
        const speed = (70 + Math.random() * 235) * dpr * (0.85 + boost * 0.25);
        const roll = i % 5;
        particles.push({
          x: pt.x + (Math.random() - 0.5) * 16 * dpr,
          y: pt.y,
          vx: Math.cos(angle) * speed * 0.65,
          vy: Math.sin(angle) * speed,
          size: (1.5 + Math.random() * 3.1) * dpr,
          life: 0,
          maxLife: 0.8 + Math.random() * 1.15,
          r: col[0],
          g: col[1],
          b: col[2],
          kind: roll === 0 ? 'star' : roll === 1 ? 'orb' : 'spark',
          spin: Math.random() * Math.PI,
        });
      }
      if (ripples.length > 34) ripples.shift();
      ripples.push({
        x: pt.x,
        y: pt.y,
        radius: 6 * dpr,
        maxRadius: (52 + vel * 68) * dpr,
        life: 0,
        r: col[0],
        g: col[1],
        b: col[2],
      });
    };

    const hitTest3DKey = (clientX: number, clientY: number): HeroKeyDef | null => {
      const rect = canvas.getBoundingClientRect();
      const px = (clientX - rect.left) * dpr;
      const py = (clientY - rect.top) * dpr;

      const frontY = projectStage(0.5, 0).y;
      const backY = projectStage(0.5, 0.46).y;
      if (py < backY - 12 * dpr || py > frontY + 26 * dpr) return null;

      const tDepth = clamp01((frontY - py) / Math.max(1, frontY - backY));
      const z = tDepth * 0.46;
      const sample = projectStage(0.5, z);
      const spread = width * curSpread * sample.scale;
      const u = 0.5 + (px - sample.x) / Math.max(1, spread);
      if (u < 0 || u > 1) return null;

      if (tDepth >= 0.34) {
        for (const k of keys) {
          if (k.isBlack && u >= k.u0 && u <= k.u1) return k;
        }
      }
      for (const k of keys) {
        if (!k.isBlack && u >= k.u0 && u <= k.u1) return k;
      }
      return null;
    };

    const strikeUserKey = (k: HeroKeyDef) => {
      audioEngine.ensureInitialized();
      audioEngine.playNote(k.midi, 0.86, 1.4, true);
      keyPress[k.midi] = 1;
      keyGlow[k.midi] = 1;
      const pal = sampleActPalette(smoothScroll);
      spawnKeyBurst(k.uCenter, 0.46, 0.96, colorForU(k.uCenter, pal), 1.35);
      onUserKeyPlayRef.current?.(k.name);
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      targetMouseX = ((e.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
      targetMouseY = ((e.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;

      const hit = hitTest3DKey(e.clientX, e.clientY);
      if (pointerDown && hit && hit.midi !== hoveredMidi) {
        if (hoveredMidi !== null) manualHeld.delete(hoveredMidi);
        hoveredMidi = hit.midi;
        manualHeld.add(hit.midi);
        strikeUserKey(hit);
      } else if (!pointerDown) {
        hoveredMidi = hit ? hit.midi : null;
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest('button, a, input')) return;
      const hit = hitTest3DKey(e.clientX, e.clientY);
      if (!hit) return;
      pointerDown = true;
      hoveredMidi = hit.midi;
      manualHeld.add(hit.midi);
      strikeUserKey(hit);
    };

    const onPointerUp = () => {
      pointerDown = false;
      manualHeld.clear();
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });

    let rafId = 0;
    let lastStamp = performance.now();
    let songTime = 0;
    let clock = 0;
    let prevLoopTime = 0;
    const firedThisCycle = new Set<number>();

    const renderFrame = (now: number) => {
      const dt = Math.min(0.05, Math.max(0.001, (now - lastStamp) / 1000));
      lastStamp = now;
      clock += dt;

      // Inertial Lenis-like scroll damping & camera damping
      const targetP = scrollProgressRef.current;
      smoothScroll += (targetP - smoothScroll) * Math.min(1, dt * 6.2);
      const scrollVel = scrollVelocityRef.current;
      scrollVelocityRef.current *= Math.exp(-dt * 8.5);

      camX += (targetMouseX - camX) * Math.min(1, dt * 4.2);
      camY += (targetMouseY - camY) * Math.min(1, dt * 4.2);
      updateCameraChoreography(smoothScroll);

      const pal = sampleActPalette(smoothScroll);
      const act2Factor = smoothstep(0.14, 0.36, smoothScroll) * (1 - smoothstep(0.5, 0.72, smoothScroll));
      const act3Factor = smoothstep(0.48, 0.68, smoothScroll) * (1 - smoothstep(0.8, 0.96, smoothScroll));
      const act4Factor = smoothstep(0.76, 0.98, smoothScroll);

      // Advance autonomous performance loop (scroll velocity gently accelerates falling energy!)
      prevLoopTime = songTime;
      const speedBoost = 1 + Math.min(1.6, Math.abs(scrollVel) * 0.45);
      songTime = (songTime + dt * speedBoost) % loop.duration;
      if (songTime < prevLoopTime) firedThisCycle.clear();

      const activeSet = new Set<number>(manualHeld);
      let activeEnergy = 0;

      for (let i = 0; i < loop.notes.length; i++) {
        const n = loop.notes[i];
        const isActive = songTime >= n.start && songTime <= n.start + n.duration;
        if (isActive) {
          activeSet.add(n.midi);
          activeEnergy += n.velocity * 0.25;
          if (!firedThisCycle.has(i)) {
            firedThisCycle.add(i);
            const k = keyByMidi.get(n.midi);
            if (k) {
              spawnKeyBurst(k.uCenter, 0.46, n.velocity, colorForU(k.uCenter, pal), 1 + act2Factor * 0.75);
            }
            if (soundEnabledRef.current) {
              audioEngine.playNote(n.midi, n.velocity * 0.65, n.duration, true);
            }
          }
        }
      }
      activeEnergy = Math.min(1, activeEnergy);

      for (let m = START_MIDI; m <= END_MIDI; m++) {
        const target = activeSet.has(m) ? 1 : hoveredMidi === m ? 0.32 : 0;
        keyPress[m] += (target - keyPress[m]) * Math.min(1, dt * (target > keyPress[m] ? 25 : 9));
        const glowTarget = activeSet.has(m) ? 1 : hoveredMidi === m ? 0.48 : 0;
        keyGlow[m] += (glowTarget - keyGlow[m]) * Math.min(1, dt * (glowTarget > keyGlow[m] ? 26 : 4.0));
      }

      // 1. Deep Concert Void Backdrop with Scroll-Reactive Atmospheric Nebulae
      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, '#03050b');
      bg.addColorStop(0.55, '#060a14');
      bg.addColorStop(1, '#020408');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // Parallax depth dust stars scrolling smoothly vertically
      ctx.save();
      for (const st of stars) {
        const sy = (((st.ny - smoothScroll * 0.38 * st.depth) % 1) + 1) % 1;
        const sx = (((st.nx - camX * 0.025 * st.depth) % 1) + 1) % 1;
        const twinkle = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(clock * 1.9 + st.phase));
        ctx.fillStyle = `rgba(226, 232, 240, ${(twinkle * 0.45).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sx * width, sy * height, st.size * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Primary volumetric concert bloom floodlight
      const horizonPt = projectStage(0.5, 0.46);
      const flood = ctx.createRadialGradient(
        horizonPt.x,
        horizonPt.y,
        14 * dpr,
        horizonPt.x,
        horizonPt.y - height * 0.12,
        Math.max(width, height) * (0.62 + act2Factor * 0.18 + act4Factor * 0.16)
      );
      flood.addColorStop(
        0,
        `rgba(${pal.low[0]}, ${pal.low[1]}, ${pal.low[2]}, ${(0.22 + activeEnergy * 0.12 + act4Factor * 0.1).toFixed(3)})`
      );
      flood.addColorStop(
        0.48,
        `rgba(${pal.high[0]}, ${pal.high[1]}, ${pal.high[2]}, ${(0.08 + act2Factor * 0.08).toFixed(3)})`
      );
      flood.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = flood;
      ctx.fillRect(0, 0, width, height);

      // 2. ACT III SIGNATURE VISUAL: Giant 3D Concentric Acoustic Frequency Halo (Audio -> MIDI Morph!)
      if (act3Factor > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const cx = width * 0.5 + camX * 22 * dpr;
        const cy = height * 0.31 + camY * 14 * dpr;
        const baseR = Math.min(width, height) * (0.145 + act3Factor * 0.055);
        const bars = 96;

        // Glowing concentric acoustic rings
        for (let ring = 0; ring < 3; ring++) {
          const rRing = baseR * (0.72 + ring * 0.24) + activeEnergy * 10 * dpr;
          const ringCol = ring === 1 ? pal.high : pal.low;
          ctx.strokeStyle = `rgba(${ringCol[0]}, ${ringCol[1]}, ${ringCol[2]}, ${(act3Factor * (0.28 - ring * 0.07)).toFixed(3)})`;
          ctx.lineWidth = (1.6 - ring * 0.35) * dpr;
          ctx.beginPath();
          ctx.arc(cx, cy, rRing, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Radial audio spectrum rays crystallizing into music!
        for (let b = 0; b < bars; b++) {
          const theta = (b / bars) * Math.PI * 2 + clock * 0.22;
          const wave =
            0.35 +
            0.35 * Math.sin(b * 0.42 + clock * 4.4) +
            0.3 * Math.cos(b * 0.85 - clock * 3.1);
          const amp = (14 + wave * (36 + activeEnergy * 42)) * dpr * act3Factor;
          const r0 = baseR * 0.84;
          const r1 = r0 + amp;
          const c = colorForU(b / bars, pal);
          ctx.strokeStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${(0.68 * act3Factor).toFixed(3)})`;
          ctx.lineWidth = 2.0 * dpr;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(theta) * r0, cy + Math.sin(theta) * r0);
          ctx.lineTo(cx + Math.cos(theta) * r1, cy + Math.sin(theta) * r1);
          ctx.stroke();
        }

        // Soft radial atmospheric glow connecting halo smoothly down into the piano highway (no hard box edges!)
        const beamG = ctx.createRadialGradient(
          cx,
          cy + baseR * 0.65,
          baseR * 0.1,
          cx,
          cy + baseR * 1.15,
          baseR * 1.65
        );
        beamG.addColorStop(0, `rgba(${pal.mid[0]}, ${pal.mid[1]}, ${pal.mid[2]}, ${(0.22 * act3Factor).toFixed(3)})`);
        beamG.addColorStop(0.55, `rgba(${pal.low[0]}, ${pal.low[1]}, ${pal.low[2]}, ${(0.08 * act3Factor).toFixed(3)})`);
        beamG.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = beamG;
        ctx.beginPath();
        ctx.arc(cx, cy + baseR * 1.15, baseR * 1.65, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 3. 3D Perspective Stage Grid + Volumetric Multi-Ribbon Soundwaves (intensified in Act II!)
      ctx.save();
      for (const k of keys) {
        if (!k.isBlack && k.midi % 12 === 0) {
          const p0 = projectStage(k.u0, 0.46);
          const p1 = projectStage(k.u0, 5.2);
          const lg = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
          lg.addColorStop(0, 'rgba(226, 232, 240, 0.16)');
          lg.addColorStop(1, 'rgba(148, 163, 184, 0)');
          ctx.strokeStyle = lg;
          ctx.lineWidth = 1 * dpr;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
      }

      ctx.globalCompositeOperation = 'lighter';
      const waveCount = 3;
      for (let w = 0; w < waveCount; w++) {
        const c = w === 0 ? pal.low : w === 1 ? pal.mid : pal.high;
        const alpha = (0.14 + act2Factor * 0.22 + activeEnergy * 0.08) * (1 - w * 0.22);
        ctx.strokeStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha.toFixed(3)})`;
        ctx.lineWidth = (1.6 + act2Factor * 1.4) * dpr;
        ctx.beginPath();
        const steps = 76;
        const zDepth = 0.55 + w * 0.52;
        for (let s = 0; s <= steps; s++) {
          const u = s / steps;
          const pt = projectStage(u, zDepth);
          const amp = (14 + act2Factor * 44 + Math.sin(u * Math.PI) * 32) * dpr * pt.scale;
          const dy =
            Math.sin(u * (9 + w * 3) + clock * (1.7 + w * 0.65) + smoothScroll * 7.5) * amp * 0.6 +
            Math.cos(u * 17 - clock * 2.1 + w) * amp * 0.3;
          if (s === 0) ctx.moveTo(pt.x, pt.y - (26 + w * 24) * dpr + dy);
          else ctx.lineTo(pt.x, pt.y - (26 + w * 24) * dpr + dy);
        }
        ctx.stroke();
      }
      ctx.restore();

      // 4. 3D Perspective Falling Luminous Note Ribbons descending onto the Grand Keyboard
      const lookahead = 3.2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      for (const n of loop.notes) {
        const k = keyByMidi.get(n.midi);
        if (!k) continue;
        let dtStart = n.start - songTime;
        if (dtStart < -n.duration - 0.1) dtStart += loop.duration;
        if (dtStart > lookahead) continue;
        const dtEnd = dtStart + n.duration;
        if (dtEnd < 0) continue;

        const zNear = 0.46 + Math.max(0, dtStart / lookahead) * 4.5;
        const zFar = 0.46 + Math.min(1.04, dtEnd / lookahead) * 4.5;
        if (zFar <= zNear + 0.01) continue;

        const pad = (k.u1 - k.u0) * 0.16;
        const bl = projectStage(k.u0 + pad, zNear, 3 * dpr);
        const br = projectStage(k.u1 - pad, zNear, 3 * dpr);
        const tl = projectStage(k.u0 + pad, zFar, 3 * dpr);
        const tr = projectStage(k.u1 - pad, zFar, 3 * dpr);

        const col = colorForU(k.uCenter, pal);
        const isHit = dtStart <= 0 && dtEnd >= 0;
        const fade = Math.min(1, Math.max(0.14, (5.0 - zNear) * 0.34));

        const ng = ctx.createLinearGradient(bl.x, bl.y, tl.x, tl.y);
        ng.addColorStop(0, `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${(isHit ? 0.56 : 0.3) * fade})`);
        ng.addColorStop(1, `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${0.06 * fade})`);

        ctx.beginPath();
        ctx.moveTo(bl.x, bl.y);
        ctx.lineTo(br.x, br.y);
        ctx.lineTo(tr.x, tr.y);
        ctx.lineTo(tl.x, tl.y);
        ctx.closePath();
        ctx.fillStyle = ng;
        ctx.fill();

        ctx.strokeStyle = `rgba(${Math.min(255, col[0] + 72)}, ${Math.min(255, col[1] + 72)}, ${Math.min(255, col[2] + 72)}, ${(isHit ? 0.98 : 0.76) * fade})`;
        ctx.lineWidth = Math.max(1 * dpr, 1.9 * bl.scale * dpr);
        ctx.stroke();
      }

      // Volumetric vertical concert light pillars rising from struck keys
      for (const k of keys) {
        const gVal = keyGlow[k.midi];
        if (gVal < 0.04) continue;
        const col = colorForU(k.uCenter, pal);
        const pBase = projectStage(k.uCenter, 0.46, 2 * dpr);
        const beamH = (140 + gVal * 185 + act4Factor * 70) * dpr * pBase.scale;
        const bw = (k.u1 - k.u0) * width * 1.45 * pBase.scale;
        const bgGrad = ctx.createLinearGradient(pBase.x, pBase.y, pBase.x, pBase.y - beamH);
        bgGrad.addColorStop(0, `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${(0.38 * gVal).toFixed(3)})`);
        bgGrad.addColorStop(0.45, `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${(0.12 * gVal).toFixed(3)})`);
        bgGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(pBase.x - bw * 0.5, pBase.y - beamH, bw, beamH);
      }
      ctx.restore();

      // 5. Sculpted 3D Lacquer Piano Fallboard + Crimson Felt Strip
      const fbL = projectStage(0, 0.46);
      const fbR = projectStage(1, 0.46);
      const fbTopL = projectStage(0, 0.46, 24 * dpr);
      const fbTopR = projectStage(1, 0.46, 24 * dpr);
      ctx.beginPath();
      ctx.moveTo(fbTopL.x, fbTopL.y);
      ctx.lineTo(fbTopR.x, fbTopR.y);
      ctx.lineTo(fbR.x, fbR.y);
      ctx.lineTo(fbL.x, fbL.y);
      ctx.closePath();
      const fbGrad = ctx.createLinearGradient(0, fbTopL.y, 0, fbL.y);
      fbGrad.addColorStop(0, '#070910');
      fbGrad.addColorStop(0.72, '#13192a');
      fbGrad.addColorStop(1, '#040509');
      ctx.fillStyle = fbGrad;
      ctx.fill();

      // Crimson felt strip
      ctx.strokeStyle = 'rgba(185, 28, 28, 0.88)';
      ctx.lineWidth = 2.5 * dpr;
      ctx.beginPath();
      ctx.moveTo(fbL.x, fbL.y);
      ctx.lineTo(fbR.x, fbR.y);
      ctx.stroke();

      // Act IV Finale Anamorphic Horizontal Lens Sweep along piano horizon!
      if (act4Factor > 0.02) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const sweepG = ctx.createLinearGradient(fbL.x, fbL.y, fbR.x, fbR.y);
        sweepG.addColorStop(0, 'rgba(0,0,0,0)');
        sweepG.addColorStop(0.3, `rgba(${pal.low[0]}, ${pal.low[1]}, ${pal.low[2]}, ${(0.45 * act4Factor).toFixed(3)})`);
        sweepG.addColorStop(0.5, `rgba(255, 255, 255, ${(0.85 * act4Factor).toFixed(3)})`);
        sweepG.addColorStop(0.7, `rgba(${pal.high[0]}, ${pal.high[1]}, ${pal.high[2]}, ${(0.45 * act4Factor).toFixed(3)})`);
        sweepG.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.strokeStyle = sweepG;
        ctx.lineWidth = 4.5 * dpr;
        ctx.beginPath();
        ctx.moveTo(fbL.x, fbL.y);
        ctx.lineTo(fbR.x, fbR.y);
        ctx.stroke();
        ctx.restore();
      }

      // 6. Sculpted 3D White Keys (Hammer Depression + Front Lip + Luminous Color Bounce)
      const lipHeight = 17 * dpr;
      for (const k of keys) {
        if (k.isBlack) continue;
        const press = keyPress[k.midi];
        const glow = keyGlow[k.midi];
        const dropPx = press * 10 * dpr;
        const col = colorForU(k.uCenter, pal);

        const gap = (k.u1 - k.u0) * 0.045;
        const tl = projectStage(k.u0 + gap, 0.46, -dropPx * 0.15);
        const tr = projectStage(k.u1 - gap, 0.46, -dropPx * 0.15);
        const bl = projectStage(k.u0 + gap, 0.0, -dropPx);
        const br = projectStage(k.u1 - gap, 0.0, -dropPx);

        ctx.beginPath();
        ctx.moveTo(tl.x, tl.y);
        ctx.lineTo(tr.x, tr.y);
        ctx.lineTo(br.x, br.y);
        ctx.lineTo(bl.x, bl.y);
        ctx.closePath();

        const topGrad = ctx.createLinearGradient(tl.x, tl.y, bl.x, bl.y);
        if (glow > 0.03) {
          const mix = Math.min(1, glow * 0.92);
          const r0 = Math.round(218 + (col[0] - 218) * mix);
          const g0 = Math.round(226 + (col[1] - 226) * mix);
          const b0 = Math.round(238 + (col[2] - 238) * mix);
          topGrad.addColorStop(0, `rgb(${Math.min(255, r0 + 28)}, ${Math.min(255, g0 + 28)}, ${Math.min(255, b0 + 28)})`);
          topGrad.addColorStop(0.7, `rgb(${r0}, ${g0}, ${b0})`);
          topGrad.addColorStop(1, `rgb(${Math.round(r0 * 0.84)}, ${Math.round(g0 * 0.84)}, ${Math.round(b0 * 0.84)})`);
        } else {
          topGrad.addColorStop(0, '#a6b2c6');
          topGrad.addColorStop(0.16, '#e2e8f0');
          topGrad.addColorStop(0.88, '#f8fafc');
          topGrad.addColorStop(1, '#cbd5e1');
        }
        ctx.fillStyle = topGrad;
        ctx.fill();

        const curLip = Math.max(5 * dpr, lipHeight - dropPx * 0.55);
        ctx.beginPath();
        ctx.moveTo(bl.x, bl.y);
        ctx.lineTo(br.x, br.y);
        ctx.lineTo(br.x, br.y + curLip);
        ctx.lineTo(bl.x, bl.y + curLip);
        ctx.closePath();
        ctx.fillStyle =
          glow > 0.05
            ? `rgb(${Math.round(col[0] * 0.65)}, ${Math.round(col[1] * 0.65)}, ${Math.round(col[2] * 0.65)})`
            : '#8c99ae';
        ctx.fill();

        ctx.strokeStyle = 'rgba(2, 6, 23, 0.55)';
        ctx.lineWidth = 0.9 * dpr;
        ctx.stroke();
      }

      // 7. True 3D Extruded Ebony Black Keys
      for (const k of keys) {
        if (!k.isBlack) continue;
        const press = keyPress[k.midi];
        const glow = keyGlow[k.midi];
        const col = colorForU(k.uCenter, pal);

        const baseRaise = (14.5 - press * 8) * dpr;
        const zFront = 0.175;
        const zTopFront = 0.2;

        // Ground shadow onto adjacent white keys
        const sBL = projectStage(k.u0 - 0.002, zFront - 0.015, 0);
        const sBR = projectStage(k.u1 + 0.003, zFront - 0.015, 0);
        const sTL = projectStage(k.u0 - 0.002, 0.46, 0);
        const sTR = projectStage(k.u1 + 0.003, 0.46, 0);
        ctx.fillStyle = `rgba(2, 5, 14, ${(0.58 - press * 0.22).toFixed(2)})`;
        ctx.beginPath();
        ctx.moveTo(sTL.x, sTL.y);
        ctx.lineTo(sTR.x, sTR.y);
        ctx.lineTo(sBR.x, sBR.y);
        ctx.lineTo(sBL.x, sBL.y);
        ctx.closePath();
        ctx.fill();

        const topTL = projectStage(k.u0 + 0.001, 0.46, baseRaise);
        const topTR = projectStage(k.u1 - 0.001, 0.46, baseRaise);
        const topBL = projectStage(k.u0 + 0.002, zTopFront, baseRaise);
        const topBR = projectStage(k.u1 - 0.002, zTopFront, baseRaise);
        const botBL = projectStage(k.u0, zFront, 1.5 * dpr);
        const botBR = projectStage(k.u1, zFront, 1.5 * dpr);
        const botTL = projectStage(k.u0, 0.46, 0);
        const botTR = projectStage(k.u1, 0.46, 0);

        // Left & right cheeks
        ctx.fillStyle = '#070a12';
        ctx.beginPath();
        ctx.moveTo(topTL.x, topTL.y);
        ctx.lineTo(topBL.x, topBL.y);
        ctx.lineTo(botBL.x, botBL.y);
        ctx.lineTo(botTL.x, botTL.y);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#161e30';
        ctx.beginPath();
        ctx.moveTo(topTR.x, topTR.y);
        ctx.lineTo(topBR.x, topBR.y);
        ctx.lineTo(botBR.x, botBR.y);
        ctx.lineTo(botTR.x, botTR.y);
        ctx.closePath();
        ctx.fill();

        // Front bevel slope
        ctx.beginPath();
        ctx.moveTo(topBL.x, topBL.y);
        ctx.lineTo(topBR.x, topBR.y);
        ctx.lineTo(botBR.x, botBR.y);
        ctx.lineTo(botBL.x, botBL.y);
        ctx.closePath();
        ctx.fillStyle =
          glow > 0.04
            ? `rgba(${col[0]}, ${col[1]}, ${col[2]}, ${(0.36 + glow * 0.56).toFixed(2)})`
            : '#1e273d';
        ctx.fill();

        // Top glossy ebony face
        ctx.beginPath();
        ctx.moveTo(topTL.x, topTL.y);
        ctx.lineTo(topTR.x, topTR.y);
        ctx.lineTo(topBR.x, topBR.y);
        ctx.lineTo(topBL.x, topBL.y);
        ctx.closePath();
        const bGrad = ctx.createLinearGradient(topTL.x, topTL.y, topBL.x, topBL.y);
        if (glow > 0.04) {
          bGrad.addColorStop(0, `rgb(${Math.min(255, col[0] + 48)}, ${Math.min(255, col[1] + 48)}, ${Math.min(255, col[2] + 48)})`);
          bGrad.addColorStop(1, `rgb(${col[0]}, ${col[1]}, ${col[2]})`);
        } else {
          bGrad.addColorStop(0, '#0d111d');
          bGrad.addColorStop(0.55, '#06080f');
          bGrad.addColorStop(1, '#182134');
        }
        ctx.fillStyle = bGrad;
        ctx.fill();

        ctx.strokeStyle =
          glow > 0.04
            ? `rgba(255, 255, 255, ${(0.6 * glow).toFixed(2)})`
            : 'rgba(255, 255, 255, 0.13)';
        ctx.lineWidth = 0.85 * dpr;
        ctx.stroke();
      }

      // 8. Additive Impact Ripples + Curl-Noise Luminous Particles + 4-Point Optical Star Glints
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      for (let i = ripples.length - 1; i >= 0; i--) {
        const rp = ripples[i];
        rp.life += dt;
        const p = rp.life / 0.68;
        if (p >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        const rad = rp.radius + (rp.maxRadius - rp.radius) * (1 - Math.pow(1 - p, 3));
        const a = (1 - p) * (1 - p) * 0.58;
        ctx.strokeStyle = `rgba(${rp.r}, ${rp.g}, ${rp.b}, ${a.toFixed(3)})`;
        ctx.lineWidth = 1.6 * dpr;
        ctx.beginPath();
        ctx.ellipse(rp.x, rp.y, rad, rad * 0.34, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      const windTurbulence = 36 + act2Factor * 95 + Math.abs(scrollVel) * 90;
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.life += dt;
        if (pt.life >= pt.maxLife) {
          particles.splice(i, 1);
          continue;
        }
        const t = pt.life / pt.maxLife;
        pt.vx += Math.sin(pt.y * 0.014 + clock * 2.7 + smoothScroll * 6) * windTurbulence * dpr * dt;
        pt.vy *= Math.exp(-dt * 1.05);
        pt.vy -= (22 + act2Factor * 34) * dpr * dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;

        const alpha = (1 - t) * (1 - t);
        if (pt.kind === 'star') {
          const r = pt.size * (2.6 - t * 1.4);
          ctx.save();
          ctx.translate(pt.x, pt.y);
          ctx.rotate(pt.spin + clock * 1.8);
          ctx.strokeStyle = `rgba(255, 255, 255, ${(alpha * 0.92).toFixed(3)})`;
          ctx.lineWidth = 1.1 * dpr;
          ctx.beginPath();
          ctx.moveTo(-r, 0);
          ctx.lineTo(r, 0);
          ctx.moveTo(0, -r);
          ctx.lineTo(0, r);
          ctx.stroke();
          ctx.restore();
        } else if (pt.kind === 'orb') {
          const rad = pt.size * (1.9 - t * 0.8);
          const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, rad * 2.6);
          g.addColorStop(0, `rgba(255, 255, 255, ${(alpha * 0.92).toFixed(3)})`);
          g.addColorStop(0.4, `rgba(${pt.r}, ${pt.g}, ${pt.b}, ${(alpha * 0.58).toFixed(3)})`);
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, rad * 2.6, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.strokeStyle = `rgba(${pt.r}, ${pt.g}, ${pt.b}, ${(alpha * 0.88).toFixed(3)})`;
          ctx.lineWidth = Math.max(1, pt.size * 0.58);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(pt.x, pt.y);
          ctx.lineTo(pt.x - pt.vx * 0.032, pt.y - pt.vy * 0.032);
          ctx.stroke();
        }
      }
      ctx.restore();

      // Subtle cinema vignette around upper edges so ultra-minimal titles float cleanly
      const topVig = ctx.createLinearGradient(0, 0, 0, height * 0.34);
      topVig.addColorStop(0, 'rgba(3, 5, 11, 0.72)');
      topVig.addColorStop(1, 'rgba(3, 5, 11, 0)');
      ctx.fillStyle = topVig;
      ctx.fillRect(0, 0, width, height * 0.34);

      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [audioEngine, scrollProgressRef, scrollVelocityRef]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full block touch-none"
      aria-label="Interactive 3D Scroll-Choreographed Concert Piano Stage"
    />
  );
};
