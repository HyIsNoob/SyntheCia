import type { MidiNoteEvent, ParsedMidi, SustainInterval } from '../types/visualizer';
import { buildMeasureMarkers, midiToNoteName } from './MidiParser';

export interface DemoSongMeta {
  id: string;
  title: string;
  subtitle: string;
  bpm: number;
  build: () => ParsedMidi;
}

class SongBuilder {
  private notes: MidiNoteEvent[] = [];
  private sustains: SustainInterval[] = [];
  private nextId = 1;
  private readonly beatSec: number;

  constructor(private readonly bpm: number) {
    this.beatSec = 60 / bpm;
  }

  add(
    midi: number,
    beatStart: number,
    beatDur: number,
    velocity: number,
    hand: 'left' | 'right'
  ): this {
    if (midi < 21 || midi > 108) return this;
    const start = beatStart * this.beatSec;
    const duration = Math.max(0.06, beatDur * this.beatSec);
    const { name, pitchClass } = midiToNoteName(midi);
    this.notes.push({
      id: this.nextId++,
      midi,
      name,
      pitchClass,
      start,
      duration,
      end: start + duration,
      velocity: Math.max(0.15, Math.min(1, velocity)),
      trackIndex: hand === 'left' ? 0 : 1,
      hand,
    });
    return this;
  }

  chord(
    midis: number[],
    beatStart: number,
    beatDur: number,
    velocity: number,
    hand: 'left' | 'right',
    arpeggiateBeats = 0
  ): this {
    midis.forEach((m, i) => {
      this.add(m, beatStart + i * arpeggiateBeats, beatDur - i * arpeggiateBeats * 0.5, velocity, hand);
    });
    return this;
  }

  sustain(beatStart: number, beatEnd: number): this {
    this.sustains.push({
      start: beatStart * this.beatSec,
      end: beatEnd * this.beatSec,
    });
    return this;
  }

  finish(name: string, timeSignature: [number, number] = [4, 4]): ParsedMidi {
    this.notes.sort((a, b) => a.start - b.start || a.midi - b.midi);
    let maxEnd = 0;
    let maxNoteDuration = 0.5;
    let leftCount = 0;
    let rightCount = 0;
    for (const n of this.notes) {
      if (n.end > maxEnd) maxEnd = n.end;
      if (n.duration > maxNoteDuration) maxNoteDuration = n.duration;
      if (n.trackIndex === 0) leftCount++;
      else rightCount++;
    }
    const duration = maxEnd + 2.0;
    const measures = buildMeasureMarkers(this.notes, duration, this.bpm, timeSignature);
    return {
      name,
      duration,
      maxNoteDuration,
      bpm: this.bpm,
      timeSignature,
      trackCount: 2,
      tracks: [
        {
          trackIndex: 0,
          name: 'Left Hand',
          noteCount: leftCount,
          defaultHand: 'left',
          defaultColor: '#ff9640',
        },
        {
          trackIndex: 1,
          name: 'Right Hand',
          noteCount: rightCount,
          defaultHand: 'right',
          defaultColor: '#9b6dff',
        },
      ],
      notes: this.notes,
      sustainIntervals: this.sustains,
      measures,
    };
  }
}

/**
 * Demo 1: Nocturne in Neon (Em - C - G - D cinematic flowing arpeggios + sparkling runs)
 * Designed to showcase curl-noise fluid ribbons, lush bloom, and dual-hand glow.
 */
function buildNocturneInNeon(): ParsedMidi {
  const b = new SongBuilder(92);

  // Progression: Em9 -> Cmaj9 -> Gmaj7 -> Dadd9 -> Am9 -> Em7 -> Cmaj7 -> B7sus4/B7
  const chords = [
    { bass: 40, arp: [40, 47, 52, 54, 55, 59, 64, 59], mel: [76, 74, 71, 74, 76, 79, 78, 76] },
    { bass: 36, arp: [36, 43, 48, 50, 52, 55, 60, 55], mel: [79, 76, 74, 72, 74, 76, 72, 71] },
    { bass: 43, arp: [43, 50, 55, 57, 59, 62, 67, 62], mel: [74, 76, 79, 83, 81, 79, 78, 74] },
    { bass: 38, arp: [38, 45, 50, 52, 54, 57, 62, 57], mel: [78, 76, 74, 71, 69, 71, 74, 78] },
    { bass: 45, arp: [45, 52, 57, 59, 60, 64, 69, 64], mel: [81, 79, 76, 74, 72, 76, 79, 81] },
    { bass: 40, arp: [40, 47, 52, 55, 59, 64, 67, 64], mel: [83, 81, 79, 76, 74, 71, 74, 76] },
    { bass: 36, arp: [36, 43, 48, 52, 55, 60, 64, 60], mel: [76, 79, 83, 84, 83, 79, 76, 72] },
    { bass: 35, arp: [35, 42, 47, 51, 54, 59, 63, 59], mel: [78, 81, 83, 87, 83, 81, 78, 75] },
  ];

  let beat = 1.0;

  // Section A: Ethereal Intro + Lyric Theme (8 bars)
  for (let i = 0; i < chords.length; i++) {
    const ch = chords[i];
    b.sustain(beat, beat + 3.85);
    // Deep resonant bass octave
    b.add(ch.bass, beat, 3.8, 0.72, 'left');
    b.add(ch.bass - 12, beat, 3.8, 0.55, 'left');

    // Flowing 8th-note left hand arpeggio
    ch.arp.forEach((n, idx) => {
      b.add(n, beat + idx * 0.5, 0.9, 0.5 + idx * 0.03, 'left');
    });

    // Expressive right-hand melody + harmonic sparkles
    b.add(ch.mel[0], beat, 1.5, 0.84, 'right');
    b.add(ch.mel[0] - 12, beat, 1.4, 0.5, 'right');
    b.add(ch.mel[1], beat + 1.5, 0.5, 0.72, 'right');
    b.add(ch.mel[2], beat + 2.0, 1.0, 0.78, 'right');
    b.add(ch.mel[3], beat + 3.0, 0.5, 0.7, 'right');
    b.add(ch.mel[4], beat + 3.5, 0.5, 0.76, 'right');

    beat += 4.0;
  }

  // Section B: Climax with fast 16th-note luminous cascades (8 bars)
  for (let i = 0; i < chords.length; i++) {
    const ch = chords[i];
    b.sustain(beat, beat + 3.85);
    b.chord([ch.bass - 12, ch.bass], beat, 2.0, 0.88, 'left');
    b.chord([ch.bass, ch.bass + 7], beat + 2.0, 1.9, 0.78, 'left');

    // Rolling left hand
    ch.arp.forEach((n, idx) => {
      b.add(n, beat + idx * 0.5, 0.75, 0.62 + (idx % 2) * 0.08, 'left');
    });

    // Sparkling 16th-note right hand cascade
    const run = [
      ch.mel[0],
      ch.mel[1],
      ch.mel[2],
      ch.mel[3],
      ch.mel[4],
      ch.mel[5],
      ch.mel[6],
      ch.mel[7],
      ch.mel[5] + 12,
      ch.mel[4] + 12,
      ch.mel[3] + 12,
      ch.mel[2] + 12,
      ch.mel[4],
      ch.mel[5],
      ch.mel[6],
      ch.mel[7],
    ];

    run.forEach((n, idx) => {
      const accent = idx % 4 === 0 ? 0.92 : 0.68 + (idx % 2) * 0.08;
      b.add(n, beat + idx * 0.25, 0.35, accent, 'right');
    });

    // Big octave chord punctuation on beat 0 and beat 2
    b.chord([ch.mel[0] - 12, ch.mel[0]], beat, 1.0, 0.95, 'right');
    b.chord([ch.mel[4] - 12, ch.mel[4]], beat + 2.0, 0.9, 0.88, 'right');

    beat += 4.0;
  }

  // Final radiant Em9 arpeggio flourish
  b.sustain(beat, beat + 6.0);
  b.chord([28, 40, 47, 52, 55, 59, 64, 66, 71, 76, 79, 83, 88], beat, 5.5, 0.86, 'right', 0.14);
  b.chord([28, 40], beat, 5.5, 0.82, 'left');

  return b.finish('Nocturne in Neon', [4, 4]);
}

/**
 * Demo 2: Stardust Etude (Fast crystalline cascades & syncopated octaves — inspired by Image 2)
 */
function buildStardustEtude(): ParsedMidi {
  const b = new SongBuilder(126);

  const scale = [60, 62, 63, 67, 68, 72, 74, 75, 79, 80, 84, 86, 87, 91]; // C minor / Eb major luminous pentatonic-ish
  const progressions = [
    { root: 36, tones: [48, 55, 60, 63, 67, 72] }, // Cm
    { root: 32, tones: [44, 51, 56, 60, 63, 68] }, // Ab
    { root: 39, tones: [51, 58, 63, 67, 70, 75] }, // Eb
    { root: 34, tones: [46, 53, 58, 62, 65, 70] }, // Bb
  ];

  let beat = 1.0;

  for (let rep = 0; rep < 3; rep++) {
    for (let p = 0; p < progressions.length; p++) {
      const prog = progressions[p];
      b.sustain(beat, beat + 3.8);

      // Driving left-hand bass + rising fifths
      b.add(prog.root, beat, 1.5, 0.88, 'left');
      b.add(prog.root + 12, beat + 0.5, 0.6, 0.72, 'left');
      b.add(prog.root + 7, beat + 1.0, 0.8, 0.75, 'left');
      b.add(prog.root + 12, beat + 1.5, 0.6, 0.7, 'left');
      b.add(prog.root, beat + 2.0, 1.5, 0.84, 'left');
      b.add(prog.root + 7, beat + 2.5, 0.6, 0.72, 'left');
      b.add(prog.root + 12, beat + 3.0, 0.6, 0.78, 'left');
      b.add(prog.root + 15, beat + 3.5, 0.5, 0.74, 'left');

      // Rapid shimmering right-hand stardust arpeggios
      const stepCount = 16;
      for (let s = 0; s < stepCount; s++) {
        const wave = Math.floor(Math.sin(s * 0.55 + rep + p) * 3 + 5);
        const note =
          s % 4 === 0
            ? prog.tones[(s / 4 + rep) % prog.tones.length] + 12
            : scale[(wave + p * 2 + s) % scale.length];
        const vel = s % 4 === 0 ? 0.94 : 0.64 + (s % 3) * 0.08;
        b.add(note, beat + s * 0.25, 0.28, vel, 'right');

        if (rep >= 1 && s % 4 === 0) {
          b.add(note + 12 <= 104 ? note + 12 : note - 12, beat + s * 0.25, 0.35, 0.82, 'right');
        }
      }
      beat += 4.0;
    }
  }

  // Grand sparkling descending + ascending sweep finale
  b.sustain(beat, beat + 5.0);
  const sweep = [48, 55, 60, 63, 67, 72, 75, 79, 84, 87, 91, 96];
  sweep.forEach((n, idx) => {
    b.add(n, beat + idx * 0.12, 3.8, 0.78 + idx * 0.015, idx < 4 ? 'left' : 'right');
  });

  return b.finish('Stardust Etude', [4, 4]);
}

/**
 * Demo 3: Aurora Highway (B -> F# -> G#m -> E -> D#m -> F# dramatic 3D showcase, inspired by Image 3)
 */
function buildAuroraHighway(): ParsedMidi {
  const b = new SongBuilder(108);

  const sections = [
    {
      // B major heroic rising figure
      lh: [35, 47, 42, 47, 35, 47, 51, 47],
      rhScale: [57, 59, 61, 63, 64, 66, 69, 71, 73, 75, 76, 78],
    },
    {
      // F# major bright cascade
      lh: [42, 54, 49, 54, 42, 54, 58, 54],
      rhScale: [66, 68, 70, 73, 75, 78, 80, 82, 85, 82, 80, 78],
    },
    {
      // D# minor sweeping arpeggio
      lh: [39, 51, 46, 51, 39, 51, 54, 51],
      rhScale: [63, 66, 70, 73, 75, 78, 82, 85, 82, 78, 75, 70],
    },
    {
      // E major soaring chords
      lh: [40, 52, 47, 52, 40, 52, 56, 52],
      rhScale: [64, 68, 71, 75, 76, 80, 83, 88, 83, 80, 76, 71],
    },
  ];

  let beat = 1.0;

  for (let loop = 0; loop < 3; loop++) {
    for (const sec of sections) {
      b.sustain(beat, beat + 3.85);
      // Powerful dual-octave left-hand march
      sec.lh.forEach((n, idx) => {
        b.add(n, beat + idx * 0.5, 0.85, idx % 2 === 0 ? 0.88 : 0.68, 'left');
        if (idx % 4 === 0) {
          b.add(n - 12, beat + idx * 0.5, 1.4, 0.82, 'left');
        }
      });

      // Right-hand rising neon lines + glissando run on bar transition
      if (loop === 1) {
        // Dramatic ascending chromatic/diatonic ribbon
        sec.rhScale.forEach((n, idx) => {
          b.add(n, beat + idx * (4 / sec.rhScale.length), 0.45, 0.8 + (idx % 3) * 0.06, 'right');
        });
      } else {
        // Big resonant dual-note harmonies
        for (let k = 0; k < 8; k++) {
          const n1 = sec.rhScale[k % sec.rhScale.length];
          const n2 = sec.rhScale[(k + 2) % sec.rhScale.length];
          b.add(n1, beat + k * 0.5, 0.55, 0.85, 'right');
          if (k % 2 === 0) {
            b.add(n2, beat + k * 0.5, 0.55, 0.72, 'right');
          }
        }
      }

      beat += 4.0;
    }
  }

  // Heroic B major ending chord
  b.sustain(beat, beat + 5.0);
  b.chord([23, 35, 42, 47], beat, 4.5, 0.92, 'left');
  b.chord([59, 63, 66, 71, 75, 78, 83], beat, 4.5, 0.94, 'right', 0.08);

  return b.finish('Aurora Highway', [4, 4]);
}

export const DEMO_SONGS: DemoSongMeta[] = [
  {
    id: 'nocturne-neon',
    title: 'Nocturne in Neon',
    subtitle: 'Arpeggio mượt & cao trào lấp lánh (92 BPM)',
    bpm: 92,
    build: buildNocturneInNeon,
  },
  {
    id: 'stardust-etude',
    title: 'Stardust Etude',
    subtitle: 'Dòng nốt dày & nhanh thử hạt Curl-Noise (126 BPM)',
    bpm: 126,
    build: buildStardustEtude,
  },
  {
    id: 'aurora-highway',
    title: 'Aurora Highway',
    subtitle: 'Hợp âm rộng & chuỗi chạy cực hợp góc 3D (108 BPM)',
    bpm: 108,
    build: buildAuroraHighway,
  },
];
