import React, { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Play, Upload, Volume2, VolumeX } from 'lucide-react';
import type { AudioEngine } from '../audio/AudioEngine';
import { DEMO_SONGS } from '../midi/DemoSongs';
import type { Language } from '../types/visualizer';
import { BrandIcon } from './BrandIcon';
import { HeroPianoCanvas } from './HeroPianoCanvas';

interface LandingPageProps {
  audioEngine: AudioEngine;
  language: Language;
  onChangeLanguage: (lang: Language) => void;
  onLaunchStudio: () => void;
  onLaunchWithDemo: (demoId: string) => void;
  onLaunchWithFile: (file: File) => void;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Smooth bell curve opacity for each cinema Act over scrollProgress [0..1].
 */
function actEnvelope(p: number, start: number, peakIn: number, peakOut: number, end: number): number {
  if (p <= start || p >= end) return 0;
  if (p < peakIn) return clamp01((p - start) / Math.max(0.001, peakIn - start));
  if (p > peakOut) return clamp01((end - p) / Math.max(0.001, end - peakOut));
  return 1;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  audioEngine,
  language,
  onChangeLanguage,
  onLaunchStudio,
  onLaunchWithDemo,
  onLaunchWithFile,
}) => {
  const isEn = language === 'en';
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Continuous scroll refs read at 60fps with ZERO React re-renders!
  const scrollProgressRef = useRef(0);
  const scrollVelocityRef = useRef(0);
  const lastScrollTopRef = useRef(0);

  // Direct DOM refs for butter-smooth 60fps scroll-driven typography choreography
  const act1Ref = useRef<HTMLDivElement | null>(null);
  const act1BtnsRef = useRef<HTMLDivElement | null>(null);
  const act2Ref = useRef<HTMLDivElement | null>(null);
  const act3Ref = useRef<HTMLDivElement | null>(null);
  const act4Ref = useRef<HTMLDivElement | null>(null);
  const act4BtnsRef = useRef<HTMLDivElement | null>(null);
  const scrollBarFillRef = useRef<HTMLDivElement | null>(null);
  const scrollHintRef = useRef<HTMLDivElement | null>(null);

  const [activeAct, setActiveAct] = useState(0);
  const [heroSound, setHeroSound] = useState(false);
  const [lastPlayedNote, setLastPlayedNote] = useState<string | null>(null);

  const handleToggleHeroSound = () => {
    audioEngine.ensureInitialized();
    setHeroSound((prev) => {
      if (prev) audioEngine.stopAllNotes();
      return !prev;
    });
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      e.target.value = '';
      onLaunchWithFile(file);
    }
  };

  const scrollToAct = (actIdx: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
    const targets = [0, 0.34, 0.66, 1.0];
    el.scrollTo({ top: maxScroll * (targets[actIdx] ?? 0), behavior: 'smooth' });
  };

  // Drive DOM scroll-storytelling choreography at 60fps with smooth inertia!
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const onScroll = () => {
      const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
      const top = el.scrollTop;
      const delta = (top - lastScrollTopRef.current) / Math.max(1, el.clientHeight);
      lastScrollTopRef.current = top;
      scrollProgressRef.current = clamp01(top / maxScroll);
      scrollVelocityRef.current = Math.max(-4, Math.min(4, scrollVelocityRef.current + delta * 12));
    };

    el.addEventListener('scroll', onScroll, { passive: true });

    let rafId = 0;
    let smoothP = 0;
    let lastActReported = 0;

    const animateText = () => {
      smoothP += (scrollProgressRef.current - smoothP) * 0.1;

      const curAct = smoothP < 0.22 ? 0 : smoothP < 0.52 ? 1 : smoothP < 0.8 ? 2 : 3;
      if (curAct !== lastActReported) {
        lastActReported = curAct;
        setActiveAct(curAct);
      }

      // Act 1: Hero Overture (visible at p=0, expands & dissolves softly by p=0.26)
      if (act1Ref.current) {
        const a1 = smoothP < 0.04 ? 1 : clamp01(1 - (smoothP - 0.04) / 0.2);
        const y1 = -smoothP * 140;
        const sc1 = 1 + smoothP * 0.14;
        act1Ref.current.style.opacity = a1.toFixed(3);
        act1Ref.current.style.transform = `translate3d(0, ${y1.toFixed(1)}px, 0) scale(${sc1.toFixed(3)})`;
        if (act1BtnsRef.current) {
          act1BtnsRef.current.style.pointerEvents = a1 > 0.35 ? 'auto' : 'none';
        }
      }

      // Act 2: Particle Bloom (sweeps in cleanly around p=0.22..0.52)
      if (act2Ref.current) {
        const a2 = actEnvelope(smoothP, 0.18, 0.29, 0.43, 0.54);
        const y2 = (0.35 - smoothP) * 160;
        act2Ref.current.style.opacity = a2.toFixed(3);
        act2Ref.current.style.transform = `translate3d(0, ${y2.toFixed(1)}px, 0)`;
      }

      // Act 3: Acoustic Frequency Halo -> Keys (p=0.50..0.82)
      if (act3Ref.current) {
        const a3 = actEnvelope(smoothP, 0.5, 0.6, 0.72, 0.83);
        const y3 = (0.66 - smoothP) * 140;
        act3Ref.current.style.opacity = a3.toFixed(3);
        act3Ref.current.style.transform = `translate3d(0, ${y3.toFixed(1)}px, 0)`;
      }

      // Act 4: Grand Finale Portal (p=0.80..1.00)
      if (act4Ref.current) {
        const a4 = clamp01((smoothP - 0.78) / 0.16);
        const y4 = (1 - a4) * 44;
        const sc4 = 0.94 + a4 * 0.06;
        act4Ref.current.style.opacity = a4.toFixed(3);
        act4Ref.current.style.transform = `translate3d(0, ${y4.toFixed(1)}px, 0) scale(${sc4.toFixed(3)})`;
        if (act4BtnsRef.current) {
          act4BtnsRef.current.style.pointerEvents = a4 > 0.45 ? 'auto' : 'none';
        }
      }

      if (scrollBarFillRef.current) {
        scrollBarFillRef.current.style.transform = `scaleY(${Math.max(0.06, smoothP).toFixed(3)})`;
      }

      if (scrollHintRef.current) {
        const hintAlpha = clamp01(1 - smoothP / 0.12);
        scrollHintRef.current.style.opacity = hintAlpha.toFixed(3);
      }

      rafId = requestAnimationFrame(animateText);
    };

    rafId = requestAnimationFrame(animateText);
    return () => {
      cancelAnimationFrame(rafId);
      el.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <div className="relative w-full h-full bg-[#03050b] text-white overflow-hidden select-none">
      <input
        ref={fileInputRef}
        type="file"
        accept=".mid,.midi,audio/midi,audio/*,.mp3,.wav,.ogg,.flac,.m4a"
        className="hidden"
        onChange={handleFilePick}
      />

      {/* 1. CONTINUOUS FIXED 3D CONCERT PIANO & SCROLL-CHOREOGRAPHED OPTICAL STAGE */}
      <HeroPianoCanvas
        audioEngine={audioEngine}
        soundEnabled={heroSound}
        scrollProgressRef={scrollProgressRef}
        scrollVelocityRef={scrollVelocityRef}
        onUserKeyPlay={(note) => setLastPlayedNote(note)}
      />

      {/* 2. ULTRA-MINIMAL FLOATING NAV (Zero visual bloat) */}
      <header className="fixed top-5 left-5 right-5 z-40 flex items-center justify-between pointer-events-none">
        <button
          type="button"
          onClick={() => scrollToAct(0)}
          className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-[#04070f]/60 backdrop-blur-xl border border-white/[0.08] hover:border-white/20 transition pointer-events-auto cursor-pointer"
        >
          <BrandIcon size={26} />
          <span className="text-xs font-extrabold tracking-[0.18em] uppercase text-white font-[var(--font-display)]">
            SyntheCia
          </span>
        </button>

        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={handleToggleHeroSound}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full backdrop-blur-xl border text-[11px] font-mono transition cursor-pointer ${
              heroSound
                ? 'bg-amber-400/20 border-amber-400/45 text-amber-200'
                : 'bg-[#04070f]/60 border-white/[0.09] text-slate-300 hover:text-white'
            }`}
            title={isEn ? 'Toggle Live Piano Audio' : 'Bật/Tắt tiếng đàn trực tiếp'}
          >
            {heroSound ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">
              {heroSound ? (isEn ? 'Sound On' : 'Đang phát') : isEn ? 'Sound' : 'Âm thanh'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => onChangeLanguage(isEn ? 'vi' : 'en')}
            className="px-2.5 py-1.5 rounded-full bg-[#04070f]/60 backdrop-blur-xl border border-white/[0.09] hover:border-white/25 text-[11px] font-mono text-slate-300 hover:text-white transition cursor-pointer"
          >
            {isEn ? 'EN' : 'VI'}
          </button>

          <button
            type="button"
            onClick={onLaunchStudio}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-white text-slate-950 hover:bg-sky-300 text-xs font-bold tracking-tight transition shadow-[0_0_24px_rgba(255,255,255,0.22)] cursor-pointer"
          >
            <span>{isEn ? 'Studio' : 'Vào Studio'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* 3. RIGHT-EDGE MINIMAL 4-ACT SCROLL RAIL */}
      <nav
        aria-label="Story Chapters"
        className="fixed right-5 top-1/2 -translate-y-1/2 z-40 hidden sm:flex flex-col items-center gap-3 pointer-events-auto"
      >
        <div className="relative w-[2px] h-28 rounded-full bg-white/12 overflow-hidden">
          <div
            ref={scrollBarFillRef}
            style={{ transformOrigin: 'top', transform: 'scaleY(0.06)' }}
            className="w-full h-full bg-gradient-to-b from-sky-300 via-white to-amber-300"
          />
        </div>
        <div className="flex flex-col gap-2">
          {['01', '02', '03', '04'].map((num, idx) => (
            <button
              key={num}
              type="button"
              onClick={() => scrollToAct(idx)}
              className={`text-[10px] font-mono transition cursor-pointer ${
                activeAct === idx
                  ? 'text-white font-bold scale-110'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {num}
            </button>
          ))}
        </div>
      </nav>

      {/* 4. BOTTOM-LEFT LIVE 3D KEY READOUT (Subtle whisper) */}
      <div className="fixed bottom-5 left-5 z-30 pointer-events-none hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-[#04070f]/55 backdrop-blur-md border border-white/[0.08] text-[10px] font-mono text-slate-300">
        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
        <span>
          {lastPlayedNote
            ? `${isEn ? 'KEY' : 'PHÍM'} ${lastPlayedNote}`
            : isEn
              ? 'CLICK OR GLIDE THE 3D KEYS'
              : 'BẤM HOẶC LƯỚT PHÍM ĐÀN 3D'}
        </span>
      </div>

      {/* 5. SCROLL-DRIVEN CINEMA OVERLAY ACTS (Pure minimal typography, zero walls of text!) */}
      <div className="fixed inset-0 z-20 pointer-events-none flex items-center justify-center px-6 sm:px-12">
        {/* ACT I: THE OVERTURE */}
        <div
          ref={act1Ref}
          className="absolute inset-x-0 top-[14vh] sm:top-[16vh] max-w-[1320px] mx-auto px-6 sm:px-12 will-change-transform"
        >
          <div className="max-w-3xl space-y-5">
            <div className="text-[11px] font-mono uppercase tracking-[0.26em] text-sky-300/90">
              01 — WEBGL2 OPTICAL PIANO
            </div>
            <h1 className="text-5xl sm:text-7xl lg:text-[86px] font-extrabold tracking-[-0.04em] leading-[0.95] text-white font-[var(--font-display)]">
              {isEn ? (
                <>
                  TOUCH
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-300 via-white to-amber-300">
                    THE LIGHT.
                  </span>
                </>
              ) : (
                <>
                  CHẠM VÀO
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-300 via-white to-amber-300">
                    ÁNH SÁNG.
                  </span>
                </>
              )}
            </h1>

            <div ref={act1BtnsRef} className="inline-flex flex-wrap items-center gap-3 pt-2 pointer-events-auto">
              <button
                type="button"
                onClick={onLaunchStudio}
                className="flex items-center gap-2 px-6 py-3 rounded-full bg-sky-400 hover:bg-sky-300 text-slate-950 text-xs sm:text-sm font-extrabold tracking-wide uppercase shadow-[0_0_36px_rgba(56,189,248,0.42)] transition cursor-pointer font-[var(--font-display)]"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{isEn ? 'Enter Studio' : 'Vào Studio'}</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-5 py-3 rounded-full bg-[#060a14]/70 hover:bg-white/12 border border-white/15 text-slate-100 text-xs font-mono uppercase tracking-wider backdrop-blur-xl transition cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-amber-300" />
                <span>MIDI / MP3</span>
              </button>
            </div>
          </div>
        </div>

        {/* ACT II: PARTICLE SYMPHONY (Right-aligned sculpture while camera orbits left) */}
        <div
          ref={act2Ref}
          style={{ opacity: 0 }}
          className="absolute inset-x-0 top-[20vh] max-w-[1320px] mx-auto px-6 sm:px-12 flex justify-end will-change-transform"
        >
          <div className="text-right max-w-xl space-y-3">
            <div className="text-[11px] font-mono uppercase tracking-[0.28em] text-pink-300/90">
              02 — HDR BLOOM &amp; PHYSICS
            </div>
            <h2 className="text-4xl sm:text-6xl lg:text-[74px] font-extrabold tracking-[-0.04em] leading-[0.96] text-white font-[var(--font-display)]">
              {isEn ? (
                <>
                  24,000
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-300 via-pink-200 to-violet-300">
                    PARTICLES.
                  </span>
                </>
              ) : (
                <>
                  24.000
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-rose-300 via-pink-200 to-violet-300">
                    HẠT ÁNH SÁNG.
                  </span>
                </>
              )}
            </h2>
            <p className="text-xs font-mono tracking-[0.18em] uppercase text-slate-300/80">
              COSMIC SILK · FIRE · SAKURA · FROST
            </p>
          </div>
        </div>

        {/* ACT III: AUDIO -> MIDI METAMORPHOSIS (Centered cleanly under the giant 3D Acoustic Halo) */}
        <div
          ref={act3Ref}
          style={{ opacity: 0 }}
          className="absolute inset-x-0 top-[56vh] max-w-[1100px] mx-auto px-6 text-center space-y-2.5 will-change-transform"
        >
          <div className="text-[11px] font-mono uppercase tracking-[0.28em] text-amber-300/90">
            03 — AUDIO TO MIDI ENGINE
          </div>
          <h2 className="text-4xl sm:text-6xl lg:text-[72px] font-extrabold tracking-[-0.04em] leading-[0.96] text-white font-[var(--font-display)] drop-shadow-[0_10px_30px_rgba(0,0,0,0.85)]">
            {isEn ? 'ANY SONG. PLAYABLE.' : 'MỌI BẢN NHẠC. CHƠI NGAY.'}
          </h2>
          <p className="text-xs font-mono tracking-[0.18em] uppercase text-slate-300/85">
            MP3 → MIDI · MAGIC KEYS · PRACTICE · 60FPS EXPORT
          </p>
        </div>

        {/* ACT IV: THE GRAND FINALE PORTAL */}
        <div
          ref={act4Ref}
          style={{ opacity: 0, pointerEvents: 'none' }}
          className="absolute inset-x-0 top-[18vh] max-w-2xl mx-auto px-6 text-center space-y-6 will-change-transform"
        >
          <div className="flex justify-center">
            <BrandIcon size={62} className="drop-shadow-[0_0_32px_rgba(56,189,248,0.45)]" />
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-mono uppercase tracking-[0.28em] text-sky-300">
              04 — FINALE
            </div>
            <h2 className="text-4xl sm:text-6xl lg:text-[76px] font-extrabold tracking-[-0.04em] leading-[0.95] text-white font-[var(--font-display)]">
              {isEn ? 'STEP ON STAGE.' : 'BƯỚC LÊN SÂN KHẤU.'}
            </h2>
          </div>

          <div ref={act4BtnsRef} style={{ pointerEvents: 'none' }} className="space-y-4 pt-1">
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onLaunchStudio}
                className="flex items-center gap-2.5 px-8 py-3.5 rounded-full bg-white hover:bg-sky-300 text-slate-950 text-sm font-extrabold uppercase tracking-wider shadow-[0_0_42px_rgba(255,255,255,0.3)] transition cursor-pointer font-[var(--font-display)]"
              >
                <span>{isEn ? 'Launch Studio' : 'Mở Studio'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Minimal 1-click demo pills */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {DEMO_SONGS.map((demo) => (
                <button
                  key={demo.id}
                  type="button"
                  onClick={() => onLaunchWithDemo(demo.id)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#060a14]/70 hover:bg-white/14 border border-white/12 text-[11px] font-mono text-slate-200 hover:text-white backdrop-blur-xl transition cursor-pointer"
                >
                  <Play className="w-2.5 h-2.5 fill-sky-400 text-sky-400" />
                  <span>{demo.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Subtle Scroll Hint in Act I */}
      <div
        ref={scrollHintRef}
        className="fixed bottom-5 right-5 z-30 pointer-events-none flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.22em] text-slate-300/80"
      >
        <span>{isEn ? 'Scroll' : 'Cuộn xuống'}</span>
        <ArrowDown className="w-3.5 h-3.5 animate-bounce text-sky-300" />
      </div>

      {/* 6. INVISIBLE 420vh SCROLL CHOREOGRAPHY TRACK */}
      <div
        ref={scrollerRef}
        className="relative z-10 w-full h-full overflow-y-auto overflow-x-hidden studio-scroll"
      >
        <div className="h-[420vh] w-full pointer-events-none" />
      </div>
    </div>
  );
};
