import type { AudioMode, InstrumentPreset } from '../types/visualizer';

export interface AudioEnergy {
  bass: number; // 0..1
  mid: number; // 0..1
  treble: number; // 0..1
  overall: number; // 0..1
}

export type SampleLoadState = 'idle' | 'loading' | 'ready' | 'fallback';

interface ActiveVoice {
  stop: (fadeSec?: number) => void;
  midi: number;
}

const SALAMANDER_BASE = 'https://tonejs.github.io/audio/salamander/';
// 19 well-spaced concert grand samples covering A0..C8 with minimal bandwidth (~1.8 MB total)
const SALAMANDER_SAMPLES: Array<{ midi: number; file: string }> = [
  { midi: 21, file: 'A0.mp3' },
  { midi: 24, file: 'C1.mp3' },
  { midi: 30, file: 'Fs1.mp3' },
  { midi: 33, file: 'A1.mp3' },
  { midi: 36, file: 'C2.mp3' },
  { midi: 42, file: 'Fs2.mp3' },
  { midi: 45, file: 'A2.mp3' },
  { midi: 48, file: 'C3.mp3' },
  { midi: 54, file: 'Fs3.mp3' },
  { midi: 57, file: 'A3.mp3' },
  { midi: 60, file: 'C4.mp3' },
  { midi: 66, file: 'Fs4.mp3' },
  { midi: 69, file: 'A4.mp3' },
  { midi: 72, file: 'C5.mp3' },
  { midi: 78, file: 'Fs5.mp3' },
  { midi: 81, file: 'A5.mp3' },
  { midi: 84, file: 'C6.mp3' },
  { midi: 90, file: 'Fs6.mp3' },
  { midi: 96, file: 'C7.mp3' },
  { midi: 108, file: 'C8.mp3' },
];

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Generates an organic stereo concert-hall impulse response buffer procedurally
 * so lush studio piano reverb works 100% offline.
 */
function createHallImpulseResponse(ctx: AudioContext, durationSec = 2.4, decay = 2.8): AudioBuffer {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * durationSec);
  const buffer = ctx.createBuffer(2, length, rate);

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const env = Math.pow(1 - t, decay);
      // Warm damped high frequencies over time
      const white = Math.random() * 2 - 1;
      lp = lp * 0.72 + white * 0.28;
      // Soft early pre-delay swell
      const attack = Math.min(1, i / (rate * 0.018));
      data[i] = lp * env * attack * 0.55;
    }
  }
  return buffer;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private analyser: AnalyserNode | null = null;
  private recordDest: MediaStreamAudioDestinationNode | null = null;
  private fftData: Uint8Array<ArrayBuffer> | null = null;

  private samples = new Map<number, AudioBuffer>();
  private sampleLoadState: SampleLoadState = 'idle';
  private sampleLoadPromise: Promise<void> | null = null;
  private onSampleStateChange?: (state: SampleLoadState, loaded: number, total: number) => void;

  private customAudioBuffer: AudioBuffer | null = null;
  private customAudioSource: AudioBufferSourceNode | null = null;
  private customAudioName: string | null = null;

  private activeVoices: ActiveVoice[] = [];
  private mode: AudioMode = 'salamander';
  private instrument: InstrumentPreset = 'grand';
  private transposeSemitones = 0;
  private volume = 0.82;
  private reverbMix = 0.36;
  private smoothedEnergy: AudioEnergy = { bass: 0, mid: 0, treble: 0, overall: 0 };
  private spectrumOut = new Float32Array(64);

  public setSampleStateListener(
    cb: (state: SampleLoadState, loaded: number, total: number) => void
  ): void {
    this.onSampleStateChange = cb;
  }

  public getSampleLoadState(): SampleLoadState {
    return this.sampleLoadState;
  }

  public getCustomAudioName(): string | null {
    return this.customAudioName;
  }

  public hasCustomAudio(): boolean {
    return this.customAudioBuffer !== null;
  }

  public ensureInitialized(): AudioContext {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return this.ctx;
    }

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    this.ctx = ctx;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -10;
    compressor.knee.value = 18;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.16;

    const masterGain = ctx.createGain();
    masterGain.gain.value = this.volume;

    const dryGain = ctx.createGain();
    dryGain.gain.value = 1 - this.reverbMix * 0.35;

    const wetGain = ctx.createGain();
    wetGain.gain.value = this.reverbMix * 0.85;

    const convolver = ctx.createConvolver();
    convolver.buffer = createHallImpulseResponse(ctx);

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.78;

    const recordDest = ctx.createMediaStreamDestination();

    // Signal chain: Voices -> dryGain + convolver->wetGain -> compressor -> masterGain -> analyser -> destination + recordDest
    dryGain.connect(compressor);
    convolver.connect(wetGain);
    wetGain.connect(compressor);
    compressor.connect(masterGain);
    masterGain.connect(analyser);
    analyser.connect(ctx.destination);
    analyser.connect(recordDest);

    this.masterGain = masterGain;
    this.dryGain = dryGain;
    this.wetGain = wetGain;
    this.convolver = convolver;
    this.analyser = analyser;
    this.recordDest = recordDest;
    this.fftData = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));

    if (this.mode === 'salamander' && this.sampleLoadState === 'idle') {
      void this.preloadSalamanderSamples();
    }

    return ctx;
  }

  public getRecordStream(): MediaStream | null {
    this.ensureInitialized();
    return this.recordDest?.stream ?? null;
  }

  public setMode(mode: AudioMode): void {
    this.mode = mode;
    if (mode === 'salamander' && this.sampleLoadState === 'idle' && this.ctx) {
      void this.preloadSalamanderSamples();
    }
    if (mode !== 'custom-audio') {
      this.stopCustomAudio();
    }
  }

  public setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
    }
  }

  public setReverbMix(mix: number): void {
    this.reverbMix = Math.max(0, Math.min(1, mix));
    if (this.dryGain && this.wetGain && this.ctx) {
      this.dryGain.gain.setTargetAtTime(1 - this.reverbMix * 0.35, this.ctx.currentTime, 0.03);
      this.wetGain.gain.setTargetAtTime(this.reverbMix * 0.85, this.ctx.currentTime, 0.03);
    }
  }

  public setInstrument(preset: InstrumentPreset): void {
    this.instrument = preset;
  }

  public setTranspose(semitones: number): void {
    this.transposeSemitones = Math.max(-12, Math.min(12, Math.round(semitones)));
  }

  /**
   * Crisp studio woodblock/bell metronome tick routed cleanly into master bus.
   */
  public playMetronomeClick(accent: boolean): void {
    const ctx = this.ensureInitialized();
    if (!this.dryGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(accent ? 1320 : 880, now);
    osc.frequency.exponentialRampToValueAtTime(accent ? 660 : 440, now + 0.038);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(accent ? 0.24 : 0.14, now + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    osc.connect(env);
    env.connect(this.dryGain);
    osc.start(now);
    osc.stop(now + 0.065);
    osc.onended = () => {
      osc.disconnect();
      env.disconnect();
    };
  }

  public async preloadSalamanderSamples(): Promise<void> {
    if (this.sampleLoadPromise) return this.sampleLoadPromise;
    const ctx = this.ensureInitialized();

    this.sampleLoadState = 'loading';
    let loaded = 0;
    const total = SALAMANDER_SAMPLES.length;
    this.onSampleStateChange?.('loading', 0, total);

    this.sampleLoadPromise = (async () => {
      try {
        await Promise.all(
          SALAMANDER_SAMPLES.map(async ({ midi, file }) => {
            const resp = await fetch(`${SALAMANDER_BASE}${file}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const arr = await resp.arrayBuffer();
            const decoded = await ctx.decodeAudioData(arr);
            this.samples.set(midi, decoded);
            loaded++;
            this.onSampleStateChange?.('loading', loaded, total);
          })
        );
        this.sampleLoadState = 'ready';
        this.onSampleStateChange?.('ready', total, total);
      } catch {
        this.sampleLoadState = this.samples.size >= 6 ? 'ready' : 'fallback';
        this.onSampleStateChange?.(this.sampleLoadState, loaded, total);
      }
    })();

    return this.sampleLoadPromise;
  }

  public async loadCustomAudioFile(file: File): Promise<void> {
    const ctx = this.ensureInitialized();
    const arr = await file.arrayBuffer();
    this.customAudioBuffer = await ctx.decodeAudioData(arr);
    this.customAudioName = file.name;
  }

  public clearCustomAudio(): void {
    this.stopCustomAudio();
    this.customAudioBuffer = null;
    this.customAudioName = null;
  }

  public startCustomAudio(midiTimeSec: number, offsetMs: number, playbackRate: number): void {
    this.stopCustomAudio();
    if (this.mode !== 'custom-audio' || !this.customAudioBuffer) return;

    const ctx = this.ensureInitialized();
    const targetPos = midiTimeSec + offsetMs / 1000;
    const src = ctx.createBufferSource();
    src.buffer = this.customAudioBuffer;
    src.playbackRate.value = playbackRate;

    if (this.masterGain) {
      src.connect(this.masterGain);
    } else {
      src.connect(ctx.destination);
    }

    if (targetPos >= 0) {
      if (targetPos < this.customAudioBuffer.duration) {
        src.start(ctx.currentTime, targetPos);
      }
    } else {
      src.start(ctx.currentTime + Math.abs(targetPos) / Math.max(0.1, playbackRate), 0);
    }
    this.customAudioSource = src;
  }

  public stopCustomAudio(): void {
    if (this.customAudioSource) {
      try {
        this.customAudioSource.stop();
        this.customAudioSource.disconnect();
      } catch {
        // already stopped
      }
      this.customAudioSource = null;
    }
  }

  public stopAllNotes(): void {
    this.stopCustomAudio();
    for (const v of this.activeVoices) {
      v.stop(0.06);
    }
    this.activeVoices = [];
  }

  /**
   * Plays a single MIDI piano note with optional sustain pedal extension.
   */
  public playNote(midi: number, velocity: number, durationSec: number, sustained: boolean): void {
    if (this.mode === 'custom-audio' && this.customAudioBuffer) {
      return; // Custom audio file provides the audio
    }

    const ctx = this.ensureInitialized();
    if (!this.dryGain || !this.convolver) return;

    // Voice stealing cap to keep polyphony ultra-clean and glitch-free
    if (this.activeVoices.length > 72) {
      const oldest = this.activeVoices.shift();
      oldest?.stop(0.04);
    }

    const shiftedMidi = Math.max(12, Math.min(115, midi + this.transposeSemitones));
    const now = ctx.currentTime;
    const holdDur = sustained ? Math.max(durationSec, 1.85) : Math.max(0.08, durationSec);
    const releaseDur = sustained ? 1.35 : 0.42;

    // Gentle stereo image across the 88-key soundboard (low left, high right)
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-0.65, Math.min(0.65, ((shiftedMidi - 60) / 44) * 0.55));
    panner.connect(this.dryGain);
    panner.connect(this.convolver);

    if (this.instrument === 'rhodes') {
      this.triggerRhodesVoice(ctx, panner, shiftedMidi, velocity, now, holdDur, releaseDur);
    } else if (this.instrument === 'musicbox') {
      this.triggerMusicBoxVoice(ctx, panner, shiftedMidi, velocity, now, holdDur, releaseDur);
    } else if (this.instrument === 'felt') {
      if (this.mode === 'salamander' && this.samples.size > 0) {
        this.triggerSampleVoice(ctx, panner, shiftedMidi, velocity, now, holdDur, releaseDur * 1.15, true);
      } else {
        this.triggerSynthVoice(ctx, panner, shiftedMidi, velocity, now, holdDur, releaseDur * 1.15, true);
      }
    } else if (this.instrument === 'strings') {
      if (this.mode === 'salamander' && this.samples.size > 0) {
        this.triggerSampleVoice(ctx, panner, shiftedMidi, velocity * 0.88, now, holdDur, releaseDur, false);
      } else {
        this.triggerSynthVoice(ctx, panner, shiftedMidi, velocity * 0.88, now, holdDur, releaseDur, false);
      }
      this.triggerStringsPadVoice(ctx, panner, shiftedMidi, velocity * 0.55, now, holdDur, releaseDur + 0.85);
    } else {
      // Concert Grand (default)
      if (this.mode === 'salamander' && this.samples.size > 0) {
        this.triggerSampleVoice(ctx, panner, shiftedMidi, velocity, now, holdDur, releaseDur, false);
      } else {
        this.triggerSynthVoice(ctx, panner, shiftedMidi, velocity, now, holdDur, releaseDur, false);
      }
    }
  }

  private findNearestSample(midi: number): { sampleMidi: number; buffer: AudioBuffer } | null {
    let bestMidi = -1;
    let bestDist = Infinity;
    for (const key of this.samples.keys()) {
      const d = Math.abs(key - midi);
      if (d < bestDist) {
        bestDist = d;
        bestMidi = key;
      }
    }
    if (bestMidi === -1) return null;
    const buffer = this.samples.get(bestMidi);
    return buffer ? { sampleMidi: bestMidi, buffer } : null;
  }

  private triggerSampleVoice(
    ctx: AudioContext,
    dest: AudioNode,
    midi: number,
    velocity: number,
    now: number,
    holdDur: number,
    releaseDur: number,
    isFelt = false
  ): void {
    const nearest = this.findNearestSample(midi);
    if (!nearest) {
      this.triggerSynthVoice(ctx, dest, midi, velocity, now, holdDur, releaseDur, isFelt);
      return;
    }

    const src = ctx.createBufferSource();
    src.buffer = nearest.buffer;
    src.playbackRate.value = Math.pow(2, (midi - nearest.sampleMidi) / 12);

    // Subtle velocity-sensitive brightness filter (warm felt piano uses mellow intimate roll-off!)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = isFelt ? 0.65 : 0.9;
    filter.frequency.value = isFelt
      ? 520 + Math.pow(velocity, 1.35) * 2350
      : 1800 + Math.pow(velocity, 1.25) * 14500;

    const env = ctx.createGain();
    const peakGain = Math.pow(velocity, 1.35) * (isFelt ? 0.86 : 0.92);
    const attackSec = isFelt ? 0.022 : 0.006;
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(peakGain, now + attackSec);
    env.gain.setValueAtTime(peakGain, now + holdDur);
    env.gain.exponentialRampToValueAtTime(0.0001, now + holdDur + releaseDur);

    src.connect(filter);
    filter.connect(env);
    env.connect(dest);

    src.start(now);
    const stopAt = now + holdDur + releaseDur + 0.05;
    src.stop(stopAt);

    let stopped = false;
    const voice: ActiveVoice = {
      midi,
      stop: (fadeSec = 0.06) => {
        if (stopped) return;
        stopped = true;
        try {
          const t = ctx.currentTime;
          env.gain.cancelScheduledValues(t);
          env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), t);
          env.gain.exponentialRampToValueAtTime(0.0001, t + fadeSec);
          src.stop(t + fadeSec + 0.02);
        } catch {
          // ignore
        }
      },
    };
    this.activeVoices.push(voice);

    src.onended = () => {
      stopped = true;
      const idx = this.activeVoices.indexOf(voice);
      if (idx !== -1) this.activeVoices.splice(idx, 1);
      src.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }

  private triggerSynthVoice(
    ctx: AudioContext,
    dest: AudioNode,
    midi: number,
    velocity: number,
    now: number,
    holdDur: number,
    releaseDur: number,
    isFelt = false
  ): void {
    const freq = midiToFreq(midi);
    const env = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = 'lowpass';
    const brightness = isFelt
      ? 380 + Math.pow(velocity, 1.3) * Math.min(2200, freq * 3.1)
      : 650 + Math.pow(velocity, 1.3) * Math.min(7200, freq * 7.5);
    filter.frequency.setValueAtTime(brightness, now);
    filter.frequency.exponentialRampToValueAtTime(Math.max(180, freq * (isFelt ? 1.3 : 1.9)), now + holdDur + 0.5);

    const osc1 = ctx.createOscillator();
    osc1.type = isFelt ? 'sine' : 'triangle';
    osc1.frequency.value = freq;

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2.0012; // subtle piano string inharmonicity

    const osc3 = ctx.createOscillator();
    osc3.type = isFelt ? 'triangle' : 'sawtooth';
    osc3.frequency.value = freq * 1.0006;

    const g1 = ctx.createGain();
    g1.gain.value = isFelt ? 0.78 : 0.65;
    const g2 = ctx.createGain();
    g2.gain.value = (isFelt ? 0.12 : 0.24) * velocity;
    const g3 = ctx.createGain();
    g3.gain.value = (isFelt ? 0.08 : 0.14) * velocity;

    const peakGain = Math.pow(velocity, 1.3) * 0.42;
    const naturalDecay = Math.max(0.8, 3.8 - (midi - 21) * 0.032);
    const totalDur = Math.min(holdDur + releaseDur, naturalDecay + 1.2);

    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(peakGain, now + (isFelt ? 0.018 : 0.005));
    env.gain.exponentialRampToValueAtTime(Math.max(0.0005, peakGain * 0.32), now + Math.min(holdDur, naturalDecay * 0.55));
    env.gain.exponentialRampToValueAtTime(0.0001, now + totalDur);

    osc1.connect(g1);
    osc2.connect(g2);
    osc3.connect(g3);
    g1.connect(filter);
    g2.connect(filter);
    g3.connect(filter);
    filter.connect(env);
    env.connect(dest);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);
    const stopAt = now + totalDur + 0.04;
    osc1.stop(stopAt);
    osc2.stop(stopAt);
    osc3.stop(stopAt);

    let stopped = false;
    const voice: ActiveVoice = {
      midi,
      stop: (fadeSec = 0.06) => {
        if (stopped) return;
        stopped = true;
        try {
          const t = ctx.currentTime;
          env.gain.cancelScheduledValues(t);
          env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), t);
          env.gain.exponentialRampToValueAtTime(0.0001, t + fadeSec);
          osc1.stop(t + fadeSec + 0.02);
          osc2.stop(t + fadeSec + 0.02);
          osc3.stop(t + fadeSec + 0.02);
        } catch {
          // ignore
        }
      },
    };
    this.activeVoices.push(voice);

    osc1.onended = () => {
      stopped = true;
      const idx = this.activeVoices.indexOf(voice);
      if (idx !== -1) this.activeVoices.splice(idx, 1);
      osc1.disconnect();
      osc2.disconnect();
      osc3.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }

  /**
   * Warm Classic Electric Rhodes EP: sine body + FM bell-tine transient + subtle vibrato.
   */
  private triggerRhodesVoice(
    ctx: AudioContext,
    dest: AudioNode,
    midi: number,
    velocity: number,
    now: number,
    holdDur: number,
    releaseDur: number
  ): void {
    const freq = midiToFreq(midi);
    const carrier = ctx.createOscillator();
    carrier.type = 'sine';
    carrier.frequency.value = freq;

    const tine = ctx.createOscillator();
    tine.type = 'sine';
    tine.frequency.value = freq * 7.0; // signature Rhodes metallic tine chime

    const tineGain = ctx.createGain();
    const modDepth = freq * (0.35 + velocity * 1.1);
    tineGain.gain.setValueAtTime(modDepth, now);
    tineGain.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

    const warm2 = ctx.createOscillator();
    warm2.type = 'triangle';
    warm2.frequency.value = freq * 2.001;
    const warm2Gain = ctx.createGain();
    warm2Gain.gain.setValueAtTime(0.14 * velocity, now);
    warm2Gain.gain.exponentialRampToValueAtTime(0.001, now + Math.min(holdDur + 0.35, 1.5));

    const env = ctx.createGain();
    const peak = Math.pow(velocity, 1.25) * 0.44;
    const totalDur = Math.min(holdDur + releaseDur, 4.2);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(peak, now + 0.006);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0008, peak * 0.42), now + Math.min(holdDur, 1.4));
    env.gain.exponentialRampToValueAtTime(0.0001, now + totalDur);

    tine.connect(tineGain);
    tineGain.connect(carrier.frequency);
    carrier.connect(env);
    warm2.connect(warm2Gain);
    warm2Gain.connect(env);
    env.connect(dest);

    carrier.start(now);
    tine.start(now);
    warm2.start(now);
    const stopAt = now + totalDur + 0.04;
    carrier.stop(stopAt);
    tine.stop(stopAt);
    warm2.stop(stopAt);

    let stopped = false;
    const voice: ActiveVoice = {
      midi,
      stop: (fadeSec = 0.06) => {
        if (stopped) return;
        stopped = true;
        try {
          const t = ctx.currentTime;
          env.gain.cancelScheduledValues(t);
          env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), t);
          env.gain.exponentialRampToValueAtTime(0.0001, t + fadeSec);
          carrier.stop(t + fadeSec + 0.02);
          tine.stop(t + fadeSec + 0.02);
          warm2.stop(t + fadeSec + 0.02);
        } catch {
          // ignore
        }
      },
    };
    this.activeVoices.push(voice);
    carrier.onended = () => {
      stopped = true;
      const idx = this.activeVoices.indexOf(voice);
      if (idx !== -1) this.activeVoices.splice(idx, 1);
      carrier.disconnect();
      tine.disconnect();
      tineGain.disconnect();
      warm2.disconnect();
      warm2Gain.disconnect();
      env.disconnect();
    };
  }

  /**
   * Crystalline Celesta / Music Box: pure shimmering high partials with magical bell decay.
   */
  private triggerMusicBoxVoice(
    ctx: AudioContext,
    dest: AudioNode,
    midi: number,
    velocity: number,
    now: number,
    holdDur: number,
    releaseDur: number
  ): void {
    const freq = midiToFreq(Math.min(108, midi + 12)); // music box sits an octave higher cleanly
    const osc1 = ctx.createOscillator();
    osc1.type = 'sine';
    osc1.frequency.value = freq;

    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2.996;

    const osc3 = ctx.createOscillator();
    osc3.type = 'sine';
    osc3.frequency.value = freq * 5.42; // delicate metallic music-box sparkle

    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0.22 * velocity, now);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    const g3 = ctx.createGain();
    g3.gain.setValueAtTime(0.11 * velocity, now);
    g3.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);

    const env = ctx.createGain();
    const peak = Math.pow(velocity, 1.2) * 0.34;
    const totalDur = Math.min(Math.max(1.1, holdDur + releaseDur), 2.8);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(peak, now + 0.003);
    env.gain.exponentialRampToValueAtTime(0.0001, now + totalDur);

    osc1.connect(env);
    osc2.connect(g2);
    g2.connect(env);
    osc3.connect(g3);
    g3.connect(env);
    env.connect(dest);

    osc1.start(now);
    osc2.start(now);
    osc3.start(now);
    const stopAt = now + totalDur + 0.04;
    osc1.stop(stopAt);
    osc2.stop(stopAt);
    osc3.stop(stopAt);

    let stopped = false;
    const voice: ActiveVoice = {
      midi,
      stop: (fadeSec = 0.06) => {
        if (stopped) return;
        stopped = true;
        try {
          const t = ctx.currentTime;
          env.gain.cancelScheduledValues(t);
          env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), t);
          env.gain.exponentialRampToValueAtTime(0.0001, t + fadeSec);
          osc1.stop(t + fadeSec + 0.02);
          osc2.stop(t + fadeSec + 0.02);
          osc3.stop(t + fadeSec + 0.02);
        } catch {
          // ignore
        }
      },
    };
    this.activeVoices.push(voice);
    osc1.onended = () => {
      stopped = true;
      const idx = this.activeVoices.indexOf(voice);
      if (idx !== -1) this.activeVoices.splice(idx, 1);
      osc1.disconnect();
      osc2.disconnect();
      osc3.disconnect();
      g2.disconnect();
      g3.disconnect();
      env.disconnect();
    };
  }

  /**
   * Lush Cinematic Orchestral Strings Pad layered softly underneath Concert Grand!
   */
  private triggerStringsPadVoice(
    ctx: AudioContext,
    dest: AudioNode,
    midi: number,
    velocity: number,
    now: number,
    holdDur: number,
    releaseDur: number
  ): void {
    const freq = midiToFreq(midi);
    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = freq * 0.9965;

    const oscB = ctx.createOscillator();
    oscB.type = 'sawtooth';
    oscB.frequency.value = freq * 1.0035;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.linearRampToValueAtTime(Math.min(3400, freq * 4.5 + 900), now + 0.35);

    const env = ctx.createGain();
    const peak = Math.pow(velocity, 1.35) * 0.14;
    const totalDur = Math.min(holdDur + releaseDur, 4.8);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(peak, now + Math.min(0.28, totalDur * 0.35));
    env.gain.exponentialRampToValueAtTime(0.0001, now + totalDur);

    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(env);
    env.connect(dest);

    oscA.start(now);
    oscB.start(now);
    const stopAt = now + totalDur + 0.04;
    oscA.stop(stopAt);
    oscB.stop(stopAt);

    let stopped = false;
    const voice: ActiveVoice = {
      midi,
      stop: (fadeSec = 0.08) => {
        if (stopped) return;
        stopped = true;
        try {
          const t = ctx.currentTime;
          env.gain.cancelScheduledValues(t);
          env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), t);
          env.gain.exponentialRampToValueAtTime(0.0001, t + fadeSec);
          oscA.stop(t + fadeSec + 0.02);
          oscB.stop(t + fadeSec + 0.02);
        } catch {
          // ignore
        }
      },
    };
    this.activeVoices.push(voice);
    oscA.onended = () => {
      stopped = true;
      const idx = this.activeVoices.indexOf(voice);
      if (idx !== -1) this.activeVoices.splice(idx, 1);
      oscA.disconnect();
      oscB.disconnect();
      filter.disconnect();
      env.disconnect();
    };
  }

  public getAudioEnergy(activeNoteEnergyFallback = 0): AudioEnergy {
    if (!this.analyser || !this.fftData) {
      const e = Math.min(1, activeNoteEnergyFallback);
      this.smoothedEnergy.bass += (e * 0.85 - this.smoothedEnergy.bass) * 0.18;
      this.smoothedEnergy.mid += (e * 0.75 - this.smoothedEnergy.mid) * 0.18;
      this.smoothedEnergy.treble += (e * 0.6 - this.smoothedEnergy.treble) * 0.18;
      this.smoothedEnergy.overall += (e - this.smoothedEnergy.overall) * 0.18;
      return this.smoothedEnergy;
    }

    this.analyser.getByteFrequencyData(this.fftData);
    const len = this.fftData.length;
    let bassSum = 0;
    let midSum = 0;
    let trebleSum = 0;

    const bassEnd = Math.min(12, len);
    const midEnd = Math.min(48, len);

    for (let i = 0; i < bassEnd; i++) bassSum += this.fftData[i];
    for (let i = bassEnd; i < midEnd; i++) midSum += this.fftData[i];
    for (let i = midEnd; i < len; i++) trebleSum += this.fftData[i];

    const rawBass = Math.min(1, bassSum / (bassEnd * 210));
    const rawMid = Math.min(1, midSum / ((midEnd - bassEnd) * 185));
    const rawTreble = Math.min(1, trebleSum / ((len - midEnd) * 145));
    const rawOverall = Math.min(
      1,
      Math.max(rawBass * 0.45 + rawMid * 0.35 + rawTreble * 0.2, activeNoteEnergyFallback * 0.65)
    );

    this.smoothedEnergy.bass += (rawBass - this.smoothedEnergy.bass) * 0.22;
    this.smoothedEnergy.mid += (rawMid - this.smoothedEnergy.mid) * 0.22;
    this.smoothedEnergy.treble += (rawTreble - this.smoothedEnergy.treble) * 0.22;
    this.smoothedEnergy.overall += (rawOverall - this.smoothedEnergy.overall) * 0.22;

    return this.smoothedEnergy;
  }

  /**
   * Returns 64 smoothed log-spaced frequency bins in [0..1] for the live Audio EQ Spectrum visualizer.
   */
  public getSpectrumBins(activeKeyFallback = 0): Float32Array {
    const out = this.spectrumOut;
    const count = out.length;

    if (!this.analyser || !this.fftData) {
      for (let i = 0; i < count; i++) {
        const target = activeKeyFallback * 0.35 * Math.sin((i / count) * Math.PI);
        out[i] += (target - out[i]) * 0.18;
      }
      return out;
    }

    this.analyser.getByteFrequencyData(this.fftData);
    const maxBin = Math.min(this.fftData.length - 1, 96);
    for (let i = 0; i < count; i++) {
      // Gentle logarithmic mapping so bass & piano fundamentals get expressive spread
      const t = i / (count - 1);
      const binIdx = Math.min(maxBin, Math.floor(Math.pow(t, 1.35) * maxBin));
      const raw = this.fftData[binIdx] / 255;
      out[i] += (raw - out[i]) * (raw > out[i] ? 0.42 : 0.16);
    }
    return out;
  }

  public dispose(): void {
    this.stopAllNotes();
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
