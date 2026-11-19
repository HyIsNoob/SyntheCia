import type { MidiNoteEvent, ParsedMidi, TrackOverride } from '../types/visualizer';

export interface MagicStep {
  index: number;
  time: number; // canonical chord onset time (seconds)
  notes: MidiNoteEvent[];
  sustained: boolean;
}

const CHORD_GROUP_WINDOW_SEC = 0.038; // 38ms grouping threshold for simultaneous chord hits

function isSustainAt(midi: ParsedMidi, timeSec: number): boolean {
  for (let i = 0; i < midi.sustainIntervals.length; i++) {
    const s = midi.sustainIntervals[i];
    if (s.start > timeSec) break;
    if (timeSec >= s.start && timeSec <= s.end) return true;
  }
  return false;
}

/**
 * Groups MIDI notes into sequential playable chord/note clusters for Magic Keys ("Giả bấm") mode.
 * Each keypress triggers the next MagicStep with the user's exact live timing!
 */
export function buildMagicSteps(
  midi: ParsedMidi | null,
  trackOverrides?: Readonly<Record<number, TrackOverride>>
): MagicStep[] {
  if (!midi || midi.notes.length === 0) return [];

  const steps: MagicStep[] = [];
  let currentNotes: MidiNoteEvent[] = [];
  let groupStart = -1;

  for (let i = 0; i < midi.notes.length; i++) {
    const n = midi.notes[i];
    const ov = trackOverrides?.[n.trackIndex];
    if (ov?.hidden || ov?.muted) continue;

    if (currentNotes.length === 0) {
      currentNotes = [n];
      groupStart = n.start;
    } else if (n.start - groupStart <= CHORD_GROUP_WINDOW_SEC) {
      currentNotes.push(n);
    } else {
      steps.push({
        index: steps.length,
        time: groupStart,
        notes: currentNotes,
        sustained: isSustainAt(midi, groupStart),
      });
      currentNotes = [n];
      groupStart = n.start;
    }
  }

  if (currentNotes.length > 0) {
    steps.push({
      index: steps.length,
      time: groupStart,
      notes: currentNotes,
      sustained: isSustainAt(midi, groupStart),
    });
  }

  return steps;
}

/**
 * Finds the next MagicStep index at or after `timeSec` (for syncing after timeline seeks).
 */
export function findMagicStepIndexAtTime(steps: readonly MagicStep[], timeSec: number): number {
  let lo = 0;
  let hi = steps.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (steps[mid].time < timeSec - 0.015) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
