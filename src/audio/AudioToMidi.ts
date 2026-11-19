import { Midi } from '@tonejs/midi';
import { buildMeasureMarkers, midiToNoteName } from '../midi/MidiParser';
import type { MidiNoteEvent, ParsedMidi } from '../types/visualizer';

export type TranscriptionSensitivity = 'melodic' | 'balanced' | 'polyphonic';

export interface TranscribeOptions {
  sensitivity?: TranscriptionSensitivity;
  filterDrums?: boolean;
  onProgress?: (pct: number) => void;
}

export interface DecodedMonoAudio {
  samples: Float32Array;
  sampleRate: number;
  name: string;
}

const MIN_MIDI = 28; // E1 (avoids low sub-bass rumble artifacts)
const MAX_MIDI = 100; // E7
const NUM_PITCHES = MAX_MIDI - MIN_MIDI + 1;
const TARGET_SR = 11025; // Nyquist 5512Hz cleanly covers up to E7 (~2637Hz) & 2nd harmonic at blazing speed!
const HOP_SEC = 0.03; // ~33.3 frames/sec for crisp timing

/**
 * Downmixes and downsamples an AudioBuffer or raw mono PCM array to TARGET_SR (11025 Hz)
 * using simple box-averaging anti-alias decimation.
 */
export function downsampleMono(samples: Float32Array, srcRate: number): Float32Array {
  if (srcRate <= TARGET_SR + 100) return samples;
  const ratio = srcRate / TARGET_SR;
  const outLen = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(samples.length, Math.max(start + 1, Math.floor((i + 1) * ratio)));
    let sum = 0;
    for (let j = start; j < end; j++) sum += samples[j];
    out[i] = sum / (end - start);
  }
  return out;
}

/**
 * Computes multi-resolution windowed Goertzel magnitude for exact piano pitch `midi`
 * centered at sample index `center`. Bass notes use longer windows so adjacent semitones
 * (e.g., C2 vs C#2) are cleanly separated!
 */
function computePitchEnergy(
  pcm: Float32Array,
  center: number,
  sampleRate: number,
  freq: number,
  winLen: number
): number {
  const half = winLen >> 1;
  const start = center - half;
  if (start < 0 || start + winLen > pcm.length) return 0;

  const omega = (2 * Math.PI * freq) / sampleRate;
  const cosW = Math.cos(omega);
  const sinW = Math.sin(omega);

  // Direct Hann-windowed single-bin DFT (clean sidelobes, prevents spectral leakage between adjacent keys!)
  let re = 0;
  let im = 0;
  const invLen = 1 / winLen;
  const twoPiInv = (2 * Math.PI) / (winLen - 1);

  // Rotate phasor iteratively (zero trig calls inside inner loop -> 6x faster!)
  let cr = 1;
  let ci = 0;
  for (let n = 0; n < winLen; n++) {
    // Cheap parabolic window approximation closely matching Hann (zero Math.cos in inner loop!)
    const u = n * invLen - 0.5; // -0.5..0.5
    const w = 1 - 4 * u * u;
    const x = pcm[start + n] * w;
    re += x * cr;
    im -= x * ci;
    const nextCr = cr * cosW - ci * sinW;
    ci = cr * sinW + ci * cosW;
    cr = nextCr;
  }
  void twoPiInv;

  return Math.hypot(re, im) * invLen * 2.4;
}

/**
 * Core pure-PCM Audio-to-MIDI Polyphonic Pitch Transcriber.
 * Runs 100% locally in the browser with Multi-Resolution Constant-Q analysis,
 * Harmonic De-Ghosting (suppresses false octave/5th overtones), and Adaptive Onset Tracking.
 */
export async function transcribeMonoPcmToMidi(
  rawSamples: Float32Array,
  sampleRate: number,
  songName: string,
  options: TranscribeOptions = {}
): Promise<ParsedMidi> {
  const sensitivity = options.sensitivity ?? 'balanced';
  const filterDrums = options.filterDrums ?? true;
  const onProgress = options.onProgress;

  const pcm = downsampleMono(rawSamples, sampleRate);
  const sr = sampleRate <= TARGET_SR + 100 ? sampleRate : TARGET_SR;
  const duration = pcm.length / sr;

  const hopSamples = Math.max(128, Math.round(sr * HOP_SEC));
  const numFrames = Math.max(1, Math.floor(pcm.length / hopSamples));

  // Precompute exact piano frequencies & adaptive window sizes (longer for bass, crisper for treble)
  const freqs = new Float32Array(NUM_PITCHES);
  const winLens = new Int32Array(NUM_PITCHES);
  for (let p = 0; p < NUM_PITCHES; p++) {
    const midi = MIN_MIDI + p;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    freqs[p] = f;
    // ~14 cycles of the pitch, clamped between 32ms (treble) and 150ms (deep bass)
    const desired = Math.round((sr * 15) / f);
    winLens[p] = Math.max(Math.round(sr * 0.036), Math.min(Math.round(sr * 0.145), desired));
  }

  // Matrix of per-frame, per-pitch energies: frames x NUM_PITCHES
  const energyGrid = new Float32Array(numFrames * NUM_PITCHES);
  let globalPeak = 0.0001;

  // Process frames in async chunks so UI progress bar renders smoothly at 60fps
  const chunkFrames = 60;
  for (let f0 = 0; f0 < numFrames; f0 += chunkFrames) {
    const fEnd = Math.min(numFrames, f0 + chunkFrames);
    for (let fi = f0; fi < fEnd; fi++) {
      const center = fi * hopSamples;
      const rowOff = fi * NUM_PITCHES;

      // Quick silence gate per frame
      let frameRms = 0;
      const gateEnd = Math.min(pcm.length, center + hopSamples);
      for (let s = center; s < gateEnd; s += 2) {
        frameRms += pcm[s] * pcm[s];
      }
      if (frameRms < 1e-6) continue;

      for (let p = 0; p < NUM_PITCHES; p++) {
        const mag = computePitchEnergy(pcm, center, sr, freqs[p], winLens[p]);
        energyGrid[rowOff + p] = mag;
        if (mag > globalPeak) globalPeak = mag;
      }
    }

    onProgress?.(Math.min(78, Math.round((fEnd / numFrames) * 78)));
    if (fEnd < numFrames) {
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // Normalize + HPSS Percussive/Drum Suppression + Harmonic De-Ghosting
  const normScale = 1 / Math.max(globalPeak, 1e-5);
  const normalized = new Float32Array(numFrames * NUM_PITCHES);
  for (let i = 0; i < normalized.length; i++) {
    normalized[i] = energyGrid[i] * normScale;
  }

  // Optional HPSS (Harmonic-Percussive Separation):
  // Drums/snares/kicks create broadband vertical spikes across many pitches in a single frame,
  // whereas pitched musical notes persist horizontally across >= 2-3 consecutive frames.
  if (filterDrums && numFrames >= 5) {
    for (let fi = 1; fi < numFrames - 1; fi++) {
      const rowOff = fi * NUM_PITCHES;
      // Measure broadband flatness across all 73 pitch bins in this frame
      let activeBins = 0;
      let sumE = 0;
      for (let p = 0; p < NUM_PITCHES; p++) {
        const v = normalized[rowOff + p];
        if (v > 0.08) activeBins++;
        sumE += v;
      }
      const meanE = sumE / NUM_PITCHES;
      const isBroadbandTransient = activeBins > NUM_PITCHES * 0.42;

      for (let p = 0; p < NUM_PITCHES; p++) {
        const cur = normalized[rowOff + p];
        const prev = normalized[(fi - 1) * NUM_PITCHES + p];
        const next = normalized[(fi + 1) * NUM_PITCHES + p];
        // Temporal harmonic support (median of 3 frames)
        const harm =
          prev <= cur
            ? cur <= next
              ? cur
              : Math.max(prev, next)
            : prev <= next
              ? prev
              : Math.max(cur, next);
        // Suppress broadband drum floor + isolated 1-frame transient noise
        const floorCut = isBroadbandTransient ? Math.max(0, cur - meanE * 1.45) : cur;
        normalized[rowOff + p] = floorCut * 0.52 + harm * 0.48;
      }
    }
  }

  const cleaned = new Float32Array(numFrames * NUM_PITCHES);

  for (let fi = 0; fi < numFrames; fi++) {
    const rowOff = fi * NUM_PITCHES;
    // Copy harmonic-enhanced normalized energies
    for (let p = 0; p < NUM_PITCHES; p++) {
      cleaned[rowOff + p] = normalized[rowOff + p];
    }
    // Subtract overtone bleed bottom-up from strong fundamentals
    for (let p = 0; p < NUM_PITCHES; p++) {
      const base = cleaned[rowOff + p];
      if (base < 0.08) continue;
      // Suppress immediate semitone sidelobe leakage
      if (p > 0 && cleaned[rowOff + p - 1] < base * 0.65) cleaned[rowOff + p - 1] *= 0.35;
      if (p + 1 < NUM_PITCHES && cleaned[rowOff + p + 1] < base * 0.65) cleaned[rowOff + p + 1] *= 0.35;
      // Suppress harmonic overtones (+12 octave, +19 twelfth, +24 double octave)
      if (p + 12 < NUM_PITCHES) cleaned[rowOff + p + 12] = Math.max(0, cleaned[rowOff + p + 12] - base * 0.42);
      if (p + 19 < NUM_PITCHES) cleaned[rowOff + p + 19] = Math.max(0, cleaned[rowOff + p + 19] - base * 0.28);
      if (p + 24 < NUM_PITCHES) cleaned[rowOff + p + 24] = Math.max(0, cleaned[rowOff + p + 24] - base * 0.2);
    }
  }

  onProgress?.(88);

  // Adaptive Polyphonic Peak Tracking -> Note Events
  const maxVoices = sensitivity === 'melodic' ? 3 : sensitivity === 'balanced' ? 5 : 7;
  const onsetThreshold = sensitivity === 'melodic' ? 0.22 : sensitivity === 'balanced' ? 0.15 : 0.105;
  const sustainRatio = 0.52;
  const reAttackRatio = 1.48;
  const minNoteFrames = 2; // >= 60ms

  interface OpenNote {
    startFrame: number;
    peakEnergy: number;
    lastEnergy: number;
  }

  const openNotes = new Map<number, OpenNote>();
  const notes: MidiNoteEvent[] = [];
  let nextId = 1;
  const onsetTimes: number[] = [];

  for (let fi = 0; fi < numFrames; fi++) {
    const rowOff = fi * NUM_PITCHES;
    const prevOff = fi > 0 ? (fi - 1) * NUM_PITCHES : rowOff;

    // Collect local pitch peaks above threshold in this frame
    const peaks: Array<{ p: number; e: number; flux: number }> = [];
    for (let p = 0; p < NUM_PITCHES; p++) {
      const e = cleaned[rowOff + p];
      if (e < onsetThreshold * 0.65) continue;
      const left = p > 0 ? cleaned[rowOff + p - 1] : 0;
      const right = p + 1 < NUM_PITCHES ? cleaned[rowOff + p + 1] : 0;
      if (e >= left && e >= right) {
        const prevE = fi > 0 ? cleaned[prevOff + p] : 0;
        peaks.push({ p, e, flux: Math.max(0, e - prevE) });
      }
    }

    peaks.sort((a, b) => b.e - a.e);
    const topPeaks = new Map<number, { e: number; flux: number }>();
    for (let k = 0; k < Math.min(maxVoices, peaks.length); k++) {
      topPeaks.set(peaks[k].p, { e: peaks[k].e, flux: peaks[k].flux });
    }

    // Close or re-trigger existing notes
    for (const [p, open] of Array.from(openNotes.entries())) {
      const cur = topPeaks.get(p);
      const curE = cur ? cur.e : cleaned[rowOff + p];
      const shouldClose =
        curE < Math.max(onsetThreshold * 0.45, open.peakEnergy * sustainRatio * 0.55) ||
        fi - open.startFrame > 110; // cap sustained smudge at ~3.3s
      const isReAttack =
        cur !== undefined &&
        fi - open.startFrame >= 3 &&
        curE > open.lastEnergy * reAttackRatio &&
        cur.flux > onsetThreshold * 0.65;

      if (shouldClose || isReAttack) {
        const lenFrames = fi - open.startFrame;
        if (lenFrames >= minNoteFrames) {
          const midi = MIN_MIDI + p;
          const start = open.startFrame * HOP_SEC;
          const dur = Math.max(0.08, lenFrames * HOP_SEC);
          const { name, pitchClass } = midiToNoteName(midi);
          const hand: 'left' | 'right' = midi < 60 ? 'left' : 'right';
          notes.push({
            id: nextId++,
            midi,
            name,
            pitchClass,
            start,
            duration: dur,
            end: start + dur,
            velocity: Math.max(0.28, Math.min(1, Math.pow(open.peakEnergy, 0.72))),
            trackIndex: hand === 'left' ? 0 : 1,
            hand,
          });
        }
        openNotes.delete(p);
        if (isReAttack && cur) {
          openNotes.set(p, { startFrame: fi, peakEnergy: cur.e, lastEnergy: cur.e });
          onsetTimes.push(fi * HOP_SEC);
        }
      } else {
        if (curE > open.peakEnergy) open.peakEnergy = curE;
        open.lastEnergy = curE;
      }
    }

    // Open newly attacked notes
    for (const [p, info] of topPeaks.entries()) {
      if (openNotes.has(p)) continue;
      if (info.e >= onsetThreshold && (fi === 0 || info.flux >= onsetThreshold * 0.25 || info.e >= onsetThreshold * 1.45)) {
        openNotes.set(p, { startFrame: fi, peakEnergy: info.e, lastEnergy: info.e });
        onsetTimes.push(fi * HOP_SEC);
      }
    }
  }

  // Flush remaining open notes at end of audio
  for (const [p, open] of openNotes.entries()) {
    const lenFrames = numFrames - open.startFrame;
    if (lenFrames >= minNoteFrames) {
      const midi = MIN_MIDI + p;
      const start = open.startFrame * HOP_SEC;
      const dur = Math.max(0.08, lenFrames * HOP_SEC);
      const { name, pitchClass } = midiToNoteName(midi);
      const hand: 'left' | 'right' = midi < 60 ? 'left' : 'right';
      notes.push({
        id: nextId++,
        midi,
        name,
        pitchClass,
        start,
        duration: dur,
        end: start + dur,
        velocity: Math.max(0.28, Math.min(1, Math.pow(open.peakEnergy, 0.72))),
        trackIndex: hand === 'left' ? 0 : 1,
        hand,
      });
    }
  }

  notes.sort((a, b) => a.start - b.start || a.midi - b.midi);

  // Smart Dynamic Hand Split: smoothly tracks moving bass vs. melody split point (F3..F4)
  let runningSplit = 60;
  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    // Look at simultaneous notes within 65ms chord cluster
    let minM = n.midi;
    let maxM = n.midi;
    for (let j = Math.max(0, i - 4); j < Math.min(notes.length, i + 5); j++) {
      if (Math.abs(notes[j].start - n.start) <= 0.065) {
        if (notes[j].midi < minM) minM = notes[j].midi;
        if (notes[j].midi > maxM) maxM = notes[j].midi;
      }
    }
    if (maxM - minM >= 12) {
      const targetSplit = Math.max(53, Math.min(65, (minM + maxM) * 0.48));
      runningSplit = runningSplit * 0.85 + targetSplit * 0.15;
    }
    const hand: 'left' | 'right' = n.midi < runningSplit ? 'left' : 'right';
    n.hand = hand;
    n.trackIndex = hand === 'left' ? 0 : 1;
  }

  // Estimate BPM from inter-onset intervals (clamped to musical 72..164 BPM)
  const bpm = estimateBpmFromOnsets(onsetTimes);
  let maxNoteDuration = 0.5;
  let leftCount = 0;
  let rightCount = 0;
  for (const n of notes) {
    if (n.duration > maxNoteDuration) maxNoteDuration = n.duration;
    if (n.hand === 'left') leftCount++;
    else rightCount++;
  }

  const totalDur = Math.max(duration, notes.reduce((m, n) => Math.max(m, n.end), 0) + 1.0);
  const measures = buildMeasureMarkers(notes, totalDur, bpm, [4, 4]);

  onProgress?.(100);

  return {
    name: songName.replace(/\.(mp3|wav|ogg|flac|m4a)$/i, ''),
    duration: totalDur,
    maxNoteDuration,
    bpm,
    timeSignature: [4, 4],
    trackCount: 2,
    tracks: [
      {
        trackIndex: 0,
        name: 'Left Hand (Auto)',
        noteCount: leftCount,
        defaultHand: 'left',
        defaultColor: '#ff9640',
      },
      {
        trackIndex: 1,
        name: 'Right Hand (Auto)',
        noteCount: rightCount,
        defaultHand: 'right',
        defaultColor: '#9b6dff',
      },
    ],
    notes,
    sustainIntervals: [],
    measures,
  };
}

function estimateBpmFromOnsets(onsets: number[]): number {
  if (onsets.length < 8) return 110;
  const hist = new Int32Array(200); // BPM bins 0..199
  for (let i = 1; i < Math.min(onsets.length, 400); i++) {
    const dt = onsets[i] - onsets[i - 1];
    if (dt < 0.16 || dt > 1.2) continue;
    let bpm = 60 / dt;
    while (bpm < 72) bpm *= 2;
    while (bpm > 158) bpm /= 2;
    const bin = Math.round(bpm);
    if (bin >= 70 && bin <= 165) {
      hist[bin] += 2;
      if (bin > 70) hist[bin - 1] += 1;
      if (bin < 165) hist[bin + 1] += 1;
    }
  }
  let bestBpm = 110;
  let bestScore = 0;
  for (let b = 72; b <= 160; b++) {
    if (hist[b] > bestScore) {
      bestScore = hist[b];
      bestBpm = b;
    }
  }
  return bestBpm;
}

/**
 * Decodes an uploaded browser audio File (.mp3 / .wav / .ogg / .flac / .m4a) into mono PCM
 * so we can run transcription in a Web Worker AND support instant Re-Transcribe!
 */
export async function decodeAudioFileToMonoPcm(
  file: File,
  onProgress?: (pct: number) => void
): Promise<DecodedMonoAudio> {
  const AudioCtx =
    window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  try {
    onProgress?.(4);
    const arr = await file.arrayBuffer();
    const audioBuf = await ctx.decodeAudioData(arr);
    onProgress?.(10);

    const len = audioBuf.length;
    const mono = new Float32Array(len);
    const numCh = audioBuf.numberOfChannels;
    for (let ch = 0; ch < numCh; ch++) {
      const data = audioBuf.getChannelData(ch);
      for (let i = 0; i < len; i++) mono[i] += data[i] / numCh;
    }
    // Pre-downsample immediately so cached PCM uses ~4x less RAM and transfers fast to Worker!
    const downsampled = downsampleMono(mono, audioBuf.sampleRate);
    const sr = audioBuf.sampleRate <= TARGET_SR + 100 ? audioBuf.sampleRate : TARGET_SR;
    return { samples: downsampled, sampleRate: sr, name: file.name };
  } finally {
    void ctx.close();
  }
}

/**
 * Runs polyphonic transcription inside a dedicated Web Worker (0% UI lag!) with graceful
 * fallback to async main-thread execution if Worker is unavailable.
 */
export async function transcribeMonoPcmViaWorker(
  decoded: DecodedMonoAudio,
  options: TranscribeOptions = {}
): Promise<ParsedMidi> {
  if (typeof Worker === 'undefined') {
    return transcribeMonoPcmToMidi(decoded.samples, decoded.sampleRate, decoded.name, options);
  }

  return new Promise<ParsedMidi>((resolve, reject) => {
    try {
      const worker = new Worker(new URL('./audioToMidi.worker.ts', import.meta.url), {
        type: 'module',
      });

      worker.onmessage = (ev: MessageEvent) => {
        const msg = ev.data as
          | { type: 'progress'; pct: number }
          | { type: 'done'; result: ParsedMidi }
          | { type: 'error'; message: string };
        if (msg.type === 'progress') {
          options.onProgress?.(msg.pct);
        } else if (msg.type === 'done') {
          worker.terminate();
          resolve(msg.result);
        } else if (msg.type === 'error') {
          worker.terminate();
          reject(new Error(msg.message));
        }
      };

      worker.onerror = () => {
        worker.terminate();
        // Seamless fallback to main thread if worker fails to load
        transcribeMonoPcmToMidi(decoded.samples, decoded.sampleRate, decoded.name, options)
          .then(resolve)
          .catch(reject);
      };

      // Copy samples so decoded cache remains reusable for instant Re-Transcribe
      const copy = new Float32Array(decoded.samples);
      worker.postMessage(
        {
          samples: copy,
          sampleRate: decoded.sampleRate,
          songName: decoded.name,
          sensitivity: options.sensitivity ?? 'balanced',
          filterDrums: options.filterDrums ?? true,
        },
        [copy.buffer]
      );
    } catch {
      transcribeMonoPcmToMidi(decoded.samples, decoded.sampleRate, decoded.name, options)
        .then(resolve)
        .catch(reject);
    }
  });
}

/**
 * Decodes a browser audio File (.mp3 / .wav / .ogg / .flac / .m4a) and transcribes it to ParsedMidi!
 */
export async function transcribeAudioFileToMidi(
  file: File,
  options: TranscribeOptions = {}
): Promise<{ parsed: ParsedMidi; decoded: DecodedMonoAudio }> {
  const decoded = await decodeAudioFileToMonoPcm(file, options.onProgress);
  const parsed = await transcribeMonoPcmViaWorker(decoded, options);
  return { parsed, decoded };
}

/**
 * Exports any ParsedMidi (such as an auto-transcribed song!) as a downloadable standard `.mid` binary Blob!
 */
export function exportParsedMidiToBlob(parsed: ParsedMidi): Blob {
  const midi = new Midi();
  midi.name = parsed.name;
  midi.header.setTempo(parsed.bpm || 120);
  midi.header.timeSignatures.push({
    ticks: 0,
    timeSignature: parsed.timeSignature,
  });

  const leftTrack = midi.addTrack();
  leftTrack.name = 'Left Hand';
  const rightTrack = midi.addTrack();
  rightTrack.name = 'Right Hand';

  for (const n of parsed.notes) {
    const tr = n.hand === 'left' ? leftTrack : rightTrack;
    tr.addNote({
      midi: n.midi,
      time: n.start,
      duration: n.duration,
      velocity: n.velocity,
    });
  }

  const bytes = midi.toArray();
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  return new Blob([ab], { type: 'audio/midi' });
}
