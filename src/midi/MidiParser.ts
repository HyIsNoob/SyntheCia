import { Midi } from '@tonejs/midi';
import type {
  MeasureMarker,
  MidiNoteEvent,
  MidiTrackInfo,
  ParsedMidi,
  SustainInterval,
} from '../types/visualizer';

export const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

const DEFAULT_TRACK_COLORS = [
  '#ff9640',
  '#9b6dff',
  '#38bdf8',
  '#f472b6',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#a78bfa',
];

/**
 * O(log N) binary-search windowing for falling notes & active key detection.
 * Returns [startIndex, endIndex) of candidate notes that could overlap [windowStart, windowEnd].
 */
export function findVisibleNoteRange(
  notes: readonly MidiNoteEvent[],
  windowStart: number,
  windowEnd: number,
  maxNoteDuration: number
): [number, number] {
  const len = notes.length;
  if (len === 0) return [0, 0];

  // Earliest possible start time of a note whose end >= windowStart
  const minStart = windowStart - maxNoteDuration - 0.05;

  // Lower bound for start >= minStart
  let lo = 0;
  let hi = len;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (notes[mid].start < minStart) lo = mid + 1;
    else hi = mid;
  }
  const startIdx = lo;

  // Upper bound for start <= windowEnd
  lo = startIdx;
  hi = len;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (notes[mid].start <= windowEnd) lo = mid + 1;
    else hi = mid;
  }
  return [startIdx, lo];
}

export function midiToNoteName(midi: number): { name: string; pitchClass: string } {
  const pitchClass = PITCH_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return { name: `${pitchClass}${octave}`, pitchClass };
}

interface ChordTemplate {
  suffix: string;
  intervals: number[];
}

const CHORD_TEMPLATES: ChordTemplate[] = [
  { suffix: '', intervals: [0, 4, 7] }, // Major
  { suffix: 'm', intervals: [0, 3, 7] }, // Minor
  { suffix: 'dim', intervals: [0, 3, 6] },
  { suffix: 'aug', intervals: [0, 4, 8] },
  { suffix: 'sus4', intervals: [0, 5, 7] },
  { suffix: '7', intervals: [0, 4, 7, 10] },
  { suffix: 'maj7', intervals: [0, 4, 7, 11] },
  { suffix: 'm7', intervals: [0, 3, 7, 10] },
];

export function detectChordForNotes(notes: MidiNoteEvent[]): string | null {
  if (notes.length < 2) return null;

  const weights = new Float32Array(12);
  let lowestMidi = 128;
  let lowestPc = 0;

  for (const n of notes) {
    const pc = ((n.midi % 12) + 12) % 12;
    // Give extra weight to longer notes and lower bass notes
    const bassBoost = n.midi < 56 ? 1.85 : 1.0;
    const w = (0.35 + Math.min(n.duration, 2.0)) * (0.4 + n.velocity) * bassBoost;
    weights[pc] += w;
    if (n.midi < lowestMidi) {
      lowestMidi = n.midi;
      lowestPc = pc;
    }
  }

  let totalWeight = 0;
  for (let i = 0; i < 12; i++) totalWeight += weights[i];
  if (totalWeight <= 0) return null;

  let bestScore = -Infinity;
  let bestLabel: string | null = null;

  for (let root = 0; root < 12; root++) {
    if (weights[root] === 0) continue;
    for (const tmpl of CHORD_TEMPLATES) {
      let match = 0;
      let presentCount = 0;
      for (const iv of tmpl.intervals) {
        const pc = (root + iv) % 12;
        if (weights[pc] > 0) {
          match += weights[pc];
          presentCount++;
        }
      }
      if (presentCount < 2) continue;

      const mismatch = totalWeight - match;
      const rootInBassBonus = root === lowestPc ? 0.35 * totalWeight : 0;
      const simplicityBonus = tmpl.intervals.length === 3 ? 0.08 * totalWeight : 0;
      const score = match - mismatch * 0.6 + rootInBassBonus + simplicityBonus;

      if (score > bestScore) {
        bestScore = score;
        bestLabel = `${PITCH_NAMES[root]}${tmpl.suffix}`;
      }
    }
  }

  return bestLabel;
}

export function buildMeasureMarkers(
  notes: MidiNoteEvent[],
  duration: number,
  bpm: number,
  timeSignature: [number, number]
): MeasureMarker[] {
  const [beatsPerBar, beatUnit] = timeSignature;
  const safeBpm = Math.max(30, Math.min(300, bpm || 120));
  const measureDuration = (60 / safeBpm) * beatsPerBar * (4 / (beatUnit || 4));
  const markers: MeasureMarker[] = [];

  if (measureDuration <= 0.1) return markers;

  const totalMeasures = Math.ceil((duration + 2) / measureDuration);
  let lastChord: string | null = null;

  for (let m = 0; m <= totalMeasures; m++) {
    const start = m * measureDuration;
    const end = start + measureDuration;
    const inBar = notes.filter((n) => n.start >= start - 0.04 && n.start < end - 0.04);
    const detected = detectChordForNotes(inBar);
    const chordLabel = detected && detected !== lastChord ? detected : null;
    if (detected) lastChord = detected;

    markers.push({
      measureNumber: m + 1,
      time: start,
      chordLabel,
    });
  }

  return markers;
}

export function parseMidiBuffer(buffer: ArrayBuffer, fallbackName = 'Untitled.mid'): ParsedMidi {
  const midi = new Midi(buffer);

  const bpm = midi.header.tempos.length > 0 ? Math.round(midi.header.tempos[0].bpm) : 120;
  const ts =
    midi.header.timeSignatures.length > 0
      ? (midi.header.timeSignatures[0].timeSignature as [number, number])
      : ([4, 4] as [number, number]);

  const rawNotes: MidiNoteEvent[] = [];
  const sustainIntervals: SustainInterval[] = [];

  // Identify non-empty melodic tracks (skip percussion channel 9)
  const melodicTracks = midi.tracks
    .map((track, idx) => ({ track, idx }))
    .filter(({ track }) => track.notes.length > 0 && track.channel !== 9);

  const trackAveragePitch = new Map<number, number>();
  for (const { track, idx } of melodicTracks) {
    let sum = 0;
    for (const n of track.notes) sum += n.midi;
    trackAveragePitch.set(idx, sum / track.notes.length);
  }

  // Decide if tracks represent Left/Right hand directly (typical 2-track piano MIDI)
  let leftTrackIdx: number | null = null;
  if (melodicTracks.length === 2) {
    const [a, b] = melodicTracks;
    const avgA = trackAveragePitch.get(a.idx) ?? 60;
    const avgB = trackAveragePitch.get(b.idx) ?? 60;
    leftTrackIdx = avgA <= avgB ? a.idx : b.idx;
  }

  let nextId = 1;
  let maxEnd = 0;
  let maxNoteDuration = 0.5;
  const tracks: MidiTrackInfo[] = [];

  for (let mIdx = 0; mIdx < melodicTracks.length; mIdx++) {
    const { track, idx } = melodicTracks[mIdx];
    let trackValidNotes = 0;
    const avgPitch = trackAveragePitch.get(idx) ?? 60;
    const defaultHand: 'left' | 'right' =
      leftTrackIdx !== null ? (idx === leftTrackIdx ? 'left' : 'right') : avgPitch < 60 ? 'left' : 'right';

    // Parse CC64 sustain pedal events
    const cc64 = track.controlChanges[64];
    if (cc64 && cc64.length > 0) {
      let pedalDownAt: number | null = null;
      const sortedCC = [...cc64].sort((a, b) => a.time - b.time);
      for (const ev of sortedCC) {
        if (ev.value >= 0.5 && pedalDownAt === null) {
          pedalDownAt = ev.time;
        } else if (ev.value < 0.5 && pedalDownAt !== null) {
          sustainIntervals.push({ start: pedalDownAt, end: ev.time });
          pedalDownAt = null;
        }
      }
      if (pedalDownAt !== null) {
        sustainIntervals.push({ start: pedalDownAt, end: Math.max(midi.duration, pedalDownAt + 2) });
      }
    }

    for (const note of track.notes) {
      // Clamp/filter to 88-key range (21..108)
      if (note.midi < 21 || note.midi > 108) continue;
      const start = Math.max(0, note.time);
      const duration = Math.max(0.05, note.duration);
      const end = start + duration;
      if (end > maxEnd) maxEnd = end;
      if (duration > maxNoteDuration) maxNoteDuration = duration;
      trackValidNotes++;

      const { name, pitchClass } = midiToNoteName(note.midi);
      let hand: 'left' | 'right';
      if (leftTrackIdx !== null) {
        hand = idx === leftTrackIdx ? 'left' : 'right';
      } else {
        hand = note.midi < 60 ? 'left' : 'right';
      }

      rawNotes.push({
        id: nextId++,
        midi: note.midi,
        name,
        pitchClass,
        start,
        duration,
        end,
        velocity: Math.max(0.15, Math.min(1, note.velocity)),
        trackIndex: idx,
        hand,
      });
    }

    if (trackValidNotes > 0) {
      const trimmed = track.name?.trim();
      tracks.push({
        trackIndex: idx,
        name:
          trimmed && trimmed.length > 0
            ? trimmed
            : melodicTracks.length === 2
              ? defaultHand === 'left'
                ? 'Left Hand'
                : 'Right Hand'
              : `Track ${mIdx + 1}`,
        noteCount: trackValidNotes,
        defaultHand,
        defaultColor: DEFAULT_TRACK_COLORS[mIdx % DEFAULT_TRACK_COLORS.length],
      });
    }
  }

  rawNotes.sort((a, b) => a.start - b.start || a.midi - b.midi);
  sustainIntervals.sort((a, b) => a.start - b.start);

  const duration = Math.max(maxEnd + 1.5, midi.duration || 0);
  const measures = buildMeasureMarkers(rawNotes, duration, bpm, ts);

  const cleanName =
    midi.name && midi.name.trim().length > 0
      ? midi.name.trim()
      : fallbackName.replace(/\.(mid|midi)$/i, '');

  return {
    name: cleanName,
    duration,
    maxNoteDuration,
    bpm,
    timeSignature: ts,
    trackCount: tracks.length,
    tracks,
    notes: rawNotes,
    sustainIntervals,
    measures,
  };
}
